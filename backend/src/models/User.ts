import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  username: string;
  email: string;
  passwordHash: string;
  displayName: string;
  avatar: string;
  studentId?: string;
  role: 'host' | 'student';
  status: 'online' | 'in-meeting' | 'offline';
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true },
    avatar: { type: String, default: '' },
    studentId: { type: String, sparse: true, unique: true, trim: true },
    role: { type: String, enum: ['host', 'student'], default: 'student' },
    status: { type: String, enum: ['online', 'in-meeting', 'offline'], default: 'online' },
  },
  { timestamps: true }
);

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
