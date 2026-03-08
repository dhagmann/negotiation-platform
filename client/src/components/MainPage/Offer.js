import React, { useEffect, useState } from 'react';
import Slider from './Slider';

const Offer = ({ appData }) => {
  const { roomName, alert, socket, role, buyerOffer, setBuyerOffer, sellerOffer, setSellerOffer, buyerCountdown, setBuyerCountdown, sellerCountdown, setSellerCountdown, }  = appData || {};
  const offerTimer = process.env.REACT_APP_SHOW_OFFER_COUNTDOWN
  const offerCountdown = process.env.REACT_APP_SHOW_OFFER_COUNTDOWN_NUMBER
  
  // FIXED: Add processing state to prevent double-clicks
  const [isProcessing, setIsProcessing] = useState(false);

  // Timer runs while buyerOffer exists - uses setInterval to avoid re-running effect each tick
  useEffect(() => {
    if (!buyerOffer) return;

    const timer = setInterval(() => {
      setBuyerCountdown((prevCountdown) => {
        if (prevCountdown <= 1) {
          if (!alert) {
            setBuyerOffer(null);
          }
          return 0;
        }
        return prevCountdown - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [buyerOffer, alert, setBuyerCountdown, setBuyerOffer]);

  // Timer runs while sellerOffer exists - uses setInterval to avoid re-running effect each tick
  useEffect(() => {
    if (!sellerOffer) return;

    const timer = setInterval(() => {
      setSellerCountdown((prevCountdown) => {
        if (prevCountdown <= 1) {
          if (!alert) {
            setSellerOffer(null);
          }
          return 0;
        }
        return prevCountdown - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [sellerOffer, alert, setSellerCountdown, setSellerOffer]);

  const handleReject = async (e) => {
    e.preventDefault();
    
    // FIXED: Prevent double-clicks and ensure role is loaded
    if (!role || isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      let message = ""
      if(role.includes("Buyer")){
        message = "Rejected an offer for $" + sellerOffer
          setSellerOffer(null)
          setSellerCountdown(0)
      }else{
        message = "Rejected an offer for $" + buyerOffer
          setBuyerOffer(null)
          setBuyerCountdown(0)
      }
      
      socket.emit("rejectOffer", {roomName, message, role})
    } finally {
      // Reset processing state after a short delay
      setTimeout(() => setIsProcessing(false), 1000);
    }
  }

  const handleRescind = async (e) => {
    e.preventDefault();
    
    // FIXED: Prevent double-clicks and ensure role is loaded
    if (!role || isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      let message = ""
      if(role.includes("Buyer")){
        message = "Rescinded an offer for $" + buyerOffer 
        setBuyerOffer(null)
        setBuyerCountdown(0)
      }else{
        message = "Rescinded an offer for $" + sellerOffer
        setSellerOffer(null)
        setSellerCountdown(0)
      }
      
      socket.emit("rescindOffer", {roomName, message, role})
    } finally {
      // Reset processing state after a short delay
      setTimeout(() => setIsProcessing(false), 1000);
    }
  }

  const handleAccept = async (e) => {
    e.preventDefault();
    
    // FIXED: Prevent double-clicks and ensure role is loaded
    if (!role || isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      let message = ""
      if(role.includes("Buyer")){
        message = "Accepted an offer for $" + sellerOffer  
      }else{
        message = "Accepted an offer for $" + buyerOffer
      }
      socket.emit("acceptOffer", {roomName, message, role})
    } finally {
      // Reset processing state after a short delay
      setTimeout(() => setIsProcessing(false), 1000);
    }
  }

  return (
    <div>
        <div className="offer-container">
            {/* Buyer Offer Section */}
            <div className="offer-section">
                <div align="center">
                  {buyerOffer && (
                    <div align="center">
                    {buyerOffer && (
                      <div className="offer-notification">
                        <div className="offer-label"> GreenBuy Energy Offer:  </div>
                        <div className="offer-label"> {buyerOffer} </div>
                      </div>
                    )}
                    </div>
                  )}
                </div>
                {(role && role.includes("Seller")  && !buyerOffer) && (
                    <h3>
                      No GreenBuy Energy Offer
                    </h3>
                )}
                
                {(role && role.includes("Buyer") && !buyerOffer) && (
                    <Slider appData={appData}/>
                )}
                
                {buyerOffer && (
                    <div className="countdown-timer">
                        {offerCountdown && (
                          <div>
                            {buyerCountdown} seconds left
                          </div>
                        )}
                        
                        {offerTimer === 'true' && (
                          <div className="progress">
                            <div
                                className={`progress-bar ${buyerCountdown <= 10 ? 'timer-red' : buyerCountdown <= 20 ? 'timer-yellow' : 'timer-green'}`}
                                role="progressbar"
                                style={{ width: `${((30 - buyerCountdown) / 30) * 100}%` }}
                                aria-valuenow={30 - buyerCountdown}
                                aria-valuemin="0"
                                aria-valuemax="30"
                            ></div>
                          </div>
                        )}
                    </div>
                    )
                }
                {(buyerOffer) && (
                  <div>
                    {role && role.includes("Seller")  ? (
                      <div>
                          <div className="d-flex flex-row"  width="100%">
                          <button
                          type="button"
                          className="btn btn-success"
                          onClick={handleAccept}>
                              Accept
                          </button>

                          <button
                          type="button"
                          className="btn btn-danger"
                          onClick={handleReject}>
                              Reject
                          </button>
                      </div>
                      </div>
                    ): (
                      <div>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={handleRescind}>
                              Rescind
                          </button>
                      </div>
                    )}
                  </div>
                )} 
            </div>

            {/* Seller Offer Section */}
            <div className="offer-section">
                {sellerOffer && (
                  <div align="center">
                  {sellerOffer && (
                    <div className="offer-notification">
                      <div className="offer-label"> SellTech Co Offer:  </div>
                      <div className="offer-label"> {sellerOffer} </div>
                    </div>
                  )}
                  </div>
                )}

                {(role && role.includes("Buyer") && !sellerOffer) && (
                    <h3>
                      No SellTech Co Offer
                    </h3>
                )}
                
                {(role && role.includes("Seller")  && !sellerOffer) && (
                    <Slider appData={appData}/>
                )}
                {sellerOffer && (
                    <div className="countdown-timer"> 
                      {offerCountdown && (
                          <div>
                            {sellerCountdown} seconds left
                          </div>
                        )}
                        {offerTimer === 'true' && (
                          <div className="progress">
                            <div
                                className={`progress-bar ${sellerCountdown <= 10 ? 'timer-red' : sellerCountdown <= 20 ? 'timer-yellow' : 'timer-green'}`}
                                role="progressbar"
                                style={{ width: `${((30 - sellerCountdown) / 30) * 100}%` }}
                                aria-valuenow={30 - sellerCountdown}
                                aria-valuemin="0"
                                aria-valuemax="30"
                            ></div>
                          </div>
                        ) }
                        
                    </div>
                    )
                }

                {(sellerOffer) && (
                  <div>
                    {role && role.includes('Buyer') ? (
                      <div>
                          <div className="d-flex flex-row"  width="100%">
                          <button
                          type="button"
                          className="btn btn-success"
                          onClick={handleAccept}>
                              Accept
                          </button>

                          <button
                          type="button"
                          className="btn btn-danger"
                          onClick={handleReject}>
                              Reject
                          </button>
                      </div>
                      </div>
                    ): (
                      <div>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={handleRescind}>
                              Rescind
                          </button>
                      </div>
                    )}
                  </div>
                )} 
            </div>
        </div>
    </div>
  );
};

export default Offer;