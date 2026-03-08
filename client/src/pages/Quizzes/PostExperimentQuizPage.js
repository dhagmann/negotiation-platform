// Post-experiment demographics questionnaire page

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useSocketConnection from '../../hooks/useSocketConnection';
import ConnectionStatus from '../../components/ConnectionStatus';
import { useSessionRecovery } from '../../utils/sessionRecovery';

function GeneralQuestionnairePage({ appData }) {
  useEffect(() => {
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 50); 
    }, []);
  const navigate = useNavigate();
  const { socket } = appData || {};
  const {prolificPID, studyID, sessionID, workerId, socketId, failed } = useLocation().state || {};
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

  // Enhanced state restoration on reconnection
  useEffect(() => {
    if (isConnected && (workerId || localStorage.getItem('participantId'))) {
      const storedParticipantId = localStorage.getItem('participantId');
      const storedWorkerId = localStorage.getItem('workerId') || workerId;
      
      console.log('🔄 CLIENT: Attempting state restoration for demographics page');
      restoreUserState(storedWorkerId, storedParticipantId);
    }
  }, [isConnected, workerId, restoreUserState]);

  const questions = [
    { type: 'radio', question: 'Gender', options: ['Male', 'Female', 'Other'], required: true },
    { type: 'number', question: 'Age', placeholder: 'Please enter your age', required: true },
    { 
      type: 'radio', 
      question: 'Ethnicity', 
      options: [
        'White or Caucasian',
        'Black or African American', 
        'Hispanic or Latino',
        'Asian',
        'Native American',
        'Pacific Islander',
        'Other'
      ], 
      required: true 
    },
    { 
      type: 'radio', 
      question: 'Education Level', 
      options: [
        'Less than high school',
        'High school graduate',
        'Some college',
        'Associate degree',
        'Bachelor\'s degree',
        'Master\'s degree',
        'Doctoral degree'
      ], 
      required: true 
    },
    { 
      type: 'radio', 
      question: 'Political Orientation', 
      options: [
        'Very liberal',
        'Slightly liberal', 
        'Middle of the road',
        'Slightly conservative',
        'Somewhat conservative',
        'Very conservative'
      ], 
      required: true 
    },
    { 
      type: 'radio', 
      question: 'Negotiation Experience', 
      options: [
        'No experience',
        'Limited experience',
        'Moderate experience', 
        'Considerable experience',
        'Extensive experience'
      ], 
      required: true 
    }
  ];

  const initialAnswers = questions.map(() => '');
  const [answers, setAnswers] = useState(initialAnswers);
  const [errors, setErrors] = useState({});
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleInputChange = (index, value) => {
    const newAnswers = [...answers];
    newAnswers[index] = value;
    setAnswers(newAnswers);
    
    // Clear any existing error for this field and re-validate on change
    const newErrors = { ...errors };
    delete newErrors[index];
    
    // Validate this specific field (but skip age validation during typing)
    if (questions[index].required) {
      const answer = value;
      // Check for empty, null, undefined, or whitespace-only answers
      if (!answer || answer.toString().trim() === '') {
        newErrors[index] = 'This question is required';
      } else if (index === 1) { // Age question - skip validation during typing
        // Age validation will happen on blur instead
      }
    }
    
    setErrors(newErrors);
  };

  const handleAgeBlur = (index, value) => {
    const newErrors = { ...errors };
    
    if (questions[index].required) {
      const answer = value;
      // Check for empty, null, undefined, or whitespace-only answers
      if (!answer || answer.toString().trim() === '') {
        newErrors[index] = 'This question is required';
      } else if (index === 1) { // Age question - validate on blur
        const age = parseInt(answer);
        const hasDecimals = answer.toString().includes('.');
        //console.log(`Age validation for "${answer}": age=${age}, hasDecimals=${hasDecimals}, isNaN=${isNaN(age)}, age<18=${age < 18}, age>100=${age > 100}`);
        
        if (isNaN(age) || age < 18 || age > 100 || hasDecimals) {
          newErrors[index] = 'Enter a value between 18 and 100 with no decimals.';
          //console.log(`Setting age error: ${newErrors[index]}`);
        }
      }
    }
    
    setErrors(newErrors);
  };

  const validateForm = () => {
      const newErrors = {};
      
      // Check all required questions are answered
      questions.forEach((question, index) => {
          if (question.required) {
              const answer = answers[index];
              // Check for empty, null, undefined, or whitespace-only answers
              if (!answer || answer.toString().trim() === '') {
                  newErrors[index] = 'This question is required';
              } else if (index === 1) { // Age question - additional validation
                  const age = parseInt(answer);
                  const hasDecimals = answer.toString().includes('.');
                  //console.log(`Form validation - Age: "${answer}" -> age=${age}, isNaN=${isNaN(age)}, age<18=${age < 18}, age>100=${age > 100}, hasDecimals=${hasDecimals}`);
                  
                  if (isNaN(age) || age < 18 || age > 100 || hasDecimals) {
                      newErrors[index] = 'Enter a value between 18 and 100 with no decimals.';
                      //console.log(`Form validation - Setting age error: ${newErrors[index]}`);
                  }
              }
          }
      });

      setErrors(newErrors);
      
      // Log validation results for debugging
      if (Object.keys(newErrors).length > 0) {
          //console.log('Validation failed:', newErrors);
          //console.log('Current answers:', answers);
      } else {
          //console.log('All validation passed');
      }
      
      return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm() || isSubmitting || hasPendingSubmissions) {
      return;
    }
    
    setIsSubmitting(true);
    setSubmitError('');
    
    try {
      // Extract answers by index: gender, age, ethnicity, education, politics, negotiation_experience
      const [gender, age, ethnicity, education, politics, negotiation_experience] = answers;
      
      const demographicsData = {
        demo_gender: gender,
        demo_age: parseInt(age),
        demo_ethnicity: ethnicity,
        demo_education: education,
        demo_political_orientation: politics,
        demo_negotiation_experience: negotiation_experience,
        demo_comments: comments
      };
      
      // Use safe submission that waits for server confirmation
      await safeSubmit(
        'submitDemographics',
        demographicsData,
        () => {
          // Success - reset recovery and navigate to payment page
          resetRecovery();
          navigate('/payment');
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
            setSubmitError(`Failed to save demographics: ${result.message}`);
            setIsSubmitting(false);
          }
        }
      );
      
    } catch (error) {
      setSubmitError('Failed to submit demographics. Please try again.');
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
        <h1>Final Questions</h1>
        <form className="quiz-form" onSubmit={handleSubmit}>
          {questions.map((q, index) => (
            <div key={index} className="quiz-question">
              <p>
                <strong>
                  {q.question}
                  {q.required && <span style={{ color: 'red' }}> *</span>}
                </strong>
              </p>
              
              {q.type === 'radio' && (
                <div className="quiz-options">
                  {q.options.map((option, optionIndex) => (
                    <label key={optionIndex} className="quiz-option">
                      <input
                        type="radio"
                        name={`question-${index}`}
                        value={option}
                        checked={answers[index] === option}
                        onChange={() => handleInputChange(index, option)}
                      />
                      {option}
                    </label>
                  ))}
                </div>
              )}
              
              {q.type === 'number' && (
                <input
                  type="number"
                  value={answers[index]}
                  placeholder={q.placeholder}
                  onChange={(e) => handleInputChange(index, e.target.value)}
                  onBlur={(e) => handleAgeBlur(index, e.target.value)}
                  className="quiz-input"
                  min="18"
                  max="100"
                  step="1"
                />
              )}
              
              {errors[index] && <span className="error">{errors[index]}</span>}
            </div>
          ))}

          <div className="quiz-question">
            <p>
              <strong>Optional: Any comments for the researchers?</strong>
            </p>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows="4"
              className="quiz-textarea"
              placeholder="Please share any thoughts about this study..."
            />
          </div>

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

export default GeneralQuestionnairePage;