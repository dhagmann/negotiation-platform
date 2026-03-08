import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Confirm = ({ appData }) => {
  const { alert, setAlert, handleConfirm, socket, role, handleCancel, approvedOffer, bothConfirmedProcessed }  = appData || {};
  const navigate = useNavigate();

  const handleContinue = () => {
    navigate('/postExperimentQuiz');
  };
  //const location = useLocation(); import useLocation from 'react-router-dom';
  //const { prolificPID, studyID, sessionID, workerId, socketId } = location.state || {}; 

  // REMOVED: Duplicate bothConfirmedOffer listener - now handled in App.js to prevent conflicts

  return (
    <div>
      {(alert && approvedOffer) && (
        <div className="alert-overlay">
          <div className="alert-box" role="dialog" aria-modal="true" aria-label="Agreement confirmation">
            {(alert === 'Waiting for partner to confirm or cancel.') ? (
              <div>
                <h2 style={{ color: '#1e40af', fontSize: '1.8rem', fontWeight: '700', textAlign: 'center', margin: '0 0 24px 0' }}>${approvedOffer}m</h2>
                <h3>You have reached an agreement!<br/><br/>Waiting for partner to confirm or cancel.</h3>
                <div className="alert-buttons">
                  <button className="alert-cancel" onClick={() => handleCancel(approvedOffer)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : alert === 'Both buyer and seller have confirmed the offer. Please click Continue to proceed to the questionnaire.' ? (
              <div>
                <h2 style={{ color: '#1e40af', fontSize: '2.2rem', fontWeight: '700', textAlign: 'center', margin: '0 0 32px 0' }}>Agreement Confirmed!</h2>
                <div className="alert-buttons">
                  <button className="alert-confirm" onClick={handleContinue}>
                    Continue
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h2 style={{ color: '#1e40af', fontSize: '1.8rem', fontWeight: '700', textAlign: 'center', margin: '0 0 24px 0' }}>${approvedOffer}m</h2>
                <h3>You have reached an agreement!<br/><br/>Confirm this offer to proceed, or cancel to return to the chat.</h3>
                <div className="alert-buttons">
                  <button className="alert-confirm" onClick={() => handleConfirm(approvedOffer)}>
                    Confirm
                  </button>
                  <button className="alert-cancel" onClick={() => handleCancel(approvedOffer)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Confirm;