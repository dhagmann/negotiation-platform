/* eslint-disable import/no-webpack-loader-syntax */
// Please note that the above comment is required to raw-load markdown 
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Markdown from 'markdown-to-jsx'
import oBuyerInstructions2 from '!!raw-loader!../../markdown/private/oBuyer2.md'
import oSellerInstructions2 from '!!raw-loader!../../markdown/private/oSeller2.md'
import pBuyerInstructions2 from '!!raw-loader!../../markdown/private/pBuyer2.md'
import pSellerInstructions2 from '!!raw-loader!../../markdown/private/pSeller2.md'

function PrivateInstructions2Page({ appData }) {
  useEffect(() => {
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 50); 
    }, []);
  const {role, socket}  = appData || {};
  const navigate = useNavigate();
  const location = useLocation();
  const { prolificPID, studyID, sessionID, workerId, socketId, failed, failureCount = 0 } = location.state || {};
  
  // Handle role assignment if missing
  useEffect(() => {
    if (!role && workerId && socket) {
      //console.log('Role missing on private instructions 2 page, resubmitting worker ID:', workerId);
      socket.emit('submitWorkerId', workerId);
    }
  }, [role, workerId, socket]);
  
  let instructions2 = 'Could not retrieve instructions, please return to prolific and restart experiment.';

  // Handle case where role is not yet assigned (null/undefined)
  if (role && role.includes('optimisticBuyer')){
    instructions2 = oBuyerInstructions2
  } else if (role && role.includes('optimisticSeller')){
    instructions2 = oSellerInstructions2
  } else if (role && role.includes('pessimisticBuyer')){
    instructions2 = pBuyerInstructions2
  } else if (role && role.includes('pessimisticSeller')){
    instructions2 = pSellerInstructions2
  } else if (!role) {
    // Role not yet assigned - show loading message
    instructions2 = 'Loading your role-specific instructions...';
  }

  const handleProceed = () => {
    navigate('/preExperimentQuiz', { state: { prolificPID, studyID, sessionID, workerId, socketId, failed, failureCount } });
  };

  return (
    <div className="info-container">
      <Markdown>
        {instructions2}
      </Markdown>
      
      <button className="proceed-button" onClick={handleProceed}>
        Continue to the Comprehension Check
      </button>
    </div>
  );
}

export default PrivateInstructions2Page; 