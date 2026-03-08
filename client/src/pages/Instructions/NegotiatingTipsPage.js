/* eslint-disable import/no-webpack-loader-syntax */
// Please note that the above comment is required to raw-load markdown 
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Markdown from 'markdown-to-jsx'
import negotiatingTips from '!!raw-loader!../../markdown/instructions/negotiatingTips.md'

function NegotiatingTipsPage({ appData }) {
  useEffect(() => {
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 50); 
    }, []);
  const navigate = useNavigate();
  const location = useLocation();
  const { prolificPID, studyID, sessionID, workerId, socketId, failed } = location.state || {};

  const handleProceed = () => {
    navigate('/outcomeGuess', { state: { prolificPID, studyID, sessionID, workerId, socketId, failed } });
  };

  return (
    <div className="info-container">
      <Markdown>
        {negotiatingTips}
      </Markdown>
      
      <button className="proceed-button" onClick={handleProceed}>
        Continue
      </button>
    </div>
  );
}

export default NegotiatingTipsPage; 