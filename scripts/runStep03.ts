/**
 * CLI runner for Step 3: Sub-criteria convergence (LLM definition + embedding assignment).
 *
 * Reads all annotated candidates from output/ (produced by Step 2),
 * sends all raw sub-criteria labels per Criterion to LLM to define ≤10 standard sub-criteria,
 * then assigns each raw label to the closest sub-criterion via embedding similarity.
 * Writes output/standard_dictionary.json.
 *
 * Usage:
 *   npm run step3
 *
 * After this step runs, **human review** is recommended:
 *   1. Open output/standard_dictionary.json
 *   2. Rename any sub-criteria name/description that doesn't fit
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
  console.log(`[Step 3] Starting Sub-criteria convergence (LLM definition + embedding assignment)`);
  console.log(`[Step 3] Reading from: ${config.outputDir}`);

  const dictionary = await buildStandardDictionary(config.outputDir);
  saveStandardDictionary(config.outputDir, dictionary);
  printDictionarySummary(dictionary);
}

main().catch(err => {
  console.error('[Step 3] Fatal error:', err);
  process.exit(1);
});
