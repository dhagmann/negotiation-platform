import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';

function MobileRestrictedPage() {
  const location = useLocation();
  
  useEffect(() => {
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 50);
    
    // Track mobile exclusion
    const trackMobileExclusion = async () => {
      try {
        const { workerId } = location.state || {};
        const serverUrl = process.env.REACT_APP_SERVER_URL || window.location.origin;
        
        if (workerId) {
          await axios.post(`${serverUrl}/record-mobile-exclusion`, {
            worker_id: workerId
          });
          //console.log('📱 Mobile exclusion tracked for worker:', workerId);
        } else {
          // Try to get workerId from URL params as backup
          const urlParams = new URLSearchParams(window.location.search);
          const urlWorkerId = urlParams.get('PROLIFIC_PID');
          
          if (urlWorkerId) {
            await axios.post(`${serverUrl}/record-mobile-exclusion`, {
              worker_id: urlWorkerId
            });
            //console.log('📱 Mobile exclusion tracked for URL worker:', urlWorkerId);
          } else {
            console.warn('📱 No worker ID available for mobile exclusion tracking');
          }
        }
      } catch (error) {
        console.error('Failed to track mobile exclusion:', error);
      }
    };
    
    trackMobileExclusion();
  }, [location.state]);

  return (
    <div className="info-container">
      <h1>📱 Desktop Required</h1>
      
      <div className="info-content">
        <p>
          <strong>This study cannot be completed on a mobile device.</strong>
        </p>
        
        <p>
          Our research requires a desktop or laptop computer to ensure the best 
          experience and accurate data collection. Mobile devices do not support 
          all the features needed for this study.
        </p>
        
        <div className="info-acknowledgment">
          <div>
            <h3>💻 To participate in this study:</h3>
            <ul>
              <li>Use a desktop computer or laptop</li>
              <li>Ensure you have a stable internet connection</li>
              <li>Use a modern web browser (Chrome, Firefox, Safari, or Edge)</li>
              <li>Make sure JavaScript is enabled</li>
            </ul>
          </div>
        </div>
        
        <p>
          <strong>Please access this study again from a desktop or laptop computer.</strong>
        </p>
        
        <div className="info-acknowledgment">
          <p>
            If you believe this detection is an error and you are using a desktop computer, 
            please contact the researchers or try using a different browser.
          </p>
        </div>
      </div>
    </div>
  );
}

export default MobileRestrictedPage; 