import React, { useRef, useState } from 'react';

const Video = ({appData}) => {
  //const { roomName, socket, setSellerVideoAccepted, setBuyerVideoAccepted, role } = useRoom(); // Access room context
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [videoAccepted, setVideoAccepted] = useState(false);
  const [videoOffered, setVideoOffered] = useState(false);
  const localVideoRef = useRef(null); // Reference to local video stream
  const remoteVideoRef = useRef(null); // Reference to remote video stream
  //const peerConnectionRef = useRef(null); // Reference to WebRTC PeerConnection

  const handleEnableVideo = () => {
    //console.log("handle enable video")
    setVideoEnabled(true)
    setVideoOffered(true)
  }

  const handleDisableVideo = () => {
    //console.log("handle disable video")
    setVideoEnabled(false)
  }

  const handleAcceptVideo = () => {
    //console.log("handle accept video")
    setVideoAccepted(true)
  }

  const handleRejectVideo = () => {
    //console.log("handle reject video")
    setVideoAccepted(true)
  }

  return (
    <div align="center">
      <div className="btn-group w-100" role="group" aria-label="Button Group Example">
        {!videoEnabled ? (
          <button type="button" className="btn btn-primary flex-fill" onClick={handleEnableVideo} >Offer Video Call</button>
        ) : (
          <button type="button" className="btn btn-danger flex-fill" onClick={handleDisableVideo} >Turn Off Your Video</button>
        )}
        {!videoAccepted ? (
          <div>
            {videoOffered ? (
              <div>
                <button type="button" className="btn btn-success flex-fill" onClick={handleAcceptVideo} >Accept Video Call</button>
                <button type="button" className="btn btn-danger flex-fill" onClick={handleRejectVideo} >Reject Video Call</button>
              </div>
              ): (
                <div>
                  <button type="button" className="btn btn-success flex-fill disabled" >No Incoming Call</button>
                </div>
            )}
          </div>
        ) : (
          <button type="button" className="btn btn-danger flex-fill" onClick={handleRejectVideo} >Turn Off Their Video</button>
        )}
      </div>

      <div style={{ display: 'flex', marginTop: '20px' }}>
        <video ref={localVideoRef} autoPlay muted style={{ width: '250px', marginRight: '10px' }} />
        <video ref={remoteVideoRef} autoPlay style={{ width: '250px' }} />
      </div>
    </div>
  );
};

export default Video;