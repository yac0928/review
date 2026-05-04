import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1_500;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 20_000;

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function embedOne(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: config.embeddingModel });
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.embedContent(text);
      return result.embedding.values;
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err
          ? (err as { status: number }).status
          : null;
      if ((status === 429 || status === 503) && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * attempt;
        console.warn(`[Embedder] ${status} — retry ${attempt}/${MAX_RETRIES - 1} in ${delay / 1000}s`);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
  throw new Error('Embedder: max retries exceeded');
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i++) {
    embeddings.push(await embedOne(texts[i]));
    if (i < texts.length - 1 && (i + 1) % BATCH_SIZE === 0) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return embeddings;
}
