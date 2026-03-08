const { Participant } = require('../models');
const sessionManager = require('../utils/session-manager');

/**
 * Enhanced expected outcome handler with automatic session recovery
 * Solves the "Participant not found" error for research studies
 */
const handleExpectedOutcome = async (socket, data, waitingUsers) => {
    const socketId = socket.id;
    
    try {
        // Try to get session from in-memory first (fastest)
        let userData = waitingUsers.get(socketId);
        
        // If not found in memory, try database recovery
        if (!userData || !userData.participant_id) {
            console.log(`🔄 SESSION: Attempting recovery for socket ${socketId}`);
            
            // Try to restore from database
            userData = await sessionManager.getSession(socketId);
            
            // If still not found, this might be a stale socket - try to find by latest socket
            if (!userData) {
                // Find the most recent participant with this socket_id pattern
                const participant = await Participant.findOne({
                    where: { socket_id: socketId },
                    order: [['last_seen_at', 'DESC']]
                });
                
                if (participant) {
                    userData = {
                        participant_id: participant.participant_id,
                        role: participant.role,
                        partner_id: participant.partner_id,
                        session_id: participant.session_id,
                        dropout_stage: participant.dropout_stage,
                        socketId: socketId,
                        waiting: false,
                        pairing: false,
                        created_at: participant.created_at
                    };
                    
                    // Restore to in-memory for performance
                    waitingUsers.set(socketId, userData);
                    
                    // Update database with current session
                    await sessionManager.storeSession(socketId, userData);
                    
                    console.log(`✅ SESSION: Recovered session for ${participant.participant_id}`);
                } else {
                    console.log(`❌ SESSION: No participant found for socket ${socketId}`);
                    socket.emit('error', 'Session expired. Please refresh the page and try again.');
                    return false;
                }
            } else {
                // Restore to in-memory for performance
                waitingUsers.set(socketId, userData);
                console.log(`✅ SESSION: Restored session from database for ${userData.participant_id}`);
            }
        }
        
        // CRITICAL: Check if data already exists to prevent duplicate submissions
        const existingData = await Participant.findOne({
            where: { participant_id: userData.participant_id },
            attributes: ['target_price', 'justification', 'walkaway_point', 'expected_outcome']
        });
        
        if (existingData && (existingData.target_price || existingData.justification)) {
            console.log(`⚠️ OUTCOME: Data already exists for ${userData.participant_id} - preventing duplicate submission`);
            socket.emit('expectedOutcomeRecorded'); // Still emit success to prevent client-side errors
            return true;
        }
        
        // Update the database with expected outcome data
        const updateResult = await Participant.update({
            target_price: data.preneg_target_price,
            justification: data.preneg_justification,
            walkaway_point: data.preneg_walkaway_point,
            expected_outcome: data.preneg_expected_outcome
        }, {
            where: { 
                participant_id: userData.participant_id,
                target_price: null // Only update if not already set
            }
        });
        
        if (updateResult[0] === 0) {
            console.log(`❌ DATABASE: No participant updated for ${userData.participant_id}`);
            socket.emit('error', 'Failed to save data. Please try again.');
            return false;
        }
        
        // Update last seen timestamp
        await sessionManager.updateLastSeen(socketId);
        
        console.log(`✅ OUTCOME: Saved expected outcome for ${userData.participant_id}`);
        socket.emit('expectedOutcomeRecorded');
        
        return true;
        
    } catch (error) {
        console.error('❌ OUTCOME: Error recording expected outcome:', error);
        socket.emit('error', 'Failed to record expected outcome. Please try again.');
        return false;
    }
};

module.exports = { handleExpectedOutcome };