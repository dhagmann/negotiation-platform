/* eslint-disable import/no-webpack-loader-syntax */
// Please note that the above comment is required to raw-load markdown 

import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Markdown from 'markdown-to-jsx'
import generalInstructionsPage from '!!raw-loader!../../markdown/pages/generalInstructions.md'

function GeneralInstructionsPage({ appData }) {
  const {setAlert, alert} = appData || {};
  useEffect(() => {
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 50); 
  }, []);

  const navigate = useNavigate();
  const location = useLocation();
  const {prolificPID, studyID, sessionID, workerId, socketId, failed, failureCount = 0 } = location.state || {};
  
  useEffect(() => {
    // Only show alert if user is explicitly returning from quiz failure
    // Must have both: failed=true AND failureCount>0 (indicating legitimate quiz failure)
    // This prevents false alerts from stale browser state or incorrect navigation
    if(failed === true && failureCount > 0){
      //console.log('Showing comprehension check failure alert - failed:', failed, 'failureCount:', failureCount);
      setAlert(true)
    } else {
      //console.log('Not showing alert - failed:', failed, 'failureCount:', failureCount);
    }
  }, [failed, failureCount, setAlert])
  

  const handleProceed = () => {
    // Always ensure clean state when proceeding normally (not from quiz failure)
    const cleanFailed = (failed === true && failureCount > 0) ? failed : false;
    navigate('/privateInstructions', { 
      state: { 
        prolificPID, 
        studyID, 
        sessionID, 
        workerId, 
        socketId, 
        failed: cleanFailed, 
        failureCount 
      } 
    });
  };

  const handleOkay = () => {
    setAlert(false)
  }

  return (
    <div>
      {alert && (
        <div className="alert-overlay">
          <div className="alert-box">
            <h3>You answered one or more questions incorrectly. You have one more chance to read the instructions and pass the quiz. Please read the instructions closely.</h3>
            <button className="alert-confirm" onClick={() => handleOkay()}>
              Okay
            </button>
          </div>
        </div>
      )}

      <div className="info-container">
        <Markdown>
          {generalInstructionsPage}
        </Markdown>
        
        <button className="proceed-button" onClick={handleProceed}>
          Continue to Role-Specific Information
        </button>
      </div>
    </div>
  );
}

export default GeneralInstructionsPage;