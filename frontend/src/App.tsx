import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { SocketProvider } from './context/SocketContext.js';
import { Navbar } from './components/Navbar.js';
import { IncomingCallModal } from './components/IncomingCallModal.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { MeetingRoomPage } from './pages/MeetingRoomPage.js';
import { MeetingSummaryPage } from './pages/MeetingSummaryPage.js';

function MainRouter() {
  const { user, isLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState<string>('dashboard');
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-slate-600 font-medium tracking-wide">
            Initializing FocusMeet AI Secure Environment...
          </span>
        </div>
      </div>
    );
  }

  // Unauthenticated routing
  if (!user) {
    if (currentPage === 'register') {
      return <RegisterPage onNavigate={(p) => setCurrentPage(p)} />;
    }
    return <LoginPage onNavigate={(p) => setCurrentPage(p)} />;
  }

  // Handlers
  const handleJoinMeeting = (meetingId: string) => {
    setActiveMeetingId(meetingId);
    setCurrentPage('meeting');
  };

  const handleLeaveMeeting = (meetingId: string) => {
    setActiveMeetingId(meetingId);
    setCurrentPage('summary');
  };

  const handleViewSummary = (meetingId: string) => {
    setActiveMeetingId(meetingId);
    setCurrentPage('summary');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      {/* Global incoming meeting invite popup */}
      <IncomingCallModal onJoinMeeting={handleJoinMeeting} />

      {/* Hide standard navbar inside full-screen meeting room for distraction-free view */}
      {currentPage !== 'meeting' && (
        <Navbar onNavigate={(page) => setCurrentPage(page)} />
      )}

      <main className="flex-1">
        {currentPage === 'meeting' && activeMeetingId ? (
          <MeetingRoomPage meetingId={activeMeetingId} onLeave={handleLeaveMeeting} />
        ) : currentPage === 'summary' && activeMeetingId ? (
          <MeetingSummaryPage
            meetingId={activeMeetingId}
            onBack={() => setCurrentPage('dashboard')}
          />
        ) : (
          <DashboardPage
            onJoinMeeting={handleJoinMeeting}
            onViewSummary={handleViewSummary}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <MainRouter />
      </SocketProvider>
    </AuthProvider>
  );
}
