import fs from 'fs';
import path from 'path';
import { callGeminiJSON } from './gemini';
import { embedTexts } from './embedder';
import { findBestK, perSampleSilhouetteScores } from '../utils/kmeans';
import { CLUSTER_NAMING_SYSTEM_PROMPT, buildAllClustersNamingPrompt } from '../prompts/clusterNaming';
import { Candidate, CriterionId, StandardSubCriteria, StandardDictionary, CRITERIA } from '../types';

const INTER_CRITERION_DELAY_MS = 2_000;
// Labels with per-sample silhouette below this go to the "others" bucket
const OUTLIER_SILHOUETTE_THRESHOLD = 0.0;

// ── Step 3a: collect raw labels per criterion ──────────────────────────────

interface LabelEntry {
  label: string;
  count: number;
}

function collectRawLabels(
  outputDir: string
): Record<CriterionId, LabelEntry[]> {
  const EXCLUDED = new Set(['standard_dictionary.json', 'embeddings_cache.json']);
  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.json') && !EXCLUDED.has(f));
  const freq: Partial<Record<CriterionId, Map<string, number>>> = {};

  for (const criterionId of Object.keys(CRITERIA) as CriterionId[]) {
    freq[criterionId] = new Map();
  }

  for (const file of files) {
    const candidate: Candidate = JSON.parse(
      fs.readFileSync(path.join(outputDir, file), 'utf-8')
    );

    for (const unit of candidate.idea_units) {
      for (const [criterionId, rawLabel] of Object.entries(unit.sub_criteria_map)) {
        if (!rawLabel) continue;
        const map = freq[criterionId as CriterionId]!;
        map.set(rawLabel, (map.get(rawLabel) ?? 0) + 1);
      }
    }
  }

  const result: Record<CriterionId, LabelEntry[]> = {} as Record<CriterionId, LabelEntry[]>;
  for (const criterionId of Object.keys(CRITERIA) as CriterionId[]) {
    result[criterionId] = Array.from(freq[criterionId]!.entries()).map(
      ([label, count]) => ({ label, count })
    );
  }
  return result;
}

// ── Step 3c: name all clusters in one LLM call ────────────────────────────

async function nameAllClusters(
  criterionId: CriterionId,
  clusters: Array<{ labels: string[] }>
): Promise<string[]> {
  const userPrompt = buildAllClustersNamingPrompt(criterionId, clusters);
  const result = await callGeminiJSON<{ names: string[] }>(
    CLUSTER_NAMING_SYSTEM_PROMPT,
    userPrompt
  );
  if (!Array.isArray(result?.names) || result.names.length !== clusters.length) {
    throw new Error(
      `Cluster naming returned invalid result for ${criterionId}: expected ${clusters.length} names, got ${JSON.stringify(result)}`
    );
  }
  return result.names.map((n: string) => n.trim());
}

// ── Step 3 main orchestrator ───────────────────────────────────────────────

export async function buildStandardDictionary(
  outputDir: string,
  minK = 3,
  maxK = 10
): Promise<StandardDictionary> {
  console.log('\n[Step 3] Collecting raw sub-criteria labels from output files...');
  const rawByC = collectRawLabels(outputDir);

  // Resume: load existing dictionary so completed criteria are skipped
  let dictionary: StandardDictionary = {};
  const dictPath = path.join(outputDir, 'standard_dictionary.json');
  if (fs.existsSync(dictPath)) {
    dictionary = JSON.parse(fs.readFileSync(dictPath, 'utf-8')) as StandardDictionary;
    console.log('[Step 3] Found existing dictionary — will skip completed criteria.');
  }
  const criteria = Object.keys(CRITERIA) as CriterionId[];

  for (let ci = 0; ci < criteria.length; ci++) {
    const criterionId = criteria[ci];
    const entries = rawByC[criterionId];

    console.log(`\n[Step 3] ${criterionId}: ${entries.length} unique labels`);

    if (dictionary[criterionId] !== undefined) {
      console.log(`[Step 3] ${criterionId}: already in dictionary, skipping`);
      continue;
    }

    if (entries.length === 0) {
      console.warn(`[Step 3] ${criterionId}: no labels found, skipping`);
      dictionary[criterionId] = [];
      continue;
    }

    // Step 3b: embed + cluster
    console.log(`[Step 3] ${criterionId}: embedding ${entries.length} labels...`);
    const labels = entries.map(e => e.label);
    const cachePath = path.join(outputDir, 'embeddings_cache.json');
    const embeddings = await embedTexts(labels, cachePath);

    console.log(`[Step 3] ${criterionId}: finding best K (${minK}–${maxK})...`);
    const { k, result: clusterResult } = findBestK(embeddings, minK, maxK);
    console.log(`[Step 3] ${criterionId}: best K=${k}`);

    // Identify outliers via per-sample silhouette
    const sampleScores = perSampleSilhouetteScores(embeddings, clusterResult.labels);
    const outlierLabels: string[] = [];
    const mainClusterMap: Map<number, string[]> = new Map();

    for (let i = 0; i < labels.length; i++) {
      if (sampleScores[i] < OUTLIER_SILHOUETTE_THRESHOLD) {
        outlierLabels.push(labels[i]);
      } else {
        const cid = clusterResult.labels[i];
        if (!mainClusterMap.has(cid)) mainClusterMap.set(cid, []);
        mainClusterMap.get(cid)!.push(labels[i]);
      }
    }

    // Remove empty clusters (all members became outliers)
    const mainClusters = Array.from(mainClusterMap.entries())
      .filter(([, clusterLabels]) => clusterLabels.length > 0)
      .sort(([a], [b]) => a - b)
      .map(([, clusterLabels]) => ({ labels: clusterLabels }));

    console.log(`[Step 3] ${criterionId}: ${mainClusters.length} main cluster(s), ${outlierLabels.length} outlier(s)`);

    const subCriteria: StandardSubCriteria[] = [];

    if (mainClusters.length > 0) {
      console.log(`[Step 3] Naming all ${mainClusters.length} cluster(s) for ${criterionId}...`);
      const names = await nameAllClusters(criterionId, mainClusters);

      for (let si = 0; si < mainClusters.length; si++) {
        const subId = `${criterionId}_S${si + 1}`;
        console.log(`  → ${subId}: "${names[si]}" (${mainClusters[si].labels.length} labels)`);
        subCriteria.push({ id: subId, name: names[si], raw_labels: mainClusters[si].labels });
      }
    }

    // Append "others" bucket for outliers
    if (outlierLabels.length > 0) {
      const othersId = `${criterionId}_others`;
      console.log(`  → ${othersId}: "其他面向" (${outlierLabels.length} labels)`);
      subCriteria.push({ id: othersId, name: '其他面向', raw_labels: outlierLabels });
    }

    dictionary[criterionId] = subCriteria;

    // Save incrementally so partial results are visible even if a later criterion fails
    saveStandardDictionary(outputDir, dictionary);

    if (ci < criteria.length - 1) {
      await new Promise(r => setTimeout(r, INTER_CRITERION_DELAY_MS));
    }
  }

  return dictionary;
}

export function saveStandardDictionary(
  outputDir: string,
  dictionary: StandardDictionary
): string {
  const filePath = path.join(outputDir, 'standard_dictionary.json');
  fs.writeFileSync(filePath, JSON.stringify(dictionary, null, 2), 'utf-8');
  console.log(`\n[Step 3] Standard dictionary saved → ${filePath}`);
  return filePath;
}

export function loadStandardDictionary(outputDir: string): StandardDictionary {
  const filePath = path.join(outputDir, 'standard_dictionary.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Standard dictionary not found: ${filePath}. Run Step 3 first.`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as StandardDictionary;
}
