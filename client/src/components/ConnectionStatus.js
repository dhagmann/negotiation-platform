import React, { useState, useEffect } from 'react';
import './ConnectionStatus.css';

const ConnectionStatus = ({ 
  isConnected, 
  isReconnecting, 
  connectionError, 
  hasPendingSubmissions,
  pendingSubmissionCount,
  onReconnect,
  className = ''
}) => {
  const [showReconnecting, setShowReconnecting] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [hasInitiallyConnected, setHasInitiallyConnected] = useState(false);

  // Only show reconnecting status after a delay to avoid flash on initial connect
  useEffect(() => {
    if (isReconnecting) {
      const timer = setTimeout(() => {
        setShowReconnecting(true);
      }, 2000); // 2 second delay before showing reconnecting status
      
      return () => clearTimeout(timer);
    } else {
      setShowReconnecting(false);
    }
  }, [isReconnecting]);

  // Only show pending submissions after a delay to avoid flash on quick operations
  useEffect(() => {
    if (hasPendingSubmissions) {
      const timer = setTimeout(() => {
        setShowPending(true);
      }, 1000); // 1 second delay before showing pending status
      
      return () => clearTimeout(timer);
    } else {
      setShowPending(false);
    }
  }, [hasPendingSubmissions]);

  // Track if we've ever successfully connected
  useEffect(() => {
    if (isConnected) {
      setHasInitiallyConnected(true);
    }
  }, [isConnected]);

  const getStatusInfo = () => {
    // Only show persistent connection errors
    if (!isConnected && connectionError && !isReconnecting) {
      return {
        type: 'error',
        message: `Connection lost: ${connectionError}`,
        icon: '❌',
        action: onReconnect ? (
          <button 
            className="connection-retry-btn" 
            onClick={onReconnect}
          >
            Retry Connection
          </button>
        ) : null
      };
    }
    
    // Only show disconnected status for persistent disconnections (not initial connection attempts)
    if (!isConnected && !isReconnecting && !connectionError && hasInitiallyConnected) {
      return {
        type: 'disconnected',
        message: 'No connection to server',
        icon: '⚠️',
        action: onReconnect ? (
          <button 
            className="connection-retry-btn" 
            onClick={onReconnect}
          >
            Reconnect
          </button>
        ) : null
      };
    }
    
    // Only show reconnecting after delay and only if taking a while
    if (!isConnected && showReconnecting) {
      return {
        type: 'reconnecting',
        message: 'Reconnecting...',
        icon: '🔄',
        action: null
      };
    }
    
    // Only show pending submissions if they're taking a while (longer operations)
    if (hasPendingSubmissions && showPending && pendingSubmissionCount > 0) {
      return {
        type: 'pending',
        message: `Saving data... (${pendingSubmissionCount} pending)`,
        icon: '💾',
        action: null
      };
    }
    
    return null;
  };

  const statusInfo = getStatusInfo();
  if (!statusInfo) return null;

  return (
    <div className={`connection-status connection-status--${statusInfo.type} ${className}`}>
      <div className="connection-status__content">
        <span className="connection-status__icon">{statusInfo.icon}</span>
        <span className="connection-status__message">{statusInfo.message}</span>
        {statusInfo.action && (
          <div className="connection-status__action">
            {statusInfo.action}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectionStatus;