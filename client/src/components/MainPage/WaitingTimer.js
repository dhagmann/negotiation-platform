import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const WAITING_TIMEOUT_SECONDS = 10 * 60; // 10 minutes
// Keep in sync with server/config/session-timeouts.js (PAIRING_STUCK_TIMEOUT)
const PAIRING_STUCK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

function WaitingTimer({ isWaiting, status }) {
  const [waitingTime, setWaitingTime] = useState(0); // in seconds
  const navigate = useNavigate();

  const startTimeRef = useRef(null);
  const intervalRef = useRef(null);
  const pairingStuckTimeoutRef = useRef(null);
  const hasNavigatedRef = useRef(false);

  const isPartnerFound = typeof status === 'string' && status.includes('Partner found');

  // Keep latest booleans available inside timeouts/intervals without stale closures
  const latestStateRef = useRef({ isWaiting, isPartnerFound });
  useEffect(() => {
    latestStateRef.current = { isWaiting, isPartnerFound };
  }, [isWaiting, isPartnerFound]);

  const navigateToWaitingTimeout = useCallback(() => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;

    // Best-effort cleanup to stop background work immediately
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (pairingStuckTimeoutRef.current) {
      clearTimeout(pairingStuckTimeoutRef.current);
      pairingStuckTimeoutRef.current = null;
    }

    console.log('🕙 CLIENT: Waiting timeout reached, navigating to timeout page');
    navigate('/waitingTimeout', {
      state: {
        timeoutType: 'waiting',
        failed: false
      }
    });
  }, [navigate]);

  // Syncs displayed timer using real time (robust to tab throttling/backgrounding)
  const syncTimer = useCallback(() => {
    const { isWaiting: stillWaiting, isPartnerFound: stillPartnerFound } = latestStateRef.current;
    if (!stillWaiting) return;

    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
    }

    const elapsedSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const clampedSeconds = Math.min(WAITING_TIMEOUT_SECONDS, Math.max(0, elapsedSeconds));
    setWaitingTime(clampedSeconds);

    // Only enforce the 10-minute timeout while we are still searching (not in the "partner found" handoff)
    if (!stillPartnerFound && elapsedSeconds >= WAITING_TIMEOUT_SECONDS) {
      navigateToWaitingTimeout();
    }
  }, [navigateToWaitingTimeout]);

  // Start/stop ticking and enforce timeouts
  useEffect(() => {
    // Reset everything when we stop waiting
    if (!isWaiting) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (pairingStuckTimeoutRef.current) {
        clearTimeout(pairingStuckTimeoutRef.current);
        pairingStuckTimeoutRef.current = null;
      }

      startTimeRef.current = null;
      hasNavigatedRef.current = false;
      setWaitingTime(0);
      return;
    }

    // Initialize start time once per waiting period
    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
      hasNavigatedRef.current = false;
    }

    // Always do an immediate sync (and possibly timeout) on state transitions
    syncTimer();

    // Clear any prior timers before re-arming
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (pairingStuckTimeoutRef.current) {
      clearTimeout(pairingStuckTimeoutRef.current);
      pairingStuckTimeoutRef.current = null;
    }

    if (!isPartnerFound) {
      intervalRef.current = setInterval(syncTimer, 1000);
    } else {
      // Guard against rare cases where "Partner found" gets stuck and the UI never transitions to chat.
      pairingStuckTimeoutRef.current = setTimeout(() => {
        const { isWaiting: stillWaiting, isPartnerFound: stillPartnerFound } = latestStateRef.current;
        if (stillWaiting && stillPartnerFound) {
          console.log('⏳ CLIENT: Partner found but chat did not start - treating as timeout');
          navigateToWaitingTimeout();
        }
      }, PAIRING_STUCK_TIMEOUT_MS);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (pairingStuckTimeoutRef.current) {
        clearTimeout(pairingStuckTimeoutRef.current);
        pairingStuckTimeoutRef.current = null;
      }
    };
  }, [isWaiting, isPartnerFound, syncTimer, navigateToWaitingTimeout]);

  // Resync immediately when tab becomes active again (handles timer throttling in background tabs/mobile)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', syncTimer);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', syncTimer);
    };
  }, [syncTimer]);

  // Format time as M:SS
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Only show the timer when actively waiting (not when partner found)
  if (!isWaiting || isPartnerFound) {
    return null;
  }

  return (
    <div style={{
      fontStyle: 'italic',
      fontSize: '0.9rem',
      color: '#6b7280',
      marginTop: '12px',
      textAlign: 'center'
    }}>
      Time Waiting: {formatTime(waitingTime)}
    </div>
  );
}

export default WaitingTimer; 