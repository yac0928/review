import fs from 'fs';
import path from 'path';

const MODEL_NAME = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const BATCH_SIZE = 32;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pipeline: any = null;

async function getPipeline() {
  if (!_pipeline) {
    const { pipeline, env } = await import('@xenova/transformers');
    env.cacheDir = path.resolve(__dirname, '../../models');
    console.log('[Embedder] Loading local model (first run will download ~450MB)...');
    _pipeline = await pipeline('feature-extraction', MODEL_NAME);
    console.log('[Embedder] Model ready.');
  }
  return _pipeline;
}

interface EmbeddingCache {
  model: string;
  embeddings: Record<string, number[]>;
}

function loadCache(cachePath: string): EmbeddingCache {
  if (!fs.existsSync(cachePath)) return { model: MODEL_NAME, embeddings: {} };
  const cached: EmbeddingCache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  if (cached.model !== MODEL_NAME) {
    console.log(`[Embedder] Model changed (${cached.model} → ${MODEL_NAME}), cache cleared`);
    return { model: MODEL_NAME, embeddings: {} };
  }
  return cached;
}

function saveCache(cachePath: string, cache: EmbeddingCache) {
  fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf-8');
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const pipe = await getPipeline();
  const output = await pipe(texts, { pooling: 'mean', normalize: true });
  // output is a Tensor of shape [batch, dims] or single Tensor if batch=1
  const data: Float32Array = output.data;
  const dims = data.length / texts.length;
  return Array.from({ length: texts.length }, (_, i) =>
    Array.from(data.slice(i * dims, (i + 1) * dims))
  );
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

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const vecs = await embedBatch(batch);
    for (let j = 0; j < batch.length; j++) {
      computed[batch[j]] = vecs[j];
      if (cache) cache.embeddings[batch[j]] = vecs[j];
    }
    if (cache && cachePath) saveCache(cachePath, cache);
    if (i + BATCH_SIZE < missing.length) {
      process.stdout.write(`[Embedder] ${Math.min(i + BATCH_SIZE, missing.length)}/${missing.length} embedded\r`);
    }
  }

  if (missing.length > 0) process.stdout.write('\n');
  if (cache && cachePath && missing.length > 0) saveCache(cachePath, cache);

  return texts.map(t => (cache ? cache.embeddings[t] : computed[t]));
}
