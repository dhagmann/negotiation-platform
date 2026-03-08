/* eslint-disable import/no-webpack-loader-syntax */
// Please note that the above comment is required to raw-load markdown 
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Markdown from 'markdown-to-jsx'
import infoPage3 from '!!raw-loader!../markdown/pages/infoPage3.md'

function Introduction3Page({ appData }) {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  
  const navigate = useNavigate();
  const location = useLocation();
  const { prolificPID, studyID, sessionID, workerId, socketId, failed } = location.state || {}; 

  const handleProceed = () => {
    navigate('/roleInstructions', { state: { prolificPID, studyID, sessionID, workerId, socketId, failed } });
  };

  return (
    <div className="info-container">
      <Markdown>
        {infoPage3}
      </Markdown>

      <button className="proceed-button" onClick={handleProceed}>
        Continue to Learn Your Role
      </button>
    </div>
  );
}

export default Introduction3Page; 