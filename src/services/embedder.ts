import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1_500;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 20_000;

interface EmbeddingCache {
  model: string;
  embeddings: Record<string, number[]>;
}

function loadCache(cachePath: string): EmbeddingCache {
  if (!fs.existsSync(cachePath)) return { model: config.embeddingModel, embeddings: {} };
  const cached: EmbeddingCache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  if (cached.model !== config.embeddingModel) {
    console.log(`[Embedder] Model changed (${cached.model} → ${config.embeddingModel}), cache cleared`);
    return { model: config.embeddingModel, embeddings: {} };
  }
  return cached;
}

function saveCache(cachePath: string, cache: EmbeddingCache) {
  fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf-8');
}

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

export async function embedTexts(texts: string[], cachePath?: string): Promise<number[][]> {
  const cache = cachePath ? loadCache(cachePath) : null;

  const missing = cache
    ? texts.filter(t => !(t in cache.embeddings))
    : texts;

  if (cache && missing.length < texts.length) {
    console.log(`[Embedder] Cache hit: ${texts.length - missing.length}/${texts.length}, embedding ${missing.length} new`);
  }

  const computed: Record<string, number[]> = {};

  for (let i = 0; i < missing.length; i++) {
    const vec = await embedOne(missing[i]);
    computed[missing[i]] = vec;
    if (cache) {
      cache.embeddings[missing[i]] = vec;
      // Save after every batch so a crash doesn't lose progress
      if ((i + 1) % BATCH_SIZE === 0 && cachePath) saveCache(cachePath, cache);
    }
    if (i < missing.length - 1 && (i + 1) % BATCH_SIZE === 0) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  if (cache && cachePath && missing.length > 0) saveCache(cachePath, cache);

  return texts.map(t => cache ? cache.embeddings[t] : computed[t]);
}
