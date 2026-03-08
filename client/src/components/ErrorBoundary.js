import React from 'react';

/**
 * Enhanced Error Display Component for Research Studies
 * Provides clear, helpful error messages and recovery instructions
 */
export const ErrorMessage = ({ error, onRetry, canRetry = true, isRecovering = false }) => {
  if (!error) return null;
  
  const isSessionError = error.includes('Participant not found') || 
                        error.includes('Session expired') ||
                        error.includes('user data missing');
  
  const isConnectionError = error.includes('No connection') || 
                           error.includes('Failed to connect');
  
  return (
    <div className="error-container" style={{
      backgroundColor: '#fff3cd',
      border: '1px solid #ffeaa7',
      borderRadius: '8px',
      padding: '16px',
      margin: '16px 0',
      color: '#856404'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '18px', marginRight: '8px' }}>⚠️</span>
        <strong>
          {isSessionError ? 'Session Issue' : 
           isConnectionError ? 'Connection Issue' : 'Error'}
        </strong>
      </div>
      
      <p style={{ margin: '8px 0', lineHeight: '1.4' }}>
        {error}
      </p>
      
      {isSessionError && (
        <div style={{ 
          backgroundColor: '#fff', 
          padding: '12px', 
          borderRadius: '4px', 
          marginTop: '12px',
          border: '1px solid #e9ecef'
        }}>
          <strong>What to do:</strong>
          <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
            <li>Try clicking the button again - your session may be automatically restored</li>
            <li>If that doesn't work, refresh this page (your progress is saved)</li>
            <li>If problems persist, please contact the researcher</li>
          </ol>
        </div>
      )}
      
      {isConnectionError && (
        <div style={{ 
          backgroundColor: '#fff', 
          padding: '12px', 
          borderRadius: '4px', 
          marginTop: '12px',
          border: '1px solid #e9ecef'
        }}>
          <strong>Check your connection:</strong>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
            <li>Make sure you're connected to the internet</li>
            <li>Try refreshing the page</li>
            <li>Your progress is automatically saved</li>
          </ul>
        </div>
      )}
      
      {canRetry && onRetry && (
        <button
          onClick={onRetry}
          disabled={isRecovering}
          style={{
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: isRecovering ? 'not-allowed' : 'pointer',
            marginTop: '12px',
            opacity: isRecovering ? 0.6 : 1
          }}
        >
          {isRecovering ? 'Recovering...' : 'Try Again'}
        </button>
      )}
    </div>
  );
};

/**
 * Simple success message component
 */
export const SuccessMessage = ({ message, onDismiss }) => {
  if (!message) return null;
  
  return (
    <div style={{
      backgroundColor: '#d4edda',
      border: '1px solid #c3e6cb',
      borderRadius: '8px',
      padding: '16px',
      margin: '16px 0',
      color: '#155724',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: '18px', marginRight: '8px' }}>✅</span>
        {message}
      </div>
      
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '16px',
            cursor: 'pointer',
            color: '#155724'
          }}
        >
          ×
        </button>
      )}
    </div>
  );
};