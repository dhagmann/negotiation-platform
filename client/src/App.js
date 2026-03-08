import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import './App.css'
import 'bootstrap/dist/css/bootstrap.min.css';

import LandingPage from './pages/LandingPage.js';
import MainPage from './pages/MainPage.js';
import Introduction1Page from './pages/Introduction1Page.js';
import Introduction2Page from './pages/Introduction2Page.js';
import Introduction3Page from './pages/Introduction3Page.js';

import PostExperimentQuizPage from './pages/Quizzes/PostExperimentQuizPage.js';
import PreExperimentQuizPage from './pages/Quizzes/PreExperimentQuizPage.js';
import OutcomeGuessPage from './pages/Quizzes/OutcomeGuessPage.js';

import GeneralInstructionsPage from './pages/Instructions/GeneralInstructionsPage.js';
import RoleInstructionsPage from './pages/Instructions/RoleInstructionsPage.js';
import PrivateInstructionsPage from './pages/Instructions/PrivateInstructionsPage.js';
import PrivateInstructions2Page from './pages/Instructions/PrivateInstructions2Page.js';
import NegotiatingInstructionsPage from './pages/Instructions/NegotiatingInstructionsPage.js';
import NegotiatingTipsPage from './pages/Instructions/NegotiatingTipsPage.js';

import PaymentPage from './pages/PaymentPage.js';
import TimeoutPage from './pages/TimeoutPage.js';
import AlreadyParticipatedPage from './pages/AlreadyParticipatedPage.js';
import RejectionPage from './pages/RejectionPage.js';
import MobileRestrictedPage from './pages/MobileRestrictedPage.js';

import ConnectionStatus from './components/ConnectionStatus';
import useSocketConnection from './hooks/useSocketConnection';

//const socket = io('http://localhost:5000');
const socketUrl = process.env.REACT_APP_SERVER_URL || window.location.origin;
//console.log('🔌 Socket connecting to:', socketUrl);
const socket = io(socketUrl);

// Function to track page visits for experiment progress
const trackPageVisit = async (socketId, page) => {
  if (!socketId) return;
  
  try {
    await fetch(`${socketUrl}/track-page`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ socketId, page }),
    });
  } catch (error) {
    console.warn('Failed to track page visit:', error);
  }
};

function App() {
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  const [role, setRole] = useState('');
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('Connecting...');
  const [buyerOffer, setBuyerOffer] = useState('');
  const [sellerOffer, setSellerOffer] = useState('');
  const [alert, setAlert] = useState(false);
  const [approvedOffer, setApprovedOffer] = useState(false)
  // REMOVED: Client-side confirmation tracking - now handled server-side
  const [bothConfirmedProcessed, setBothConfirmedProcessed] = useState(false);
  
  // FIXED: Add offer sequence tracking to prevent out-of-order processing
  const [offerSequence, setOfferSequence] = useState(0);
  const [lastProcessedSequence, setLastProcessedSequence] = useState(0);
  const lastProcessedSequenceRef = useRef(lastProcessedSequence);

  const [buyerCountdown, setBuyerCountdown] = useState(null);
  const [sellerCountdown, setSellerCountdown] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [partnerId, setPartnerId] = useState(false); 
  const [myId, setMyId] = useState(false); 
  const myIdRef = useRef(myId);
  const [participantId, setParticipantId] = useState('');
  const [partnerParticipantId, setPartnerParticipantId] = useState('');

  
  // Helper function to get location state (for timeout navigation)
  const getLocationState = () => {
    return {
      prolificPID: 'Prolific ID', 
      studyID: 'N/A', 
      sessionID: 'N/A', 
      workerId: 'DefaultWorker'
    };
  };
  
  useEffect(() => {
    document.title = "Agent Selections";
  }, []);

  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);

  useEffect(() => {
    lastProcessedSequenceRef.current = lastProcessedSequence;
  }, [lastProcessedSequence]);

  // Socket connection status and reconnection helpers
  const {
    isConnected,
    isReconnecting,
    connectionError,
    hasPendingSubmissions,
    pendingSubmissionCount,
    manualReconnect
  } = useSocketConnection(socket);

  // Create a component to track page changes
  const PageTracker = () => {
    const location = useLocation();
    
    useEffect(() => {
      if (myId) {
        trackPageVisit(myId, location.pathname);
      }
    }, [location.pathname, myId]);
    
    return null;
  };

  useEffect(() => {
    const handleConnect = () => {
      setStatus('Connected');
    };

    // Server emits 'waiting' with a human-readable status message (e.g., "Waiting...", "Partner found! ...")
    const handleWaiting = (message) => {
      if (typeof message === 'string' && message.trim().length > 0) {
        setStatus(message);
      } else {
        setStatus('Waiting for another user to join...');
      }
    };

    const handleError = (errorMessage) => {
      setAlert(`Error: ${errorMessage}`);
      setStatus('Error occurred');
    };

    const handleJoinRoom = (roomName, sessionData) => {
      setRoomName(roomName);
      setIsRunning(true)
      setMessages(["Type in the chat below..."]);
      
      // Capture participant IDs from research system
      if (sessionData) {
        setParticipantId(sessionData.participant_id || '');
        setPartnerParticipantId(sessionData.partner_participant_id || '');
        
        // CRITICAL: Set partnerId to enable chat UI - use partner's participant_id as the partner ID
        setPartnerId(sessionData.partner_participant_id || 'partner');
      }
    };

    const handleAssignPartner = (partnerId) => {
      setPartnerId(partnerId);
    };

    const handleAssignSelf = (socketId, role, roomName) => {
      setMyId(socketId);
      setRole(role);
      // Only set roomName if it's not null (user is paired)
      if (roomName) {
        setRoomName(roomName);
      }
    };

    const handleWaitingTimeout = () => {
      //console.log('📥 CLIENT: Received waitingTimeout event from server');
      // Navigate to timeout page
      const { prolificPID, studyID, sessionID, workerId } = getLocationState();
      //console.log('🔄 CLIENT: Navigating to /waitingTimeout page');
      navigate('/waitingTimeout', { 
        state: { prolificPID, studyID, sessionID, workerId, socketId: myIdRef.current, failed: false, timeoutType: 'waiting' } 
      });
      //console.log('✅ CLIENT: Navigation to timeout page initiated');
    };

    const handlePartnerFound = () => {
      setStatus('Partner found! Starting in 3 seconds...');
    };

    // Enhanced state restoration handler
    const handleStateRestored = (data) => {
      console.log('📥 CLIENT: State restoration response:', data);
      
      if (data.isTimedOut && data.shouldRedirectToTimeout) {
        // User has timed out waiting for partner - redirect to timeout page
        const { prolificPID, studyID, sessionID, workerId } = getLocationState();
        console.log('🔄 CLIENT: Redirecting timed-out user to timeout page');
        navigate('/waitingTimeout', { 
          state: { 
            prolificPID, 
            studyID, 
            sessionID, 
            workerId, 
            socketId: myIdRef.current, 
            failed: false, 
            timeoutType: 'waiting',
            participant_id: data.participant_id
          } 
        });
      } else if (data.isCompleted && data.shouldRedirectToPayment) {
        // User has completed the study - redirect to payment page
        console.log('🔄 CLIENT: Redirecting completed user to payment page');
        navigate('/payment');
      } else if (data.isNewUser) {
        console.log('ℹ️ CLIENT: New user - no state to restore');
      }
      
      // Store participant ID in localStorage for future reconnections
      if (data.participant_id) {
        localStorage.setItem('participantId', data.participant_id);
      }
    };

    const handleReceiveOffer = (msg) => {
      // FIXED: Add sequence tracking to prevent out-of-order processing
      const currentSequence = Date.now();
      
      // Only process if this is a newer sequence than what we've seen
      if (currentSequence > lastProcessedSequenceRef.current) {
        lastProcessedSequenceRef.current = currentSequence;
        setOfferSequence(currentSequence);
        setLastProcessedSequence(currentSequence);
        
        let newMessage = msg 
        newMessage.message = "Made an offer for $" + newMessage.message
        newMessage.sequence = currentSequence; // Track sequence in message
        
        setMessages((prevMessages) => [...prevMessages, newMessage]);
        if(msg.role.includes("Buyer")){
          setBuyerOffer(msg.message.replace(/^\D+/, ""));
          setBuyerCountdown(30); 
        }else{
          setSellerOffer(msg.message.replace(/^\D+/, ""));
          setSellerCountdown(30); 
        }
        
        console.log(`📥 CLIENT: Processed offer sequence ${currentSequence} from ${msg.role}`);
      } else {
        console.log(`⚠️ CLIENT: Ignoring out-of-order offer sequence ${currentSequence} (last: ${lastProcessedSequenceRef.current})`);
      }
    };

    const handleRejectedOffer = (msg) => {
      let roleMessage = "Seller"
      if(msg.role.includes("Buyer")){
        roleMessage = "Buyer"
      }
      msg = {role: roleMessage, message: msg.message} 
      
      setMessages((prevMessages) => [...prevMessages, msg]);
      setAlert(false)
      if(msg.role.includes("Buyer")){
        setSellerOffer(null)
        setSellerCountdown(0)
      }else if(msg.role.includes("Seller")){
        setBuyerOffer(null)
        setBuyerCountdown(0)
      }
    };

    const handleRescindedOffer = (msg) => {
      let newMessage = msg 
      setMessages((prevMessages) => [...prevMessages, newMessage]);
      if(msg.role.includes("Buyer")){
        setBuyerOffer(null)
        setBuyerCountdown(0)
      }else if(msg.role.includes("Seller")){
        setSellerOffer(null)
        setSellerCountdown(0)
      }
    };

    // Listen for received messages
    const handleReceiveMessage = (msg) => {
      let newMessage = msg 
      setMessages((prevMessages) => [...prevMessages, newMessage]);
    };

    const handleAcceptedOffer = (msg) => {
      let offer_amount = parseFloat(msg.message.replace(/^\D+/, "")) || 0;
      let newMessage = msg 
      setMessages((prevMessages) => [...prevMessages, newMessage]);
      // FIXED: Only set approvedOffer (removed acceptedOffer duplication)
      setApprovedOffer(offer_amount)
      setAlert("You have reached an agreement! Click Continue to proceed to confirmation.")
    };

    // REMOVED: approvedOffer handler - approval step eliminated from flow

    const handleConfirmedOffer = (msg) => {
      let offer_amount = parseFloat(msg.message.replace(/^\D+/, "")) || 0;
      let newMessage = msg 
      setMessages((prevMessages) => [...prevMessages, newMessage]);
      // REMOVED: Client-side confirmation state tracking - server handles this now
    };

    // CRITICAL FIX: Listen for bothConfirmedOffer from server
    const handleBothConfirmedOffer = (msg) => {
      console.log('🎉 CLIENT: Received bothConfirmedOffer from server:', msg);
      
      // FIXED: Always process server confirmation and reset all states
      console.log('🔄 CLIENT: Processing bothConfirmedOffer from server - setting final states');
      setBothConfirmedProcessed(true);
      
      // REMOVED: Client-side confirmation state reset - no longer needed
      
      // Clear any pending offer states to prevent conflicts
      setBuyerOffer(false);
      setSellerOffer(false);
      setBuyerCountdown(0);
      setSellerCountdown(0);
      
      // FIXED: Set the alert message for the Continue button
      setAlert("Both buyer and seller have confirmed the offer. Please click Continue to proceed to the questionnaire.");
      
      console.log('✅ CLIENT: Ready for Continue button');
    };

    // cancelledOffer
    const handleCancelledOffer = (msg) => {
      let newMessage = msg 
      setMessages((prevMessages) => [...prevMessages, newMessage]);
      setAlert(null);
      setBuyerCountdown(0)
      setBuyerOffer(false)
      setSellerOffer(false)
      // REMOVED: Client-side confirmation state reset - no longer needed
      setSellerCountdown(0)
      // REMOVED: setAcceptedOffer(false) - no longer needed
      setApprovedOffer(false)
      setBothConfirmedProcessed(false) // Reset the processed flag
      setOfferSequence(0) // Reset offer sequence tracking
      setLastProcessedSequence(0)
      lastProcessedSequenceRef.current = 0;
    };

    socket.on('connect', handleConnect);
    socket.on('waiting', handleWaiting);
    socket.on('error', handleError);
    socket.on('joinRoom', handleJoinRoom);
    socket.on('assignPartner', handleAssignPartner);
    socket.on('assignSelf', handleAssignSelf);
    socket.on('waitingTimeout', handleWaitingTimeout);
    socket.on('partnerFound', handlePartnerFound);
    socket.on('stateRestored', handleStateRestored);
    socket.on('receiveOffer', handleReceiveOffer);
    socket.on('rejectedOffer', handleRejectedOffer);
    socket.on('rescindedOffer', handleRescindedOffer);
    socket.on('receiveMessage', handleReceiveMessage);
    socket.on('acceptedOffer', handleAcceptedOffer);
    socket.on('confirmedOffer', handleConfirmedOffer);
    socket.on('bothConfirmedOffer', handleBothConfirmedOffer);
    socket.on('cancelledOffer', handleCancelledOffer);
    
    return () => {
      socket.off('connect', handleConnect);
      socket.off('waiting', handleWaiting);
      socket.off('error', handleError);
      socket.off('joinRoom', handleJoinRoom);
      socket.off('assignPartner', handleAssignPartner);
      socket.off('assignSelf', handleAssignSelf);
      socket.off('waitingTimeout', handleWaitingTimeout);
      socket.off('partnerFound', handlePartnerFound);
      socket.off('stateRestored', handleStateRestored);
      socket.off('receiveOffer', handleReceiveOffer);
      socket.off('rejectedOffer', handleRejectedOffer);
      socket.off('rescindedOffer', handleRescindedOffer);
      socket.off('receiveMessage', handleReceiveMessage);
      socket.off('acceptedOffer', handleAcceptedOffer);
      socket.off('confirmedOffer', handleConfirmedOffer);
      socket.off('bothConfirmedOffer', handleBothConfirmedOffer);
      socket.off('cancelledOffer', handleCancelledOffer);
      // REMOVED: approvedOffer cleanup - handler removed
    };
    // FIXED: Removed state dependencies that handlers modify - using refs instead to prevent
    // listener re-registration race conditions. navigate is stable from React Router.
  }, [navigate]);

  
  // REMOVED: Client-side bothConfirmOffer logic - now handled server-side


  const handleCancel = useCallback(async (offerAmount) => {
      // CRITICAL FIX: Prevent cancellation after both parties have confirmed
      if (bothConfirmedProcessed) {
        console.log('🚫 CLIENT: Cannot cancel - agreement already confirmed by both parties');
        return;
      }
      
      let message = "Cancelled the offer for " + offerAmount;
      socket.emit('cancelOffer', { roomName, message, role });
      setAlert(false);
  }, [roomName, role, bothConfirmedProcessed]);
  

  const handleConfirm = useCallback(async (approvedOffer) => {
    // CRITICAL FIX: Prevent multiple confirmations after both parties have confirmed
    if (bothConfirmedProcessed) {
      console.log('🚫 CLIENT: Cannot confirm again - agreement already processed');
      return;
    }
    
    let message = "Confirmed the offer for " + approvedOffer;
    // Emit the reject offer message
    socket.emit('confirmOffer', { roomName, message, role });
    setAlert("Waiting for partner to confirm or cancel.");
  }, [roomName, role, bothConfirmedProcessed]);

  
  // REMOVED: handleApprove is no longer needed since we skip the approval step
  

  const appData = {
    socket: socket,
    partnerId: partnerId,
    myId: myId,
    participantId: participantId,
    partnerParticipantId: partnerParticipantId,
    handleCancel: handleCancel,
    // REMOVED: handleApprove - no longer needed
    handleConfirm: handleConfirm,
    isRunning: isRunning,
    setIsRunning:setIsRunning,
    // REMOVED: Client-side confirmation states - no longer needed

    approvedOffer: approvedOffer,
    setApprovedOffer:setApprovedOffer,
    buyerCountdown: buyerCountdown,
    setBuyerCountdown: setBuyerCountdown,
    sellerCountdown: sellerCountdown,
    setSellerCountdown: setSellerCountdown,
    alert: alert, 
    setAlert: setAlert, 
    buyerOffer: buyerOffer, 
    setBuyerOffer: setBuyerOffer, 
    sellerOffer: sellerOffer, 
    setSellerOffer: setSellerOffer, 
    status: status, 
    setStatus: setStatus, 
    roomName: roomName, 
    setRoomName: setRoomName, 
    role: role, 
    setRole:setRole,
    messages: messages, 
    setMessages: setMessages,
    bothConfirmedProcessed: bothConfirmedProcessed // FIXED: Add to appData for Confirm component
  }
  return (
    <>
      <PageTracker />
      <ConnectionStatus
        isConnected={isConnected}
        isReconnecting={isReconnecting}
        connectionError={connectionError}
        hasPendingSubmissions={hasPendingSubmissions}
        pendingSubmissionCount={pendingSubmissionCount}
        onReconnect={manualReconnect}
      />
      <Routes>
      <Route path="/" element={<LandingPage appData={appData}/>} />
      <Route path="/introduction1" element={<Introduction1Page appData={appData}/>} />
      <Route path="/introduction2" element={<Introduction2Page appData={appData}/>} />
      <Route path="/introduction3" element={<Introduction3Page appData={appData}/>} />
      <Route path="/generalInstructions" element={<GeneralInstructionsPage appData={appData}/>} />
      <Route path="/roleInstructions" element={<RoleInstructionsPage appData={appData}/>} />
      <Route path="/privateInstructions" element={<PrivateInstructionsPage appData={appData}/>} />
      <Route path="/privateInstructions2" element={<PrivateInstructions2Page appData={appData}/>} />
      <Route path="/preExperimentQuiz" element={<PreExperimentQuizPage appData={appData}/>} />
      <Route path="/negotiatingInstructions" element={<NegotiatingInstructionsPage appData={appData}/>} />
      <Route path="/negotiatingTips" element={<NegotiatingTipsPage appData={appData}/>} />
      <Route path="/outcomeGuess" element={<OutcomeGuessPage appData={appData}/>} />
      <Route path="/main" element={<MainPage appData={appData}/>} />
      <Route path="/postExperimentQuiz" element={<PostExperimentQuizPage appData={appData}/>} />
      <Route path="/timeoutPage" element={<TimeoutPage appData={appData}/>} />
      <Route path="/waitingTimeout" element={<TimeoutPage appData={appData}/>} />
      <Route path="/alreadyParticipated" element={<AlreadyParticipatedPage appData={appData}/>} />
      <Route path="/rejection" element={<RejectionPage appData={appData}/>} />
      <Route path="/payment" element={<PaymentPage appData={appData}/>} />
      <Route path="/mobileRestricted" element={<MobileRestrictedPage/>} />
      {/* New Catch-All Route */}
      <Route path="/*" element={<RejectionPage appData={appData}/>} />
      </Routes>
    </>
  );
}

export default App;