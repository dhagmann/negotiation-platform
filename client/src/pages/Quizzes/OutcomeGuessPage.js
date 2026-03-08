import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Content from '../../components/MainPage/Content';
import { useSessionRecovery } from '../../utils/sessionRecovery';
import { ErrorMessage } from '../../components/ErrorBoundary';

function OutcomeGuessPage({ appData }) {
  useEffect(() => {
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 50); 
    }, []);

  const navigate = useNavigate();
  const { myId, participantId, socket } = appData || {};
  const {prolificPID, studyID, sessionID, workerId, socketId, failed } = useLocation().state || {};
  const { handleErrorWithRecovery, resetRecovery } = useSessionRecovery(workerId, participantId, socket);
  
  // Define the outcome values
  const outcomeValues = ['$1.5m', '$2.0m', '$2.5m', '$3.0m', '$3.5m', '$4.0m'];
  
  const [selectedValue, setSelectedValue] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [justification, setJustification] = useState('');
  const [walkawayPoint, setWalkawayPoint] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOptionChange = (option) => {
    setSelectedValue(option);
    setError('');
  };

  const validateForm = () => {
    if (!targetPrice.trim()) {
      setError('Please enter your target price');
      return false;
    }
    if (!justification.trim()) {
      setError('Please provide your justification');
      return false;
    }
    if (!walkawayPoint.trim()) {
      setError('Please enter your walkaway point');
      return false;
    }
    if (!selectedValue) {
      setError('Please select an outcome prediction');
      return false;
    }
    return true;
  };

  // Set up socket event listeners for server responses
  useEffect(() => {
    if (!socket) return;

    const handleExpectedOutcomeRecorded = () => {
      setIsSubmitting(false);
      resetRecovery(); // Reset recovery attempts on success
      // Server confirmed data was saved - now navigate
      navigate('/main', { state: { prolificPID, studyID, sessionID, workerId, socketId, failed } });
    };

    const handleError = async (errorMessage) => {
      setIsSubmitting(false);
      
      // Try session recovery for session-related errors
      const result = await handleErrorWithRecovery(errorMessage);
      
      if (result.recovered) {
        setError(`${result.message}`);
        // Auto-retry after recovery
        setTimeout(() => {
          setError('');
          setIsSubmitting(false);
        }, 2000);
      } else {
        setError(`Failed to save data: ${result.message}`);
      }
    };

    socket.on('expectedOutcomeRecorded', handleExpectedOutcomeRecorded);
    socket.on('error', handleError);

    return () => {
      socket.off('expectedOutcomeRecorded', handleExpectedOutcomeRecorded);
      socket.off('error', handleError);
    };
  }, [socket, navigate, prolificPID, studyID, sessionID, workerId, socketId, failed]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validateForm() && !isSubmitting) {
      setIsSubmitting(true);
      setError('');
      
      try {
        // Save to research system using socket events
        if (socket) {
          socket.emit('submitExpectedOutcome', {
            preneg_target_price: targetPrice,  // Server will map to target_price
            preneg_justification: justification,  // Server will map to justification
            preneg_walkaway_point: walkawayPoint,  // Server will map to walkaway_point
            preneg_expected_outcome: selectedValue  // Server will map to expected_outcome
          });
          
          // Wait for server response - navigation will happen in the event listener
        } else {
          setIsSubmitting(false);
          setError('No connection to server. Please refresh and try again.');
        }
      } catch (error) {
        setIsSubmitting(false);
        setError('Failed to submit data. Please try again.');
      }
    }
  };

  return (
    <div className="preparation-container">
      <div className="preparation-left">
        <h1>Negotiation Information</h1>
        <Content appData={appData} />
      </div>
      <div className="preparation-right">
        <div className="quiz-container">
          <h1>Negotiation Preparation</h1>
          <p>Before you go into the negotiation, we would like you to think about your strategy. This will help you achieve a good outcome. Recall that you will receive a bonus based on the outcome of this negotiation. If you reach an agreement with your counterpart, the bonus will be determined by the amount you agree on. If you do not reach an agreement, your bonus will depend on the offer of a third party, known as an "outside option." While you do not know exactly how much that is, you received an estimate from a consultant. </p>
          <form className="quiz-form" onSubmit={handleSubmit}>
            {/* Target Price Section */}
            <div className="quiz-section">
              <h2>Target Price</h2>
              <p>Your target in a negotiation is the realistic yet ambitious outcome you aim to achieve. That is, the kind of outcome you would be very happy with.</p>
              <div className="quiz-question">
                <p><strong>What is your target price going into the negotiation?</strong></p>
                <textarea
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  rows="3"
                  className="quiz-textarea"
                />
              </div>
            </div>

            {/* Justification Section */}
            <div className="quiz-section">
              <h2>Justification</h2>
              <p> In a negotiation, you want to provide some justification for why you think the offer you make is reasonable (even if it is extremely in your favor).</p>
              <div className="quiz-question">
                <p><strong>What is one argument you can make to justify your target price?</strong></p>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  rows="3"
                  className="quiz-textarea"
                />
              </div>
            </div>

            {/* Walkaway Point Section */}
            <div className="quiz-section">
              <h2>Walkaway Point</h2>
              <p>Your walkaway point is the price where you would rather reject an agreement with your negotiation counterpart and take an alternative offer. Recall that a consultant provided an estimate for how much that could be, although it is not guaranteed that this will be the correct amount.</p>
              <div className="quiz-question">
                <p><strong>What is your walkaway point in this negotiation?</strong></p>
                <textarea
                  value={walkawayPoint}
                  onChange={(e) => setWalkawayPoint(e.target.value)}
                  rows="3"
                  className="quiz-textarea"
                />
              </div>
            </div>

            {/* Outcome Prediction Section */}
            <div className="quiz-section">
              <h2>Outcome Prediction</h2>
              <div className="quiz-question">
                <p><strong>What do you think the outcome of the negotiation will be?</strong></p>
                <div className="quiz-options">
                  {outcomeValues.map((value, index) => (
                    <label key={index} className="quiz-option">
                      <input
                        type="radio"
                        name="outcome-guess"
                        value={value}
                        checked={selectedValue === value}
                        onChange={() => handleOptionChange(value)}
                      />
                      {value}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {error && <span className="error">{error}</span>}
            <div className="matching-info" style={{ marginBottom: '20px', textAlign: 'center', color: '#666' }}>
              <p>Please click "Start the Negotiation" when you are ready to begin.</p>
              <p>It may take a few minutes for you to be matched with another participant.</p>
            </div>
            <button 
              type="submit" 
              className="quiz-submit-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Start the Negotiation'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default OutcomeGuessPage; 