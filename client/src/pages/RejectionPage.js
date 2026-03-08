/* eslint-disable import/no-webpack-loader-syntax */
// Please note that the above comment is required to raw-load markdown 
import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import Markdown from 'markdown-to-jsx';
import rejectionPage from '!!raw-loader!../markdown/pages/rejectionPage.md';

const RejectionPage = () => {
  const location = useLocation();

  // Prevent users from navigating back to the quiz page
  useEffect(() => {
    // Track comprehension check failure
    const trackCompCheckFailure = async () => {
      try {
        const { workerId } = location.state || {};
        const serverUrl = process.env.REACT_APP_SERVER_URL || window.location.origin;
        
        if (workerId) {
          // First try to find participant by worker_id
          const checkResponse = await axios.post(`${serverUrl}/check-duplicate-participant`, {
            worker_id: workerId
          });
          
          if (checkResponse.data.participant_id) {
            await axios.post(`${serverUrl}/record-compcheck-failure`, {
              participant_id: checkResponse.data.participant_id
            });
            //console.log('📝 Comprehension check failure tracked for participant:', checkResponse.data.participant_id);
          } else {
            console.warn('📝 No participant found for comprehension check failure tracking');
          }
        } else {
          console.warn('📝 No worker ID available for comprehension check failure tracking');
        }
      } catch (error) {
        console.error('Failed to track comprehension check failure:', error);
      }
    };
    
    trackCompCheckFailure();
    
    // Clear the browser history to prevent back navigation
    window.history.pushState(null, '', window.location.href);
    
    // Add multiple history entries to prevent back navigation
    for (let i = 0; i < 10; i++) {
      window.history.pushState(null, '', window.location.href);
    }
    
    // Handle the popstate event (triggered when user clicks back button)
    const handlePopState = (event) => {
      // Prevent the default behavior
      event.preventDefault();
      // Push a new state to prevent going back
      window.history.pushState(null, '', window.location.href);
    };
    
    // Add the event listener
    window.addEventListener('popstate', handlePopState);
    
    // Clean up the event listener when the component unmounts
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  return (
    <div className="rejection-container">
      <Markdown>{rejectionPage}</Markdown>
    </div>
  );
};

export default RejectionPage;