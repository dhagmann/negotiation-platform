/**
 * Database Service Layer
 * Optimizes database queries and connection usage for Aurora Serverless v2
 */

const { sequelize } = require('../models');
const logger = require('./logger');

class DatabaseService {
    constructor() {
        this.queryCache = new Map();
        this.cacheTimeout = 30000; // 30 seconds cache for dashboard data
    }

    /**
     * Get cached query result or execute and cache
     */
    async getCachedQuery(cacheKey, queryFn, timeout = this.cacheTimeout) {
        const cached = this.queryCache.get(cacheKey);
        const now = Date.now();
        
        if (cached && (now - cached.timestamp) < timeout) {
            return cached.data;
        }
        
        try {
            const data = await queryFn();
            this.queryCache.set(cacheKey, {
                data,
                timestamp: now
            });
            return data;
        } catch (error) {
            //logger.error(`Cached query failed for ${cacheKey}:`, error);
            throw error;
        }
    }

    /**
     * Batch dashboard queries into a single transaction
     */
    async getDashboardData() {
        const cacheKey = 'dashboard_data';
        
        return this.getCachedQuery(cacheKey, async () => {
            const transaction = await sequelize.transaction();
            
            try {
                // Simplified query to get all dashboard data at once
                const [participantResults] = await sequelize.query(`
                    SELECT 
                        COUNT(*) as total_participants,
                        COUNT(CASE WHEN completed_study = true THEN 1 END) as completed_studies,
                        COUNT(CASE WHEN final_agreement IS NOT NULL THEN 1 END) as total_agreements,
                        COUNT(CASE WHEN quiz_passed = true THEN 1 END) as quiz_passed,
                        COUNT(CASE WHEN quiz_attempts > 0 THEN 1 END) as quiz_attempts,
                        COUNT(DISTINCT session_id) as total_sessions
                    FROM participants;
                `, { 
                    type: sequelize.QueryTypes.SELECT,
                    transaction 
                });
                
                const [messageResults] = await sequelize.query(`
                    SELECT COUNT(*) as count
                    FROM chat_messages 
                    WHERE absolute_timestamp > NOW() - INTERVAL '1 hour';
                `, { 
                    type: sequelize.QueryTypes.SELECT,
                    transaction 
                });
                
                const results = {
                    ...participantResults[0],
                    recent_messages: messageResults[0]?.count || 0
                };
                
                await transaction.commit();
                
                return {
                    totalParticipants: parseInt(results.total_participants || 0),
                    completedStudies: parseInt(results.completed_studies || 0),
                    totalAgreements: parseInt(results.total_agreements || 0),
                    quizPassed: parseInt(results.quiz_passed || 0),
                    quizAttempts: parseInt(results.quiz_attempts || 0),
                    totalSessions: parseInt(results.total_sessions || 0),
                    recentMessagesCount: parseInt(results.recent_messages || 0),
                    roleDistribution: []
                };
                
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        });
    }

    /**
     * Optimized participant creation with connection reuse
     */
    async createOrUpdateParticipant(workerId, role, socketId) {
        const transaction = await sequelize.transaction();
        
        try {
            // Use UPSERT to avoid multiple queries
            const [participant, created] = await sequelize.query(`
                INSERT INTO participants (participant_id, worker_id, role, socket_id, created_at)
                VALUES (
                    CASE 
                        WHEN NOT EXISTS (SELECT 1 FROM participants WHERE worker_id = :workerId)
                        THEN CONCAT('P-', 
                            substr(md5(random()::text), 1, 4), '-', 
                            substr(md5(random()::text), 1, 4)
                        )
                        ELSE (SELECT participant_id FROM participants WHERE worker_id = :workerId)
                    END,
                    :workerId,
                    :role,
                    :socketId,
                    COALESCE(
                        (SELECT created_at FROM participants WHERE worker_id = :workerId),
                        NOW()
                    )
                )
                ON CONFLICT (participant_id) 
                DO UPDATE SET 
                    socket_id = :socketId,
                    role = :role
                RETURNING participant_id, 
                    CASE WHEN xmax = 0 THEN true ELSE false END as was_created;
            `, {
                replacements: { workerId, role, socketId },
                type: sequelize.QueryTypes.SELECT,
                transaction
            });
            
            await transaction.commit();
            
            return {
                participant_id: participant[0].participant_id,
                created: participant[0].was_created
            };
            
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    /**
     * Batch update multiple participants (for pairing)
     */
    async updateParticipantPair(participant1Id, participant2Id, sessionId, chatStartTime) {
        const transaction = await sequelize.transaction();
        
        try {
            await sequelize.query(`
                UPDATE participants 
                SET 
                    session_id = :sessionId,
                    partner_id = CASE 
                        WHEN participant_id = :participant1Id THEN :participant2Id
                        WHEN participant_id = :participant2Id THEN :participant1Id
                    END,
                    chat_started_at = :chatStartTime
                WHERE participant_id IN (:participant1Id, :participant2Id);
            `, {
                replacements: { 
                    participant1Id, 
                    participant2Id, 
                    sessionId, 
                    chatStartTime 
                },
                type: sequelize.QueryTypes.UPDATE,
                transaction
            });
            
            await transaction.commit();
            
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    /**
     * Optimized quiz response recording
     */
    async recordQuizResponses(participantId, quizData) {
        const { quiz_q1_answer, quiz_q2_answer, quiz_q3_answer, quiz_score, quiz_passed, quiz_attempts } = quizData;
        
        // Determine columns based on attempt number
        const columnPrefix = quiz_attempts === 1 ? 'quiz_q' : 'quiz_q';
        const columnSuffix = quiz_attempts === 1 ? '' : '_retake';
        
        await sequelize.query(`
            UPDATE participants 
            SET 
                ${columnPrefix}1${columnSuffix} = :q1,
                ${columnPrefix}2${columnSuffix} = :q2,
                ${columnPrefix}3${columnSuffix} = :q3,
                quiz_score = :score,
                quiz_passed = :passed,
                quiz_attempts = :attempts
            WHERE participant_id = :participantId OR socket_id = :participantId;
        `, {
            replacements: {
                q1: quiz_q1_answer,
                q2: quiz_q2_answer,
                q3: quiz_q3_answer,
                score: quiz_score,
                passed: quiz_passed,
                attempts: quiz_attempts,
                participantId
            },
            type: sequelize.QueryTypes.UPDATE
        });
    }

    /**
     * Clear cache for specific keys or all
     */
    clearCache(key = null) {
        if (key) {
            this.queryCache.delete(key);
        } else {
            this.queryCache.clear();
        }
    }

    /**
     * Get connection pool status
     */
    async getConnectionStatus() {
        try {
            await sequelize.authenticate();
            const pool = sequelize.connectionManager.pool;
            
            return {
                status: 'connected',
                pool: {
                    total: pool.options.max,
                    used: pool.used || 0,
                    waiting: pool.pending || 0,
                    available: (pool.options.max - (pool.used || 0)) || 0,
                    idle: pool.idle || 0
                },
                cache: {
                    entries: this.queryCache.size,
                    keys: Array.from(this.queryCache.keys())
                }
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Cleanup old cache entries
     */
    cleanupCache() {
        const now = Date.now();
        for (const [key, value] of this.queryCache.entries()) {
            if (now - value.timestamp > this.cacheTimeout * 2) {
                this.queryCache.delete(key);
            }
        }
    }
}

// Create singleton instance
const dbService = new DatabaseService();

// Cleanup cache every 5 minutes
setInterval(() => {
    dbService.cleanupCache();
}, 5 * 60 * 1000);

module.exports = dbService; 