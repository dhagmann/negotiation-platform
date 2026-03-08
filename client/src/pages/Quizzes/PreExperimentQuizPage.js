import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getQuizForRole, validateQuizAnswers } from '../../quizzes/quizQuestions.js';
import useSocketConnection from '../../hooks/useSocketConnection';
import ConnectionStatus from '../../components/ConnectionStatus';
import { useSessionRecovery } from '../../utils/sessionRecovery';

function PreExperimentQuizPage({ appData }) {
  useEffect(() => {
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 50); 
    }, []);
  const navigate = useNavigate();
  const { myId, role, socket }  = appData || {};
  const {prolificPID, studyID, sessionID, workerId, socketId, failed, failureCount = 0 } = useLocation().state || {};
  const { handleErrorWithRecovery, resetRecovery } = useSessionRecovery(workerId, null, socket);
  
  // Use the new socket connection hook
  const {
    isConnected,
    isReconnecting,
    connectionError,
    hasPendingSubmissions,
    pendingSubmissionCount,
    safeSubmit,
    manualReconnect,
    restoreUserState
  } = useSocketConnection(socket);

  // Restore state on reconnection
  useEffect(() => {
    if (isConnected && workerId) {
      restoreUserState(workerId);
    }
  }, [isConnected, workerId, restoreUserState]);

  // Handle role assignment if missing
  useEffect(() => {
    if (!role && workerId && socket) {
      //console.log('Role missing on quiz page, resubmitting worker ID:', workerId);
      socket.emit('submitWorkerId', workerId);
    }
  }, [role, workerId, socket]);
  
  // Check if user has already failed twice and redirect to rejection page if they have
  useEffect(() => {
    if (failureCount >= 2) {
      navigate('/rejection', { 
        state: {
          prolificPID, 
          studyID, 
          sessionID, 
          workerId, 
          socketId
        }
      });
    }
  }, [failureCount, navigate, prolificPID, studyID, sessionID, workerId, socketId]);
  
  // Get quiz questions for role - handles null role gracefully by returning empty array
  const quizQuestions = getQuizForRole(role);

  let [answers, setAnswers] = useState(Array(quizQuestions.length).fill(''));
  let [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleOptionChange = (questionIndex, option) => {
    const newAnswers = [...answers];
    newAnswers[questionIndex] = option;
    setAnswers(newAnswers);
  };

  const validateForm = () => {
    const newErrors = {};
    
    // Check for empty answers
    answers.forEach((answer, index) => {
      if (!answer) {
        newErrors[index] = 'Please select an option';
      }
    });
    
    setErrors(newErrors);
    
    // Return validation result using the new helper function
    if (Object.keys(newErrors).length === 0) {
      const validation = validateQuizAnswers(role, answers);
      return {
        hasErrors: false,
        passed: validation.passed,
        score: validation.score,
        totalQuestions: validation.totalQuestions
      };
    } else {
      return {
        hasErrors: true,
        passed: false,
        score: 0,
        totalQuestions: quizQuestions.length
      };
    }
  };

  const handleSubmit = async (e) => {
      e.preventDefault();
      const validation = validateForm();
      
      if (validation.hasErrors || isSubmitting || hasPendingSubmissions) {
        return;
      }

      setIsSubmitting(true);
      setSubmitError('');
      
      const currentAttempt = (failureCount || 0) + 1; // Current attempt number
      
      try {
        const quizData = {
          quiz_q1_answer: answers[0] || '',
          quiz_q2_answer: answers[1] || '',
          quiz_q3_answer: answers[2] || '',
          quiz_score: validation.score,
          quiz_passed: validation.passed,
          quiz_attempts: currentAttempt
        };

        // Use safe submission that waits for server confirmation
        await safeSubmit(
          'submitQuizResponses',
          quizData,
          () => {
            // Success - reset recovery and navigate based on results
            resetRecovery();
            if (validation.passed) {
              // Passed - proceed to next step
              navigate('/negotiatingInstructions', { 
                state: { prolificPID, studyID, sessionID, workerId, socketId, failed } 
              }); 
            } else {
              // Failed - check attempt count
              const newFailureCount = currentAttempt;
              if (newFailureCount >= 2) {
                // Failed twice - reject
                navigate('/rejection', { 
                  state: {
                    prolificPID, 
                    studyID, 
                    sessionID, 
                    workerId, 
                    socketId
                  }
                });
              } else {
                // Failed once - give second chance
                navigate('/generalInstructions', { 
                  state: { 
                    prolificPID, 
                    studyID, 
                    sessionID, 
                    workerId, 
                    socketId, 
                    failed: true, // This is a legitimate failure from quiz
                    failureCount: newFailureCount 
                  } 
                });
              }
            }
          },
          async (error) => {
            // Error - try session recovery for session-related errors
            const result = await handleErrorWithRecovery(error);
            
            if (result.recovered) {
              setSubmitError(`${result.message}`);
              // Auto-retry after recovery
              setTimeout(() => {
                setSubmitError('');
                setIsSubmitting(false);
              }, 2000);
            } else {
              setSubmitError(`Failed to save quiz: ${result.message}`);
              setIsSubmitting(false);
            }
          }
        );
        
      } catch (error) {
        setSubmitError('Failed to submit quiz. Please try again.');
        setIsSubmitting(false);
      }
  };


  return (
    <>
      <ConnectionStatus
        isConnected={isConnected}
        isReconnecting={isReconnecting}
        connectionError={connectionError}
        hasPendingSubmissions={hasPendingSubmissions}
        pendingSubmissionCount={pendingSubmissionCount}
        onReconnect={manualReconnect}
      />
      
      <div className="quiz-container">
        <h1>Quiz on your Role</h1>
        <form className="quiz-form" onSubmit={handleSubmit}>
          {quizQuestions.map((q, index) => (
            <div key={index} className="quiz-question">
              <p>
                <strong>
                  {q.question}
                </strong>
              </p>
              <div className="quiz-options">
                {q.options.map((option, optionIndex) => (
                  <label key={optionIndex} className="quiz-option">
                    <input
                      type="radio"
                      name={`question-${index}`}
                      value={option}
                      checked={answers[index] === option}
                      onChange={() => handleOptionChange(index, option)}
                    />
                    {option}
                  </label>
                ))}
              </div>
              {errors[index] && <span className="error">{errors[index]}</span>}
            </div>
          ))}

          {submitError && (
            <div className="error" style={{ textAlign: 'center', marginBottom: '20px' }}>
              {submitError}
            </div>
          )}

          <button 
            type="submit" 
            className="quiz-submit-button"
            disabled={isSubmitting || hasPendingSubmissions || !isConnected}
          >
            {isSubmitting || hasPendingSubmissions ? 'Saving...' : 'Submit'}
          </button>
          
          {!isConnected && (
            <p style={{ textAlign: 'center', color: '#666', fontSize: '14px', marginTop: '10px' }}>
              Please check your internet connection and try again.
            </p>
          )}
        </form>
      </div>
    </>
  );
}

export default PreExperimentQuizPage;