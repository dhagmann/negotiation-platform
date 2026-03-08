import React, {useEffect} from 'react';
import Content from '../components/MainPage/Content';
import Chat from '../components/MainPage/Chat';
import Timer from '../components/MainPage/Timer';
import WaitingTimer from '../components/MainPage/WaitingTimer';
// Legacy createUser removed - using research participant system
import { useLocation, useNavigate } from 'react-router-dom';

function MainPage({ appData }) {
  const {partnerId, socket, role, setAlert, status}  = appData || {};
  const location = useLocation();
  const navigate = useNavigate();
  // Legacy user creation removed - using research participant system

  useEffect(() => {
    if(socket){
      // Handle partner disconnection during chat
      socket.on('partnerDisconnected', (data) => {
        //console.log('📥 CLIENT: Partner disconnected:', data.message);
        
        // PROTECTION: Don't redirect if user has already moved past main page
        const currentPath = window.location.pathname;
        const isOnMainPage = currentPath === '/main';
        
        if (!isOnMainPage) {
          //console.log('📥 CLIENT: Ignoring partner disconnect redirect - user already on:', currentPath);
          return;
        }
        
        setAlert("Your partner has disconnected. You will now be redirected to the next part of the survey.");
        
        setTimeout(() => {
          // Double-check the path hasn't changed during the timeout
          const pathAfterTimeout = window.location.pathname;
          if (pathAfterTimeout === '/main') {
            const { prolificPID, studyID, sessionID, workerId } = location.state || {};
            navigate('/timeoutPage', { 
              state: { 
                prolificPID, 
                studyID, 
                sessionID, 
                workerId, 
                failed: false, 
                timeoutType: 'partnerDisconnected',
                sessionId: data.session_id
              } 
            });
          } else {
            //console.log('📥 CLIENT: Skipping redirect - user moved to:', pathAfterTimeout);
          }
        }, 10000); // Changed from 3000 to 10000 (10 seconds)
      });
      
      // Handle partner reconnection during chat
      socket.on('partnerReconnected', (data) => {
        //console.log('📥 CLIENT: Partner reconnected:', data.message);
        
        // Only show reconnection message if still on main page
        const currentPath = window.location.pathname;
        if (currentPath === '/main') {
          // Clear any existing alerts
          setAlert(null);
          // Show brief notification that partner reconnected
          setAlert("Your partner has reconnected to the chat.");
          setTimeout(() => {
            setAlert(null);
          }, 3000);
        }
      });
      
      // Legacy userLeft handler (keeping for backward compatibility)
      socket.on('userLeft', () => {
        // PROTECTION: Don't redirect if user has already moved past main page
        const currentPath = window.location.pathname;
        const isOnMainPage = currentPath === '/main';
        
        if (!isOnMainPage) {
          //console.log('📥 CLIENT: Ignoring userLeft redirect - user already on:', currentPath);
          return;
        }
        
        setAlert("Your partner has left and no agreement was reached. You will now be redirected to the next part of the survey.");
        setTimeout(() => {
          // Double-check the path hasn't changed during the timeout
          const pathAfterTimeout = window.location.pathname;
          if (pathAfterTimeout === '/main') {
            const { prolificPID, studyID, sessionID, workerId } = location.state || {};
            navigate('/timeoutPage', { 
              state: { 
                prolificPID, 
                studyID, 
                sessionID, 
                workerId, 
                failed: false, 
                timeoutType: 'partnerDisconnected'
              } 
            });
          } else {
            //console.log('📥 CLIENT: Skipping userLeft redirect - user moved to:', pathAfterTimeout);
          }
        }, 10000); // Changed from 3000 to 10000 (10 seconds)
      });
      
      // Handle participant creation response
      socket.on('participantCreated', (data) => {
        // Participant created successfully
        console.log(`📥 CLIENT: Participant created: ${data.participant_id} (${data.role})`);
        
        // Store participant ID in localStorage for reconnection recovery
        if (data.participant_id) {
          localStorage.setItem('participantId', data.participant_id);
        }
        
        // Store worker ID for reconnection recovery
        const { workerId } = location.state || {};
        if (workerId) {
          localStorage.setItem('workerId', workerId);
        }
      });
      
      // Handle participant creation errors
      socket.on('error', (message) => {
        // Socket error occurred
      });
      
      return () => {
        socket.off('partnerDisconnected');
        socket.off('userLeft');
        socket.off('participantCreated');
        socket.off('error');
      };
    }
  },[socket, navigate, role, setAlert, location.state]);

  useEffect(() => {
    if (window.location.pathname === '/main' && socket) { // Only trigger connection on /main page
      const { workerId } = location.state || {};
      let fallbackTimeoutId = null;
      
      const handleParticipantCreated = () => {
        socket.emit('reachedMain');
        socket.off('participantCreated', handleParticipantCreated);
        if (fallbackTimeoutId) {
          clearTimeout(fallbackTimeoutId);
          fallbackTimeoutId = null;
        }
      };
      
      // First create participant record with worker ID if we have one
      if (workerId) {
        socket.emit('submitWorkerId', workerId);
        
        // Wait for participant creation confirmation, then trigger pairing
        socket.on('participantCreated', handleParticipantCreated);
        
        // Fallback timeout in case participantCreated doesn't fire
        fallbackTimeoutId = setTimeout(() => {
          socket.emit('reachedMain');
          socket.off('participantCreated', handleParticipantCreated);
          fallbackTimeoutId = null;
        }, 2000);
      } else {
        socket.emit('reachedMain'); // Try anyway
      }

      return () => {
        if (fallbackTimeoutId) {
          clearTimeout(fallbackTimeoutId);
        }
        socket.off('participantCreated', handleParticipantCreated);
      };
    }
  }, [socket, location.state]);

  return (
    <div>
      {/* Alert modal for partner disconnection */}
      {alert && typeof alert === 'string' && (
        <div className="alert-overlay">
          <div className="alert-box" role="dialog" aria-modal="true" aria-label="Partner disconnected">
            <h3>{alert}</h3>
            <p style={{ marginTop: '16px', fontSize: '14px', color: '#666' }}>
              Redirecting in 10 seconds...
            </p>
          </div>
        </div>
      )}

      <div className={`App ${partnerId !== false ? 'has-timer' : 'no-timer'}`}>
        <div>
          {partnerId === false ? (
            <div className="waiting-container">
              <h2 className="waiting-header">
                {status && status.includes("Partner found") ? status : "Waiting for Partner"}
              </h2>
            </div>
            ) : (
            <div>
              <Timer appData={appData}/>
            </div>
            )
          }
        </div>
          <div className="main-container">
            <Content appData={appData}/>
            {partnerId === false ? (
              <div className="waiting-container-chat">
                <h1 className="waiting-header-chat">
                  {status && status.includes("Partner found") 
                    ? "Preparing Chat Session..." 
                    : (
                      <>
                        Chat Will Appear Here<br />
                        When a Partner Joins
                      </>
                    )
                  }
                </h1>
                {!status?.includes("Partner found") && (
                  <p style={{ 
                    fontSize: '0.9rem', 
                    color: '#6b7280', 
                    marginTop: '16px',
                    lineHeight: '1.5',
                    maxWidth: '400px',
                    margin: '16px auto 0'
                  }}>
                    Most participants are matched within one or two minutes. If you have not been matched within ten minutes, we will automatically advance you to the final demographic questions and you will receive the full payment (including a bonus) for your time.
                  </p>
                )}
                <WaitingTimer isWaiting={partnerId === false} status={status} />
              </div>
              ) : (
              <div>
                <Chat appData={appData}/>
              </div>
              )
            }
          </div>
        </div>
    </div>
  );
}

export default MainPage;