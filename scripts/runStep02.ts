/**
 * CLI runner for Step 2: Annotate Idea Units (criteria + sub_criteria + hashtags).
 * Reads from output/{id}.json (produced by Step 1) and updates it in-place.
 *
 * Single candidate (PowerShell):
 *   $env:CANDIDATE_ID="1"; npm run step2
 *
 * Batch — all files currently in output/:
 *   npm run step2
 */
import fs from 'fs';
import path from 'path';
import { config } from '../src/config';
import { annotateCandidate, loadCandidate, saveCandidate } from '../src/services/annotator';

const BATCH_DELAY_MS = 3_000;

async function processSingle(candidateId: string) {
  const candidate = loadCandidate(config.outputDir, candidateId);
  await annotateCandidate(candidate);
  saveCandidate(config.outputDir, candidate);
  console.log(`\nDone. [${candidateId}] annotation complete.`);
}

async function processBatch() {
  if (!fs.existsSync(config.outputDir)) {
    console.error(`Output directory not found: ${config.outputDir}. Run Step 1 first.`);
    process.exit(1);
  }

  const files = fs.readdirSync(config.outputDir).filter(f => f.endsWith('.json'));
  console.log(`Found ${files.length} candidate(s) to annotate`);

  for (let i = 0; i < files.length; i++) {
    const candidateId = path.basename(files[i], '.json');
    try {
      await processSingle(candidateId);
    } catch (err) {
      console.error(`[Error] ${files[i]}:`, err);
    }
    if (i < files.length - 1) {
      console.log(`[Batch] Waiting ${BATCH_DELAY_MS / 1000}s before next candidate...`);
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }
  console.log('\nBatch annotation complete.');
}

async function main() {
  const args = process.argv.slice(2);
  const candidateId =
    process.env.CANDIDATE_ID ??
    args.find(a => a.startsWith('--id='))?.split('=')[1];

  if (candidateId) {
    await processSingle(candidateId);
  } else {
    await processBatch();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
