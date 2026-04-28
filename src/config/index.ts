import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const config = {
  geminiApiKey: requireEnv('GEMINI_API_KEY'),
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
  port: parseInt(process.env.PORT ?? '3000', 10),
  dataDir: path.resolve(__dirname, '../../data'),
  outputDir: path.resolve(__dirname, '../../output'),
};
