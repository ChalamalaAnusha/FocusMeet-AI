// WebRTC Mesh Manager with Privacy-Preserving Camera Mode support

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export class WebRTCManager {
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>(); // socketId -> RTCPeerConnection
  private remoteStreams = new Map<string, MediaStream>();
  private pendingIceCandidates = new Map<string, RTCIceCandidateInit[]>();
  private socket: any;
  private onRemoteStreamCallback: ((socketId: string, stream: MediaStream) => void) | null = null;
  private onRemoteLeaveCallback: ((socketId: string) => void) | null = null;
  private isCameraBroadcasting: boolean = true;

  constructor(socket: any) {
    this.socket = socket;
    this.setupSignaling();
  }

  public setCallbacks(
    onStream: (socketId: string, stream: MediaStream) => void,
    onLeave: (socketId: string) => void
  ) {
    this.onRemoteStreamCallback = onStream;
    this.onRemoteLeaveCallback = onLeave;
  }

  // Request camera and microphone independently so either device can work alone.
  public async initLocalMedia(video = true, audio = true): Promise<MediaStream> {
    const tracks: MediaStreamTrack[] = [];

    if (video) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });
        tracks.push(...videoStream.getVideoTracks());
      } catch (err) {
        console.warn('Camera is unavailable; continuing with audio only:', err);
      }
    }

    if (audio) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        tracks.push(...audioStream.getAudioTracks());
      } catch (err) {
        console.warn('Microphone is unavailable; continuing without audio:', err);
      }
    }

    this.localStream = new MediaStream(tracks);
    return this.localStream;
  }

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  // Privacy Camera Mode: Keep camera active locally for AI, but mute/unmute peer video track
  public setCameraBroadcast(broadcast: boolean) {
    this.isCameraBroadcasting = broadcast;
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      videoTracks.forEach((track) => {
        // Track remains enabled for local <video> element AI analysis,
        // but for peer connections we control transmission
        this.peerConnections.forEach((pc) => {
          const senders = pc.getSenders();
          const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
          if (videoSender && videoSender.track) {
            videoSender.track.enabled = broadcast;
          }
        });
      });
    }
  }

  // Toggle Microphone
  public async setMicEnabled(enabled: boolean): Promise<void> {
    if (enabled && this.localStream && this.localStream.getAudioTracks().length === 0) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const audioTrack = audioStream.getAudioTracks()[0];
        this.localStream.addTrack(audioTrack);
        this.peerConnections.forEach((pc) => {
          const audioSender = pc.getTransceivers().find((transceiver) => transceiver.receiver.track.kind === 'audio')?.sender;
          if (audioSender) {
            audioSender.replaceTrack(audioTrack);
          }
        });
      } catch (err) {
        console.warn('Microphone permission was not granted:', err);
        return;
      }
    }
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  // Screen Share
  public async toggleScreenShare(): Promise<MediaStream | null> {
    if (this.screenStream) {
      this.stopScreenShare();
      return null;
    }

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const screenTrack = this.screenStream.getVideoTracks()[0];
      screenTrack.onended = () => {
        this.stopScreenShare();
      };

      // Replace video track in peer connections
      this.peerConnections.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
      });

      return this.screenStream;
    } catch (err) {
      console.warn('Screen share cancelled or failed:', err);
      return null;
    }
  }

  public stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;

      // Revert to local camera video track
      if (this.localStream) {
        const localVideoTrack = this.localStream.getVideoTracks()[0];
        if (localVideoTrack) {
          this.peerConnections.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
            if (sender) {
              sender.replaceTrack(localVideoTrack);
              localVideoTrack.enabled = this.isCameraBroadcasting;
            }
          });
        }
      }
    }
  }

  // Initiate peer connection to an existing participant
  public async connectToPeer(remoteSocketId: string) {
    if (this.peerConnections.has(remoteSocketId)) return;

    const pc = this.createPeerConnection(remoteSocketId);
    this.peerConnections.set(remoteSocketId, pc);

    this.attachLocalTracks(pc);

    // Create and send SDP Offer
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit('webrtc:offer', {
        toSocketId: remoteSocketId,
        offer,
      });
    } catch (err) {
      console.error('Error creating offer:', err);
    }
  }

  private createPeerConnection(remoteSocketId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pc.addTransceiver('audio', { direction: 'sendrecv' });
    pc.addTransceiver('video', { direction: 'sendrecv' });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc:ice-candidate', {
          toSocketId: remoteSocketId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      let remoteStream = this.remoteStreams.get(remoteSocketId);
      if (!remoteStream) {
        remoteStream = new MediaStream();
        this.remoteStreams.set(remoteSocketId, remoteStream);
      }
      if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }
      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(remoteSocketId, remoteStream);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        this.closePeer(remoteSocketId);
      }
    };

    return pc;
  }

  private attachLocalTracks(pc: RTCPeerConnection) {
    const localTracks = this.localStream?.getTracks() || [];
    for (const transceiver of pc.getTransceivers()) {
      const track = localTracks.find((localTrack) => localTrack.kind === transceiver.receiver.track.kind);
      transceiver.sender.replaceTrack(track || null);
      if (track?.kind === 'video') {
        track.enabled = this.isCameraBroadcasting;
      }
    }
  }

  private setupSignaling() {
    // Received SDP Offer
    this.socket.on('webrtc:offer', async ({ fromSocketId, offer }: any) => {
      let pc = this.peerConnections.get(fromSocketId);
      if (!pc) {
        pc = this.createPeerConnection(fromSocketId);
        this.peerConnections.set(fromSocketId, pc);

        this.attachLocalTracks(pc);
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await this.flushPendingIceCandidates(fromSocketId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.socket.emit('webrtc:answer', {
          toSocketId: fromSocketId,
          answer,
        });
      } catch (err) {
        console.error('Error responding to offer:', err);
      }
    });

    // Received SDP Answer
    this.socket.on('webrtc:answer', async ({ fromSocketId, answer }: any) => {
      const pc = this.peerConnections.get(fromSocketId);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          await this.flushPendingIceCandidates(fromSocketId, pc);
        } catch (err) {
          console.error('Error setting remote answer:', err);
        }
      }
    });

    // Received ICE candidate
    this.socket.on('webrtc:ice-candidate', async ({ fromSocketId, candidate }: any) => {
      const pc = this.peerConnections.get(fromSocketId);
      if (!candidate) return;

      if (!pc || !pc.remoteDescription) {
        const pending = this.pendingIceCandidates.get(fromSocketId) || [];
        pending.push(candidate);
        this.pendingIceCandidates.set(fromSocketId, pending);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    });

    // Peer disconnected
    this.socket.on('meeting:peer-left', ({ socketId }: any) => {
      this.closePeer(socketId);
    });
  }

  private async flushPendingIceCandidates(socketId: string, pc: RTCPeerConnection) {
    const pending = this.pendingIceCandidates.get(socketId) || [];
    this.pendingIceCandidates.delete(socketId);

    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding queued ICE candidate:', err);
      }
    }
  }

  private closePeer(socketId: string) {
    const pc = this.peerConnections.get(socketId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(socketId);
    }
    this.remoteStreams.delete(socketId);
    this.pendingIceCandidates.delete(socketId);
    if (this.onRemoteLeaveCallback) {
      this.onRemoteLeaveCallback(socketId);
    }
  }

  public cleanup() {
    this.stopScreenShare();
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.remoteStreams.clear();
    this.pendingIceCandidates.clear();
  }
}
