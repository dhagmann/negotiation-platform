'use strict';

module.exports = (sequelize, DataTypes) => {
    const ChatMessage = sequelize.define(
        'ChatMessage',
        {
            message_id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            session_id: {
                type: DataTypes.STRING(19),
                allowNull: false,
                comment: 'Links to participants.session_id'
            },
            sender_participant_id: {
                type: DataTypes.STRING(12),
                allowNull: false,
                references: {
                    model: 'participants',
                    key: 'participant_id'
                }
            },
            recipient_participant_id: {
                type: DataTypes.STRING(12),
                allowNull: false,
                references: {
                    model: 'participants',
                    key: 'participant_id'
                }
            },
            message_text: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
            
            // Key improvement: relative timing for analysis
            seconds_since_chat_start: {
                type: DataTypes.INTEGER,
                allowNull: false,
                comment: 'Seconds since negotiation chat began - for analysis'
            },
            
            // Keep absolute timestamp for debugging/admin
            absolute_timestamp: {
                type: DataTypes.DATE,
                defaultValue: DataTypes.NOW,
            }
        },
        {
            tableName: 'chat_messages',
            timestamps: false,
            indexes: [
                {
                    fields: ['session_id']
                },
                {
                    fields: ['sender_participant_id']
                },
                {
                    fields: ['seconds_since_chat_start']
                }
            ]
        }
    );

    // Helper method to calculate relative timing
    ChatMessage.calculateRelativeTime = function(chatStartTime) {
        const now = new Date();
        const startTime = new Date(chatStartTime);
        return Math.floor((now - startTime) / 1000);
    };

    return ChatMessage;
}; 