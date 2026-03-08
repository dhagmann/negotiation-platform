/* eslint-disable import/no-webpack-loader-syntax */
// Please note that the above comment is required to raw-load markdown 
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Markdown from 'markdown-to-jsx'
import infoPage1 from '!!raw-loader!../markdown/pages/infoPage1.md'

function Introduction1Page({ appData }) {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  
  const navigate = useNavigate();
  const location = useLocation();
  const { prolificPID, studyID, sessionID, workerId, socketId, failed } = location.state || {}; 

  const handleProceed = () => {
    navigate('/introduction2', { state: { prolificPID, studyID, sessionID, workerId, socketId, failed } });
  };

  return (
    <div className="info-container">
      <Markdown>
        {infoPage1}
      </Markdown>
      
      <button className="proceed-button" onClick={handleProceed}>
        Continue
      </button>
    </div>
  );
}

export default Introduction1Page; 