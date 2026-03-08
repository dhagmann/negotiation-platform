const isProduction = process.env.NODE_ENV === 'production';

const logger = {
  info: (message, data = null) => {
    const timestamp = new Date().toISOString();
    const logEntry = data 
      ? `[${timestamp}] INFO: ${message} ${JSON.stringify(data)}`
      : `[${timestamp}] INFO: ${message}`;
    //console.log(logEntry);
  },
  
  warn: (message, data = null) => {
    const timestamp = new Date().toISOString();
    const logEntry = data 
      ? `[${timestamp}] WARN: ${message} ${JSON.stringify(data)}`
      : `[${timestamp}] WARN: ${message}`;
    console.warn(logEntry);
  },
  
  error: (message, error = null) => {
    const timestamp = new Date().toISOString();
    const logEntry = error 
      ? `[${timestamp}] ERROR: ${message} ${error.stack || error}`
      : `[${timestamp}] ERROR: ${message}`;
    console.error(logEntry);
  },
  
  debug: (message, data = null) => {
    if (!isProduction) {
      const timestamp = new Date().toISOString();
      const logEntry = data 
        ? `[${timestamp}] DEBUG: ${message} ${JSON.stringify(data)}`
        : `[${timestamp}] DEBUG: ${message}`;
      //console.log(logEntry);
    }
  },

  // Specific methods for socket events
  connection: (socketId, additionalInfo = {}) => {
    //logger.info(`User connected: ${socketId}`, additionalInfo);
  },

  disconnection: (socketId, additionalInfo = {}) => {
    //logger.info(`User disconnected: ${socketId}`, additionalInfo);
  },

  pairing: (user1Id, user2Id, roomName, roles) => {
    //logger.info(`Users paired: ${user1Id} (${roles.user1}) with ${user2Id} (${roles.user2}) in room ${roomName}`);
  },

  cleanup: (cleanedCount, remaining) => {
    //logger.info(`Cleaned up ${cleanedCount} connections`, remaining);
  }
};

module.exports = logger; 