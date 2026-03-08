/* eslint-disable import/no-webpack-loader-syntax */
// Please note that the above comment is required to raw-load markdown 
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Markdown from 'markdown-to-jsx'
import buyerInstructions from '!!raw-loader!../../markdown/instructions/buyer.md'
import sellerInstructions from '!!raw-loader!../../markdown/instructions/seller.md'

function RoleInstructionsPage({ appData }) {
  useEffect(() => {
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 50); 
    }, []);
  const {role, socket}  = appData || {};
  const navigate = useNavigate();
  const location = useLocation();
  const { prolificPID, studyID, sessionID, workerId, socketId, failed } = location.state || {};
  const [isLoadingRole, setIsLoadingRole] = useState(!role);
  const [roleLoadingTimedOut, setRoleLoadingTimedOut] = useState(false);
  
  // Handle role assignment if missing
  useEffect(() => {
    if (!role && workerId && socket) {
      //console.log('🔄 RoleInstructionsPage: Role missing, resubmitting worker ID:', workerId);
      //console.log('🔍 Current role state:', role);
      //console.log('🔍 Current socket state:', socket ? 'connected' : 'disconnected');
      setIsLoadingRole(true);
      socket.emit('submitWorkerId', workerId);
      
      // Timeout after 10 seconds if role still not received
      const timeout = setTimeout(() => {
        if (!role) {
          console.error('⏰ Role loading timed out after 10 seconds, proceeding with timeout state');
          setIsLoadingRole(false);
          setRoleLoadingTimedOut(true);
        }
      }, 10000);
      
      return () => clearTimeout(timeout);
    } else if (role) {
      //console.log('✅ RoleInstructionsPage: Role loaded:', role);
      setIsLoadingRole(false);
      setRoleLoadingTimedOut(false);
    }
  }, [role, workerId, socket]);
  
  // Debug role assignment
  useEffect(() => {
    //console.log('🎯 RoleInstructionsPage state update:');
    //console.log('  - role:', role);
    //console.log('  - isLoadingRole:', isLoadingRole);
    //console.log('  - roleLoadingTimedOut:', roleLoadingTimedOut);
    //console.log('  - workerId:', workerId);
  }, [role, isLoadingRole, roleLoadingTimedOut, workerId]);
  
  let instructions = 'Could not retrieve instructions, please return to prolific and restart experiment.';
  
  // Handle role-based instruction selection with improved logic
  if (isLoadingRole && !roleLoadingTimedOut) {
    // Currently loading role
    instructions = 'Loading your role-specific instructions...';
  } else if (role && role.includes('Buyer')) {
    instructions = buyerInstructions;
  } else if (role && role.includes('Seller')) {
    instructions = sellerInstructions;
  } else if (roleLoadingTimedOut) {
    // Role loading timed out - provide helpful message
    instructions = 'Role assignment timed out. Please check your connection and try refreshing the page, or return to Prolific to restart the experiment.';
  } else if (!role) {
    // Role is null but not actively loading
    instructions = 'Role not assigned. Please refresh the page or return to Prolific to restart the experiment.';
  }

  const handleProceed = () => {
    // Don't allow proceeding without a role unless timeout occurred
    if (!role && isLoadingRole) {
      //console.log('🚫 Cannot proceed without role assignment');
      return;
    }
    
    if (!role && roleLoadingTimedOut) {
      //console.log('⚠️ Proceeding despite role timeout - user chose to continue');
    }
    
    navigate('/generalInstructions', { state: { prolificPID, studyID, sessionID, workerId, socketId, failed } });
  };

  return (
    <div className="info-container">
      <Markdown>
        {instructions}
      </Markdown>
      
      <button 
        className="proceed-button" 
        onClick={handleProceed}
        disabled={isLoadingRole && !roleLoadingTimedOut}
      >
        Continue
      </button>
    </div>
  );
}

export default RoleInstructionsPage;