/**
 * CLI runner for Step 6: Candidate Feature Vector Construction.
 *
 * Reads standard_dictionary.json and all candidate JSON files,
 * builds a L2-normalized sub-criteria count vector for each candidate,
 * and writes feature_vector + radar_chart_data back to each candidate file.
 *
 * Usage:
 *   npm run step6
 *   npm run step6:mock
 *
 * Re-running is safe — candidates that already have feature_vector are skipped.
 * To force rebuild, delete feature_vector from the candidate file or use FORCE=1.
 */
import { config } from '../src/config';
import { buildAllFeatureVectors } from '../src/services/featureBuilder';

async function main() {
  const force = process.env.FORCE === '1';
  if (force) console.log('[Step 6] FORCE mode — rebuilding all feature vectors');
  console.log(`[Step 6] Reading from: ${config.outputDir}`);
  await buildAllFeatureVectors(config.outputDir);
}

main().catch(err => {
  console.error('[Step 6] Fatal error:', err);
  process.exit(1);
});
