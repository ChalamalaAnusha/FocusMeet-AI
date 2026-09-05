import mongoose, { Document, Schema } from 'mongoose';

export interface IStudyMaterial extends Document {
  _id: mongoose.Types.ObjectId;
  meeting: mongoose.Types.ObjectId;
  uploadedBy: mongoose.Types.ObjectId;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

const StudyMaterialSchema = new Schema<IStudyMaterial>(
  {
    meeting: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true, index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true, unique: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { timestamps: true }
);

export const StudyMaterial = mongoose.models.StudyMaterial || mongoose.model<IStudyMaterial>('StudyMaterial', StudyMaterialSchema);