// Chat component for real-time messaging during negotiation
import React, { useState, useEffect, useRef} from 'react';
import Offer from './Offer'
import Accept from './Accept'
import Confirm from './Confirm'
import Video from '../Communication/Video'
import Audio from '../Communication/Audio'
import ChatGPT from '../Communication/ChatGPT'

function Chat({ appData }) {
  const { roomName, messages, socket, role, partnerId, myId, participantId, partnerParticipantId }  = appData || {};
  const [input, setInput] = useState('');
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    //const chimeSound = new Audio('../../audio/chime.mp3');
    //chimeSound.play();
    ////console.log("Playing chime")
  }, []); // Empty dependency array ensures this runs only once

  // Autofocus input when chat becomes available
  useEffect(() => {
    if (roomName) {
      inputRef.current?.focus();
    }
  }, [roomName]);

  const handleSendMessage = async (e) => {
      e.preventDefault();

      if (!socket) {
          return;
      }

      const message = input;

      if (message.trim() === "") {
          return;
      }

      // Send via socket - server automatically saves to research database
      socket.emit('sendMessage', { roomName, message, role });
      
      // Clear the input field
      setInput('');
      // Return focus to the input for rapid keyboard entry
      inputRef.current?.focus();
  };

  return (
    <div>
      <div style={{ minHeight: "100%" }}>
        <div className="chat-panel" style={{ minHeight: "95%" }}>
          <Accept appData={appData}/>
          <Confirm appData={appData}/>
          <Offer appData={appData}/>

          {/* Status used for testing and debugging */}
          {/* <div className="chat-status">{status}</div> */}

          <div className="chat-messages" ref={messagesContainerRef}>
            {messages.map((msg, index) => (
              <div key={index} className="message-wrapper">
                {(msg && msg.role) && (
                  <div className="message-content">
                    {msg.role.includes("Buyer") ? (
                      <div className="message-text">
                        <span className="sender-name">GreenBuy Energy</span>: {msg.message}
                      </div>
                    ) : (
                      <div className="message-text">
                        <span className="sender-name">SellTech Co</span>: {msg.message}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          
          {process.env.REACT_APP_ENABLE_VIDEO && <div> <Video appData={appData}/> </div>}
          {process.env.REACT_APP_ENABLE_AUDIO && <div> <Audio appData={appData}/> </div>}
          {process.env.REACT_APP_ENABLE_GPT && <div> <ChatGPT appData={appData}/> </div>}
          

          <form className="chat-input" onSubmit={handleSendMessage}>
            <input
              type="text"
              placeholder="Type a message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!roomName}
              maxLength="1000"
              ref={inputRef}
            />
            <button type="submit" disabled={!roomName}>
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Chat;