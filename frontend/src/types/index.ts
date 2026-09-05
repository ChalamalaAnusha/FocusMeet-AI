export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatar: string;
  studentId?: string;
  role: 'host' | 'student';
  status?: 'online' | 'in-meeting' | 'offline';
}

export interface Meeting {
  _id: string;
  title: string;
  description?: string;
  host: string;
  hostName?: string;
  isHost?: boolean;
  scheduledAt: string;
  status: 'scheduled' | 'live' | 'ended';
  invitedUsers: string[];
  activeParticipants: string[];
  settings: {
    allowChat: boolean;
    aiFocusTracking: boolean;
    toxicityModeration: boolean;
  };
  distractionAlertCount?: number;
  averageFocusScore?: number;
}

export interface Invitation {
  _id: string;
  meeting: Meeting;
  host: User;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string | Date;
  isSystem?: boolean;
  isBlocked?: boolean;
}

export interface FocusMetric {
  score: number; // 0 - 100
  category: 'focused' | 'moderate' | 'low' | 'distracted';
  faceDetected: boolean;
  ear?: number;
  headYaw?: number;
  headPitch?: number;
  gazeDirection?: string;
}

export interface AggregateFocusData {
  averageFocus: number;
  totalAttendees: number;
  focusedCount: number;
  distractedCount: number;
  distractionRate: number;
  participantScore?: {
    userId: string;
    username: string;
    score: number;
    category: string;
  };
}

export interface ModerationEvent {
  _id: string;
  meeting: string;
  user: string;
  username: string;
  source: 'chat' | 'voice';
  violationType: 'profanity' | 'harassment' | 'hate_speech' | 'disruption';
  snippet: string;
  confidence: number;
  actionTaken: 'flagged' | 'warned' | 'muted' | 'kicked' | 'blocked';
  timestamp: string | Date;
}
