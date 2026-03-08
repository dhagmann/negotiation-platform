const { Participant } = require('../models');

/**
 * Database-based session management for research studies
 * Replaces in-memory Maps with persistent Aurora storage
 */
class SessionManager {
    
    /**
     * Get or restore user session with automatic recovery
     * This is the main method used by socket handlers
     */
    async getOrRestoreSession(socketId, waitingUsers, activeUsers = null) {
        try {
            // Try to get session from in-memory first (fastest)
            let userData = waitingUsers.get(socketId) || (activeUsers ? activeUsers.get(socketId) : null);
            
            // If not found in memory, try database recovery
            if (!userData || !userData.participant_id) {
                console.log(`🔄 SESSION: Attempting recovery for socket ${socketId}`);
                
                // Try to restore from database
                userData = await this.getSession(socketId);
                
                // If still not found, this might be a stale socket - try to find by latest socket
                if (!userData) {
                    // Find the most recent participant with this socket_id
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
                        await this.storeSession(socketId, userData);
                        
                        console.log(`✅ SESSION: Recovered session for ${participant.participant_id}`);
                    } else {
                        console.log(`❌ SESSION: No participant found for socket ${socketId}`);
                        return null;
                    }
                } else {
                    // Restore to in-memory for performance
                    waitingUsers.set(socketId, userData);
                    console.log(`✅ SESSION: Restored session from database for ${userData.participant_id}`);
                }
            }
            
            // Update last seen timestamp
            await this.updateLastSeen(socketId);
            
            return userData;
            
        } catch (error) {
            console.error('❌ SESSION: Error in getOrRestoreSession:', error);
            return null;
        }
    }
    
    /**
     * Store user session data in database
     */
    async storeSession(socketId, userData) {
        try {
            await Participant.update({
                socket_id: socketId,
                session_state: userData,
                last_seen_at: new Date()
            }, {
                where: { participant_id: userData.participant_id }
            });
            
            console.log(`💾 SESSION: Stored session for ${userData.participant_id}`);
            return true;
        } catch (error) {
            console.error('❌ SESSION: Failed to store session:', error);
            return false;
        }
    }
    
    /**
     * Retrieve user session data from database
     */
    async getSession(socketId) {
        try {
            const participant = await Participant.findOne({
                where: { socket_id: socketId },
                attributes: ['participant_id', 'session_state', 'role', 'partner_id', 'session_id', 'dropout_stage', 'created_at']
            });
            
            if (participant && participant.session_state) {
                console.log(`🔄 SESSION: Retrieved session for ${participant.participant_id}`);
                return {
                    participant_id: participant.participant_id,
                    role: participant.role,
                    partner_id: participant.partner_id,
                    session_id: participant.session_id,
                    dropout_stage: participant.dropout_stage,
                    created_at: participant.created_at,
                    ...participant.session_state
                };
            }
            
            return null;
        } catch (error) {
            console.error('❌ SESSION: Failed to retrieve session:', error);
            return null;
        }
    }
    
    /**
     * Find session by worker_id or participant_id (for restoration)
     */
    async findSession(workerId, participantId = null) {
        try {
            let whereClause = {};
            if (participantId) {
                whereClause.participant_id = participantId;
            } else {
                whereClause.worker_id = workerId;
            }
            
            const participant = await Participant.findOne({
                where: whereClause,
                attributes: ['participant_id', 'session_state', 'role', 'partner_id', 'session_id', 'dropout_stage', 'created_at', 'socket_id']
            });
            
            if (participant) {
                console.log(`🔍 SESSION: Found session for ${participant.participant_id}`);
                return {
                    participant_id: participant.participant_id,
                    role: participant.role,
                    partner_id: participant.partner_id,
                    session_id: participant.session_id,
                    dropout_stage: participant.dropout_stage,
                    created_at: participant.created_at,
                    socket_id: participant.socket_id,
                    ...participant.session_state
                };
            }
            
            return null;
        } catch (error) {
            console.error('❌ SESSION: Failed to find session:', error);
            return null;
        }
    }
    
    /**
     * Update last seen timestamp
     */
    async updateLastSeen(socketId) {
        try {
            await Participant.update({
                last_seen_at: new Date()
            }, {
                where: { socket_id: socketId }
            });
        } catch (error) {
            // Silent fail - not critical
        }
    }
    
    /**
     * Remove session (on disconnect/completion)
     */
    async removeSession(socketId) {
        try {
            await Participant.update({
                socket_id: null,
                session_state: null
            }, {
                where: { socket_id: socketId }
            });
            
            console.log(`🗑️ SESSION: Removed session for socket ${socketId}`);
        } catch (error) {
            console.error('❌ SESSION: Failed to remove session:', error);
        }
    }
    
    /**
     * Clean up old sessions (run periodically)
     */
    async cleanupOldSessions(olderThanHours = 2) {
        try {
            const cutoffTime = new Date(Date.now() - (olderThanHours * 60 * 60 * 1000));
            
            const result = await Participant.update({
                socket_id: null,
                session_state: null
            }, {
                where: {
                    last_seen_at: {
                        [require('sequelize').Op.lt]: cutoffTime
                    },
                    socket_id: {
                        [require('sequelize').Op.not]: null
                    }
                }
            });
            
            if (result[0] > 0) {
                console.log(`🧹 SESSION: Cleaned up ${result[0]} old sessions`);
            }
        } catch (error) {
            console.error('❌ SESSION: Failed to cleanup old sessions:', error);
        }
    }
}

module.exports = SessionManager;