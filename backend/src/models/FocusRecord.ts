import mongoose, { Schema, Document } from 'mongoose';

export interface IFocusRecord extends Document {
  _id: mongoose.Types.ObjectId;
  meeting: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  timestamp: Date;
  focusScore: number;
  category: 'focused' | 'moderate' | 'low' | 'distracted';
  details?: {
    faceDetected: boolean;
    ear?: number;
    headYaw?: number;
    headPitch?: number;
    gazeDirection?: string;
  };
}

const FocusRecordSchema = new Schema<IFocusRecord>(
  {
    meeting: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    timestamp: { type: Date, default: Date.now, index: true },
    focusScore: { type: Number, required: true },
    category: {
      type: String,
      enum: ['focused', 'moderate', 'low', 'distracted'],
      default: 'focused',
    },
    details: {
      faceDetected: { type: Boolean, default: true },
      ear: { type: Number },
      headYaw: { type: Number },
      headPitch: { type: Number },
      gazeDirection: { type: String },
    },
  },
  { timestamps: true }
);

export const FocusRecord = mongoose.models.FocusRecord || mongoose.model<IFocusRecord>('FocusRecord', FocusRecordSchema);
