/**
 * CLI runner for Step 7: Candidate Clustering + UMAP visualization.
 *
 * Runs K-Means and GMM on candidate feature vectors, picks the winner by
 * silhouette score, assigns cluster_id / is_medoid to each candidate, and
 * generates output/clusters.json + output/umap.html.
 *
 * Usage:
 *   npm run step7
 *   npm run step7:mock
 *
 * Options (env vars):
 *   MIN_K   minimum K to try (default: 2)
 *   MAX_K   maximum K to try (default: 6)
 */
import { config } from '../src/config';
import { clusterCandidates, ClusterSummary } from '../src/services/candidateClusterer';
import { CRITERIA, CriterionId } from '../src/types';

function printSummary(summary: ClusterSummary) {
  console.log('\n══════════════════════════════════════');
  console.log(`  Clustering Summary — ${summary.algorithm.toUpperCase()} K=${summary.k}`);
  console.log(`  Silhouette Score: ${summary.silhouette.toFixed(4)}`);
  console.log('══════════════════════════════════════');
  for (const c of summary.clusters) {
    console.log(`\n  Cluster ${c.cluster_id} (${c.size} candidates, medoid: ${c.medoid})`);
    for (const id of c.members) {
      const marker = id === c.medoid ? ' ★' : '';
      console.log(`    · ${id}${marker}`);
    }
  }
  console.log('\n══════════════════════════════════════\n');
}

async function main() {
  const minK = parseInt(process.env.MIN_K ?? '2', 10);
  const maxK = parseInt(process.env.MAX_K ?? '6', 10);

  console.log(`[Step 7] Clustering candidates (K range: ${minK}–${maxK})`);
  console.log(`[Step 7] Reading from: ${config.outputDir}`);

  const summary = await clusterCandidates(config.outputDir, minK, maxK);
  printSummary(summary);
}

main().catch(err => {
  console.error('[Step 7] Fatal error:', err);
  process.exit(1);
});
