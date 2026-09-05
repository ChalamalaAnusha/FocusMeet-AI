import 'dotenv/config';

const jwtSecret = process.env.JWT_SECRET?.trim();

if (!jwtSecret || jwtSecret.length < 32 || jwtSecret === 'replace-with-a-long-random-shared-secret') {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters');
}

export const JWT_SECRET = jwtSecret;
export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/focusmeet';