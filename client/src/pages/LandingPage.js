// Landing page for participant entry
// Production Link: https://www.agentselections.com?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
// Development Link: http://localhost:3000/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import useSocketConnection from '../hooks/useSocketConnection';
import ConnectionStatus from '../components/ConnectionStatus';
// Legacy createUser removed - using research participant system

const serverUrl = process.env.REACT_APP_SERVER_URL || window.location.origin;

function LandingPage({ appData }) {
  useEffect(() => {
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 50); 
    }, []);
  const { socket }  = appData || {};
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  
  // Use the new socket connection hook
  const {
    isConnected,
    isReconnecting,
    connectionError,
    hasPendingSubmissions,
    pendingSubmissionCount,
    safeSubmit,
    manualReconnect
  } = useSocketConnection(socket);
  
  // Mobile device detection
  useEffect(() => {
    const detectMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      
      // Check for explicit mobile device indicators
      const explicitMobileKeywords = ['mobile', 'android', 'iphone', 'ipod', 'blackberry', 'windows phone'];
      const isExplicitMobile = explicitMobileKeywords.some(keyword => userAgent.includes(keyword));
      
      // iPad specific check (since iPad doesn't include "mobile" in user agent)
      const isIPad = userAgent.includes('ipad') || (userAgent.includes('macintosh') && navigator.maxTouchPoints > 1);
      
      // Only redirect if it's clearly a mobile device based on user agent
      return isExplicitMobile || isIPad;
    };

    if (detectMobile()) {
      navigate('/mobileRestricted');
    }
  }, [navigate]);
  
  // Extract query parameters
  const searchParams = new URLSearchParams(location.search);
  let prolificPID = searchParams.get("PROLIFIC_PID");
  if (prolificPID) {
    prolificPID = prolificPID.replace(/[{}]/g, '');
  }

  let studyID = searchParams.get("STUDY_ID");
  let sessionID = searchParams.get("SESSION_ID");
  if(prolificPID === null){
    prolificPID = "" // Empty string, not placeholder text
  }
  const [workerId, setWorkerId] = useState(prolificPID);
  
  if(studyID === null){
    studyID = "N/A"
  }
  if(sessionID === null){
    sessionID = "N/A"
  }
  
  const validateForm = () => {
    const newErrors = {};
    if (!workerId.trim() || workerId.trim() === "Prolific ID") {
      newErrors.workerId = 'Please enter a valid Prolific ID';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
      e.preventDefault();
      if (!validateForm() || loading || hasPendingSubmissions) {
        return;
      }
      
      setLoading(true);
      
      try {
        // First, check if this worker_id has already participated
        const duplicateCheck = await axios.post(`${serverUrl}/check-duplicate-participant`, {
          worker_id: workerId
        });
        
        if (duplicateCheck.data.isDuplicate) {
          setLoading(false);
          navigate('/alreadyParticipated', { 
            state: { prolificPID, studyID, sessionID, workerId } 
          });
          return;
        }
        
        let socketId = socket.id;
        
        // Use safe submission that waits for server confirmation
        await safeSubmit(
          'submitWorkerId',
          workerId,
          () => {
            // Success - navigate to next page
            let failed = false;
            navigate('/introduction1', { state: { prolificPID, studyID, sessionID, workerId, socketId, failed } });
          },
          (error) => {
            // Error - show message but still allow continuation for better UX
            console.warn('Worker ID submission failed:', error);
            // Still proceed for better UX (duplicate check already passed)
            let failed = false;
            navigate('/introduction1', { state: { prolificPID, studyID, sessionID, workerId, socketId, failed } });
          }
        );
        
      } catch (error) {
        setLoading(false);
        // If duplicate check fails, show error but still allow continuation
        // (better UX than blocking legitimate participants)
        let socketId = socket.id;
        
        // Try socket emission anyway
        if (socket && socket.connected) {
          socket.emit('submitWorkerId', workerId);
        }
        
        let failed = false;
        navigate('/introduction1', { state: { prolificPID, studyID, sessionID, workerId, socketId, failed } });
      }
  };


  return (
    <>
      <ConnectionStatus
        isConnected={isConnected}
        isReconnecting={isReconnecting}
        connectionError={connectionError}
        hasPendingSubmissions={hasPendingSubmissions}
        pendingSubmissionCount={pendingSubmissionCount}
        onReconnect={manualReconnect}
      />
      
      <div className="landing-container">
        {loading && (
            <div className="loading-overlay">
              Loading...
            </div>
          )}
        <h1>Welcome to this Study!</h1>
        <form className="landing-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="workerId">Please make sure that your Prolific ID is correct:</label>
            <input
              type="text"
              id="workerId"
              value={workerId}
              placeholder="Prolific ID"
              onChange={(e) => setWorkerId(e.target.value)}
            />
            {errors.workerId && <span className="error">{errors.workerId}</span>}
          </div>
          <button 
            disabled={loading || hasPendingSubmissions || !isConnected} 
            type="submit"
          >
            {loading || hasPendingSubmissions ? 'Loading...' : 'Continue'}
          </button>
          
          {!isConnected && (
            <p style={{ textAlign: 'center', color: '#666', fontSize: '14px', marginTop: '10px' }}>
              Please check your internet connection and try again.
            </p>
          )}
        </form>
      </div>
    </>
  );
}

export default LandingPage;