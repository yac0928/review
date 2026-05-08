/**
 * Embedding-based relabeling for mock_101~135.
 *
 * For each idea unit, takes the raw label in sub_criteria_map,
 * embeds it, finds the closest standard sub-criteria description
 * (cosine similarity), and writes the result to standard_sub_criteria_map.
 *
 * Uses the embeddings cache — only new raw labels are re-computed.
 *
 * Usage:
 *   npm run relabel:embed
 *
 * Options:
 *   OUTPUT_DIR  (default: output_mock)
 *   MIN_ID / MAX_ID  numeric range of mock IDs to process (default: 101 / 135)
 */
import fs from 'fs';
import path from 'path';
import { Candidate, CriterionId, StandardDictionary } from '../src/types';
import { loadStandardDictionary } from '../src/services/subCriteriaClusterer';
import { embedTexts } from '../src/services/embedder';
import { config } from '../src/config';

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, x, i) => sum + x * b[i], 0);
  const normA = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const normB = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}

async function main() {
  const outputDir = config.outputDir;
  const cachePath = path.join(outputDir, 'embeddings_cache.json');
  const minId = parseInt(process.env.MIN_ID ?? '101', 10);
  const maxId = parseInt(process.env.MAX_ID ?? '135', 10);

  console.log(`[RelabelEmbed] Output dir: ${outputDir}`);
  console.log(`[RelabelEmbed] Processing mock_${minId} ~ mock_${maxId}`);

  // Load standard dictionary
  const dictionary = loadStandardDictionary(outputDir);

  // Build per-criterion sub-criteria list with desc texts
  const subsByC: Record<string, Array<{ name: string; descText: string }>> = {};
  const allDescTexts: string[] = [];
  const descMeta: Array<{ criterionId: string; name: string }> = [];

  for (const [criterionId, subs] of Object.entries(dictionary)) {
    subsByC[criterionId] = [];
    for (const sub of subs ?? []) {
      const descText = `${sub.name}：${sub.description}`;
      subsByC[criterionId].push({ name: sub.name, descText });
      allDescTexts.push(descText);
      descMeta.push({ criterionId, name: sub.name });
    }
  }

  // Filter target files
  const EXCLUDED = new Set(['standard_dictionary.json', 'embeddings_cache.json', 'clusters.json']);
  const files = fs.readdirSync(outputDir)
    .filter(f => {
      if (!f.endsWith('.json') || EXCLUDED.has(f)) return false;
      const m = f.match(/^mock_(\d+)\.json$/);
      if (!m) return false;
      const n = parseInt(m[1], 10);
      return n >= minId && n <= maxId;
    })
    .sort();

  console.log(`[RelabelEmbed] Found ${files.length} candidate file(s)`);
  if (files.length === 0) process.exit(0);

  // Load candidates and collect unique raw labels
  const candidates: Candidate[] = files.map(f =>
    JSON.parse(fs.readFileSync(path.join(outputDir, f), 'utf-8')) as Candidate
  );

  const rawLabelSet = new Set<string>();
  for (const candidate of candidates) {
    for (const unit of candidate.idea_units) {
      for (const rawLabel of Object.values(unit.sub_criteria_map)) {
        if (rawLabel) rawLabelSet.add(rawLabel);
      }
    }
  }

  const rawLabels = Array.from(rawLabelSet);
  console.log(`[RelabelEmbed] ${rawLabels.length} unique raw label(s), ${allDescTexts.length} sub-criteria description(s)`);

  // Embed everything (raw labels first, then desc texts)
  const allTexts = [...rawLabels, ...allDescTexts];
  console.log(`[RelabelEmbed] Embedding ${allTexts.length} texts (cache will be used for known texts)...`);
  const allEmbeddings = await embedTexts(allTexts, cachePath);

  // Build lookup maps
  const labelEmbMap = new Map<string, number[]>(
    rawLabels.map((label, i) => [label, allEmbeddings[i]])
  );

  const descEmbByC: Record<string, Array<{ name: string; emb: number[] }>> = {};
  for (const criterionId of Object.keys(subsByC)) {
    descEmbByC[criterionId] = [];
  }
  descMeta.forEach((meta, i) => {
    descEmbByC[meta.criterionId].push({
      name: meta.name,
      emb: allEmbeddings[rawLabels.length + i],
    });
  });

  // Assign standard sub-criteria for each candidate
  for (const candidate of candidates) {
    let updated = 0;

    for (const unit of candidate.idea_units) {
      if (!unit.standard_sub_criteria_map) unit.standard_sub_criteria_map = {};

      for (const [criterionId, rawLabel] of Object.entries(unit.sub_criteria_map) as [CriterionId, string][]) {
        if (!rawLabel) continue;

        const labelEmb = labelEmbMap.get(rawLabel);
        if (!labelEmb) continue;

        const descs = descEmbByC[criterionId];
        if (!descs || descs.length === 0) continue;

        let bestName = descs[0].name;
        let bestSim = -Infinity;
        for (const { name, emb } of descs) {
          const sim = cosineSimilarity(labelEmb, emb);
          if (sim > bestSim) { bestSim = sim; bestName = name; }
        }

        unit.standard_sub_criteria_map[criterionId] = bestName;
        updated++;
      }
    }

    fs.writeFileSync(
      path.join(outputDir, `${candidate.candidate_id}.json`),
      JSON.stringify(candidate, null, 2),
      'utf-8'
    );
    console.log(`[RelabelEmbed] ${candidate.candidate_id}: ${updated} unit(s) assigned`);
  }

  console.log('[RelabelEmbed] Done.');
}

main().catch(err => {
  console.error('[RelabelEmbed] Fatal error:', err);
  process.exit(1);
});
