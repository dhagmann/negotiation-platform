'use strict';

module.exports = (sequelize, DataTypes) => {
    const Participant = sequelize.define(
        'Participant',
        {
            // Identifiers
            participant_id: {
                type: DataTypes.STRING(12),
                primaryKey: true,
                // Will be generated as "P-A7X9-M3K1" format
            },
            partner_id: {
                type: DataTypes.STRING(12),
                allowNull: true,
                references: {
                    model: 'participants',
                    key: 'participant_id'
                }
            },
            session_id: {
                type: DataTypes.STRING(19),
                allowNull: true,
                // Format: "S-YYYY-MM-DD-XXXXXX" (19 chars)
            },
            worker_id: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },

            // Experimental design
            role: {
                type: DataTypes.STRING(50),
                allowNull: true,
                comment: 'Full role type including optimistic/pessimistic distinction (optimisticBuyer, pessimisticBuyer, optimisticSeller, pessimisticSeller)'
            },
            partner_role: {
                type: DataTypes.STRING(50),
                allowNull: true,
                comment: 'Role of the matched partner in negotiation (optimisticBuyer, pessimisticBuyer, optimisticSeller, pessimisticSeller)'
            },
            environment: {
                type: DataTypes.STRING(20),
                allowNull: false,
                defaultValue: process.env.NODE_ENV === 'production' ? 'production' : 'dev',
                comment: 'Environment where participant was created: production (Heroku) or dev (local development)'
            },


            // Pre-negotiation responses
            target_price: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'Target price going into negotiation'
            },
            justification: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'Justification argument for target price'
            },
            walkaway_point: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'Walkaway point for negotiation'
            },
            expected_outcome: {
                type: DataTypes.STRING(20),
                allowNull: true,
                comment: 'Expected outcome multiple choice (e.g., $2.5m)'
            },

            // Negotiation outcomes
            final_agreement: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: true,
                comment: 'Final agreed amount, NULL if no agreement'
            },
            agreement_reached: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },
            negotiation_duration_seconds: {
                type: DataTypes.INTEGER,
                allowNull: true,
                comment: 'Total time spent in chat'
            },

            // Demographics (from end survey)
            gender: {
                type: DataTypes.STRING(20),
                allowNull: true,
                comment: 'Gender: Male, Female, Other'
            },
            age: {
                type: DataTypes.INTEGER,
                allowNull: true,
                comment: 'Age (18-100)'
            },
            ethnicity: {
                type: DataTypes.STRING(50),
                allowNull: true,
                comment: 'Ethnicity selection'
            },
            education: {
                type: DataTypes.STRING(100),
                allowNull: true,
                comment: 'Education level'
            },
            political_orientation: {
                type: DataTypes.STRING(50),
                allowNull: true,
                comment: 'Political orientation scale'
            },
            negotiation_experience: {
                type: DataTypes.STRING(50),
                allowNull: true,
                comment: 'Negotiation experience level'
            },
            comments: {
                type: DataTypes.TEXT,
                allowNull: true,
                comment: 'Optional comments for researchers'
            },



            // Individual quiz responses
            quiz_q1: {
                type: DataTypes.STRING(100),
                allowNull: true,
                comment: 'Quiz question 1 answer (first attempt)'
            },
            quiz_q2: {
                type: DataTypes.STRING(100),
                allowNull: true,
                comment: 'Quiz question 2 answer (first attempt)'
            },
            quiz_q3: {
                type: DataTypes.STRING(100),
                allowNull: true,
                comment: 'Quiz question 3 answer (first attempt)'
            },
            // Retake quiz answers (for those who failed first attempt)
            quiz_q1_retake: {
                type: DataTypes.STRING(100),
                allowNull: true,
                comment: 'Quiz question 1 answer (second attempt)'
            },
            quiz_q2_retake: {
                type: DataTypes.STRING(100),
                allowNull: true,
                comment: 'Quiz question 2 answer (second attempt)'
            },
            quiz_q3_retake: {
                type: DataTypes.STRING(100),
                allowNull: true,
                comment: 'Quiz question 3 answer (second attempt)'
            },
            quiz_score: {
                type: DataTypes.INTEGER,
                allowNull: true,
                comment: 'Number of correct quiz answers'
            },
            quiz_passed: {
                type: DataTypes.BOOLEAN,
                allowNull: true,
                comment: 'Whether participant passed the quiz'
            },
            quiz_attempts: {
                type: DataTypes.INTEGER,
                defaultValue: 0,
                comment: 'Number of times participant attempted the quiz'
            },

            // Process tracking
            chat_started_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            chat_ended_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            completed_study: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },
            dropout_stage: {
                type: DataTypes.STRING(50),
                allowNull: true,
                comment: 'Stage where participant left if incomplete'
            },

            // Technical (keep socket for real-time features)
            socket_id: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            
            // Session state management
            session_state: {
                type: DataTypes.JSONB,
                allowNull: true,
                comment: 'Stores user session data (waiting, pairing, etc.)'
            },
            last_seen_at: {
                type: DataTypes.DATE,
                allowNull: true,
                comment: 'Last activity timestamp for session management'
            },
            created_at: {
                type: DataTypes.DATE,
                defaultValue: DataTypes.NOW,
            },
        },
        {
            tableName: 'participants',
            timestamps: false,
            indexes: [
                {
                    fields: ['session_id']
                },
                {
                    fields: ['worker_id']
                },
                {
                    fields: ['partner_id']
                },
                {
                    fields: ['socket_id']
                }
            ]
        }
    );

    // Generate participant ID in format P-XXXX-XXXX
    Participant.generateParticipantId = function() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const part1 = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        const part2 = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        return `P-${part1}-${part2}`;
    };

    // Generate session ID in format S-YYYY-MM-DD-XXXXXX (6 alphanumeric chars for ~2B combinations)
    Participant.generateSessionId = function() {
        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const random = Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        return `S-${date}-${random}`;
    };

    return Participant;
}; 