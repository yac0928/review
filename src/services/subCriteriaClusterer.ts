import fs from 'fs';
import path from 'path';
import { callGeminiJSON } from './gemini';
import { embedTexts } from './embedder';
import { findBestK } from '../utils/kmeans';
import { CLUSTER_NAMING_SYSTEM_PROMPT, buildClusterNamingPrompt } from '../prompts/clusterNaming';
import { Candidate, CriterionId, StandardSubCriteria, StandardDictionary, CRITERIA } from '../types';

const INTER_CRITERION_DELAY_MS = 2_000;
const INTER_CLUSTER_DELAY_MS = 1_500;

// ── Step 3a: collect raw labels per criterion ──────────────────────────────

interface LabelEntry {
  label: string;
  count: number;
}

function collectRawLabels(
  outputDir: string
): Record<CriterionId, LabelEntry[]> {
  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.json'));
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

// ── Step 3c: name a single cluster via LLM ─────────────────────────────────

async function nameCluster(
  criterionId: CriterionId,
  rawLabels: string[]
): Promise<string> {
  const userPrompt = buildClusterNamingPrompt(criterionId, rawLabels);
  const result = await callGeminiJSON<{ name: string }>(
    CLUSTER_NAMING_SYSTEM_PROMPT,
    userPrompt
  );
  if (typeof result?.name !== 'string' || result.name.trim().length === 0) {
    throw new Error(`Cluster naming returned invalid result for ${criterionId}`);
  }
  return result.name.trim();
}

// ── Step 3 main orchestrator ───────────────────────────────────────────────

export async function buildStandardDictionary(
  outputDir: string,
  minK = 2,
  maxK = 6
): Promise<StandardDictionary> {
  console.log('\n[Step 3] Collecting raw sub-criteria labels from output files...');
  const rawByC = collectRawLabels(outputDir);

  const dictionary: StandardDictionary = {};
  const criteria = Object.keys(CRITERIA) as CriterionId[];

  for (let ci = 0; ci < criteria.length; ci++) {
    const criterionId = criteria[ci];
    const entries = rawByC[criterionId];

    console.log(`\n[Step 3] ${criterionId}: ${entries.length} unique labels`);

    if (entries.length === 0) {
      console.warn(`[Step 3] ${criterionId}: no labels found, skipping`);
      dictionary[criterionId] = [];
      continue;
    }

    // Step 3b: embed + cluster
    console.log(`[Step 3] ${criterionId}: embedding ${entries.length} labels...`);
    const labels = entries.map(e => e.label);
    const embeddings = await embedTexts(labels);

    console.log(`[Step 3] ${criterionId}: finding best K (${minK}–${maxK})...`);
    const { k, result: clusterResult } = findBestK(embeddings, minK, maxK);
    console.log(`[Step 3] ${criterionId}: best K=${k}`);

    // Group labels by cluster
    const clusters: Map<number, string[]> = new Map();
    for (let i = 0; i < labels.length; i++) {
      const cid = clusterResult.labels[i];
      if (!clusters.has(cid)) clusters.set(cid, []);
      clusters.get(cid)!.push(labels[i]);
    }

    // Step 3c: name each cluster
    const subCriteria: StandardSubCriteria[] = [];

    const clusterEntries = Array.from(clusters.entries())
      .sort(([a], [b]) => a - b);

    for (let si = 0; si < clusterEntries.length; si++) {
      const [, clusterLabels] = clusterEntries[si];
      const subId = `${criterionId}_S${si + 1}`;

      console.log(`[Step 3] Naming cluster ${subId} (${clusterLabels.length} labels)...`);
      const name = await nameCluster(criterionId, clusterLabels);
      console.log(`  → ${subId}: "${name}"`);

      subCriteria.push({ id: subId, name, raw_labels: clusterLabels });

      if (si < clusterEntries.length - 1) {
        await new Promise(r => setTimeout(r, INTER_CLUSTER_DELAY_MS));
      }
    }

    dictionary[criterionId] = subCriteria;

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
