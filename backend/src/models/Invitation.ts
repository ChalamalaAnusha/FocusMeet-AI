import mongoose, { Schema, Document } from 'mongoose';

export interface IInvitation extends Document {
  _id: mongoose.Types.ObjectId;
  meeting: mongoose.Types.ObjectId;
  host: mongoose.Types.ObjectId;
  recipient: mongoose.Types.ObjectId;
  status: 'pending' | 'accepted' | 'declined';
  respondedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    meeting: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
    host: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
    respondedAt: { type: Date },
  },
  { timestamps: true }
);

InvitationSchema.index({ meeting: 1, recipient: 1 }, { unique: true });

export const Invitation = mongoose.models.Invitation || mongoose.model<IInvitation>('Invitation', InvitationSchema);
