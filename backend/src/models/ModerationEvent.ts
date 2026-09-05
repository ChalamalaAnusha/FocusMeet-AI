import mongoose, { Schema, Document } from 'mongoose';

export interface IModerationEvent extends Document {
  _id: mongoose.Types.ObjectId;
  meeting: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  username: string;
  source: 'chat' | 'voice';
  violationType: 'profanity' | 'harassment' | 'hate_speech' | 'disruption';
  snippet: string;
  confidence: number;
  actionTaken: 'flagged' | 'warned' | 'muted' | 'kicked' | 'blocked';
  timestamp: Date;
}

const ModerationEventSchema = new Schema<IModerationEvent>(
  {
    meeting: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    username: { type: String, required: true },
    source: { type: String, enum: ['chat', 'voice'], required: true },
    violationType: {
      type: String,
      enum: ['profanity', 'harassment', 'hate_speech', 'disruption'],
      default: 'profanity',
    },
    snippet: { type: String, required: true },
    confidence: { type: Number, default: 0.95 },
    actionTaken: {
      type: String,
      enum: ['flagged', 'warned', 'muted', 'kicked', 'blocked'],
      default: 'warned',
    },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const ModerationEvent =
  mongoose.models.ModerationEvent || mongoose.model<IModerationEvent>('ModerationEvent', ModerationEventSchema);
