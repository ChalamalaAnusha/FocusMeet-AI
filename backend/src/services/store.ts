import mongoose from 'mongoose';
import { User, IUser } from '../models/User.js';
import { Meeting, IMeeting } from '../models/Meeting.js';
import { Invitation, IInvitation } from '../models/Invitation.js';
import { FocusRecord, IFocusRecord } from '../models/FocusRecord.js';
import { ModerationEvent, IModerationEvent } from '../models/ModerationEvent.js';
import { StudyMaterial } from '../models/StudyMaterial.js';
import { Feedback, IFeedback } from '../models/Feedback.js';
import { v4 as uuidv4 } from 'uuid';

export interface UserRecord {
  _id: string;
  username: string;
  email: string;
  passwordHash: string;
  displayName: string;
  avatar: string;
  studentId?: string;
  role: 'host' | 'student';
  status: 'online' | 'in-meeting' | 'offline';
  createdAt: Date;
}

export interface MeetingRecord {
  _id: string;
  title: string;
  description: string;
  host: string;
  scheduledAt: Date;
  status: 'scheduled' | 'live' | 'ended';
  invitedUsers: string[];
  activeParticipants: string[];
  settings: {
    allowChat: boolean;
    aiFocusTracking: boolean;
    toxicityModeration: boolean;
  };
  startedAt?: Date;
  endedAt?: Date;
  distractionAlertCount: number;
  averageFocusScore: number;
  createdAt: Date;
}

export interface InvitationRecord {
  _id: string;
  meeting: string;
  host: string;
  recipient: string;
  status: 'pending' | 'accepted' | 'declined';
  respondedAt?: Date;
  createdAt: Date;
}

export interface StudyMaterialRecord {
  _id: string;
  meeting: string;
  uploadedBy: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

export interface FocusRecordItem {
  _id: string;
  meeting: string;
  user: string;
  timestamp: Date;
  focusScore: number;
  category: 'focused' | 'moderate' | 'low' | 'distracted';
  details?: any;
}

export interface ModerationRecordItem {
  _id: string;
  meeting: string;
  user: string;
  username: string;
  source: 'chat' | 'voice';
  violationType: 'profanity' | 'harassment' | 'hate_speech' | 'disruption';
  snippet: string;
  confidence: number;
  actionTaken: 'flagged' | 'warned' | 'muted' | 'kicked' | 'blocked';
  timestamp: Date;
}

export interface FeedbackRecordItem {
  _id: string;
  meeting: string;
  user: string;
  username: string;
  rating: number;
  futureTopics: string;
  createdAt: Date;
}

// In-Memory Fallback Cache
class MemoryStore {
  users = new Map<string, UserRecord>();
  meetings = new Map<string, MeetingRecord>();
  invitations = new Map<string, InvitationRecord>();
  focusRecords: FocusRecordItem[] = [];
  moderationEvents: ModerationRecordItem[] = [];
  studyMaterials = new Map<string, StudyMaterialRecord>();
  feedbacks: FeedbackRecordItem[] = [];
  blockedMeetingUsers = new Set<string>();

  // Active socket tracking: userId -> socketId
  userSockets = new Map<string, string>();
  socketUsers = new Map<string, string>();

  // Meeting active room metrics
  roomFocusScores = new Map<string, Map<string, number>>(); // meetingId -> (userId -> score)
  roomAttentionHistory = new Map<string, Array<{ timestamp: number; lowAttentionPercentage: number }>>();
  roomDistractionAlertSent = new Map<string, number>(); // meetingId -> lastAlertTimestamp
}

export const memoryStore = new MemoryStore();

export const isMongoReady = (): boolean => {
  return mongoose.connection.readyState === 1;
};

// Data access helpers with Mongo + memory synchronization
export const Store = {
  // User methods
  async createUser(userData: Omit<UserRecord, '_id' | 'createdAt'>): Promise<UserRecord> {
    const id = new mongoose.Types.ObjectId().toString();
    const record: UserRecord = {
      ...userData,
      _id: id,
      createdAt: new Date(),
    };

    memoryStore.users.set(id, record);

    if (isMongoReady()) {
      try {
        const u = await User.create({ ...record, _id: new mongoose.Types.ObjectId(id) });
        return {
          _id: u._id.toString(),
          username: u.username,
          email: u.email,
          passwordHash: u.passwordHash,
          displayName: u.displayName,
          avatar: u.avatar,
          studentId: u.studentId,
          role: u.role,
          status: u.status,
          createdAt: u.createdAt,
        };
      } catch (err) {
        console.warn('Mongo create error, cached in memory:', err);
      }
    }

    return record;
  },

  async findUserByUsernameOrEmail(identifier: string): Promise<UserRecord | null> {
    const norm = identifier.toLowerCase().trim();
    if (isMongoReady()) {
      try {
        const u = await User.findOne({
          $or: [{ username: norm }, { email: norm }],
        });
        if (u) {
          const rec: UserRecord = {
            _id: u._id.toString(),
            username: u.username,
            email: u.email,
            passwordHash: u.passwordHash,
            displayName: u.displayName,
            avatar: u.avatar,
            studentId: u.studentId,
            role: u.role,
            status: u.status,
            createdAt: u.createdAt,
          };
          memoryStore.users.set(rec._id, rec);
          return rec;
        }
      } catch (err) {
        console.warn('Mongo lookup error, falling back to memory');
      }
    }

    for (const u of memoryStore.users.values()) {
      if (u.username.toLowerCase() === norm || u.email.toLowerCase() === norm) {
        return u;
      }
    }
    return null;
  },

  async findUserById(id: string): Promise<UserRecord | null> {
    if (isMongoReady() && mongoose.Types.ObjectId.isValid(id)) {
      try {
        const u = await User.findById(id);
        if (u) {
          const rec: UserRecord = {
            _id: u._id.toString(),
            username: u.username,
            email: u.email,
            passwordHash: u.passwordHash,
            displayName: u.displayName,
            avatar: u.avatar,
            studentId: u.studentId,
            role: u.role || 'student',
            status: u.status,
            createdAt: u.createdAt,
          };
          memoryStore.users.set(rec._id, rec);
          return rec;
        }
      } catch (err) {
        // fallback
      }
    }
    return memoryStore.users.get(id) || null;
  },

  async searchUsers(query: string, currentUserId: string): Promise<Omit<UserRecord, 'passwordHash'>[]> {
    const q = query.toLowerCase().trim();
    const results: Omit<UserRecord, 'passwordHash'>[] = [];

    if (isMongoReady()) {
      try {
        const users = await User.find({
          _id: { $ne: new mongoose.Types.ObjectId(currentUserId) },
          $or: [
            { username: { $regex: q, $options: 'i' } },
            { displayName: { $regex: q, $options: 'i' } },
            { email: { $regex: q, $options: 'i' } },
            { studentId: { $regex: q, $options: 'i' } },
          ],
        }).limit(20);

        return users.map((u) => ({
          _id: u._id.toString(),
          username: u.username,
          email: u.email,
          displayName: u.displayName,
          avatar: u.avatar,
          status: u.status,
          createdAt: u.createdAt,
          studentId: (u as any).studentId,
          role: u.role,
        }));
      } catch (err) {
        // fallback
      }
    }

    for (const u of memoryStore.users.values()) {
      if (u._id !== currentUserId && (u.username.includes(q) || u.displayName.toLowerCase().includes(q) || u.email.includes(q) || (u.studentId || '').toLowerCase().includes(q))) {
        const { passwordHash, ...safe } = u;
        results.push(safe);
      }
    }
    return results;
  },

  // Meeting methods
  async createMeeting(meetingData: Omit<MeetingRecord, '_id' | 'createdAt' | 'distractionAlertCount' | 'averageFocusScore' | 'activeParticipants'>): Promise<MeetingRecord> {
    const id = new mongoose.Types.ObjectId().toString();
    const record: MeetingRecord = {
      ...meetingData,
      _id: id,
      activeParticipants: [],
      distractionAlertCount: 0,
      averageFocusScore: 100,
      createdAt: new Date(),
    };

    memoryStore.meetings.set(id, record);

    if (isMongoReady()) {
      try {
        const m = await Meeting.create({
          ...record,
          _id: new mongoose.Types.ObjectId(id),
          host: new mongoose.Types.ObjectId(record.host),
          invitedUsers: record.invitedUsers.map((uId) => new mongoose.Types.ObjectId(uId)),
        });
        return {
          _id: m._id.toString(),
          title: m.title,
          description: m.description,
          host: m.host.toString(),
          scheduledAt: m.scheduledAt,
          status: m.status,
          invitedUsers: m.invitedUsers.map((u: any) => u.toString()),
          activeParticipants: [],
          settings: m.settings,
          distractionAlertCount: m.distractionAlertCount,
          averageFocusScore: m.averageFocusScore || 100,
          createdAt: m.createdAt,
        };
      } catch (err) {
        console.warn('Mongo create meeting error:', err);
      }
    }

    return record;
  },

  async getMeetingById(id: string): Promise<MeetingRecord | null> {
    if (isMongoReady() && mongoose.Types.ObjectId.isValid(id)) {
      try {
        const m = await Meeting.findById(id);
        if (m) {
          const rec: MeetingRecord = {
            _id: m._id.toString(),
            title: m.title,
            description: m.description,
            host: m.host.toString(),
            scheduledAt: m.scheduledAt,
            status: m.status,
            invitedUsers: m.invitedUsers.map((u: any) => u.toString()),
            activeParticipants: m.activeParticipants.map((u: any) => u.toString()),
            settings: m.settings,
            startedAt: m.startedAt,
            endedAt: m.endedAt,
            distractionAlertCount: m.distractionAlertCount,
            averageFocusScore: m.averageFocusScore || 100,
            createdAt: m.createdAt,
          };
          memoryStore.meetings.set(rec._id, rec);
          return rec;
        }
      } catch (err) {
        // fallback
      }
    }
    return memoryStore.meetings.get(id) || null;
  },

  async getUserMeetings(userId: string): Promise<MeetingRecord[]> {
    if (isMongoReady() && mongoose.Types.ObjectId.isValid(userId)) {
      try {
        const objId = new mongoose.Types.ObjectId(userId);
        const list = await Meeting.find({
          $or: [{ host: objId }, { invitedUsers: objId }],
        }).sort({ scheduledAt: -1 });

        return list.map((m) => ({
          _id: m._id.toString(),
          title: m.title,
          description: m.description,
          host: m.host.toString(),
          scheduledAt: m.scheduledAt,
          status: m.status,
          invitedUsers: m.invitedUsers.map((u: any) => u.toString()),
          activeParticipants: m.activeParticipants.map((u: any) => u.toString()),
          settings: m.settings,
          startedAt: m.startedAt,
          endedAt: m.endedAt,
          distractionAlertCount: m.distractionAlertCount,
          averageFocusScore: m.averageFocusScore || 100,
          createdAt: m.createdAt,
        }));
      } catch (err) {
        // fallback
      }
    }

    const res: MeetingRecord[] = [];
    for (const m of memoryStore.meetings.values()) {
      if (m.host === userId || m.invitedUsers.includes(userId)) {
        res.push(m);
      }
    }
    return res.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  },

  async updateMeetingStatus(meetingId: string, status: 'scheduled' | 'live' | 'ended'): Promise<void> {
    const m = memoryStore.meetings.get(meetingId);
    if (m) {
      m.status = status;
      if (status === 'live' && !m.startedAt) m.startedAt = new Date();
      if (status === 'ended') m.endedAt = new Date();
    }

    if (isMongoReady() && mongoose.Types.ObjectId.isValid(meetingId)) {
      const updates: any = { status };
      if (status === 'live') updates.startedAt = new Date();
      if (status === 'ended') updates.endedAt = new Date();
      await Meeting.findByIdAndUpdate(meetingId, updates);
    }
  },

  async addActiveParticipant(meetingId: string, userId: string): Promise<void> {
    const meeting = memoryStore.meetings.get(meetingId);
    if (meeting && !meeting.activeParticipants.includes(userId)) meeting.activeParticipants.push(userId);
    if (isMongoReady() && mongoose.Types.ObjectId.isValid(meetingId) && mongoose.Types.ObjectId.isValid(userId)) {
      await Meeting.findByIdAndUpdate(meetingId, { $addToSet: { activeParticipants: new mongoose.Types.ObjectId(userId) } });
    }
  },

  async removeActiveParticipant(meetingId: string, userId: string): Promise<void> {
    const meeting = memoryStore.meetings.get(meetingId);
    if (meeting) meeting.activeParticipants = meeting.activeParticipants.filter((participantId) => participantId !== userId);
    if (isMongoReady() && mongoose.Types.ObjectId.isValid(meetingId) && mongoose.Types.ObjectId.isValid(userId)) {
      await Meeting.findByIdAndUpdate(meetingId, { $pull: { activeParticipants: new mongoose.Types.ObjectId(userId) } });
    }
  },

  async incrementDistractionAlert(meetingId: string): Promise<number> {
    const m = memoryStore.meetings.get(meetingId);
    if (m) {
      m.distractionAlertCount = (m.distractionAlertCount || 0) + 1;
    }

    if (isMongoReady() && mongoose.Types.ObjectId.isValid(meetingId)) {
      try {
        const updated = await Meeting.findByIdAndUpdate(
          meetingId,
          { $inc: { distractionAlertCount: 1 } },
          { new: true }
        );
        return updated?.distractionAlertCount || (m ? m.distractionAlertCount : 1);
      } catch (err) {
        // fallback
      }
    }
    return m ? m.distractionAlertCount : 1;
  },

  // Invitations
  async createInvitation(meetingId: string, hostId: string, recipientId: string): Promise<InvitationRecord> {
    const id = new mongoose.Types.ObjectId().toString();
    const inv: InvitationRecord = {
      _id: id,
      meeting: meetingId,
      host: hostId,
      recipient: recipientId,
      status: 'pending',
      createdAt: new Date(),
    };

    memoryStore.invitations.set(id, inv);

    if (isMongoReady()) {
      try {
        await Invitation.create({
          _id: new mongoose.Types.ObjectId(id),
          meeting: new mongoose.Types.ObjectId(meetingId),
          host: new mongoose.Types.ObjectId(hostId),
          recipient: new mongoose.Types.ObjectId(recipientId),
          status: 'pending',
        });
      } catch (err) {
        // duplicate or mongo error
      }
    }
    return inv;
  },

  async getUserPendingInvitations(userId: string): Promise<any[]> {
    if (isMongoReady() && mongoose.Types.ObjectId.isValid(userId)) {
      try {
        const invs = await Invitation.find({
          recipient: new mongoose.Types.ObjectId(userId),
          status: 'pending',
        })
          .populate('meeting')
          .populate('host', 'username displayName avatar')
          .sort({ createdAt: -1 });

        return invs.map((i: any) => ({
          _id: i._id.toString(),
          meeting: i.meeting,
          host: i.host,
          status: i.status,
          createdAt: i.createdAt,
        }));
      } catch (err) {
        // fallback
      }
    }

    const list: any[] = [];
    for (const inv of memoryStore.invitations.values()) {
      if (inv.recipient === userId && inv.status === 'pending') {
        const m = memoryStore.meetings.get(inv.meeting);
        const host = memoryStore.users.get(inv.host);
        list.push({
          _id: inv._id,
          meeting: m,
          host: host ? { _id: host._id, username: host.username, displayName: host.displayName, avatar: host.avatar } : null,
          status: inv.status,
          createdAt: inv.createdAt,
        });
      }
    }
    return list;
  },

  async hasAcceptedInvitation(meetingId: string, userId: string): Promise<boolean> {
    for (const invitation of memoryStore.invitations.values()) {
      if (invitation.meeting === meetingId && invitation.recipient === userId && invitation.status === 'accepted') {
        return true;
      }
    }

    if (isMongoReady() && mongoose.Types.ObjectId.isValid(meetingId) && mongoose.Types.ObjectId.isValid(userId)) {
      try {
        return Boolean(await Invitation.exists({
          meeting: new mongoose.Types.ObjectId(meetingId),
          recipient: new mongoose.Types.ObjectId(userId),
          status: 'accepted',
        }));
      } catch (err) {
        // Fall back to the in-memory cache.
      }
    }
    return false;
  },

  async respondToInvitation(invitationId: string, userId: string, status: 'accepted' | 'declined'): Promise<boolean> {
    const inv = memoryStore.invitations.get(invitationId);
    if (inv && inv.recipient === userId) {
      inv.status = status;
      inv.respondedAt = new Date();
    }

    if (isMongoReady() && mongoose.Types.ObjectId.isValid(invitationId)) {
      try {
        await Invitation.findOneAndUpdate(
          { _id: new mongoose.Types.ObjectId(invitationId), recipient: new mongoose.Types.ObjectId(userId) },
          { status, respondedAt: new Date() }
        );
        return true;
      } catch (err) {
        // fallback
      }
    }
    return !!inv;
  },

  // Focus Telemetry & Moderation records
  async saveFocusRecord(record: Omit<FocusRecordItem, '_id'>): Promise<void> {
    const item: FocusRecordItem = { ...record, _id: uuidv4() };
    memoryStore.focusRecords.push(item);
    if (memoryStore.focusRecords.length > 5000) memoryStore.focusRecords.shift();

    if (isMongoReady()) {
      try {
        await FocusRecord.create({
          meeting: new mongoose.Types.ObjectId(record.meeting),
          user: new mongoose.Types.ObjectId(record.user),
          timestamp: record.timestamp,
          focusScore: record.focusScore,
          category: record.category,
          details: record.details,
        });
      } catch (err) {
        // ignore telemetry save error
      }
    }
  },

  async saveModerationEvent(event: Omit<ModerationRecordItem, '_id'>): Promise<ModerationRecordItem> {
    const item: ModerationRecordItem = { ...event, _id: uuidv4() };
    memoryStore.moderationEvents.push(item);

    if (isMongoReady()) {
      try {
        await ModerationEvent.create({
          meeting: new mongoose.Types.ObjectId(event.meeting),
          user: new mongoose.Types.ObjectId(event.user),
          username: event.username,
          source: event.source,
          violationType: event.violationType,
          snippet: event.snippet,
          confidence: event.confidence,
          actionTaken: event.actionTaken,
          timestamp: event.timestamp,
        });
      } catch (err) {
        // fallback
      }
    }

    return item;
  },

  async getMeetingModerationEvents(meetingId: string): Promise<ModerationRecordItem[]> {
    if (isMongoReady() && mongoose.Types.ObjectId.isValid(meetingId)) {
      try {
        const events = await ModerationEvent.find({
          meeting: new mongoose.Types.ObjectId(meetingId),
        }).sort({ timestamp: -1 });

        return events.map((e) => ({
          _id: e._id.toString(),
          meeting: e.meeting.toString(),
          user: e.user.toString(),
          username: e.username,
          source: e.source,
          violationType: e.violationType,
          snippet: e.snippet,
          confidence: e.confidence,
          actionTaken: e.actionTaken,
          timestamp: e.timestamp,
        }));
      } catch (err) {
        // fallback
      }
    }

    return memoryStore.moderationEvents
      .filter((e) => e.meeting === meetingId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  },

  async createStudyMaterial(material: Omit<StudyMaterialRecord, '_id' | 'createdAt'>): Promise<StudyMaterialRecord> {
    const record: StudyMaterialRecord = { ...material, _id: uuidv4(), createdAt: new Date() };
    memoryStore.studyMaterials.set(record._id, record);
    if (isMongoReady() && mongoose.Types.ObjectId.isValid(record.meeting) && mongoose.Types.ObjectId.isValid(record.uploadedBy)) {
      try {
        const saved = await StudyMaterial.create({
          ...record,
          _id: new mongoose.Types.ObjectId(),
          meeting: new mongoose.Types.ObjectId(record.meeting),
          uploadedBy: new mongoose.Types.ObjectId(record.uploadedBy),
        });
        record._id = saved._id.toString();
        memoryStore.studyMaterials.set(record._id, record);
      } catch (err) {
        console.warn('Mongo study material error, cached in memory:', err);
      }
    }
    return record;
  },

  async getMeetingStudyMaterials(meetingId: string): Promise<StudyMaterialRecord[]> {
    if (isMongoReady() && mongoose.Types.ObjectId.isValid(meetingId)) {
      try {
        const materials = await StudyMaterial.find({ meeting: new mongoose.Types.ObjectId(meetingId) }).sort({ createdAt: -1 });
        return materials.map((material) => ({
          _id: material._id.toString(),
          meeting: material.meeting.toString(),
          uploadedBy: material.uploadedBy.toString(),
          originalName: material.originalName,
          storedName: material.storedName,
          mimeType: material.mimeType,
          size: material.size,
          createdAt: material.createdAt,
        }));
      } catch (err) {
        // Fall back to the in-memory cache.
      }
    }
    return [...memoryStore.studyMaterials.values()].filter((material) => material.meeting === meetingId);
  },

  async getStudyMaterial(id: string): Promise<StudyMaterialRecord | null> {
    if (isMongoReady() && mongoose.Types.ObjectId.isValid(id)) {
      try {
        const material = await StudyMaterial.findById(id);
        if (material) return {
          _id: material._id.toString(), meeting: material.meeting.toString(), uploadedBy: material.uploadedBy.toString(),
          originalName: material.originalName, storedName: material.storedName, mimeType: material.mimeType,
          size: material.size, createdAt: material.createdAt,
        };
      } catch (err) {
        // Fall back to the in-memory cache.
      }
    }
    return memoryStore.studyMaterials.get(id) || null;
  },

  async getMeetingAnalytics(meetingId: string) {
    const meeting = await this.getMeetingById(meetingId);
    const moderation = await this.getMeetingModerationEvents(meetingId);

    // Get focus records for this meeting
    let records = memoryStore.focusRecords.filter((r) => r.meeting === meetingId);
    if (isMongoReady() && mongoose.Types.ObjectId.isValid(meetingId)) {
      try {
        const dbRecords = await FocusRecord.find({ meeting: new mongoose.Types.ObjectId(meetingId) });
        if (dbRecords.length > 0) {
          records = dbRecords.map((r) => ({
            _id: r._id.toString(),
            meeting: r.meeting.toString(),
            user: r.user.toString(),
            timestamp: r.timestamp,
            focusScore: r.focusScore,
            category: r.category,
            details: r.details,
          }));
        }
      } catch (err) {
        // fallback
      }
    }

    // Compute average focus
    const avgScore: number | null =
      records.length > 0
        ? Math.round(records.reduce((acc, r) => acc + r.focusScore, 0) / records.length)
        : null;

    const participantRecords = new Map<string, FocusRecordItem[]>();
    records.forEach((record) => {
      const userRecords = participantRecords.get(record.user) || [];
      userRecords.push(record);
      participantRecords.set(record.user, userRecords);
    });

    const participantDetails = await Promise.all(Array.from(participantRecords.entries()).map(async ([userId, userRecords]) => {
      const participant = await this.findUserById(userId);
      const participantAverage = Math.round(userRecords.reduce((sum, record) => sum + record.focusScore, 0) / userRecords.length);
      return {
        userId,
        username: participant?.username || 'Participant',
        displayName: participant?.displayName || participant?.username || 'Participant',
        avatar: participant?.avatar || '',
        averageFocus: participantAverage,
        sampleCount: userRecords.length,
        category: participantAverage >= 80 ? 'focused' : participantAverage >= 60 ? 'moderate' : 'low',
      };
    }));

    const focusedCount = participantDetails.filter((participant) => participant.category === 'focused').length;
    const moderateCount = participantDetails.filter((participant) => participant.category === 'moderate').length;
    const lowFocusCount = participantDetails.filter((participant) => participant.category === 'low').length;
    const attendedStudents = meeting?.activeParticipants.filter((userId) => userId !== meeting.host) || [];
    const participantCount = attendedStudents.length || participantDetails.length;
    const unavailableCount = Math.max(0, participantCount - participantDetails.length);

    // Timeline buckets (e.g. per minute or sample)
    const timeline: { time: string; avgFocus: number; attendees: number }[] = [];
    const grouped = new Map<number, number[]>();

    records.forEach((r) => {
      const minKey = Math.floor(new Date(r.timestamp).getTime() / 30000) * 30000;
      if (!grouped.has(minKey)) grouped.set(minKey, []);
      grouped.get(minKey)!.push(r.focusScore);
    });

    const sortedTimes = Array.from(grouped.keys()).sort();
    sortedTimes.forEach((t) => {
      const scores = grouped.get(t)!;
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      timeline.push({
        time: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        avgFocus: avg,
        attendees: scores.length,
      });
    });

    const feedbacks = await this.getMeetingFeedback(meetingId);
    const averageRating = feedbacks.length > 0
      ? Number((feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length).toFixed(1))
      : 0;

    return {
      meeting,
      averageFocusScore: avgScore,
      durationMinutes: meeting?.startedAt && meeting?.endedAt
        ? Math.max(0, Math.round((new Date(meeting.endedAt).getTime() - new Date(meeting.startedAt).getTime()) / 60000))
        : null,
      participantCount,
      unavailableCount,
      focusDistribution: {
        focused: focusedCount,
        moderate: moderateCount,
        low: lowFocusCount,
        focusedPercentage: participantCount ? Math.round((focusedCount / participantCount) * 100) : 0,
        moderatePercentage: participantCount ? Math.round((moderateCount / participantCount) * 100) : 0,
        lowPercentage: participantCount ? Math.round((lowFocusCount / participantCount) * 100) : 0,
      },
      participantDetails,
      totalSamples: records.length,
      distractionAlertsCount: meeting?.distractionAlertCount || 0,
      timeline,
      moderationViolations: moderation,
      feedbacks,
      averageRating,
    };
  },

  // Feedback methods (Requirement 10)
  async saveFeedback(data: Omit<FeedbackRecordItem, '_id' | 'createdAt'>): Promise<FeedbackRecordItem> {
    const id = new mongoose.Types.ObjectId().toString();
    const record: FeedbackRecordItem = {
      ...data,
      _id: id,
      createdAt: new Date(),
    };

    // Remove any existing feedback by same student for this meeting
    memoryStore.feedbacks = memoryStore.feedbacks.filter(
      (f) => !(f.meeting === data.meeting && f.user === data.user)
    );
    memoryStore.feedbacks.push(record);

    if (isMongoReady() && mongoose.Types.ObjectId.isValid(data.meeting) && mongoose.Types.ObjectId.isValid(data.user)) {
      try {
        const saved = await Feedback.findOneAndUpdate(
          {
            meeting: new mongoose.Types.ObjectId(data.meeting),
            user: new mongoose.Types.ObjectId(data.user),
          },
          {
            username: data.username,
            rating: data.rating,
            futureTopics: data.futureTopics,
            createdAt: record.createdAt,
          },
          { upsert: true, new: true }
        );
        record._id = saved._id.toString();
      } catch (err) {
        console.warn('Mongo feedback save error, retained in memory store:', err);
      }
    }
    return record;
  },

  async getStudentFeedback(meetingId: string, userId: string): Promise<FeedbackRecordItem | null> {
    if (isMongoReady() && mongoose.Types.ObjectId.isValid(meetingId) && mongoose.Types.ObjectId.isValid(userId)) {
      try {
        const fb = await Feedback.findOne({
          meeting: new mongoose.Types.ObjectId(meetingId),
          user: new mongoose.Types.ObjectId(userId),
        });
        if (fb) {
          return {
            _id: fb._id.toString(),
            meeting: fb.meeting.toString(),
            user: fb.user.toString(),
            username: fb.username,
            rating: fb.rating,
            futureTopics: fb.futureTopics,
            createdAt: fb.createdAt,
          };
        }
      } catch (err) {
        // fallback
      }
    }
    return memoryStore.feedbacks.find((f) => f.meeting === meetingId && f.user === userId) || null;
  },

  async getMeetingFeedback(meetingId: string): Promise<FeedbackRecordItem[]> {
    if (isMongoReady() && mongoose.Types.ObjectId.isValid(meetingId)) {
      try {
        const list = await Feedback.find({ meeting: new mongoose.Types.ObjectId(meetingId) }).sort({ createdAt: -1 });
        if (list.length > 0) {
          return list.map((fb) => ({
            _id: fb._id.toString(),
            meeting: fb.meeting.toString(),
            user: fb.user.toString(),
            username: fb.username,
            rating: fb.rating,
            futureTopics: fb.futureTopics,
            createdAt: fb.createdAt,
          }));
        }
      } catch (err) {
        // fallback
      }
    }
    return memoryStore.feedbacks.filter((f) => f.meeting === meetingId);
  },

  async getUserMeetingFocusRecords(meetingId: string, userId: string): Promise<FocusRecordItem[]> {
    let records = memoryStore.focusRecords.filter((r) => r.meeting === meetingId && r.user === userId);
    if (isMongoReady() && mongoose.Types.ObjectId.isValid(meetingId) && mongoose.Types.ObjectId.isValid(userId)) {
      try {
        const dbRecords = await FocusRecord.find({
          meeting: new mongoose.Types.ObjectId(meetingId),
          user: new mongoose.Types.ObjectId(userId),
        });
        if (dbRecords.length > 0) {
          records = dbRecords.map((r) => ({
            _id: r._id.toString(),
            meeting: r.meeting.toString(),
            user: r.user.toString(),
            timestamp: r.timestamp,
            focusScore: r.focusScore,
            category: r.category,
            details: r.details,
          }));
        }
      } catch (err) {
        // fallback
      }
    }
    return records;
  },
};
