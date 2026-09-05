import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext.js';

export interface IncomingCallData {
  invitationId: string;
  meetingId: string;
  title: string;
  host: {
    id: string;
    username: string;
  };
  scheduledAt: string;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  incomingCall: IncomingCallData | null;
  clearIncomingCall: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);

  useEffect(() => {
    if (!token || !user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const socketHost = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    const newSocket = io(socketHost, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('[Socket] Connected to FocusMeet signaling server');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('[Socket] Disconnected from signaling server');
      setIsConnected(false);
    });

    // Real-time direct app-to-app meeting invitation popup
    newSocket.on('meeting:incoming-call', (callData: IncomingCallData) => {
      console.log('[Socket] Incoming meeting invitation received:', callData);
      setIncomingCall(callData);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token, user?.id]);

  const clearIncomingCall = () => {
    setIncomingCall(null);
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        incomingCall,
        clearIncomingCall,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
