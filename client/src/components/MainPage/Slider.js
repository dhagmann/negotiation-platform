import React, { useState } from 'react';

const Slider = ({ appData }) => {
  const { roomName, socket, role }  = appData || {};
  const [sliderValue, setSliderValue] = useState(5.0); // Default slider value

  const handleSliderChange = (e) => {
    if(parseFloat(e.target.value) === 10){
      setSliderValue(parseInt(e.target.value));
    }else{
      setSliderValue(parseFloat(e.target.value));
    }
    
  };

  const handleSliderSubmit = () => {
    if (roomName && role) {
      // Send numeric value; server will validate, clamp and format
      const amount = Number(sliderValue);
      socket.emit("sendOffer", {roomName, message: amount, role})
    }
  };

  const handleInputChange = (e) => {
    const value = Math.min(10, Math.max(0, parseFloat(e.target.value))); // Clamp between 0 and 10
    setSliderValue(value);
  };

  return (
    <div className="slider-container">
      {/* Your Offer label and input on same line */}
      <div className="slider-row">
        <div className="slider-label">Your Offer:</div>
        <input
          type="number"
          min="0"
          max="10"
          step="0.1"
          value={sliderValue.toFixed(1)}
          onChange={handleInputChange}
          className="slider-value-input"
        />
        <span className="slider-value-text">Million</span>
      </div>
      {/* Horizontal row for slider and button */}
      <div className="slider-row">
        <input
          type="range"
          min="0"
          max="10"
          step="0.1"
          value={sliderValue}
          onChange={handleSliderChange}
          className="slider"
        />
        <button onClick={handleSliderSubmit} className="slider-submit">
          Submit
        </button>
      </div>
    </div>
  );
};

export default Slider;