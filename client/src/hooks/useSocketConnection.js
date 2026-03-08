import { useState, useEffect, useCallback, useRef } from 'react';

const useSocketConnection = (socket) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [lastDisconnectTime, setLastDisconnectTime] = useState(null);
  
  // Track pending submissions to prevent race conditions
  const [pendingSubmissions, setPendingSubmissions] = useState(new Set());
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  
  // Auto-restore state utility (defined before useEffect)
  const autoRestoreState = useCallback(() => {
    // Try to restore state using URL parameters or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const workerId = urlParams.get('PROLIFIC_PID') || localStorage.getItem('workerId');
    const participantId = localStorage.getItem('participantId');
    
    if (workerId || participantId) {
      console.log('🔄 CLIENT: Auto-restoring state after reconnection');
      if (socket && socket.connected) {
        socket.emit('restoreUserState', { workerId, participantId });
      }
    }
  }, [socket]);

  // Connection status monitoring
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      console.log('✅ CLIENT: Socket connected successfully');
      setIsConnected(true);
      setIsReconnecting(false);
      setConnectionError(null);
      setLastDisconnectTime(null);
      
      // Clear any pending reconnection attempts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Auto-restore state after reconnection
      autoRestoreState();
    };

    const handleDisconnect = (reason) => {
      setIsConnected(false);
      setLastDisconnectTime(Date.now());
      
      // Don't auto-reconnect if disconnection was intentional
      if (reason === 'io client disconnect') {
        return;
      }
      
      // Start reconnection process for unexpected disconnects
      setIsReconnecting(true);
      attemptReconnection();
    };

    const handleConnectError = (error) => {
      setConnectionError(error.message || 'Connection failed');
      setIsReconnecting(true);
      attemptReconnection();
    };

    const handleReconnect = () => {
      setIsReconnecting(false);
      setConnectionError(null);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('reconnect', handleReconnect);

    // Initial connection state
    setIsConnected(socket.connected);

      // Set up enhanced heartbeat to detect stale connections
  // More frequent heartbeats during waiting periods to prevent mobile timeout
  heartbeatIntervalRef.current = setInterval(() => {
    if (socket.connected) {
      socket.emit('heartbeat', Date.now());
    }
  }, 15000); // Every 15 seconds for better mobile compatibility

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('reconnect', handleReconnect);
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [socket, autoRestoreState]);

  const attemptReconnection = useCallback(() => {
    if (reconnectTimeoutRef.current) return; // Already attempting

    reconnectTimeoutRef.current = setTimeout(() => {
      if (socket && !socket.connected) {
        console.log('🔄 CLIENT: Attempting to reconnect socket...');
        socket.connect();
      }
      reconnectTimeoutRef.current = null;
      
      // If still not connected, try again with exponential backoff
      if (socket && !socket.connected) {
        // More aggressive reconnection during waiting periods
        const backoffDelay = Math.min(5000, 1000 * Math.pow(1.2, 3)); // Max 5 seconds
        console.log(`🔄 CLIENT: Reconnection failed, retrying in ${backoffDelay}ms`);
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            attemptReconnection();
          }, backoffDelay);
        }
      }
    }, 1000); // Faster initial reconnection attempt
  }, [socket]);

  // Safe submission wrapper that waits for server confirmation
  const safeSubmit = useCallback((eventName, data, onSuccess, onError, timeoutMs = 10000) => {
    return new Promise((resolve, reject) => {
      if (!socket || !socket.connected) {
        const error = 'No socket connection available';
        onError?.(error);
        reject(new Error(error));
        return;
      }

      const submissionId = `${eventName}_${Date.now()}_${Math.random()}`;
      setPendingSubmissions(prev => new Set(prev).add(submissionId));

      let timeoutId;

      const cleanupListeners = () => {
        socket.off(`${eventName}Recorded`, handleSuccess);
        socket.off('error', handleError);
      };

      // Success handler
      const handleSuccess = (response) => {
        clearTimeout(timeoutId);
        setPendingSubmissions(prev => {
          const newSet = new Set(prev);
          newSet.delete(submissionId);
          return newSet;
        });
        
        // Clean up listeners
        cleanupListeners();
        
        onSuccess?.(response);
        resolve(response);
      };

      // Error handler
      const handleError = (error) => {
        clearTimeout(timeoutId);
        setPendingSubmissions(prev => {
          const newSet = new Set(prev);
          newSet.delete(submissionId);
          return newSet;
        });
        
        // Clean up listeners
        cleanupListeners();
        
        const errorMsg = typeof error === 'string' ? error : error?.message || 'Unknown error';
        onError?.(errorMsg);
        reject(new Error(errorMsg));
      };

      // Set up timeout
      timeoutId = setTimeout(() => {
        setPendingSubmissions(prev => {
          const newSet = new Set(prev);
          newSet.delete(submissionId);
          return newSet;
        });
        
        // Clean up listeners
        cleanupListeners();
        
        const error = `Submission timeout after ${timeoutMs}ms`;
        onError?.(error);
        reject(new Error(error));
      }, timeoutMs);

      // Set up listeners for this specific submission
      socket.once(`${eventName}Recorded`, handleSuccess);
      socket.once('error', handleError);

      // Emit the event
      socket.emit(eventName, data);
    });
  }, [socket]);

  // Utility to check if user has been idle too long
  const hasBeenIdleTooLong = useCallback(() => {
    if (!lastDisconnectTime) return false;
    const fiveMinutes = 5 * 60 * 1000;
    return (Date.now() - lastDisconnectTime) > fiveMinutes;
  }, [lastDisconnectTime]);

  // Enhanced utility to restore user state after reconnection
  const restoreUserState = useCallback((workerId, participantId = null) => {
    if (socket && socket.connected && (workerId || participantId)) {
      console.log('🔄 CLIENT: Attempting to restore user state...');
      socket.emit('restoreUserState', { workerId, participantId });
    }
  }, [socket]);



  return {
    isConnected,
    isReconnecting,
    connectionError,
    hasPendingSubmissions: pendingSubmissions.size > 0,
    pendingSubmissionCount: pendingSubmissions.size,
    safeSubmit,
    hasBeenIdleTooLong,
    restoreUserState,
    autoRestoreState,
    manualReconnect: attemptReconnection
  };
};

export default useSocketConnection;