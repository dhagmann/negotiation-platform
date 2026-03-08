import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const Timer = ({ appData }) => {
  const { alert, partnerId, socket }  = appData || {}; // Access socket for server events
  const [timeLeft, setTimeLeft] = useState(7 * 60); // 7 minutes in seconds
  const navigate = useNavigate();
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);
  const hasNavigatedRef = useRef(false); // Prevent double navigation
  
  // FIXED: Add state-based navigation guard to prevent multiple simultaneous navigations
  const [hasNavigated, setHasNavigated] = useState(false);

  // Listen for server-side chat timeout events and partner disconnection
  useEffect(() => {
    if (!socket) return;

    const handleChatTimeout = (data) => {
      // PROTECTION: Don't redirect if user has already moved past main page
      const currentPath = window.location.pathname;
      const isOnMainPage = currentPath === '/main';
      
      if (!isOnMainPage) {
        //console.log('📥 TIMER: Ignoring chat timeout redirect - user already on:', currentPath);
        return;
      }
      
      if (!hasNavigatedRef.current && !hasNavigated) {
        setHasNavigated(true);
        hasNavigatedRef.current = true;
        clearInterval(timerRef.current);
        setTimeLeft(0);
        console.log('🕒 SERVER: Server-coordinated chat timeout:', data.message);
        navigate('/timeoutPage', { state: { timeoutType: 'chat' } });
      }
    };

    const handlePartnerDisconnected = (data) => {
      // PROTECTION: Don't redirect if user has already moved past main page
      const currentPath = window.location.pathname;
      const isOnMainPage = currentPath === '/main';
      
      if (!isOnMainPage) {
        //console.log('📥 TIMER: Ignoring partner disconnect redirect - user already on:', currentPath);
        return;
      }
      
      if (!hasNavigatedRef.current && !hasNavigated) {
        setHasNavigated(true);
        hasNavigatedRef.current = true;
        clearInterval(timerRef.current);
        setTimeLeft(0);
        console.log('🔌 SERVER: Partner disconnected during chat:', data.message);
        navigate('/timeoutPage', { state: { timeoutType: 'partnerDisconnected', sessionId: data.session_id } });
      }
    };

    socket.on('chatSessionTimeout', handleChatTimeout);
    socket.on('partnerDisconnected', handlePartnerDisconnected);

    return () => {
      socket.off('chatSessionTimeout', handleChatTimeout);
      socket.off('partnerDisconnected', handlePartnerDisconnected);
    };
  }, [socket, navigate]);

  // Use real timestamps to avoid tab switching issues
  useEffect(() => {
    if (partnerId !== false && !startTimeRef.current) {
      // Initialize start time when partner is found
      startTimeRef.current = Date.now();
      hasNavigatedRef.current = false; // Reset navigation flag for new chat
    }

    if (partnerId !== false && startTimeRef.current) {
      const updateTimer = () => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTimeRef.current) / 1000);
        const remaining = Math.max(0, (7 * 60) - elapsed);
        
        setTimeLeft(remaining);
        
        // FIXED: Client-side fallback timeout with enhanced navigation guard
        if (remaining <= 0 && !hasNavigatedRef.current && !hasNavigated) {
          setHasNavigated(true);
          hasNavigatedRef.current = true;
          clearInterval(timerRef.current);
          if (!alert) {
            console.log('🕒 CLIENT: Client-side fallback timeout triggered');
            navigate('/timeoutPage', { state: { timeoutType: 'chat' } });
          }
        }
      };

      // Update immediately
      updateTimer();
      
      // Set up interval for regular updates with more frequent checks
      // Use 500ms interval to reduce perceived skipping
      timerRef.current = setInterval(updateTimer, 500);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [alert, partnerId, navigate]);

  // Handle page visibility changes to sync timer when tab becomes active again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && partnerId !== false && startTimeRef.current) {
        // Tab became active - immediately sync the timer
        const now = Date.now();
        const elapsed = Math.floor((now - startTimeRef.current) / 1000);
        const remaining = Math.max(0, (7 * 60) - elapsed);
        setTimeLeft(remaining);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [partnerId]);

  // Format the time as MM:SS
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get timer color class based on time remaining
  const getTimerColorClass = (timeLeft) => {
    const totalTime = 420; // 7 minutes
    const halfTime = totalTime / 2; // 210 seconds (50%)
    const lastMinute = 60; // Last minute
    
    if (timeLeft > halfTime) {
      return 'timer-green';
    } else if (timeLeft > lastMinute) {
      return 'timer-yellow';
    } else {
      return 'timer-red';
    }
  };

  // Get progress bar width percentage
  const getProgressPercentage = (timeLeft) => {
    return Math.max(0, (timeLeft / 420) * 100);
  };

  const colorClass = getTimerColorClass(timeLeft);
  const progressPercentage = getProgressPercentage(timeLeft);

  return (
    <div className="timer-container">
        <div className={`countdown-timer ${colorClass}`}>
            <h2>Time Left: {formatTime(timeLeft)}</h2>
            <div className="progress">
            <div
                className={`progress-bar ${colorClass}`}
                role="progressbar"
                style={{ width: `${progressPercentage}%` }}
                aria-valuenow={timeLeft}
                aria-valuemin="0"
                aria-valuemax="420"
            ></div>
            </div>
        </div>
    </div>
  );
};

export default Timer;