import React, { useEffect } from 'react';

function AlreadyParticipatedPage({ appData }) {
  useEffect(() => {
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 50); 
  }, []);

  return (
    <div className="info-container">
      <h1>🚫 Already Participated</h1>
      
      <div className="info-content">
        <p>
          Our records show that you have already participated in this study using 
          this Prolific ID. To ensure the integrity of our research, participants 
          can only complete this study once.
        </p>
        
        <div className="info-acknowledgment">
          <div>
            <h3>📋 Important Information</h3>
            <ul>
              <li>You cannot participate in this study again</li>
              <li>Your previous participation was recorded successfully</li>
              <li>Please look for other studies that you haven't completed yet</li>
            </ul>
          </div>
        </div>
        
        <p>
          Thank you for your interest in our research. Please feel free to 
          participate in other studies on Prolific.
        </p>
        
        <div className="info-acknowledgment">
          <p><strong>You can now close this tab and return to Prolific.</strong></p>
        </div>
      </div>
    </div>
  );
}

export default AlreadyParticipatedPage; 