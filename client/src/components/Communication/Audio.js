import React, { useState, useRef } from 'react';

const Audio = ({appData}) => {
  const { roomId, socket } = appData || {}; // Access room context
  const [audioEnabled, setAudioEnabled] = useState(false);
  const localStreamRef = useRef(null); // To hold local audio stream
  const remoteStreamRef = useRef(null); // To hold remote audio stream
  const peerConnectionRef = useRef(null); // WebRTC peer connection

  const servers = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], // Public STUN server
  };

  const handleEnableAudio = async () => {
    setAudioEnabled(true);

    // Get local audio stream
    const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = localStream;

    peerConnectionRef.current = new RTCPeerConnection(servers);

    // Add local audio tracks to peer connection
    localStream.getTracks().forEach((track) => peerConnectionRef.current.addTrack(track, localStream));

    // Handle ICE candidates
    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('iceCandidate', { roomId, candidate: event.candidate });
      }
    };

    // Handle remote stream
    peerConnectionRef.current.ontrack = (event) => {
      const remoteStream = new MediaStream();
      remoteStream.addTrack(event.track);
      remoteStreamRef.current.srcObject = remoteStream;
    };

    // Create and send offer
    const offer = await peerConnectionRef.current.createOffer();
    await peerConnectionRef.current.setLocalDescription(offer);
    socket.emit('audioOffer', { roomId, offer });
  };

  const handleDisableAudio = () => {
    setAudioEnabled(false); // Update state to reflect audio is disabled
  
    // Stop all tracks in the local audio stream
    if (localStreamRef.current) {
      const localStream = localStreamRef.current;
      localStream.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null; // Clear the reference
    }
  
    // Close the peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === 'audio') {
          peerConnectionRef.current.removeTrack(sender); // Remove audio track
        }
      });
      peerConnectionRef.current.close();
      peerConnectionRef.current = null; // Cleanup reference
    }
  
    // Optionally emit an event to inform the other user
    socket.emit('audioDisabled', { roomId });
  };

  // Handle incoming WebRTC offers
  socket.on('audioOffer', async ({ offer }) => {
    if (!peerConnectionRef.current) {
      peerConnectionRef.current = new RTCPeerConnection(servers);

      // Handle ICE candidates
      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('iceCandidate', { roomId, candidate: event.candidate });
        }
      };

      // Handle remote stream
      peerConnectionRef.current.ontrack = (event) => {
        const remoteStream = new MediaStream();
        remoteStream.addTrack(event.track);
        remoteStreamRef.current.srcObject = remoteStream;
      };

      // Add local audio tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => peerConnectionRef.current.addTrack(track, localStreamRef.current));
      }
    }

    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnectionRef.current.createAnswer();
    await peerConnectionRef.current.setLocalDescription(answer);
    socket.emit('audioAnswer', { roomId, answer });
  });

  // Handle incoming WebRTC answers
  socket.on('audioAnswer', async ({ answer }) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    }
  });

  // Handle incoming ICE candidates
  socket.on('iceCandidate', ({ candidate }) => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    }
  });

  return (
    <div>
      {audioEnabled ? (
        <div>
          <button className="btn btn-outline-primary shadow-none mx-1" onClick={handleDisableAudio}>Disable Audio</button>
          <audio ref={remoteStreamRef} autoPlay controls />
        </div>
      ) : (
        <button className="btn btn-outline-primary shadow-none mx-1" onClick={handleEnableAudio}>Enable Audio</button>
      )}
    </div>
  );
};

export default Audio;