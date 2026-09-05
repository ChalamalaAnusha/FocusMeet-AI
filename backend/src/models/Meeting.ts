import mongoose, { Schema, Document } from 'mongoose';

export interface IMeeting extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  description: string;
  host: mongoose.Types.ObjectId;
  scheduledAt: Date;
  status: 'scheduled' | 'live' | 'ended';
  invitedUsers: mongoose.Types.ObjectId[];
  activeParticipants: mongoose.Types.ObjectId[];
  settings: {
    allowChat: boolean;
    aiFocusTracking: boolean;
    toxicityModeration: boolean;
  };
  startedAt?: Date;
  endedAt?: Date;
  distractionAlertCount: number;
  averageFocusScore?: number;
  createdAt: Date;
  updatedAt: Date;
}

const MeetingSchema = new Schema<IMeeting>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    host: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scheduledAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['scheduled', 'live', 'ended'], default: 'scheduled' },
    invitedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    activeParticipants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    settings: {
      allowChat: { type: Boolean, default: true },
      aiFocusTracking: { type: Boolean, default: true },
      toxicityModeration: { type: Boolean, default: true },
    },
    startedAt: { type: Date },
    endedAt: { type: Date },
    distractionAlertCount: { type: Number, default: 0 },
    averageFocusScore: { type: Number, default: 100 },
  },
  { timestamps: true }
);

export const Meeting = mongoose.models.Meeting || mongoose.model<IMeeting>('Meeting', MeetingSchema);
