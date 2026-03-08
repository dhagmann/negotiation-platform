import React, { useEffect } from 'react';

function ThankYouPage({ appData }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = 'https://app.prolific.com/submissions/complete?cc=C10X81P7';
    }, 20000); // Changed from 15 to 20 seconds
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="info-container">
      <h1>Thank You!</h1>
      <p style={{ textAlign: 'left' }}>
        Thank you for participating in our study. Your responses have been recorded. We appreciate your time and effort.
      </p>
      <p style={{ textAlign: 'left' }}>
        We will calculate and send your bonus earnings within the next 72 hours.
      </p>
      <p style={{ textAlign: 'left' }}>
        In a few seconds, you will be redirected to Prolific and your submission will be marked as complete.
      </p>
    </div>
  );
}

export default ThankYouPage;