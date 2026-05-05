/**
 * CLI runner for Step 8: Cluster Naming.
 *
 * For each cluster in clusters.json, collects top sub-criteria and hashtags,
 * then calls LLM to generate a 4-8 character Chinese cluster name.
 * Writes cluster_name to each candidate file and to clusters.json.
 *
 * Usage:
 *   npm run step8
 *   npm run step8:mock
 *
 * Re-running is safe — already-named clusters are skipped.
 */
import { config } from '../src/config';
import { nameAllClusters } from '../src/services/clusterNamer';

async function main() {
  console.log(`[Step 8] Reading from: ${config.outputDir}`);
  await nameAllClusters(config.outputDir);
}

main().catch(err => {
  console.error('[Step 8] Fatal error:', err);
  process.exit(1);
});
