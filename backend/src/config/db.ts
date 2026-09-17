import mongoose from 'mongoose';
import { MONGODB_URI } from './env.js';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      family: 4,
    });

    console.log(`[DB] Connected to MongoDB: ${conn.connection.host}`);
    return true;
  } catch (err) {
    console.warn(
      `[DB] Warning: MongoDB connection failed: ${(err as Error).message}. Running in memory fallback mode.`
    );
    return false;
  }
};