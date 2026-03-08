import React, { useRef, useState } from 'react';

const ChatGPT = ({appData}) => {
  //const { roomName, socket, setSellerChatGPTAccepted, setBuyerChatGPTAccepted, role } = useRoom(); // Access room context
  const [chatGPTEnabled, setChatGPTEnabled] = useState(false);
  const [chatGPTAccepted, setChatGPTAccepted] = useState(false);
  const [chatGPTOffered, setChatGPTOffered] = useState(false);
  const localChatGPTRef = useRef(null); // Reference to local chatGPT stream
  const remoteChatGPTRef = useRef(null); // Reference to remote chatGPT stream
  //const peerConnectionRef = useRef(null); // Reference to WebRTC PeerConnection

  const handleEnableChatGPT = () => {
    //console.log("handle enable chatGPT")
    setChatGPTEnabled(true)
    setChatGPTOffered(true)
  }

  const handleDisableChatGPT = () => {
    //console.log("handle disable chatGPT")
    setChatGPTEnabled(false)
  }

  const handleAcceptChatGPT = () => {
    //console.log("handle accept chatGPT")
    setChatGPTAccepted(true)
  }

  const handleRejectChatGPT = () => {
    //console.log("handle reject chatGPT")
    setChatGPTAccepted(true)
  }

  return (
    <div align="center">
      <div className="btn-group w-100" role="group" aria-label="Button Group Example">
        {!chatGPTEnabled ? (
          <button type="button" className="btn btn-primary flex-fill" onClick={handleEnableChatGPT} >Offer ChatGPT Call</button>
        ) : (
          <button type="button" className="btn btn-danger flex-fill" onClick={handleDisableChatGPT} >Turn Off Your ChatGPT</button>
        )}
        {!chatGPTAccepted ? (
          <div>
            {chatGPTOffered ? (
              <div>
                <button type="button" className="btn btn-success flex-fill" onClick={handleAcceptChatGPT} >Accept ChatGPT Call</button>
                <button type="button" className="btn btn-danger flex-fill" onClick={handleRejectChatGPT} >Reject ChatGPT Call</button>
              </div>
              ): (
                <div>
                  <button type="button" className="btn btn-success flex-fill disabled" >No Incoming Call</button>
                </div>
            )}
          </div>
        ) : (
          <button type="button" className="btn btn-danger flex-fill" onClick={handleRejectChatGPT} >Turn Off Their ChatGPT</button>
        )}
      </div>

      <div style={{ display: 'flex', marginTop: '20px' }}>
        <chatGPT ref={localChatGPTRef} autoPlay muted style={{ width: '250px', marginRight: '10px' }} />
        <chatGPT ref={remoteChatGPTRef} autoPlay style={{ width: '250px' }} />
      </div>
    </div>
  );
};

export default ChatGPT;