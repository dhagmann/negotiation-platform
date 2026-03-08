/* eslint-disable import/no-webpack-loader-syntax */
// Please note that the above comment is required to raw-load markdown 
import React, { useEffect } from 'react';
import Markdown from 'markdown-to-jsx'
import negotiationTimeExpired from '!!raw-loader!../markdown/pages/negotiationTimeExpired.md'
import partnerMatchingFailed from '!!raw-loader!../markdown/pages/partnerMatchingFailed.md'
import partnerDisconnected from '!!raw-loader!../markdown/pages/partnerDisconnected.md'
import { useNavigate, useLocation } from 'react-router-dom';

function TimeoutPage({ appData }) {
  useEffect(() => {
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 50); 
    }, []);

  const navigate = useNavigate();
  const location = useLocation();
  const { timeoutType } = location.state || {};

  const handleRedirect = () => {
    // All timeout types now go to the post-experiment questionnaire
    navigate('/postExperimentQuiz');
  };

  // Select the appropriate message based on timeout type
  let timeoutMessage;
  if (timeoutType === 'chat') {
    timeoutMessage = negotiationTimeExpired;
  } else if (timeoutType === 'partnerDisconnected') {
    timeoutMessage = partnerDisconnected;
  } else {
    timeoutMessage = partnerMatchingFailed; // Default for 'waiting' and other types
  }

  return (
    <div className="markdown-container">
      <Markdown>
          {timeoutMessage}
      </Markdown>
      <div className="row mt-3">
        <div className="col-12">
          <button className="btn btn-primary w-100" onClick={handleRedirect}>Continue</button>
        </div>
      </div>
    </div>
  );
}

export default TimeoutPage;