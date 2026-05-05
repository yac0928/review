import { GoogleGenerativeAI, GenerationConfig } from '@google/generative-ai';
import { config } from '../config';

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

const JSON_GENERATION_CONFIG: GenerationConfig = {
  responseMimeType: 'application/json',
  temperature: 0.1,
};

const TEXT_GENERATION_CONFIG: GenerationConfig = {
  temperature: 0.2,
};

const MAX_RETRIES = 8;
const BASE_DELAY_MS = 20_000; // 429 retry hints suggest ~19s

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Extracts retryDelay seconds from a 429 error if the API provides one.
function parseRetryDelay(err: unknown): number {
  if (err && typeof err === 'object' && 'errorDetails' in err) {
    const details = (err as { errorDetails?: unknown[] }).errorDetails ?? [];
    for (const d of details) {
      if (d && typeof d === 'object' && '@type' in d) {
        const typed = d as Record<string, unknown>;
        if (
          typed['@type'] === 'type.googleapis.com/google.rpc.RetryInfo' &&
          typeof typed.retryDelay === 'string'
        ) {
          const seconds = parseInt(typed.retryDelay, 10);
          if (!isNaN(seconds)) return (seconds + 2) * 1000;
        }
      }
    }
  }
  return BASE_DELAY_MS;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err
          ? (err as { status: number }).status
          : null;

      const isRetryable = status === 429 || status === 503;

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = status === 429
          ? parseRetryDelay(err)
          : BASE_DELAY_MS * Math.pow(1.5, attempt - 1); // exponential backoff for 503
        console.warn(`[Gemini] ${status} error. Retry ${attempt}/${MAX_RETRIES - 1} in ${Math.round(delay / 1000)}s...`);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

export async function callGeminiJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  modelName = config.geminiModel
): Promise<T> {
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    generationConfig: JSON_GENERATION_CONFIG,
  });

  const text = await withRetry(async () => {
    const result = await model.generateContent(userPrompt);
    return result.response.text();
  });

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Gemini returned invalid JSON:\n${text.slice(0, 500)}`);
  }
}

export async function callGeminiText(
  systemPrompt: string,
  userPrompt: string,
  modelName = config.geminiModel
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    generationConfig: TEXT_GENERATION_CONFIG,
  });

  return withRetry(async () => {
    const result = await model.generateContent(userPrompt);
    return result.response.text();
  });
}
