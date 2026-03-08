const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');
const { Participant, ChatMessage, sequelize } = require('./models');
const crypto = require('crypto');
const path = require('path');
const logger = require('./utils/logger');
const timeouts = require('./config/session-timeouts');
require('dotenv').config();

const DEMO_MODE = process.env.DEMO_MODE === 'true';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(express.static(path.join(__dirname, '../client/build')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// CORS configuration for local development and production
const corsOrigin = process.env.NODE_ENV === 'production' 
  ? process.env.FRONTEND_URL 
  : ['http://localhost:3000', 'http://localhost:8000'];

app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

// Initialize Socket.IO variables early so they can be used in monitoring endpoints
let connectedSockets = new Map(); // Changed from Set to Map to store more info
let waitingUsers = new Map(); // Users waiting to be paired (not in chat yet)
let activeUsers = new Map(); // Users currently in chat sessions
let userProgress = new Map(); // Track what page/stage each user is on
let matchingInProgress = false; // Semaphore to prevent race conditions in matching
let matchingLocks = new Map(); // Per-user locks to prevent double-matching
const roles = ['pessimisticSeller', 'pessimisticBuyer', 'optimisticSeller', 'optimisticBuyer'];
const buyers = ['pessimisticBuyer', 'optimisticBuyer'];
const sellers = ['pessimisticSeller', 'optimisticSeller'];

// FIXED: Add event deduplication to prevent race conditions from rapid clicks
const recentEvents = new Map(); // Track recent events for deduplication
const EVENT_DEDUP_WINDOW = 1000; // 1 second deduplication window

// Define experiment stages
const experimentStages = {
  '/': 'setup',
      '/introduction1': 'setup',
    '/introduction2': 'setup', 
    '/introduction3': 'setup',
  '/generalInstructions': 'instructions',
  '/roleInstructions': 'instructions',
  '/privateInstructions': 'instructions',
  '/negotiatingInstructions': 'instructions',
  '/preExperimentQuiz': 'preChat',
  '/outcomeGuess': 'preChat',
  '/main': 'waiting', // Will be updated to 'inChat' when paired
  '/postExperimentQuiz': 'postChat',
  '/payment': 'completedSuccess',
  '/timeoutPage': 'completedTimeout',
  '/quizFailure': 'completedFailure'
};

// Automatic matching check interval
let autoMatchingInterval = null;

// Cleanup function to handle memory leaks
const cleanupUser = (socketId) => {
  // Cancel any pending timeout for this user
  const waitingUser = waitingUsers.get(socketId);
  if (waitingUser && waitingUser.timeoutId) {
    clearTimeout(waitingUser.timeoutId);
    //logger.info(`⏰ Cancelled timeout for cleaned up user ${socketId}`);
  }
  
  // Clean up matching locks
  matchingLocks.delete(socketId);
  
  connectedSockets.delete(socketId);
  waitingUsers.delete(socketId);
  activeUsers.delete(socketId);
  // Note: userProgress is preserved to track disconnections and completions
};

// Helper function to safely get a socket by ID
const getSocket = (socketId) => {
  return io.sockets.sockets.get(socketId);
};

// FIXED: Helper function to check for duplicate events
const isDuplicateEvent = (socketId, eventType, data) => {
  const key = `${socketId}-${eventType}-${JSON.stringify(data)}`;
  const now = Date.now();
  
  if (recentEvents.has(key)) {
    const lastTime = recentEvents.get(key);
    if (now - lastTime < EVENT_DEDUP_WINDOW) {
      return true; // Duplicate detected
    }
  }
  
  recentEvents.set(key, now);
  
  // Cleanup old entries periodically to prevent memory leaks
  if (recentEvents.size > 1000) {
    for (const [k, time] of recentEvents.entries()) {
      if (now - time > EVENT_DEDUP_WINDOW * 2) {
        recentEvents.delete(k);
      }
    }
  }
  
  return false;
};

// CRITICAL FIX: Active matching function to prevent users waiting unnecessarily
const attemptActiveMatching = async () => {
  if (matchingInProgress) return; // Don't interfere with ongoing matching
  
  // Find all waiting users ready for matching
  const waitingBuyers = [];
  const waitingSellers = [];
  
  for (const [socketId, userData] of waitingUsers) {
    if (!userData.waiting || userData.pairing || !userData.participant_id || !userData.waitingStartTime) {
      continue; // Skip if not ready for matching
    }
    
    // Also skip users with matching locks (already being matched)
    if (matchingLocks.has(socketId)) {
      continue;
    }
    
    const socket = getSocket(socketId);
    if (!socket) {
      // Clean up disconnected users
      waitingUsers.delete(socketId);
      continue;
    }
    
    if (userData.role.includes('Buyer')) {
      waitingBuyers.push({ socketId, userData, socket });
    } else if (userData.role.includes('Seller')) {
      waitingSellers.push({ socketId, userData, socket });
    }
  }
  
  // Only log if there are users waiting
  if (waitingBuyers.length > 0 || waitingSellers.length > 0) {
    console.log(`🔍 ACTIVE MATCHING: Found ${waitingBuyers.length} buyers, ${waitingSellers.length} sellers waiting`);
  }
  
  // Try to match buyers with sellers
  const matches = Math.min(waitingBuyers.length, waitingSellers.length);
  for (let i = 0; i < matches; i++) {
    const buyer = waitingBuyers[i];
    const seller = waitingSellers[i];
    
    // Verify both users are still valid and waiting (re-check in case state changed)
    const currentBuyer = waitingUsers.get(buyer.socketId);
    const currentSeller = waitingUsers.get(seller.socketId);
    
    if (
      currentBuyer?.waiting && !currentBuyer.pairing &&
      currentSeller?.waiting && !currentSeller.pairing &&
      currentBuyer.participant_id !== currentSeller.participant_id &&
      !matchingLocks.has(buyer.socketId) && !matchingLocks.has(seller.socketId)
    ) {
      console.log(`🎯 ACTIVE MATCHING: Triggering match between ${currentBuyer.role} (${buyer.socketId}) and ${currentSeller.role} (${seller.socketId})`);
      
      // Set matching locks for both users
      matchingLocks.set(buyer.socketId, Date.now());
      matchingLocks.set(seller.socketId, Date.now());
      
      // Set both users to pairing state
      currentBuyer.pairing = true;
      currentSeller.pairing = true;
      
      // Cancel waiting timeouts since they're being matched
      if (currentBuyer.timeoutId) {
        clearTimeout(currentBuyer.timeoutId);
        currentBuyer.timeoutId = null;
      }
      if (currentSeller.timeoutId) {
        clearTimeout(currentSeller.timeoutId);
        currentSeller.timeoutId = null;
      }
      
      // Set up pairing stuck timeouts
      if (currentBuyer.pairingTimeoutId) clearTimeout(currentBuyer.pairingTimeoutId);
      if (currentSeller.pairingTimeoutId) clearTimeout(currentSeller.pairingTimeoutId);
      currentBuyer.pairingTimeoutId = setupPairingStuckTimeout(buyer.socketId);
      currentSeller.pairingTimeoutId = setupPairingStuckTimeout(seller.socketId);
      
      // Update waitingUsers
      waitingUsers.set(buyer.socketId, currentBuyer);
      waitingUsers.set(seller.socketId, currentSeller);
      
      // Notify both users
      buyer.socket.emit('waiting', 'Partner found! Starting in 3 seconds...');
      seller.socket.emit('waiting', 'Partner found! Starting in 3 seconds...');
      
      // Schedule matching after 3 seconds (using closure to capture current values)
      const buyerSocketId = buyer.socketId;
      const sellerSocketId = seller.socketId;
      const buyerData = currentBuyer;
      const sellerData = currentSeller;
      
      setTimeout(async () => {
        try {
          await performMatchingWithTransaction(buyerSocketId, sellerSocketId, buyerData, sellerData);
        } finally {
          // Clean up matching locks
          matchingLocks.delete(buyerSocketId);
          matchingLocks.delete(sellerSocketId);
        }
      }, 3 * 1000);
      
      // Small delay to prevent race conditions between multiple matches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
};

// Helper function to set up 10-minute timeout for waiting users
const setupWaitingTimeout = (socketId, socket, logSuffix = '') => {
  //console.log(`⏰ SERVER: Setting up 10-minute waiting timeout for ${socketId}${logSuffix}`);
  return setTimeout(async () => {
    //console.log(`⏰ SERVER: 10-minute timeout triggered for ${socketId}${logSuffix}`);
    const user = waitingUsers.get(socketId);
    //console.log(`🔍 SERVER: Timeout check - user exists: ${!!user}, user waiting: ${user?.waiting}, user pairing: ${user?.pairing}`);
    
    if (user && user.waiting && !user.pairing) {
      console.log(`✅ SERVER: User ${socketId} timed out after 10 minutes of waiting${logSuffix} - sending waitingTimeout event`);
      //logger.info(`⏰ User ${socketId} timed out after 10 minutes of waiting${logSuffix}`);
      
      const userSocket = socket || getSocket(socketId);
      if (userSocket && userSocket.connected) {
        console.log(`📤 SERVER: Emitting waitingTimeout to ${socketId}`);
        userSocket.emit('waitingTimeout');
        
        // FIXED: Add redundant timeout emit to increase reliability
        setTimeout(() => {
          if (userSocket && userSocket.connected) {
            userSocket.emit('waitingTimeout');
            console.log(`🔄 SERVER: Redundant waitingTimeout sent to ${socketId}`);
          }
        }, 1000);
        
        console.log(`✅ SERVER: waitingTimeout event sent to ${socketId}`);
      } else {
        console.log(`❌ SERVER: Could not send timeout to ${socketId} - socket not found or disconnected`);
        //logger.warn(`⚠️ Could not send timeout to ${socketId} - socket not found`);
      }
      
      // Keep user data but mark as timed out for demographics collection
      user.waiting = false;
      user.pairing = false;
      user.timedOut = true;
      user.chatEndedAt = new Date();
      waitingUsers.set(socketId, user);
      userProgress.set(socketId, 'waitingTimeout');
      
      // Persist waiting timeout immediately so dashboards count NOT MATCHED correctly
      try {
        if (user.participant_id) {
          await Participant.update({
            dropout_stage: 'waitingTimeout',
            chat_ended_at: new Date()
          }, {
            where: { participant_id: user.participant_id }
          });
        }
      } catch (persistErr) {
        console.error(`❌ SERVER: Failed to persist waiting timeout for ${socketId}:`, persistErr);
      }
      //console.log(`🧹 SERVER: Cleaned up user data for timed out user ${socketId}`);
    } else {
      //console.log(`❌ SERVER: Timeout triggered for ${socketId} but user no longer waiting (user: ${!!user}, waiting: ${user?.waiting}, pairing: ${user?.pairing})`);
    }
  }, timeouts.WAITING_FOR_PARTNER_TIMEOUT);
};

// Helper function to safely reset user to waiting state with timeout
const resetUserToWaiting = (socketId, logSuffix = '') => {
  const userData = waitingUsers.get(socketId);
  if (!userData) return false;

  const userSocket = getSocket(socketId);
  if (!userSocket) {
    //logger.warn(`⚠️ Cannot reset ${socketId} to waiting - socket disconnected`);
    waitingUsers.delete(socketId);
    return false;
  }

  // Clear any existing waiting timeout before scheduling a new one
  if (userData.timeoutId) {
    clearTimeout(userData.timeoutId);
    userData.timeoutId = null;
  }

  // Clear any pairing-stuck timeout if present
  if (userData.pairingTimeoutId) {
    clearTimeout(userData.pairingTimeoutId);
    userData.pairingTimeoutId = null;
  }

  userData.pairing = false;
  userData.waiting = true;
  userData.waitingStartTime = Date.now();
  
  const newTimeoutId = setupWaitingTimeout(socketId, userSocket, logSuffix);
  userData.timeoutId = newTimeoutId;
  
  waitingUsers.set(socketId, userData);
  userSocket.emit('waiting', 'Looking for another partner...');
  
  //logger.info(`🔄 Reset user ${socketId} to waiting state with new timeout${logSuffix}`);
  return true;
};

// Helper: protect against users getting stuck in pairing state (e.g., race conditions/DB issues).
// Schedules a 2-minute pairing recovery (configured in session-timeouts.js).
const setupPairingStuckTimeout = (socketId, logSuffix = '') => {
  return setTimeout(() => {
    const userData = waitingUsers.get(socketId);
    if (!userData) return;

    // If the user is still pairing and hasn't entered a chat session, reset them back to waiting.
    // NOTE: This avoids the 10-minute wait timeout being bypassed by a stuck pairing state.
    if (userData.pairing && userData.waiting && !userData.session_id && !userData.timedOut) {
      console.log(`🧹 SERVER: Pairing stuck for ${socketId}${logSuffix} - resetting to waiting`);
      resetUserToWaiting(socketId, ' (pairing stuck)');
    }
  }, timeouts.PAIRING_STUCK_TIMEOUT);
};

// Atomic matching function with database transactions and proper error recovery
const performMatchingWithTransaction = async (socketId1, socketId2, user1Data, user2Data) => {
  const transaction = await sequelize.transaction();
  
  try {
    // CRITICAL: Verify both users are still in pairing state and haven't been matched elsewhere
    const currentUser1 = waitingUsers.get(socketId1);
    const currentUser2 = waitingUsers.get(socketId2);
    const socket1 = getSocket(socketId1);
    const socket2 = getSocket(socketId2);
    
    // Check if either user already has a session_id (already matched)
    if (currentUser1?.session_id || currentUser2?.session_id) {
      console.log(`❌ RACE CONDITION PREVENTED: User already matched - ${socketId1}: ${!!currentUser1?.session_id}, ${socketId2}: ${!!currentUser2?.session_id}`);
      await transaction.rollback();
      
      // IMPORTANT: Release both users from pairing so they don't get stuck indefinitely
      resetUserToWaiting(socketId1, ' (already matched)');
      resetUserToWaiting(socketId2, ' (already matched)');
      return;
    }
    
    if (!currentUser1 || !currentUser2) {
      await transaction.rollback();
      
      // Reset any remaining user
      if (currentUser1) resetUserToWaiting(socketId1, ' (partner disappeared)');
      if (currentUser2) resetUserToWaiting(socketId2, ' (partner disappeared)');
      return;
    }
    
    if (!socket1 || !socket2) {
      await transaction.rollback();
      
      // Clean up and reset available users
      if (!socket1) waitingUsers.delete(socketId1);
      if (!socket2) waitingUsers.delete(socketId2);
      if (socket1 && currentUser1) resetUserToWaiting(socketId1, ' (partner disconnected)');
      if (socket2 && currentUser2) resetUserToWaiting(socketId2, ' (partner disconnected)');
      return;
    }
    
    // Verify users are still in pairing state (not waiting or already matched)
    if (!currentUser1.pairing || !currentUser2.pairing) {
      await transaction.rollback();
      
      // Don't leave users stuck in a partially-matched state
      resetUserToWaiting(socketId1, ' (pairing state changed)');
      resetUserToWaiting(socketId2, ' (pairing state changed)');
      return;
    }
    
    if (!currentUser1.participant_id || !currentUser2.participant_id) {
      console.log(`❌ Missing participant IDs: user1=${!!currentUser1.participant_id}, user2=${!!currentUser2.participant_id}`);
      await transaction.rollback();
      
      resetUserToWaiting(socketId1, ' (missing participant ID)');
      resetUserToWaiting(socketId2, ' (missing participant ID)');
      return;
    }

    // Create session in database with TRANSACTION
    const session_id = Participant.generateSessionId();
    const chat_start_time = new Date();
    const chatRoomName = crypto.randomBytes(12).toString('hex');
    
    //logger.info(`💾 Creating database session ${session_id} with transaction`);
    
    // Update both participants atomically with additional safety checks
    // First check if either participant already has a session_id in the database
    const dbUser1 = await Participant.findOne({
      where: { participant_id: currentUser1.participant_id },
      transaction: transaction
    });
    const dbUser2 = await Participant.findOne({
      where: { participant_id: currentUser2.participant_id },
      transaction: transaction
    });
    
    if (dbUser1?.session_id || dbUser2?.session_id) {
      console.log(`❌ DATABASE RACE CONDITION PREVENTED: User already has session - ${currentUser1.participant_id}: ${dbUser1?.session_id}, ${currentUser2.participant_id}: ${dbUser2?.session_id}`);
      await transaction.rollback();
      
      // IMPORTANT: Release both users from pairing so they don't get stuck indefinitely
      resetUserToWaiting(socketId1, ' (already has session)');
      resetUserToWaiting(socketId2, ' (already has session)');
      return;
    }
    
    // CRITICAL: Check if updates actually affected rows (race condition detection)
    const [affectedCount1] = await Participant.update({
      session_id: session_id,
      partner_id: currentUser2.participant_id,
      partner_role: currentUser2.role,
      chat_started_at: chat_start_time
    }, {
      where: { 
        participant_id: currentUser1.participant_id,
        session_id: null // Only update if session_id is still null
      },
      transaction: transaction
    });
    
    const [affectedCount2] = await Participant.update({
      session_id: session_id,
      partner_id: currentUser1.participant_id,
      partner_role: currentUser1.role,
      chat_started_at: chat_start_time
    }, {
      where: { 
        participant_id: currentUser2.participant_id,
        session_id: null // Only update if session_id is still null
      },
      transaction: transaction
    });
    
    // If either update affected 0 rows, another transaction already matched these users
    // Roll back and exit gracefully - the other transaction will handle the matching
    if (affectedCount1 === 0 || affectedCount2 === 0) {
      console.log(`❌ CONCURRENT MATCH DETECTED: Updates affected ${affectedCount1}/${affectedCount2} rows for ${currentUser1.participant_id}/${currentUser2.participant_id} - another transaction already matched them`);
      await transaction.rollback();
      // Don't call resetUserToWaiting - the successful transaction will complete the matching
      // Just clean up this transaction's pairing timeouts
      if (currentUser1.pairingTimeoutId) {
        clearTimeout(currentUser1.pairingTimeoutId);
        currentUser1.pairingTimeoutId = null;
      }
      if (currentUser2.pairingTimeoutId) {
        clearTimeout(currentUser2.pairingTimeoutId);
        currentUser2.pairingTimeoutId = null;
      }
      return;
    }
    
    //console.log(`💾 SERVER: Stored partner roles - ${currentUser1.participant_id} (${currentUser1.role}) paired with ${currentUser2.participant_id} (${currentUser2.role})`);
    //logger.info(`Partner roles stored: ${currentUser1.participant_id} -> partner_role: ${currentUser2.role}, ${currentUser2.participant_id} -> partner_role: ${currentUser1.role}`);
    
    // Commit transaction - if this fails, everything gets rolled back
    await transaction.commit();
    //logger.info(`✅ Database session ${session_id} committed successfully`);
    
    // Update in-memory state AFTER successful database commit
    currentUser1.pairing = true;
    currentUser1.roomName = chatRoomName;
    currentUser1.partnerId = socketId2;
    currentUser1.session_id = session_id;
    currentUser1.waiting = false;
    
    currentUser2.pairing = true;
    currentUser2.roomName = chatRoomName;
    currentUser2.partnerId = socketId1;
    currentUser2.session_id = session_id;
    currentUser2.waiting = false;
    
    // Update waiting users with pairing info - CRITICAL for preventing double matching
    waitingUsers.set(socketId1, currentUser1);
    waitingUsers.set(socketId2, currentUser2);
    
    console.log(`✅ MATCHING SUCCESS: ${currentUser1.participant_id} <-> ${currentUser2.participant_id} in session ${session_id}`);

    // Join both users to the chat room
    socket1.join(chatRoomName);
    socket2.join(chatRoomName);
    
    // Move users from waiting to active state
    waitingUsers.delete(socketId1);
    waitingUsers.delete(socketId2);
    
    activeUsers.set(socketId1, {
      ...currentUser1,
      roomName: chatRoomName,
      partnerId: socketId2,
      session_id: session_id,
      waiting: false,
      pairing: false
    });
    
    activeUsers.set(socketId2, {
      ...currentUser2,
      roomName: chatRoomName,
      partnerId: socketId1,
      session_id: session_id,
      waiting: false,
      pairing: false
    });

    // Update progress to 'inChat' for both users
    userProgress.set(socketId1, 'inChat');
    userProgress.set(socketId2, 'inChat');
    
    // SET UP CHAT SESSION TIMEOUT (7 minutes) - Server-side coordination
    const chatTimeoutId = setTimeout(async () => {
      //logger.info(`⏰ Chat session ${session_id} timed out after ${timeouts.CHAT_SESSION_TIMEOUT / 60000} minutes - redirecting both participants`);
      
      // Get current user data
      const user1 = activeUsers.get(socketId1);
      const user2 = activeUsers.get(socketId2);
      
      if (user1 || user2) {
        // Emit timeout event to both participants in the room
        io.to(chatRoomName).emit('chatSessionTimeout', {
          session_id: session_id,
          message: 'Chat time has expired'
        });
        
        // IMPORTANT: Move users to post-chat state instead of deleting them
        // This preserves their data for demographics collection
        if (user1) {
          // Remove from activeUsers but keep in waitingUsers for demographics
          activeUsers.delete(socketId1);
          waitingUsers.set(socketId1, {
            ...user1,
            waiting: false,
            pairing: false,
            postChat: true, // Flag for post-chat data collection
            chatEndedAt: new Date()
          });
        }
        
        if (user2) {
          // Remove from activeUsers but keep in waitingUsers for demographics
          activeUsers.delete(socketId2);
          waitingUsers.set(socketId2, {
            ...user2,
            waiting: false,
            pairing: false,
            postChat: true, // Flag for post-chat data collection
            chatEndedAt: new Date()
          });
        }
        
        // Update database for timeout participants
        try {
          const end_time = new Date();
          const participants = await Participant.findAll({
            where: { session_id: session_id }
          });
          
          if (participants.length === 2) {
            // Calculate duration from chat start
            const duration_seconds = Math.floor((end_time - new Date(participants[0].chat_started_at)) / 1000);
            
            // Update both participants with timeout status
            await Participant.update({
              agreement_reached: false,
              final_agreement: null,
              negotiation_duration_seconds: duration_seconds,
              chat_ended_at: end_time
            }, {
              where: { session_id: session_id }
            });
            
            //console.log(`💾 SERVER: Updated timeout participants in session ${session_id} - duration: ${duration_seconds}s`);
            //logger.info(`Recorded timeout for session ${session_id} - no agreement reached (${duration_seconds}s)`);
          }
        } catch (dbError) {
          console.error(`❌ SERVER: Error updating timeout participants in session ${session_id}:`, dbError);
          //logger.error('Error updating timeout participants:', dbError);
        }
        
        // Update progress tracking
        userProgress.set(socketId1, 'chatTimeout');
        userProgress.set(socketId2, 'chatTimeout');
        
        //logger.info(`✅ Both participants in session ${session_id} notified of timeout and moved to post-chat state`);
      }
    }, timeouts.CHAT_SESSION_TIMEOUT);
    
    // Store timeout ID for potential cleanup
    if (activeUsers.has(socketId1)) {
      activeUsers.get(socketId1).chatTimeoutId = chatTimeoutId;
    }
    if (activeUsers.has(socketId2)) {
      activeUsers.get(socketId2).chatTimeoutId = chatTimeoutId;
    }
    
    //logger.info(`📡 Sending joinRoom events to both users`);
    
    // Send join room events to both users
    socket1.emit('joinRoom', chatRoomName, {
      session_id: session_id,
      participant_id: currentUser1.participant_id,
      partner_participant_id: currentUser2.participant_id,
      chat_started_at: chat_start_time
    });
    
    socket2.emit('joinRoom', chatRoomName, {
      session_id: session_id,
      participant_id: currentUser2.participant_id,
      partner_participant_id: currentUser1.participant_id,
      chat_started_at: chat_start_time
    });
    
    //logger.info(`✅ Chat started successfully for session ${session_id}: ${currentUser1.participant_id} <-> ${currentUser2.participant_id}`);
    
  } catch (error) {
    //logger.error('Error in performMatchingWithTransaction:', error);
    
    // Rollback transaction if still active
    if (!transaction.finished) {
      await transaction.rollback();
      //logger.info(`💾 Rolled back transaction due to error`);
    }
    
    // Reset both users to waiting state with proper error handling
    const success1 = resetUserToWaiting(socketId1, ' (database error)');
    const success2 = resetUserToWaiting(socketId2, ' (database error)');
    
    // Send error messages to users who are still connected
    if (success1) {
      const socket1 = getSocket(socketId1);
      if (socket1) socket1.emit('error', 'Failed to create chat session');
    }
    if (success2) {
      const socket2 = getSocket(socketId2);
      if (socket2) socket2.emit('error', 'Failed to create chat session');
    }
  }
};

reinit = false  
if(reinit){
  sequelize.sync({ alter: true }) // Use alter to add new columns safely without dropping data
    .then(() => {
        //console.log('All models were synchronized successfully.');
    })
    .catch((err) => {
        console.error('Error syncing models:', err);
    });
}

// ========================================
// RESEARCH-FOCUSED ENDPOINTS
// ========================================

// Check if worker_id has already participated
app.post('/check-duplicate-participant', async (req, res) => {
  const { worker_id } = req.body;
  
  try {
    const existingParticipant = await Participant.findOne({
      where: { worker_id: worker_id }
    });

    res.status(200).json({ 
      isDuplicate: !!existingParticipant,
      participant_id: existingParticipant ? existingParticipant.participant_id : null
    });
  } catch (error) {
    //logger.error('Error checking duplicate participant:', error);
    res.status(500).json({ error: 'Failed to check participant' });
  }
});

// Create participant with research ID
app.post('/create-participant', async (req, res) => {
  const { worker_id, role } = req.body;
  
  try {
    // Check for duplicate worker_id first
    const existingParticipant = await Participant.findOne({
      where: { worker_id: worker_id }
    });

    if (existingParticipant) {
      return res.status(409).json({ 
        error: 'Participant already exists',
        isDuplicate: true,
        participant_id: existingParticipant.participant_id
      });
    }
    
    // Generate clean research ID
    const participant_id = Participant.generateParticipantId();
    
    const participant = await Participant.create({
      participant_id: participant_id,
      worker_id: worker_id,
      role: role, // Store full role: optimisticBuyer, pessimisticBuyer, etc.
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'dev',
      created_at: new Date()
    });

    //logger.info(`Created participant: ${participant_id} (${role})`);
    res.status(201).json({ 
      participant_id: participant_id,
      role: role
    });
  } catch (error) {
    //logger.error('Error creating participant:', error);
    res.status(500).json({ error: 'Failed to create participant' });
  }
});

// Update participant with socket ID for real-time features
app.post('/link-participant-socket', async (req, res) => {
  const { participant_id, socket_id } = req.body;
  
  try {
    await Participant.update(
      { socket_id: socket_id },
      { where: { participant_id: participant_id } }
    );
    
    res.status(200).json({ success: true });
  } catch (error) {
    //logger.error('Error linking participant socket:', error);
    res.status(500).json({ error: 'Failed to link socket' });
  }
});

// Update participant with expected outcome before chat
app.post('/update-expected-outcome', async (req, res) => {
  const { 
    participant_id, 
    expected_outcome, 
    preneg_target_price,
    preneg_justification,
    preneg_walkaway_point,
    preneg_expected_outcome
  } = req.body;
  
  try {
    // Handle socket_id → participant_id lookup if needed
    let whereClause;
    if (participant_id && participant_id.includes('-')) {
      // Looks like participant_id format (P-XXXX-XXXX)
      whereClause = { participant_id: participant_id };
    } else {
      // Assume it's socket_id, lookup by socket_id
      whereClause = { socket_id: participant_id };
    }
    
    const [affectedRows] = await Participant.update({
      target_price: preneg_target_price,
      justification: preneg_justification,
      walkaway_point: preneg_walkaway_point,
      expected_outcome: preneg_expected_outcome
    }, {
      where: whereClause
    });
    
    if (affectedRows === 0) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    //logger.info(`Updated expected outcome for ${participant_id}: ${preneg_expected_outcome}`);
    res.status(200).json({ success: true });
  } catch (error) {
    //logger.error('Error updating expected outcome:', error);
    res.status(500).json({ error: 'Failed to update expected outcome' });
  }
});



// Start chat session (set timing baseline and pair participants)
app.post('/start-chat-session', async (req, res) => {
  const { participant1_id, participant2_id } = req.body;
  
  try {
    const session_id = Participant.generateSessionId();
    const chat_start_time = new Date();
    
    // Update both participants with session info
    await Participant.update({
      session_id: session_id,
      partner_id: participant2_id,
      chat_started_at: chat_start_time
    }, {
      where: { participant_id: participant1_id }
    });
    
    await Participant.update({
      session_id: session_id,
      partner_id: participant1_id,
      chat_started_at: chat_start_time
    }, {
      where: { participant_id: participant2_id }
    });

    //logger.info(`Started chat session ${session_id}: ${participant1_id} <-> ${participant2_id}`);
    res.status(200).json({ 
      session_id: session_id,
      chat_started_at: chat_start_time 
    });
  } catch (error) {
    //logger.error('Error starting chat session:', error);
    res.status(500).json({ error: 'Failed to start chat session' });
  }
});

// Save chat message with relative timing
app.post('/save-chat-message', async (req, res) => {
  const { sender_participant_id, recipient_participant_id, message_text } = req.body;
  
  try {
    // Get sender's chat start time to calculate relative timing
    const sender = await Participant.findByPk(sender_participant_id);
    if (!sender || !sender.chat_started_at) {
      return res.status(400).json({ error: 'Chat not started for this participant' });
    }
    
    const relative_time = ChatMessage.calculateRelativeTime(sender.chat_started_at);
    
    const message = await ChatMessage.create({
      session_id: sender.session_id,
      sender_participant_id: sender_participant_id,
      recipient_participant_id: recipient_participant_id,
      message_text: message_text,
      seconds_since_chat_start: relative_time
    });

    //logger.debug(`Saved message: ${sender_participant_id} -> ${recipient_participant_id} at ${relative_time}s`);
    res.status(201).json({ 
      message_id: message.message_id,
      seconds_since_chat_start: relative_time 
    });
  } catch (error) {
    //logger.error('Error saving chat message:', error);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// Record final agreement
app.post('/record-agreement', async (req, res) => {
  const { session_id, final_agreement } = req.body;
  
  try {
    const end_time = new Date();
    
    // Get participants in this session
    const participants = await Participant.findAll({
      where: { session_id: session_id }
    });
    
    if (participants.length !== 2) {
      return res.status(400).json({ error: 'Invalid session - must have exactly 2 participants' });
    }
    
    // Calculate duration for both participants
    const duration_seconds = Math.floor((end_time - new Date(participants[0].chat_started_at)) / 1000);
    
    // Update both participants
    await Participant.update({
      final_agreement: final_agreement,
      agreement_reached: true,
      negotiation_duration_seconds: duration_seconds,
      chat_ended_at: end_time
    }, {
      where: { session_id: session_id }
    });

    //logger.info(`Recorded agreement for session ${session_id}: $${final_agreement} (${duration_seconds}s)`);
    res.status(200).json({ 
      success: true,
      agreement_amount: final_agreement,
      duration_seconds: duration_seconds 
    });
  } catch (error) {
    //logger.error('Error recording agreement:', error);
    res.status(500).json({ error: 'Failed to record agreement' });
  }
});

// Record demographics from end survey (HTTP endpoint - legacy/backup)
app.post('/record-demographics', async (req, res) => {
  const { 
    participant_id, 
    age, 
    gender, 
    education, 
    experience_negotiating,
    demo_gender,
    demo_age,
    demo_ethnicity,
    demo_education,
    demo_political_orientation,
    demo_negotiation_experience,
    demo_comments
  } = req.body;
  
  try {
    // Handle socket_id → participant_id lookup if needed
    let whereClause;
    if (participant_id && participant_id.includes('-')) {
      // Looks like participant_id format (P-XXXX-XXXX)
      whereClause = { participant_id: participant_id };
    } else {
      // Assume it's socket_id, lookup by socket_id
      whereClause = { socket_id: participant_id };
    }
    
    // Check existing dropout stage to preserve partnerDisconnected status
    const existingParticipant = await Participant.findOne({
      where: whereClause
    });

    // Determine final dropout stage:
    // - partnerDisconnected: Always preserve (their partner left during chat)
    // - waitingTimeout: Only preserve if not matched (timed out in waiting room)
    // - Otherwise: Mark as completed
    const wasMatched = existingParticipant?.partner_id && existingParticipant?.session_id;
    let finalDropoutStage = 'completed';
    if (existingParticipant?.dropout_stage === 'partnerDisconnected') {
      // Partner disconnected during chat - always preserve this status
      finalDropoutStage = 'partnerDisconnected';
    } else if (existingParticipant?.dropout_stage === 'waitingTimeout' && !wasMatched) {
      // Timed out waiting and never matched - preserve this status
      finalDropoutStage = 'waitingTimeout';
    }

    const [affectedRows] = await Participant.update({
      gender: demo_gender || gender,
      age: demo_age || age,
      ethnicity: demo_ethnicity,
      education: demo_education || education,
      political_orientation: demo_political_orientation,
      negotiation_experience: demo_negotiation_experience || experience_negotiating,
      comments: demo_comments,
      completed_study: true,
      dropout_stage: finalDropoutStage, // Preserve waitingTimeout/partnerDisconnected or mark as completed
      chat_ended_at: new Date()
    }, {
      where: whereClause
    });

    console.log(`✅ SERVER: Demographics saved via HTTP for participant with dropout_stage: ${finalDropoutStage}`);

    //console.log(`✅ SERVER: Demographics saved successfully via HTTP for participant ID: ${participant_id}`);
    //logger.info(`Recorded demographics via HTTP for participant: ${participant_id} - study completed`);
    
    // For HTTP endpoint, we can't easily clean up socket-based user data
    // The main cleanup should happen through the socket-based submitDemographics handler
    
    res.status(200).json({ 
      success: true,
      message: 'Demographics recorded successfully' 
    });
    
  } catch (error) {
    console.error(`❌ SERVER: Error recording demographics via HTTP:`, error);
    //logger.error('Error recording demographics via HTTP:', error);
    res.status(500).json({ 
      error: 'Failed to record demographics' 
    });
  }
});

// Record quiz responses with attempt tracking
app.post('/record-quiz-responses', async (req, res) => {
  const { 
    participant_id, 
    quiz_q1_answer,
    quiz_q2_answer, 
    quiz_q3_answer,
    quiz_score,
    quiz_passed,
    quiz_attempts
  } = req.body;
  
  try {
    // Handle socket_id → participant_id lookup if needed
    let whereClause;
    if (participant_id && participant_id.includes('-')) {
      // Looks like participagit statgit add nt_id format (P-XXXX-XXXX)
      whereClause = { participant_id: participant_id };
    } else {
      // Assume it's socket_id, lookup by socket_id
      whereClause = { socket_id: participant_id };
    }
    
    // CRITICAL: Check if quiz data already exists to prevent duplicate submissions
    const existingParticipant = await Participant.findOne({
      where: whereClause,
      attributes: ['participant_id', 'quiz_q1', 'quiz_q1_retake', 'quiz_attempts', 'quiz_passed']
    });

    if (!existingParticipant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    // Check for duplicate submission based on attempt number
    const alreadyHasData = quiz_attempts === 1 
      ? existingParticipant.quiz_q1 !== null 
      : existingParticipant.quiz_q1_retake !== null;

    if (alreadyHasData) {
      console.log(`⚠️ QUIZ: Data already exists for ${existingParticipant.participant_id} attempt ${quiz_attempts} - preventing duplicate submission`);
      return res.status(200).json({ success: true }); // Return success to prevent client-side errors
    }
    
    // Determine which columns to update based on attempt number
    let updateData = {
      quiz_score: quiz_score,
      quiz_passed: quiz_passed,
      quiz_attempts: quiz_attempts
    };
    
    if (quiz_attempts === 1) {
      // First attempt - use regular columns
      updateData.quiz_q1 = quiz_q1_answer;
      updateData.quiz_q2 = quiz_q2_answer;
      updateData.quiz_q3 = quiz_q3_answer;
    } else if (quiz_attempts === 2) {
      // Second attempt - use retake columns
      updateData.quiz_q1_retake = quiz_q1_answer;
      updateData.quiz_q2_retake = quiz_q2_answer;
      updateData.quiz_q3_retake = quiz_q3_answer;
    }
    
    const [affectedRows] = await Participant.update(updateData, {
      where: whereClause
    });
    
    if (affectedRows === 0) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    //logger.info(`Recorded quiz responses for ${participant_id} (Score: ${quiz_score}, Passed: ${quiz_passed}, Attempt: ${quiz_attempts})`);
    res.status(200).json({ success: true });
  } catch (error) {
    //logger.error('Error recording quiz responses:', error);
    res.status(500).json({ error: 'Failed to record quiz responses' });
  }
});



// Record dropout
app.post('/record-dropout', async (req, res) => {
  const { participant_id, dropout_stage } = req.body;
  
  try {
    await Participant.update({
      dropout_stage: dropout_stage,
      chat_ended_at: new Date()
    }, {
      where: { participant_id: participant_id }
    });

    //logger.info(`Recorded dropout for ${participant_id} at stage: ${dropout_stage}`);
    res.status(200).json({ success: true });
  } catch (error) {
    //logger.error('Error recording dropout:', error);
    res.status(500).json({ error: 'Failed to record dropout' });
  }
});

// Record mobile exclusion
app.post('/record-mobile-exclusion', async (req, res) => {
  const { worker_id } = req.body;
  
  try {
    // Try to find or create a participant record for this mobile user
    let participant = await Participant.findOne({ where: { worker_id: worker_id } });
    
    if (!participant) {
      // Create minimal participant record for mobile exclusion tracking
      const participant_id = Participant.generateParticipantId();
      participant = await Participant.create({
        participant_id: participant_id,
        worker_id: worker_id,
        role: null, // No role assigned for mobile users
        socket_id: null,
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'dev',
        dropout_stage: 'mobileRestricted',
        created_at: new Date(),
        chat_ended_at: new Date()
      });
      //logger.info(`Created participant record for mobile exclusion: ${participant_id}`);
    } else {
      // Update existing record
      await Participant.update({
        dropout_stage: 'mobileRestricted',
        chat_ended_at: new Date()
      }, {
        where: { participant_id: participant.participant_id }
      });
      //logger.info(`Updated existing participant for mobile exclusion: ${participant.participant_id}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    //logger.error('Error recording mobile exclusion:', error);
    res.status(500).json({ error: 'Failed to record mobile exclusion' });
  }
});

// Record comprehension check failure
app.post('/record-compcheck-failure', async (req, res) => {
  const { participant_id } = req.body;
  
  try {
    await Participant.update({
      dropout_stage: 'comprehensionCheckFailed',
      chat_ended_at: new Date()
    }, {
      where: { participant_id: participant_id }
    });

    //logger.info(`Recorded comprehension check failure for ${participant_id}`);
    res.status(200).json({ success: true });
  } catch (error) {
    //logger.error('Error recording comprehension check failure:', error);
    res.status(500).json({ error: 'Failed to record comprehension check failure' });
  }
});

// Save negotiation offer with participant IDs
app.post('/save-negotiation-offer', async (req, res) => {
  const { sender_participant_id, recipient_participant_id, offer_amount, status } = req.body;
  
  try {
    // Get sender's session info for context
    const sender = await Participant.findByPk(sender_participant_id);
    if (!sender) {
      return res.status(400).json({ error: 'Sender participant not found' });
    }
    
    // Calculate relative timing if chat has started
    let seconds_since_chat_start = null;
    if (sender.chat_started_at) {
      seconds_since_chat_start = Math.floor((new Date() - new Date(sender.chat_started_at)) / 1000);
    }
    
    // For now, we'll log offers but could create a negotiation_offers table later
    //logger.info(`Offer: ${sender_participant_id} -> ${recipient_participant_id}: $${offer_amount} (${status}) at ${seconds_since_chat_start}s`);
    
    res.status(201).json({ 
      success: true,
      offer_amount: offer_amount,
      status: status,
      seconds_since_chat_start: seconds_since_chat_start
    });
  } catch (error) {
    //logger.error('Error saving offer:', error);
    res.status(500).json({ error: 'Failed to save offer' });
  }
});

// Get participant by socket ID (for bridging with socket system)
app.get('/participant-by-socket/:socketId', async (req, res) => {
  const { socketId } = req.params;
  
  try {
    const participant = await Participant.findOne({
      where: { socket_id: socketId }
    });
    
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    
    res.status(200).json(participant);
  } catch (error) {
    //logger.error('Error finding participant:', error);
    res.status(500).json({ error: 'Failed to find participant' });
  }
});




// Simple health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Removed detailed stats endpoint - use /dashboard-data instead

// Page tracking endpoint for experiment progress
app.post('/track-page', (req, res) => {
  const { socketId, page } = req.body;
  
  if (!socketId || !page) {
    return res.status(400).json({ error: 'Missing socketId or page' });
  }

  // Map page to experiment stage
  const stage = experimentStages[page] || 'unknown';
  userProgress.set(socketId, stage);
  
  //logger.debug(`User ${socketId} progressed to ${page} (stage: ${stage})`);
  res.status(200).json({ success: true, stage });
});









// Socket.IO connection functions

// Get balanced role based on current waiting users
const getBalancedRole = () => {
  let waitingBuyers = 0;
  let waitingSellers = 0;

  for (const [socketId, userData] of waitingUsers) {
    // Skip users without assigned roles (null roles from new connections)
    if (userData.role && userData.role.includes("Seller")) {
      waitingSellers++;
    } else if (userData.role && userData.role.includes("Buyer")) {
      waitingBuyers++;
    }
  }

  if (waitingSellers > waitingBuyers) {
    return buyers[Math.floor(Math.random() * buyers.length)];
  } else if (waitingBuyers > waitingSellers) {
    return sellers[Math.floor(Math.random() * sellers.length)];
  } else {
    // Equal numbers or no waiting users - assign random role
    const allRoles = [...buyers, ...sellers];
    return allRoles[Math.floor(Math.random() * allRoles.length)];
  }
};

// Function removed - using direct matching logic in reachedMain handler

// Enhanced periodic cleanup for orphaned connections and stale users (every 10 minutes)
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  const STALE_CONNECTION_TIMEOUT = timeouts.STALE_CONNECTION_TIMEOUT;
  const ACTIVE_PARTICIPANT_TIMEOUT = timeouts.ACTIVE_PARTICIPANT_TIMEOUT;
  let cleanedUp = 0;
  let staleWaitingUsers = 0;
  let longStuckPairing = 0;

  // Clean up orphaned socket connections (but only after 1 hour)
  for (const [socketId, socketData] of connectedSockets) {
    const timeSinceLastSeen = now - socketData.lastSeen;
    
    // Don't cleanup active participants who might be spending time on forms
    const isActiveParticipant = waitingUsers.has(socketId) || activeUsers.has(socketId);
    const timeoutToUse = isActiveParticipant ? ACTIVE_PARTICIPANT_TIMEOUT : STALE_CONNECTION_TIMEOUT;
    
    if (timeSinceLastSeen > timeoutToUse) {
      console.log(`🧹 SERVER: Cleaning up stale connection: ${socketId} (inactive for ${Math.floor(timeSinceLastSeen / 60000)} minutes)`);
      cleanupUser(socketId);
      cleanedUp++;
    }
  }
  
  // Clean up waiting users with stale sockets or stuck in pairing too long
  for (const [socketId, userData] of waitingUsers) {
    const socket = getSocket(socketId);
    if (!socket) {
      // Don't auto-remove users who have timed out and may be completing demographics
      if (userData.timedOut || userData.postChat) {
        // Keep timed-out users for longer to allow demographics completion
        const timeSinceTimeout = userData.chatEndedAt ? (now - new Date(userData.chatEndedAt).getTime()) : 0;
        const thirtyMinutes = timeouts.DEMOGRAPHICS_COMPLETION_TIMEOUT;
        
        if (timeSinceTimeout > thirtyMinutes) {
          //logger.info(`🧹 Auto-removing very stale timed-out user: ${socketId} (${userData.role}) after ${Math.floor(timeSinceTimeout / 60000)} minutes`);
          waitingUsers.delete(socketId);
          staleWaitingUsers++;
        }
      } else {
        //logger.info(`🧹 Auto-removing stale waiting user: ${socketId} (${userData.role})`);
        waitingUsers.delete(socketId);
        staleWaitingUsers++;
      }
    } else if (userData.pairing && userData.waitingStartTime && (now - userData.waitingStartTime) > timeouts.PAIRING_STUCK_TIMEOUT) {
      // Fix users stuck in pairing state for over 2 minutes
      //logger.info(`🧹 Auto-fixing long stuck pairing user: ${socketId} (${userData.role}), stuck for ${Math.floor((now - userData.waitingStartTime) / 1000)}s`);
      const success = resetUserToWaiting(socketId, ' (auto-cleanup)');
      if (success) longStuckPairing++;
    }
  }
  
  const totalCleaned = cleanedUp + staleWaitingUsers + longStuckPairing;
  if (totalCleaned > 0) {
    //logger.info(`🧹 Periodic cleanup completed: ${cleanedUp} orphaned connections, ${staleWaitingUsers} stale waiting users, ${longStuckPairing} stuck pairing users. Active: ${connectedSockets.size}, Waiting: ${waitingUsers.size}, In chat: ${activeUsers.size}`);
  }
}, timeouts.CLEANUP_INTERVAL);

// Periodic cleanup for old progress tracking data (every hour)
setInterval(() => {
  const progressSize = userProgress.size;
  const MAX_PROGRESS_ENTRIES = 1000; // Keep last 1000 progress entries
  
  if (progressSize > MAX_PROGRESS_ENTRIES) {
    // Convert to array, sort by recent activity, keep most recent entries
    const progressEntries = Array.from(userProgress.entries());
    const entriesToKeep = progressEntries.slice(-MAX_PROGRESS_ENTRIES);
    
    userProgress.clear();
    entriesToKeep.forEach(([socketId, stage]) => {
      userProgress.set(socketId, stage);
    });
    
    //logger.info(`Cleaned up old progress data: ${progressSize} -> ${userProgress.size} entries`);
  }
}, timeouts.PROGRESS_CLEANUP_INTERVAL);

// Start active matching interval - checks every 5 seconds for waiting users
if (!DEMO_MODE) {
  autoMatchingInterval = setInterval(async () => {
    try {
      await attemptActiveMatching();
    } catch (error) {
      console.error('❌ Error in active matching:', error);
    }
  }, 5000); // Check every 5 seconds
  console.log('🔄 Active matching system started - checking every 5 seconds');
} else {
  console.log('DEMO MODE: Automatic matching disabled (users are auto-matched individually)');
}

// Demo mode: auto-match a solo user with a simulated partner
const demoAutoMatch = async (socketId, socket, currentUser) => {
  try {
    const userData = waitingUsers.get(socketId);
    if (!userData || !userData.waiting || userData.pairing) return;

    // Create a complementary partner role
    const partnerRole = currentUser.role.includes('Buyer')
      ? (currentUser.role.includes('optimistic') ? 'pessimisticSeller' : 'optimisticSeller')
      : (currentUser.role.includes('optimistic') ? 'pessimisticBuyer' : 'optimisticBuyer');

    const partnerParticipantId = Participant.generateParticipantId();
    await Participant.create({
      participant_id: partnerParticipantId,
      worker_id: 'demo-partner',
      role: partnerRole,
      environment: 'demo',
      created_at: new Date()
    });

    const session_id = Participant.generateSessionId();
    const chatRoomName = crypto.randomBytes(12).toString('hex');
    const chat_start_time = new Date();

    // Update both participants in DB
    await Participant.update({
      session_id, partner_id: partnerParticipantId,
      partner_role: partnerRole, chat_started_at: chat_start_time
    }, { where: { participant_id: currentUser.participant_id } });

    await Participant.update({
      session_id, partner_id: currentUser.participant_id,
      partner_role: currentUser.role, chat_started_at: chat_start_time
    }, { where: { participant_id: partnerParticipantId } });

    // Cancel waiting timeout
    if (userData.timeoutId) {
      clearTimeout(userData.timeoutId);
      userData.timeoutId = null;
    }

    // Move user to active state
    waitingUsers.delete(socketId);
    activeUsers.set(socketId, {
      ...userData,
      roomName: chatRoomName,
      partnerId: null,
      session_id: session_id,
      waiting: false,
      pairing: false,
      demoPartnerParticipantId: partnerParticipantId
    });

    userProgress.set(socketId, 'inChat');
    socket.join(chatRoomName);

    socket.emit('waiting', 'Partner found! Starting in 3 seconds...');

    setTimeout(() => {
      socket.emit('joinRoom', chatRoomName, {
        session_id: session_id,
        participant_id: currentUser.participant_id,
        partner_participant_id: partnerParticipantId,
        chat_started_at: chat_start_time
      });
    }, 3000);

    // Set up chat timeout
    const chatTimeoutId = setTimeout(async () => {
      const user = activeUsers.get(socketId);
      if (user) {
        io.to(chatRoomName).emit('chatSessionTimeout', {
          session_id, message: 'Chat time has expired'
        });
        activeUsers.delete(socketId);
        waitingUsers.set(socketId, {
          ...user, waiting: false, pairing: false,
          postChat: true, chatEndedAt: new Date()
        });
      }
    }, timeouts.CHAT_SESSION_TIMEOUT);

    const activeData = activeUsers.get(socketId);
    if (activeData) {
      activeData.chatTimeoutId = chatTimeoutId;
      activeUsers.set(socketId, activeData);
    }

    console.log(`DEMO: Auto-matched ${currentUser.participant_id} with simulated partner ${partnerParticipantId}`);
  } catch (error) {
    console.error('Demo auto-match error:', error);
  }
};

io.on('connection', (socket) => {
  const socketId = socket.id;
  let lastHeartbeat = Date.now();
  
  // CRITICAL FIX: Add socket to connectedSockets Map for cleanup tracking
  connectedSockets.set(socketId, {
    connectedAt: Date.now(),
    lastSeen: Date.now()
  });
  
  // Initialize connection monitoring  
  const updateLastSeen = () => {
    lastHeartbeat = Date.now();
    // Update both local tracking and connectedSockets Map
    const socketData = connectedSockets.get(socketId);
    if (socketData) {
      socketData.lastSeen = Date.now();
      connectedSockets.set(socketId, socketData);
    }
  };

  // Heartbeat monitoring
  socket.on('heartbeat', (timestamp) => {
    updateLastSeen();
    socket.emit('heartbeat_ack', Date.now());
  });

  // Enhanced state restoration handler
  socket.on('restoreUserState', async (data) => {
    updateLastSeen();
    
    try {
      const { workerId, participantId } = data;
      if (!workerId && !participantId) {
        socket.emit('error', 'Worker ID or Participant ID required for state restoration');
        return;
      }

      // Find participant by worker_id or participant_id
      let whereClause = {};
      if (participantId) {
        whereClause.participant_id = participantId;
      } else {
        whereClause.worker_id = workerId;
      }

      const participant = await Participant.findOne({
        where: whereClause
      });

      if (participant) {
        console.log(`🔄 SERVER: Restoring state for ${workerId || participantId} (${participant.participant_id}) - dropout_stage: ${participant.dropout_stage}`);
        
        // Update socket_id to current connection
        await Participant.update(
          { socket_id: socketId },
          { where: { participant_id: participant.participant_id } }
        );

        // Restore user to appropriate map based on their current stage
        const userData = {
          participant_id: participant.participant_id,
          role: participant.role,
          partner_id: participant.partner_id,
          session_id: participant.session_id,
          waiting: false,
          pairing: false,
          created_at: participant.created_at,
          dropout_stage: participant.dropout_stage
        };

        // Enhanced logic to handle different participant states
        if (participant.dropout_stage === 'waitingTimeout' || participant.dropout_stage === 'partnerDisconnected') {
          // User has timed out or partner disconnected - they need to complete demographics
          userData.timedOut = true;
          userData.postChat = true;
          userData.chatEndedAt = participant.chat_ended_at || new Date();
          waitingUsers.set(socketId, userData);
          userProgress.set(socketId, 'waitingTimeout');
          
          console.log(`✅ SERVER: Restored timed-out user ${participant.participant_id} for demographics completion`);
          
          // Immediately redirect to timeout page if they're not already there
          socket.emit('stateRestored', { 
            isTimedOut: true, 
            participant_id: participant.participant_id,
            role: participant.role,
            shouldRedirectToTimeout: true 
          });
          
        } else if (participant.session_id && participant.partner_id && !participant.completed_study) {
          // User is/was in an active session
          activeUsers.set(socketId, userData);
          userProgress.set(socketId, 'inChat');
          
          socket.emit('participantCreated', {
            participant_id: participant.participant_id,
            role: participant.role
          });
          socket.emit('assignSelf', socketId, participant.role, participant.partner_id);
          
        } else if (!participant.completed_study) {
          // Restore user to PRE CHAT state; only mark as waiting once they reach the main page
          userData.waiting = false;
          userData.waitingStartTime = null;
          waitingUsers.set(socketId, userData);
          userProgress.set(socketId, 'preChat');

          socket.emit('participantCreated', {
            participant_id: participant.participant_id,
            role: participant.role
          });
          socket.emit('assignSelf', socketId, participant.role, null);
          
        } else {
          // User has completed the study
          socket.emit('stateRestored', { 
            isCompleted: true,
            participant_id: participant.participant_id,
            shouldRedirectToPayment: true
          });
        }
        
        console.log(`✅ SERVER: Restored state for ${workerId || participantId} (${participant.participant_id}) on socket ${socketId}`);
      } else {
        // No existing participant - this is expected for new users
        console.log(`ℹ️ SERVER: No existing participant found for ${workerId || participantId} - new user`);
        socket.emit('stateRestored', { isNewUser: true });
      }
    } catch (error) {
      console.error(`❌ SERVER: Error restoring state for socket ${socketId}:`, error);
      socket.emit('error', 'Failed to restore user state');
    }
  });

  // Note: Disconnect handling is done by the main disconnect handler later in the file

  // Enhanced participant creation with confirmation and race condition prevention
  socket.on('submitWorkerId', async (workerId) => {
    updateLastSeen();
    
    try {
      // CRITICAL: Check if user already has a participant_id to prevent duplicate creation
      const currentUser = waitingUsers.get(socketId);
      if (currentUser && currentUser.participant_id) {
        console.log(`⚠️ User ${socketId} already has participant_id: ${currentUser.participant_id} - ignoring duplicate submitWorkerId`);
        socket.emit('submitWorkerIdRecorded');
        return;
      }
      
      // Check if participant already exists in database (proper duplicate check)
      const existingParticipant = await Participant.findOne({
        where: { worker_id: workerId }
      });
      
      if (existingParticipant) {
        // CRITICAL: Check if participant is already in an active session
        if (existingParticipant.session_id && !existingParticipant.chat_ended_at) {
          console.log(`❌ Participant ${existingParticipant.participant_id} already in active session ${existingParticipant.session_id}`);
          socket.emit('error', 'You are already participating in an active session. Please wait for it to complete.');
          return;
        }
        
        // User reconnecting - restore their state from database
        waitingUsers.set(socketId, {
          participant_id: existingParticipant.participant_id,
          role: existingParticipant.role,
          socketId: socketId,
          waiting: false,
          pairing: false,
          session_id: existingParticipant.session_id, // Preserve existing session_id
          created_at: existingParticipant.created_at
        });
        
        // Update socket_id in database atomically
        await Participant.update(
          { 
            socket_id: socketId,
            last_seen_at: new Date()
          },
          { where: { participant_id: existingParticipant.participant_id } }
        );
        
        socket.emit('participantCreated', {
          participant_id: existingParticipant.participant_id,
          role: existingParticipant.role
        });
        
        socket.emit('assignSelf', socketId, existingParticipant.role, null);
        socket.emit('submitWorkerIdRecorded');
        console.log(`✅ SERVER: Restored existing participant ${existingParticipant.participant_id} for worker ${workerId}`);
        return;
      }

      // Create new participant (existing logic)
      const participant_id = Participant.generateParticipantId();
      const finalRole = getBalancedRole();
      
      const participantData = {
        participant_id: participant_id,
        worker_id: workerId,
        role: finalRole,
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'dev',
        socket_id: socketId,
        created_at: new Date()
      };

      await Participant.create(participantData);
      
      // Store in waiting users
      waitingUsers.set(socketId, {
        participant_id: participant_id,
        role: finalRole,
        waiting: false,
        pairing: false,
        created_at: new Date()
      });

      userProgress.set(socketId, 'registered');
      
      socket.emit('participantCreated', {
        participant_id: participant_id,
        role: finalRole
      });
      
      socket.emit('assignSelf', socketId, finalRole, null);
      socket.emit('submitWorkerIdRecorded'); // New confirmation event
      
      console.log(`✅ SERVER: Created participant ${participant_id} for worker ${workerId} on socket ${socketId}`);
      
    } catch (error) {
      console.error(`❌ SERVER: Error processing participant for ${socketId}:`, error);
      socket.emit('error', 'Failed to process participant record');
    }
  });

  // Add confirmation events for all submission types
  socket.on('submitQuizResponses', async (quizData) => {
    updateLastSeen();
    
    try {
      const userData = activeUsers.get(socketId) || waitingUsers.get(socketId);
      if (!userData || !userData.participant_id) {
        socket.emit('error', 'Participant not found');
        return;
      }

      // Determine which columns to update based on attempt number
      let updateData = {
        quiz_score: quizData.quiz_score,
        quiz_passed: quizData.quiz_passed,
        quiz_attempts: quizData.quiz_attempts
      };
      
      if (quizData.quiz_attempts === 1) {
        updateData.quiz_q1 = quizData.quiz_q1_answer;
        updateData.quiz_q2 = quizData.quiz_q2_answer;
        updateData.quiz_q3 = quizData.quiz_q3_answer;
      } else if (quizData.quiz_attempts === 2) {
        updateData.quiz_q1_retake = quizData.quiz_q1_answer;
        updateData.quiz_q2_retake = quizData.quiz_q2_answer;
        updateData.quiz_q3_retake = quizData.quiz_q3_answer;
      }

      await Participant.update(updateData, {
        where: { participant_id: userData.participant_id }
      });

      socket.emit('submitQuizResponsesRecorded'); // New confirmation event
      
    } catch (error) {
      console.error('Error recording quiz responses:', error);
      socket.emit('error', 'Failed to record quiz responses');
    }
  });

  // Enhanced demographics handler with automatic session recovery
  socket.on('submitDemographics', async (demographicsData) => {
    updateLastSeen();
    
    try {
      // Use enhanced session recovery
      const SessionManager = require('./utils/session-manager');
      const sessionManager = new SessionManager();
      const userData = await sessionManager.getOrRestoreSession(socketId, waitingUsers, activeUsers);
      
      if (!userData || !userData.participant_id) {
        socket.emit('error', 'Session expired. Please refresh the page and try again.');
        return;
      }

      // Check existing dropout stage to preserve partnerDisconnected status
      const existingParticipant = await Participant.findOne({
        where: { participant_id: userData.participant_id }
      });

      // CRITICAL: Check if demographics already submitted to prevent duplicate submissions
      if (existingParticipant?.completed_study) {
        console.log(`⚠️ DEMOGRAPHICS: Already completed for ${userData.participant_id} - preventing duplicate submission`);
        socket.emit('demographicsRecorded'); // Still emit success to prevent client-side errors
        return;
      }

      // Determine final dropout stage:
      // - partnerDisconnected: Always preserve (their partner left during chat)
      // - waitingTimeout: Only preserve if not matched (timed out in waiting room)
      // - Otherwise: Mark as completed
      const wasMatched = existingParticipant?.partner_id && existingParticipant?.session_id;
      let finalDropoutStage = 'completed';
      if (existingParticipant?.dropout_stage === 'partnerDisconnected') {
        // Partner disconnected during chat - always preserve this status
        finalDropoutStage = 'partnerDisconnected';
      } else if (existingParticipant?.dropout_stage === 'waitingTimeout' && !wasMatched) {
        // Timed out waiting and never matched - preserve this status
        finalDropoutStage = 'waitingTimeout';
      }

      const updateResult = await Participant.update({
        gender: demographicsData.demo_gender,
        age: demographicsData.demo_age,
        ethnicity: demographicsData.demo_ethnicity,
        education: demographicsData.demo_education,
        political_orientation: demographicsData.demo_political_orientation,
        negotiation_experience: demographicsData.demo_negotiation_experience,
        comments: demographicsData.demo_comments,
        completed_study: true,
        dropout_stage: finalDropoutStage,
        chat_ended_at: userData.chatEndedAt || new Date()
      }, {
        where: { participant_id: userData.participant_id }
      });
      
      if (updateResult[0] === 0) {
        console.log(`❌ DATABASE: No participant updated for ${userData.participant_id}`);
        socket.emit('error', 'Failed to save demographics. Please try again.');
        return;
      }

      console.log(`✅ DEMOGRAPHICS: Saved for ${userData.participant_id} with dropout_stage: ${finalDropoutStage}`);
      
      // Clean up user data after successful demographics submission
      // Remove from both activeUsers and waitingUsers to ensure they don't appear in dashboard counts
      const wasInActiveUsers = activeUsers.has(socketId);
      const wasInWaitingUsers = waitingUsers.has(socketId);
      
      activeUsers.delete(socketId);
      waitingUsers.delete(socketId);
      userProgress.set(socketId, 'completedSuccess');
      
      console.log(`🧹 SERVER: Cleaned up completed user ${socketId} (was in activeUsers: ${wasInActiveUsers}, waitingUsers: ${wasInWaitingUsers})`);
      
      // Send both events for compatibility
      socket.emit('submitDemographicsRecorded');
      socket.emit('demographicsRecorded');
      
    } catch (error) {
      console.error('❌ DEMOGRAPHICS: Error recording demographics:', error);
      socket.emit('error', 'Failed to record demographics. Please try again.');
    }
  });

  // Enhanced expected outcome handler with automatic session recovery
  socket.on('submitExpectedOutcome', async (data) => {
    updateLastSeen();
    
    try {
      // Use enhanced session recovery
      const SessionManager = require('./utils/session-manager');
      const sessionManager = new SessionManager();
      const userData = await sessionManager.getOrRestoreSession(socketId, waitingUsers, activeUsers);
      
      if (!userData || !userData.participant_id) {
        socket.emit('error', 'Session expired. Please refresh the page and try again.');
        return;
      }

      // Update the database with expected outcome data
      const updateResult = await Participant.update({
        target_price: data.preneg_target_price,
        justification: data.preneg_justification,
        walkaway_point: data.preneg_walkaway_point,
        expected_outcome: data.preneg_expected_outcome
      }, {
        where: { participant_id: userData.participant_id }
      });
      
      if (updateResult[0] === 0) {
        console.log(`❌ DATABASE: No participant updated for ${userData.participant_id}`);
        socket.emit('error', 'Failed to save data. Please try again.');
        return;
      }

      console.log(`✅ OUTCOME: Saved expected outcome for ${userData.participant_id}`);
      socket.emit('expectedOutcomeRecorded');
      
    } catch (error) {
      console.error('❌ OUTCOME: Error recording expected outcome:', error);
      socket.emit('error', 'Failed to record expected outcome. Please try again.');
    }
  });



  // Listen for user reaching the main page (chat stage) - WITH ATOMIC MATCHING
  socket.on('reachedMain', async () => {
    updateLastSeen();
    
    // ATOMIC MATCHING: Prevent race conditions with semaphore
    if (matchingInProgress) {
      // Don't block the user - they'll be matched by the 5-second attemptActiveMatching interval
      // or by the 500ms delayed attemptActiveMatching after their state settles
      // Just set their waiting state so they're eligible for matching
      const currentUser = waitingUsers.get(socketId);
      if (currentUser && !currentUser.waiting && !currentUser.pairing) {
        currentUser.waiting = true;
        currentUser.waitingStartTime = Date.now();
        waitingUsers.set(socketId, currentUser);
      }
      return;
    }
    
    if (!waitingUsers.has(socketId)) {
      //logger.error(`❌ User ${socketId} reached main but not in waiting list`);
      return;
    }

    const currentUser = waitingUsers.get(socketId);
    
    // Require participant ID before allowing chat
    if (!currentUser.participant_id) {
      //logger.warn(`⚠️ User ${socketId} reached main without participant_id - role: ${currentUser.role}`);
      socket.emit('error', 'Must submit worker ID before entering chat');
      userProgress.set(socketId, 'preChat');
      return;
    }
    
    //logger.info(`✅ User ${socketId} reached main with participant_id: ${currentUser.participant_id}, role: ${currentUser.role}`);
    
    // Check if user is already waiting for matches or in pairing process (prevent duplicate reachedMain calls)
    if (currentUser.waiting || currentUser.pairing) {
      //logger.info(`⚠️ User ${socketId} already waiting (${currentUser.waiting}) or pairing (${currentUser.pairing}) - ignoring duplicate reachedMain`);
      return;
    }
    
    // Check if user already has a matching lock (prevent concurrent matching attempts)
    if (matchingLocks.has(socketId)) {
      console.log(`⚠️ User ${socketId} already has matching lock - ignoring duplicate reachedMain`);
      return;
    }
    
    // Set per-user matching lock
    matchingLocks.set(socketId, Date.now());
    
    // Set global matching lock
    matchingInProgress = true;
    
    // Track whether matching was scheduled (to avoid premature lock release)
    let matchingScheduled = false;
    
    try {
      // NOW the user is ready to be matched - set waiting to true
      currentUser.waiting = true;
      currentUser.waitingStartTime = Date.now();
      waitingUsers.set(socketId, currentUser);
      
      //console.log(`🕐 SERVER: User ${socketId} starting to wait for partner at ${new Date().toISOString()}`);
      //logger.info(`🔄 User ${socketId} now available for matching`);
      
      // Set up 10-minute timeout for this user and store the timeout ID
      const timeoutId = setupWaitingTimeout(socketId, socket, '');
      
      // Store timeout ID for later cancellation
      currentUser.timeoutId = timeoutId;
      waitingUsers.set(socketId, currentUser);
      //console.log(`💾 SERVER: Stored timeout ID ${timeoutId} for user ${socketId}`);
      
      // CRITICAL: Trigger active matching immediately when user starts waiting
      setTimeout(async () => {
        try {
          await attemptActiveMatching();
        } catch (error) {
          console.error('❌ Error in immediate active matching:', error);
        }
      }, 500); // Small delay to let state settle
      
      // COMPREHENSIVE DEBUG: Show all current users and their states
      //logger.info(`🔍 MATCHING DEBUG for ${socketId}:`);
      //logger.info(`  Current user: role=${currentUser.role}, participant_id=${currentUser.participant_id}, waiting=${currentUser.waiting}, pairing=${currentUser.pairing}`);
      
      let availablePartners = [];
      for (const [id, data] of waitingUsers) {
        // Skip users without assigned roles to prevent null pointer errors
        if (!data.role || !currentUser.role) {
          //logger.info(`  ${id}: role=${data.role}, skipping due to null role`);
          continue;
        }
        
        const compatible = (
          (currentUser.role.includes("Buyer") && data.role.includes("Seller")) ||
          (currentUser.role.includes("Seller") && data.role.includes("Buyer"))
        );
        
        //logger.info(`  ${id}: role=${data.role}, waiting=${data.waiting}, pairing=${data.pairing}, hasID=${!!data.participant_id}, compatible=${compatible}, readyToMatch=${data.waiting && data.participant_id && data.waitingStartTime}`);
        
        // Only match users who are truly ready: waiting=true, has participant_id, has reached main page (waitingStartTime set), and no matching lock
        if (id !== socketId && data.waiting && !data.pairing && data.participant_id && data.waitingStartTime && compatible && !matchingLocks.has(id)) {
          availablePartners.push({ socketId: id, userData: data });
        }
      }
      
      //logger.info(`🎯 Found ${availablePartners.length} available partners for ${socketId}`);
      
      if (availablePartners.length === 0) {
        //logger.info(`❌ No available partners for ${socketId}. User will wait.`);
        socket.emit('waiting', 'Waiting for another user to join...');

        // In demo mode, auto-match the user with a simulated partner
        if (DEMO_MODE) {
          setTimeout(async () => {
            await demoAutoMatch(socketId, socket, currentUser);
          }, 2000);
        }
        return;
      }
      
      // Take the first available partner
      const match = availablePartners[0];
      //logger.info(`✅ MATCHING: ${currentUser.role} (${socketId}) <-> ${match.userData.role} (${match.socketId})`);
      
      // Verify partner socket still exists
      const partnerSocket = getSocket(match.socketId);
      if (!partnerSocket) {
        waitingUsers.delete(match.socketId);
        // Don't try to emit to client - just return and let attemptActiveMatching handle it
        // The current user's waiting state is already set, so they'll be matched on the next interval
        return;
      }
      
      // Set both users to pairing state to prevent double matching
      currentUser.pairing = true;
      match.userData.pairing = true;
      
      // Pairing recovery: if anything goes wrong before joinRoom, don't leave users stuck in pairing state
      if (currentUser.pairingTimeoutId) {
        clearTimeout(currentUser.pairingTimeoutId);
      }
      if (match.userData.pairingTimeoutId) {
        clearTimeout(match.userData.pairingTimeoutId);
      }
      currentUser.pairingTimeoutId = setupPairingStuckTimeout(socketId);
      match.userData.pairingTimeoutId = setupPairingStuckTimeout(match.socketId);
      
      // Set matching lock for partner to prevent them from being matched elsewhere
      matchingLocks.set(match.socketId, Date.now());
      
      // Cancel timeouts for both users since they're being matched
      if (currentUser.timeoutId) {
        clearTimeout(currentUser.timeoutId);
        currentUser.timeoutId = null;
        //logger.info(`⏰ Cancelled timeout for ${socketId} (found partner)`);
      }
      if (match.userData.timeoutId) {
        clearTimeout(match.userData.timeoutId);
        match.userData.timeoutId = null;
        //logger.info(`⏰ Cancelled timeout for ${match.socketId} (found partner)`);
      }
      
      waitingUsers.set(socketId, currentUser);
      waitingUsers.set(match.socketId, match.userData);
      
      // Send status update to both users
      socket.emit('waiting', 'Partner found! Starting in 3 seconds...');
      partnerSocket.emit('waiting', 'Partner found! Starting in 3 seconds...');
      
      // Mark that matching was scheduled - locks will be released by the setTimeout callback
      matchingScheduled = true;
      
      // Start the room after 3 seconds
      setTimeout(async () => {
        try {
          await performMatchingWithTransaction(socketId, match.socketId, currentUser, match.userData);
        } finally {
          // Clean up matching locks after transaction completes (success or failure)
          matchingLocks.delete(socketId);
          matchingLocks.delete(match.socketId);
        }
      }, 3 * 1000);
      
    } finally {
      // Release global matching lock so other users can start their matching process
      // (the pairing=true flags prevent this pair from being matched again)
      matchingInProgress = false;
      
      // Only release the current user's lock if matching wasn't scheduled
      // If matching was scheduled, the setTimeout callback will release both locks
      if (!matchingScheduled) {
        matchingLocks.delete(socketId);
      }
    }
  });

  // Relay WebRTC offers
  socket.on('audioOffer', ({ roomName, offer }) => {
    updateLastSeen();
    io.to(roomName).emit('audioOffer', { offer });
  });

  // Relay WebRTC answers
  socket.on('audioAnswer', ({ roomName, answer }) => {
    updateLastSeen();
    io.to(roomName).emit('audioAnswer', { answer });
  });

  socket.on('videoDisconnected', ({roomName, role}) => {
    updateLastSeen();
    io.to(roomName).emit('videoDisconnected', { role });
  });

  // Relay WebRTC offers
  socket.on('videoOffer', ({ roomName, offer, role }) => {
    updateLastSeen();
    io.to(roomName).emit('videoOffer', { offer, role });
  });

  // Relay WebRTC answers
  socket.on('videoAnswer', ({ roomName, answer }) => {
    updateLastSeen();
    io.to(roomName).emit('videoAnswer', { answer });
  });

  // Relay ICE candidates
  socket.on('iceCandidate', ({ roomName, candidate }) => {
    updateLastSeen();
    io.to(roomName).emit('iceCandidate', { candidate });
  });

  // Helper function to save negotiation events to chat_messages
  const saveNegotiationEvent = async (message_text) => {
    try {
      // Look for user data in both active and waiting users (includes post-chat participants)
      const userData = activeUsers.get(socketId) || waitingUsers.get(socketId);
      
      if (userData && userData.participant_id && userData.session_id) {
        // Find partner data (also check both active and waiting users)
        let partner = null;
        if (userData.partnerId) {
          partner = activeUsers.get(userData.partnerId) || waitingUsers.get(userData.partnerId);
        }
        
        if (partner && partner.participant_id) {
          // Get chat start time and calculate relative timing
          const participant = await Participant.findByPk(userData.participant_id);
          if (participant && participant.chat_started_at) {
            const relative_time = ChatMessage.calculateRelativeTime(participant.chat_started_at);
            
            await ChatMessage.create({
              session_id: userData.session_id,
              sender_participant_id: userData.participant_id,
              recipient_participant_id: partner.participant_id,
              message_text: message_text,
              seconds_since_chat_start: relative_time
            });
            
            //console.log(`💾 SERVER: Saved chat message for ${userData.participant_id} -> ${partner.participant_id}: "${message_text}"`);
            //logger.debug(`Saved negotiation event: ${userData.participant_id} -> ${partner.participant_id} at ${relative_time}s: ${message_text}`);
          } else {
            //console.log(`⚠️ SERVER: No chat_started_at found for participant ${userData.participant_id}`);
          }
        } else {
          //console.log(`⚠️ SERVER: Partner data not found for ${userData.partnerId}`);
        }
      } else {
        //console.log(`⚠️ SERVER: User data incomplete for ${socketId}:`, {
        //  hasUserData: !!userData,
        //  hasParticipantId: !!userData?.participant_id,
        //  hasSessionId: !!userData?.session_id
        //});
      }
    } catch (error) {
      console.error(`❌ SERVER: Error saving negotiation event for ${socketId}:`, error);
      //logger.error('Error saving negotiation event:', error);
      // Don't fail the real-time message for this
    }
  };

  socket.on('sendMessage', async ({ roomName, message, role }) => {
    updateLastSeen();
    
    // Server-side validation: ensure message is a bounded string
    if (typeof message !== 'string') { return; }
    const trimmed = message.trim();
    if (trimmed.length === 0) { return; }
    const safeMessage = trimmed.slice(0, 1000);

    // Emit message immediately for real-time chat (legacy compatibility)
    io.to(roomName).emit('receiveMessage', { message: safeMessage, role });
    
    // Save regular chat message to database
    await saveNegotiationEvent(safeMessage);
  });

  socket.on('sendOffer', async ({roomName, message, role}) => {
    updateLastSeen();
    
    // Validate and normalize offer amount (expect numeric value in millions)
    let offerNumeric = NaN;
    if (typeof message === 'number') {
      offerNumeric = message;
    } else if (typeof message === 'string') {
      const num = parseFloat(message);
      offerNumeric = isNaN(num) ? NaN : num;
    }
    if (!isFinite(offerNumeric)) { return; }
    // Clamp to allowed range [0, 10]
    offerNumeric = Math.max(0, Math.min(10, offerNumeric));
    const display = `${offerNumeric.toFixed(1)} Million`;

    // Emit to room immediately for real-time chat
    io.to(roomName).emit('receiveOffer', { message: display, role });

    // Save offer to chat_messages database
    await saveNegotiationEvent(`Made an offer for $${display}`);

    // In demo mode, simulate the partner accepting the offer after a short delay
    if (DEMO_MODE) {
      const partnerRole = role.includes('Buyer') ? 'Seller' : 'Buyer';
      setTimeout(() => {
        const acceptMessage = `Accepted an offer for $${display}`;
        io.to(roomName).emit('acceptedOffer', { message: acceptMessage, role: partnerRole });
      }, 2000);
    }
  });

  // REMOVED: bothConfirmOffer handler - now handled directly in confirmOffer

  socket.on('acceptOffer', async ({roomName, message, role}) => {
    updateLastSeen();
    
    // FIXED: Check for duplicate events to prevent race conditions
    if (isDuplicateEvent(socketId, 'acceptOffer', {roomName, message, role})) {
      console.log(`🔄 SERVER: Ignoring duplicate acceptOffer from ${socketId}`);
      return;
    }
    
    if (typeof message !== 'string') { return; }
    io.to(roomName).emit('acceptedOffer', { message, role });
    await saveNegotiationEvent(message);
  });

  // REMOVED: approveOffer handler - approval step eliminated from flow

  socket.on('confirmOffer', async ({roomName, message, role}) => {
    updateLastSeen();
    
    // FIXED: Check for duplicate events to prevent race conditions
    if (isDuplicateEvent(socketId, 'confirmOffer', {roomName, message, role})) {
      console.log(`🔄 SERVER: Ignoring duplicate confirmOffer from ${socketId}`);
      return;
    }
    
    if (typeof message !== 'string') { return; }
    
    // FIXED: Server-side confirmation tracking
    const userData = activeUsers.get(socketId);
    if (userData && userData.session_id) {
      // Initialize confirmation tracking if not exists
      if (!userData.confirmationState) {
        userData.confirmationState = { buyerConfirmed: false, sellerConfirmed: false };
      }
      
      // Mark this user as confirmed
      if (role.includes('Buyer')) {
        userData.confirmationState.buyerConfirmed = true;
      } else if (role.includes('Seller')) {
        userData.confirmationState.sellerConfirmed = true;
      }

      // In demo mode, auto-confirm for both sides since there is no real partner
      if (DEMO_MODE) {
        userData.confirmationState.buyerConfirmed = true;
        userData.confirmationState.sellerConfirmed = true;
      }

      // Update partner's confirmation state too
      if (userData.partnerId && activeUsers.has(userData.partnerId)) {
        const partnerData = activeUsers.get(userData.partnerId);
        if (!partnerData.confirmationState) {
          partnerData.confirmationState = { buyerConfirmed: false, sellerConfirmed: false };
        }
        // Sync the confirmation state
        partnerData.confirmationState = userData.confirmationState;
        activeUsers.set(userData.partnerId, partnerData);
      }
      
      activeUsers.set(socketId, userData);
      
      // Check if both parties have confirmed
      if (userData.confirmationState.buyerConfirmed && userData.confirmationState.sellerConfirmed) {
        console.log(`🎉 SERVER: Both parties confirmed for session ${userData.session_id}`);
        
        // Extract offer amount from message
        const offerAmount = parseFloat(message.replace(/^\D+/, "")) || 0;
        
        // Record the agreement immediately
        try {
          const end_time = new Date();
          const participants = await Participant.findAll({
            where: { session_id: userData.session_id }
          });
          
          if (participants.length === 2) {
            const duration_seconds = Math.floor((end_time - new Date(participants[0].chat_started_at)) / 1000);
            
            // Update both participants with agreement
            await Participant.update({
              final_agreement: offerAmount,
              agreement_reached: true,
              negotiation_duration_seconds: duration_seconds,
              chat_ended_at: end_time
            }, {
              where: { session_id: userData.session_id }
            });
            
            console.log(`✅ Agreement recorded for session ${userData.session_id}: $${offerAmount}M (${duration_seconds}s)`);
            
            // Lock session to prevent cancellations
            userData.agreementLocked = true;
            activeUsers.set(socketId, userData);
            
            if (userData.partnerId && activeUsers.has(userData.partnerId)) {
              const partnerData = activeUsers.get(userData.partnerId);
              partnerData.agreementLocked = true;
              activeUsers.set(userData.partnerId, partnerData);
            }
          }
        } catch (error) {
          console.error('❌ Error recording agreement in confirmOffer:', error);
        }
        
        // Emit final confirmation to both clients
        io.to(roomName).emit('bothConfirmedOffer', { 
          message: `Both parties confirmed the offer of ${offerAmount}`, 
          role: 'system',
          amount: offerAmount 
        });
        
        // Cancel chat timeout since agreement was reached
        if (userData.chatTimeoutId) {
          clearTimeout(userData.chatTimeoutId);
          if (userData.partnerId && activeUsers.has(userData.partnerId)) {
            const partnerData = activeUsers.get(userData.partnerId);
            if (partnerData.chatTimeoutId) {
              clearTimeout(partnerData.chatTimeoutId);
            }
          }
        }
        
        await saveNegotiationEvent(`Both parties confirmed the offer of ${offerAmount}`);
      } else {
        // Only one party confirmed so far - emit individual confirmation
        io.to(roomName).emit('confirmedOffer', { message, role });
        await saveNegotiationEvent(message);
      }
    } else {
      // Fallback for users without session data
      io.to(roomName).emit('confirmedOffer', { message, role });
      await saveNegotiationEvent(message);
    }
  });

  // Backward compatibility: accept legacy typo event and new standardized event
  const handleCancelOffer = async ({roomName, message, role}) => {
    updateLastSeen();
    
    // CRITICAL FIX: Prevent cancellation after both parties have confirmed agreement
    const userData = activeUsers.get(socketId);
    if (userData && userData.agreementLocked) {
      console.log(`🚫 SERVER: Cannot cancel - agreement already locked for session ${userData.session_id}`);
      return;
    }
    
    if (typeof message !== 'string') { return; }
    io.to(roomName).emit('cancelledOffer', { message, role });
    await saveNegotiationEvent(message);
  };
  socket.on('cancellOffer', handleCancelOffer);
  socket.on('cancelOffer', handleCancelOffer);

  socket.on('rejectOffer', async ({roomName, message, role}) => {
    updateLastSeen();
    
    // FIXED: Check for duplicate events to prevent race conditions
    if (isDuplicateEvent(socketId, 'rejectOffer', {roomName, message, role})) {
      console.log(`🔄 SERVER: Ignoring duplicate rejectOffer from ${socketId}`);
      return;
    }
    
    if (typeof message !== 'string') { return; }
    io.to(roomName).emit('rejectedOffer', { message, role });
    await saveNegotiationEvent(message);
  });

  socket.on('rescindOffer', async ({roomName, message, role}) => {
    updateLastSeen();
    if (typeof message !== 'string') { return; }
    io.to(roomName).emit('rescindedOffer', { message, role });
    await saveNegotiationEvent(message);
  });

  // Handle agreement recording
  socket.on('recordAgreement', async (agreementData) => {
    updateLastSeen();
    
    try {
      const userData = activeUsers.get(socketId);
      if (!userData || !userData.session_id) {
        socket.emit('error', 'No active session found');
        return;
      }

      const end_time = new Date();
      const participants = await Participant.findAll({
        where: { session_id: userData.session_id }
      });
      
      if (participants.length !== 2) {
        socket.emit('error', 'Invalid session');
        return;
      }
      
      const duration_seconds = Math.floor((end_time - new Date(participants[0].chat_started_at)) / 1000);
      
      // Update both participants with agreement
      await Participant.update({
        final_agreement: agreementData.amount,
        agreement_reached: true,
        negotiation_duration_seconds: duration_seconds,
        chat_ended_at: end_time
      }, {
        where: { session_id: userData.session_id }
      });

      //logger.info(`Recorded agreement for session ${userData.session_id}: $${agreementData.amount} (${duration_seconds}s)`);
      
      // IMPORTANT: Move both users to post-chat state after successful agreement
      // This ensures dashboard shows them as "POST CHAT" instead of "IN CHAT"
      const partnerId = userData.partnerId;
      const partnerData = activeUsers.get(partnerId);
      
      if (userData) {
        // Remove from activeUsers but keep in waitingUsers for demographics
        activeUsers.delete(socketId);
        waitingUsers.set(socketId, {
          ...userData,
          waiting: false,
          pairing: false,
          postChat: true, // Flag for post-chat data collection
          chatEndedAt: end_time
        });
        userProgress.set(socketId, 'postChat');
      }
      
      if (partnerData && partnerId) {
        // Remove from activeUsers but keep in waitingUsers for demographics
        activeUsers.delete(partnerId);
        waitingUsers.set(partnerId, {
          ...partnerData,
          waiting: false,
          pairing: false,
          postChat: true, // Flag for post-chat data collection
          chatEndedAt: end_time
        });
        userProgress.set(partnerId, 'postChat');
      }
      
      //console.log(`✅ SERVER: Moved both participants to post-chat state after agreement in session ${userData.session_id}`);
      
      // Notify both users
      io.to(userData.roomName).emit('agreementRecorded', {
        amount: agreementData.amount,
        duration_seconds: duration_seconds
      });
      
    } catch (error) {
      //logger.error('Error recording agreement:', error);
      socket.emit('error', 'Failed to record agreement');
    }
  });

  // Note: Demographics handler is now consolidated above to avoid duplicates

  // Enhanced quiz handler with automatic session recovery
  socket.on('submitQuizResponses', async (quizData) => {
    updateLastSeen();
    
    try {
      // Use enhanced session recovery
      const SessionManager = require('./utils/session-manager');
      const sessionManager = new SessionManager();
      const userData = await sessionManager.getOrRestoreSession(socketId, waitingUsers, activeUsers);
      
      if (!userData || !userData.participant_id) {
        socket.emit('error', 'Session expired. Please refresh the page and try again.');
        return;
      }

      // Determine which columns to update based on attempt number
      let updateData = {
        quiz_score: quizData.quiz_score,
        quiz_passed: quizData.quiz_passed,
        quiz_attempts: quizData.quiz_attempts
      };
      
      if (quizData.quiz_attempts === 1) {
        // First attempt - use regular columns
        updateData.quiz_q1 = quizData.quiz_q1_answer;
        updateData.quiz_q2 = quizData.quiz_q2_answer;
        updateData.quiz_q3 = quizData.quiz_q3_answer;
      } else if (quizData.quiz_attempts === 2) {
        // Second attempt - use retake columns
        updateData.quiz_q1_retake = quizData.quiz_q1_answer;
        updateData.quiz_q2_retake = quizData.quiz_q2_answer;
        updateData.quiz_q3_retake = quizData.quiz_q3_answer;
      }

      const updateResult = await Participant.update(updateData, {
        where: { participant_id: userData.participant_id }
      });
      
      if (updateResult[0] === 0) {
        console.log(`❌ DATABASE: No participant updated for ${userData.participant_id}`);
        socket.emit('error', 'Failed to save quiz responses. Please try again.');
        return;
      }

      console.log(`✅ QUIZ: Saved responses for ${userData.participant_id} (Score: ${quizData.quiz_score}, Passed: ${quizData.quiz_passed}, Attempt: ${quizData.quiz_attempts})`);
      socket.emit('quizResponsesRecorded');
      
    } catch (error) {
      console.error('❌ QUIZ: Error recording quiz responses:', error);
      socket.emit('error', 'Failed to record quiz responses. Please try again.');
    }
  });



  // Handle dropout recording
  socket.on('recordDropout', async (dropoutData) => {
    updateLastSeen();
    
    try {
      const userData = activeUsers.get(socketId) || waitingUsers.get(socketId);
      if (!userData || !userData.participant_id) {
        return; // Silent fail for dropouts
      }

      await Participant.update({
        dropout_stage: dropoutData.stage,
        chat_ended_at: new Date()
      }, {
        where: { participant_id: userData.participant_id }
      });

      //logger.info(`Recorded dropout for ${userData.participant_id} at stage: ${dropoutData.stage}`);
      
    } catch (error) {
      //logger.error('Error recording dropout:', error);
    }
  });

  // Handle disconnect
  socket.on('disconnect', async (reason) => {
    console.log(`🔌 SERVER: Socket ${socketId} disconnected. Reason: ${reason}`);
    //logger.disconnection(socketId, {
    //  wasInChat: activeUsers.has(socketId),
    //  roomName: activeUsers.has(socketId) ? activeUsers.get(socketId).roomName : null
    //});
    
    // Cancel any pending timeout for this user
    const waitingUser = waitingUsers.get(socketId);
    if (waitingUser && waitingUser.timeoutId) {
      clearTimeout(waitingUser.timeoutId);
      //logger.info(`⏰ Cancelled timeout for disconnected user ${socketId}`);
    }
    
    // Track disconnection if user was actively participating
    const currentStage = userProgress.get(socketId);
    if (currentStage && !['completedSuccess', 'completedFailure', 'completedTimeout'].includes(currentStage)) {
      // User disconnected before completing - mark as disconnected
      userProgress.set(socketId, 'disconnected');
      
      // Update database to track disconnection
      const userData = activeUsers.get(socketId) || waitingUsers.get(socketId);
      if (userData && userData.participant_id) {
        try {
          await Participant.update({
            dropout_stage: 'disconnected',
            chat_ended_at: new Date()
          }, {
            where: { participant_id: userData.participant_id }
          });
          //console.log(`💾 SERVER: Recorded disconnection for participant ${userData.participant_id}`);
          //logger.info(`Recorded disconnection for participant ${userData.participant_id} at stage: ${currentStage}`);
        } catch (dbError) {
          console.error(`❌ SERVER: Error recording disconnection for ${userData.participant_id}:`, dbError);
          //logger.error('Error recording disconnection:', dbError);
        }
      }
    }
    
    // Check if user was in active chat
    if (activeUsers.has(socketId)) {
      const userData = activeUsers.get(socketId);
      const roomName = userData.roomName;
      const partnerId = userData.partnerId;
      
      // Cancel chat timeout if user disconnects
      if (userData.chatTimeoutId) {
        clearTimeout(userData.chatTimeoutId);
        //logger.info(`⏰ Cancelled chat timeout for disconnected user ${socketId}`);
        
        // Also cancel timeout for partner
        if (partnerId && activeUsers.has(partnerId)) {
          const partnerData = activeUsers.get(partnerId);
          if (partnerData.chatTimeoutId) {
            clearTimeout(partnerData.chatTimeoutId);
            //logger.info(`⏰ Cancelled chat timeout for partner ${partnerId}`);
          }
        }
      }
      
      // Notify partner in the chat room
      if (roomName && partnerId) {
        console.log(`📤 SERVER: Notifying partner ${partnerId} that user ${socketId} disconnected from room ${roomName}`);
        // Emit partner disconnection event to the remaining user
        socket.to(roomName).emit('partnerDisconnected', {
          message: 'Your partner has disconnected',
          session_id: userData.session_id
        });
        console.log(`✅ SERVER: Partner disconnection event sent to room ${roomName}`);
        
        // Update database for the disconnected participant and partner
        try {
          if (userData.session_id) {
            const end_time = new Date();
            const participants = await Participant.findAll({
              where: { session_id: userData.session_id }
            });
            
            if (participants.length === 2) {
              // Calculate duration from chat start
              const duration_seconds = Math.floor((end_time - new Date(participants[0].chat_started_at)) / 1000);
              
              // Update both participants with disconnection status, but different dropout stages
              // IMPORTANT: Use conditional update to avoid race condition with agreement recording
              for (const participant of participants) {
                const isDisconnectingUser = participant.participant_id === userData.participant_id;
                
                // Only set agreement_reached=false and final_agreement=null if no agreement exists yet
                // This prevents overwriting a valid agreement if disconnect happens after confirmation
                await sequelize.query(`
                  UPDATE participants 
                  SET 
                    agreement_reached = CASE WHEN agreement_reached = true THEN true ELSE false END,
                    final_agreement = CASE WHEN final_agreement IS NOT NULL THEN final_agreement ELSE NULL END,
                    negotiation_duration_seconds = :duration_seconds,
                    chat_ended_at = :end_time,
                    dropout_stage = CASE 
                      WHEN agreement_reached = true THEN 'completed' 
                      ELSE :dropout_stage 
                    END
                  WHERE participant_id = :participant_id
                `, {
                  replacements: {
                    duration_seconds: duration_seconds,
                    end_time: end_time,
                    dropout_stage: isDisconnectingUser ? 'disconnected' : 'partnerDisconnected',
                    participant_id: participant.participant_id
                  },
                  type: sequelize.QueryTypes.UPDATE
                });
              }
              
              //console.log(`💾 SERVER: Updated disconnection participants in session ${userData.session_id} - disconnected: ${userData.participant_id}, partner: partnerDisconnected - duration: ${duration_seconds}s`);
              //logger.info(`Recorded partner disconnection for session ${userData.session_id} - disconnected user vs partner disconnected (${duration_seconds}s)`);
            }
          }
        } catch (dbError) {
          console.error(`❌ SERVER: Error updating disconnection participants in session ${userData.session_id}:`, dbError);
          //logger.error('Error updating disconnection participants:', dbError);
        }
        
        // Move the disconnecting user to post-chat state if they had started a chat
        // This preserves their data for potential completion tracking
        if (userData.participant_id && userData.session_id) {
          waitingUsers.set(socketId, {
            ...userData,
            waiting: false,
            pairing: false,
            postChat: true,
            chatEndedAt: new Date(),
            disconnected: true
          });
          //console.log(`💾 SERVER: Preserved data for disconnected user ${socketId} (${userData.participant_id})`);
        }
      }
    }
    
    // Clean up active references but preserve some data for post-chat operations
    connectedSockets.delete(socketId);
    activeUsers.delete(socketId);
    // Note: Don't delete from waitingUsers if we just moved them there for post-chat
    if (!waitingUsers.get(socketId)?.postChat) {
      waitingUsers.delete(socketId);
    }
    // Note: userProgress is intentionally NOT deleted to track disconnections
    
    //logger.cleanup(1, {
    //  active: connectedSockets.size,
    //  waiting: waitingUsers.size,
    //  inChat: activeUsers.size
    //});
  });
});

// Catch-all handler for React routes - MUST BE LAST
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

// Cleanup intervals on server shutdown
process.on('SIGINT', () => {
  console.log('🛑 Server shutting down...');
  if (autoMatchingInterval) {
    clearInterval(autoMatchingInterval);
    console.log('✅ Active matching interval cleared');
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Server terminating...');
  if (autoMatchingInterval) {
    clearInterval(autoMatchingInterval);
    console.log('✅ Active matching interval cleared');
  }
  process.exit(0);
});

const PORT = process.env.PORT || 5000;

// In demo mode, wait for in-memory tables to be created before starting
const startServer = () => {
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    if (DEMO_MODE) {
      console.log('DEMO MODE: Running without persistent database. Visit http://localhost:' + PORT + ' to try the experiment.');
    }
  });
};

const db = require('./models');
if (DEMO_MODE && db.syncPromise) {
  db.syncPromise.then(startServer);
} else {
  startServer();
}

