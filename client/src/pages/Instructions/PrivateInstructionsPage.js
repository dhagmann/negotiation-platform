/* eslint-disable import/no-webpack-loader-syntax */
// Please note that the above comment is required to raw-load markdown 
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Markdown from 'markdown-to-jsx'
import buyerInstructions1 from '!!raw-loader!../../markdown/private/Buyer1.md'
import sellerInstructions1 from '!!raw-loader!../../markdown/private/Seller1.md'

function PrivateInstructionsPage({ appData }) {
  useEffect(() => {
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 50); 
    }, []);
  const {role, socket}  = appData || {};
  const navigate = useNavigate();
  const location = useLocation();
  const { prolificPID, studyID, sessionID, workerId, socketId, failed, failureCount = 0 } = location.state || {};
  const [isLoadingRole, setIsLoadingRole] = useState(!role);
  
  // Handle role assignment if missing
  useEffect(() => {
    if (!role && workerId && socket) {
      //console.log('Role missing on private instructions page, resubmitting worker ID:', workerId);
      setIsLoadingRole(true);
      socket.emit('submitWorkerId', workerId);
      
      // Timeout after 10 seconds if role still not received
      const timeout = setTimeout(() => {
        if (!role) {
          console.error('Role loading timed out, proceeding anyway');
          setIsLoadingRole(false);
        }
      }, 10000);
      
      return () => clearTimeout(timeout);
    } else if (role) {
      setIsLoadingRole(false);
    }
  }, [role, workerId, socket]);
  
  let instructions1 = 'Could not retrieve instructions, please return to prolific and restart experiment.';

  // Handle case where role is not yet assigned (null/undefined)
  if (role && role.includes('optimisticBuyer')){
    instructions1 = buyerInstructions1
  } else if (role && role.includes('optimisticSeller')){
    instructions1 = sellerInstructions1
  } else if (role && role.includes('pessimisticBuyer')){
    instructions1 = buyerInstructions1
  } else if (role && role.includes('pessimisticSeller')){
    instructions1 = sellerInstructions1
  } else if (isLoadingRole) {
    // Role not yet assigned - show loading message
    instructions1 = 'Loading your role-specific instructions...';
  }

  const handleProceed = () => {
    // Don't allow proceeding without a role unless timeout occurred
    if (!role && isLoadingRole) {
      //console.log('Cannot proceed without role assignment');
      return;
    }
    navigate('/privateInstructions2', { state: { prolificPID, studyID, sessionID, workerId, socketId, failed, failureCount } });
  };

  return (
    <div className="info-container">
      <Markdown>
        {instructions1}
      </Markdown>
      
      <button 
        className="proceed-button" 
        onClick={handleProceed}
        disabled={!role && isLoadingRole}
        style={{ 
          opacity: (!role && isLoadingRole) ? 0.6 : 1,
          cursor: (!role && isLoadingRole) ? 'not-allowed' : 'pointer'
        }}
      >
        Continue
      </button>
    </div>
  );
}

export default PrivateInstructionsPage;