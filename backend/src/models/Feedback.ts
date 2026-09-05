import mongoose, { Schema, Document } from 'mongoose';

export interface IFeedback extends Document {
  meeting: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  username: string;
  rating: number; // 1 to 5
  futureTopics: string;
  createdAt: Date;
}

const FeedbackSchema = new Schema<IFeedback>({
  meeting: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true, index: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  username: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  futureTopics: { type: String, default: '', trim: true },
  createdAt: { type: Date, default: Date.now },
});

// Ensure one feedback per student per meeting
FeedbackSchema.index({ meeting: 1, user: 1 }, { unique: true });

export const Feedback = mongoose.model<IFeedback>('Feedback', FeedbackSchema);
