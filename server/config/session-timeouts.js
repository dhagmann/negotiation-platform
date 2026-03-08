/**
 * Session Timeout Configuration for Research Studies
 * Protects against dropping participants who are actively working
 */

module.exports = {
  // Connection cleanup timeouts
  STALE_CONNECTION_TIMEOUT: 60 * 60 * 1000, // 1 hour for inactive connections
  ACTIVE_PARTICIPANT_TIMEOUT: 2 * 60 * 60 * 1000, // 2 hours for active participants
  
  // Waiting timeouts  
  WAITING_FOR_PARTNER_TIMEOUT: 10 * 60 * 1000, // 10 minutes to find partner
  PAIRING_STUCK_TIMEOUT: 2 * 60 * 1000, // 2 minutes for pairing recovery
  
  // Chat session timeouts
  CHAT_SESSION_TIMEOUT: 7 * 60 * 1000, // 7 minutes for negotiation
  
  // Post-chat timeouts
  DEMOGRAPHICS_COMPLETION_TIMEOUT: 30 * 60 * 1000, // 30 minutes to complete demographics
  
  // Page-specific timeouts (for forms that might take longer)
  FORM_COMPLETION_TIMEOUTS: {
    '/outcomeGuess': 15 * 60 * 1000, // 15 minutes for outcome guess form
    '/preExperimentQuiz': 10 * 60 * 1000, // 10 minutes for quiz
    '/postExperimentQuiz': 20 * 60 * 1000, // 20 minutes for demographics
    '/instructions': 10 * 60 * 1000, // 10 minutes for instruction pages
  },
  
  // Cleanup intervals
  CLEANUP_INTERVAL: 10 * 60 * 1000, // Run cleanup every 10 minutes
  PROGRESS_CLEANUP_INTERVAL: 60 * 60 * 1000, // Clean old progress every hour
  
  // Session recovery settings
  MAX_RECOVERY_ATTEMPTS: 3,
  RECOVERY_TIMEOUT: 5 * 1000, // 5 seconds for recovery attempts
};