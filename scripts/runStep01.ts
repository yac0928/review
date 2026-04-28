/**
 * CLI runner for Step 0 + Step 1.
 *
 * Batch (all files in data/):
 *   npm run pipeline
 *
 * Single file (PowerShell):
 *   $env:CANDIDATE_ID="1"; $env:CANDIDATE_FILE="data/1.txt"; npm run pipeline
 *
 * Single file (bash/cmd):
 *   CANDIDATE_ID=1 CANDIDATE_FILE=data/1.txt npm run pipeline
 */
import fs from 'fs';
import path from 'path';
import { config } from '../src/config';
import { splitIdeaUnits } from '../src/services/ideaUnitSplitter';
import { Candidate } from '../src/types';

const BATCH_DELAY_MS = 3_000; // courtesy delay between files to avoid rate limits

function saveOutput(candidateId: string, candidate: Candidate) {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }
  const outPath = path.join(config.outputDir, `${candidateId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(candidate, null, 2), 'utf-8');
  console.log(`[Output] Saved → ${outPath}`);
}

async function processSingle(candidateId: string, filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const candidate = await splitIdeaUnits(filePath, candidateId);
  saveOutput(candidateId, candidate);
  console.log(`\nDone. ${candidate.idea_units.length} Idea Units extracted for [${candidateId}]`);
}

async function processBatch() {
  if (!fs.existsSync(config.dataDir)) {
    console.error(`Data directory not found: ${config.dataDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(config.dataDir).filter(f => f.endsWith('.txt'));
  console.log(`Found ${files.length} file(s) in ${config.dataDir}`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const candidateId = path.basename(file, '.txt');
    const filePath = path.join(config.dataDir, file);
    try {
      const candidate = await splitIdeaUnits(filePath, candidateId);
      saveOutput(candidateId, candidate);
    } catch (err) {
      console.error(`[Error] ${file}:`, err);
    }
    if (i < files.length - 1) {
      console.log(`[Batch] Waiting ${BATCH_DELAY_MS / 1000}s before next file...`);
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }
  console.log('\nBatch complete.');
}

async function main() {
  // Support both env vars (PowerShell-friendly) and CLI args
  const args = process.argv.slice(2);
  const idArg =
    process.env.CANDIDATE_ID ??
    args.find(a => a.startsWith('--id='))?.split('=')[1];
  const fileArg =
    process.env.CANDIDATE_FILE ??
    args.find(a => a.startsWith('--file='))?.split('=')[1];

  if (idArg && fileArg) {
    await processSingle(idArg, fileArg);
  } else {
    await processBatch();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
