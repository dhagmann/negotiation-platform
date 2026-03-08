import React from 'react';

const Alert = ({ appData }) => {
  const { alert, approvedOffer }  = appData || {};
  
  const handleContinue = () => {
    // Clear the alert to proceed to confirmation dialog
    appData.setAlert("You have reached an agreement! Confirm this offer to proceed, or cancel to return to the chat.");
  };
  
  return (
    <div>
      {(alert === "You have reached an agreement! Click Continue to proceed to confirmation." && approvedOffer) && (
        <div className="alert-overlay">
          <div className="alert-box" role="dialog" aria-modal="true" aria-label="Offer accepted">
            <h2>Offer Accepted</h2>
            <h2>${approvedOffer}M</h2>
            <h3>You have reached an agreement!</h3>
            <div className="alert-buttons">
              <button className="alert-confirm" onClick={handleContinue}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Alert;