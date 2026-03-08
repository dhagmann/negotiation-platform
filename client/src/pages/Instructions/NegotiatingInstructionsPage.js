/* eslint-disable import/no-webpack-loader-syntax */
// Please note that the above comment is required to raw-load markdown 
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Markdown from 'markdown-to-jsx'
import negotiatingBuyerInstructions from '!!raw-loader!../../markdown/instructions/negotiatingBuyer.md'
import negotiatingSellerInstructions from '!!raw-loader!../../markdown/instructions/negotiatingSeller.md'

function NegotiatingInstructionsPage({ appData }) {
  useEffect(() => {
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 50); 
    }, []);
  const navigate = useNavigate();
  const location = useLocation();
  const { prolificPID, studyID, sessionID, workerId, socketId, failed } = location.state || {};
  const { role, socket } = appData || {};
  
  // Handle role assignment if missing
  useEffect(() => {
    if (!role && workerId && socket) {
      //console.log('Role missing on negotiating instructions page, resubmitting worker ID:', workerId);
      socket.emit('submitWorkerId', workerId);
    }
  }, [role, workerId, socket]);
  
  // Select the appropriate instructions based on role
  let instructions = negotiatingBuyerInstructions; // Default to buyer
  if (role && role.includes('Seller')) {
    instructions = negotiatingSellerInstructions;
  } else if (!role) {
    instructions = 'Loading your role-specific negotiating instructions...';
  }

  const handleProceed = () => {
    navigate('/negotiatingTips', { state: { prolificPID, studyID, sessionID, workerId, socketId, failed } });
  };

  return (
    <div className="info-container">
      <Markdown>
        {instructions}
      </Markdown>
      
      <button className="proceed-button" onClick={handleProceed}>
        Continue
      </button>
    </div>
  );
}

export default NegotiatingInstructionsPage;