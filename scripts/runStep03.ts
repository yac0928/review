/**
 * CLI runner for Step 3: Sub-criteria convergence (Hybrid Clustering).
 *
 * Reads all annotated candidates from output/ (produced by Step 2),
 * embeds raw sub-criteria labels, clusters them per Criterion,
 * and asks LLM to name each cluster → writes output/standard_dictionary.json.
 *
 * Usage:
 *   npm run step3
 *
 * Options (env vars):
 *   MIN_K   minimum number of clusters to try (default: 3)
 *   MAX_K   maximum number of clusters to try (default: 10)
 *
 * After this step runs, **human review** is recommended:
 *   1. Open output/standard_dictionary.json
 *   2. Rename any cluster name that doesn't fit
 *   3. Save — the file is used as-is by Steps 4 and 5
 */
import { config } from '../src/config';
import { buildStandardDictionary, saveStandardDictionary } from '../src/services/subCriteriaClusterer';
import { StandardDictionary, CRITERIA, CriterionId } from '../src/types';

function printDictionarySummary(dict: StandardDictionary) {
  console.log('\n══════════════════════════════════════');
  console.log('  Standard Dictionary Summary');
  console.log('══════════════════════════════════════');

  for (const criterionId of Object.keys(CRITERIA) as CriterionId[]) {
    const subs = dict[criterionId] ?? [];
    console.log(`\n${criterionId} — ${CRITERIA[criterionId]}`);
    for (const sub of subs) {
      console.log(`  [${sub.id}] ${sub.name} (${sub.raw_labels.length} raw labels)`);
      for (const label of sub.raw_labels) {
        console.log(`        · ${label}`);
      }
    }
  }

  console.log('\n══════════════════════════════════════');
  console.log('Review output/standard_dictionary.json and edit names if needed.');
  console.log('Then run Step 4 (Relabeling).');
  console.log('══════════════════════════════════════\n');
}

async function main() {
  const minK = parseInt(process.env.MIN_K ?? '3', 10);
  const maxK = parseInt(process.env.MAX_K ?? '10', 10);

  console.log(`[Step 3] Starting Sub-criteria convergence (K range: ${minK}–${maxK})`);
  console.log(`[Step 3] Reading from: ${config.outputDir}`);

  const dictionary = await buildStandardDictionary(config.outputDir, minK, maxK);
  saveStandardDictionary(config.outputDir, dictionary);
  printDictionarySummary(dictionary);
}

main().catch(err => {
  console.error('[Step 3] Fatal error:', err);
  process.exit(1);
});
