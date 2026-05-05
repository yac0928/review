import fs from 'fs';
import path from 'path';
import { Candidate } from '../types';
import { callGeminiJSON } from './gemini';
import {
  DISTINCTIVE_HASHTAGS_SYSTEM_PROMPT,
  buildDistinctiveHashtagsPrompt,
} from '../prompts/distinctiveHashtags';

const EXCLUDED = new Set(['standard_dictionary.json', 'embeddings_cache.json', 'clusters.json']);
const INTER_CANDIDATE_DELAY_MS = 1_000;

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function loadCandidates(outputDir: string): Candidate[] {
  const files = fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.json') && !EXCLUDED.has(f))
    .sort();
  return files.map(f => JSON.parse(fs.readFileSync(path.join(outputDir, f), 'utf-8')) as Candidate);
}

function saveCandidate(outputDir: string, candidate: Candidate) {
  fs.writeFileSync(
    path.join(outputDir, `${candidate.candidate_id}.json`),
    JSON.stringify(candidate, null, 2),
    'utf-8'
  );
}

function getRawHashtags(candidate: Candidate): string[] {
  const tags = new Set<string>();
  for (const unit of candidate.idea_units ?? []) {
    for (const tag of unit.hashtags ?? []) tags.add(tag);
  }
  return [...tags];
}

export async function buildDistinctiveHashtags(outputDir: string): Promise<void> {
  const candidates = loadCandidates(outputDir);

  let done = 0;
  let skipped = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    if (candidate.distinctive_hashtags && candidate.distinctive_hashtags.length > 0) {
      console.log(`[Step 9] [${candidate.candidate_id}] already done, skipping`);
      skipped++;
      continue;
    }

    const hashtags = getRawHashtags(candidate);
    if (hashtags.length === 0) {
      console.warn(`[Step 9] [${candidate.candidate_id}] no hashtags found, skipping`);
      skipped++;
      continue;
    }

    const userPrompt = buildDistinctiveHashtagsPrompt(hashtags);
    const result = await callGeminiJSON<{ distinctive_hashtags: string[] }>(
      DISTINCTIVE_HASHTAGS_SYSTEM_PROMPT,
      userPrompt
    );

    if (!Array.isArray(result?.distinctive_hashtags) || result.distinctive_hashtags.length === 0) {
      console.warn(`[Step 9] [${candidate.candidate_id}] invalid result, skipping`);
      skipped++;
      continue;
    }

    candidate.distinctive_hashtags = result.distinctive_hashtags.slice(0, 4);
    saveCandidate(outputDir, candidate);
    done++;

    console.log(`[Step 9] [${candidate.candidate_id}] → [${candidate.distinctive_hashtags.join(', ')}]`);

    if (i < candidates.length - 1) await sleep(INTER_CANDIDATE_DELAY_MS);
  }

  console.log(`\n[Step 9] Done. ${done} updated, ${skipped} skipped.`);
}
