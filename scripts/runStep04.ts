/**
 * CLI runner for Step 4: Relabeling — maps raw sub-criteria labels to standard names.
 *
 * Reads standard_dictionary.json (produced by Step 3) and updates all candidate
 * JSON files in-place, replacing raw sub-criteria labels with standard names.
 *
 * Batch (all files in output/):
 *   npm run step4
 *
 * Single candidate (PowerShell):
 *   $env:OUTPUT_DIR="output_mock"; $env:CANDIDATE_ID="mock_1"; npm run step4
 */
import { config } from '../src/config';
import { relabelAll } from '../src/services/relabeler';

async function main() {
  console.log(`[Step 4] Relabeling — reading from: ${config.outputDir}`);
  await relabelAll(config.outputDir);
}

main().catch(err => {
  console.error('[Step 4] Fatal error:', err);
  process.exit(1);
});
