/**
 * CLI runner for Step 9: Distinctive Hashtag Selection.
 *
 * For each candidate, uses LLM to select 3-4 hashtags that best represent
 * their technical strengths and special experiences for a CS grad school reviewer.
 * Writes distinctive_hashtags back to each candidate file.
 *
 * Usage:
 *   npm run step9
 *   npm run step9:mock
 *
 * Re-running is safe — candidates that already have distinctive_hashtags are skipped.
 */
import { config } from '../src/config';
import { buildDistinctiveHashtags } from '../src/services/hashtagDistinctifier';

async function main() {
  console.log(`[Step 9] Reading from: ${config.outputDir}`);
  await buildDistinctiveHashtags(config.outputDir);
}

main().catch(err => {
  console.error('[Step 9] Fatal error:', err);
  process.exit(1);
});
