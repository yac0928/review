import fs from 'fs';
import path from 'path';
import { callGeminiJSON } from './gemini';
import { embedTexts } from './embedder';
import { SUB_CRITERIA_DEFINITION_SYSTEM_PROMPT, buildSubCriteriaDefinitionPrompt } from '../prompts/clusterNaming';
import { Candidate, CriterionId, StandardSubCriteria, StandardDictionary, CRITERIA } from '../types';

const INTER_CRITERION_DELAY_MS = 2_000;

// ── Step 3a: collect raw labels per criterion ──────────────────────────────

interface LabelEntry {
  label: string;
  count: number;
}

function collectRawLabels(outputDir: string): Record<CriterionId, LabelEntry[]> {
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
    result[criterionId] = Array.from(freq[criterionId]!.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }
  return result;
}

// ── Step 3b: LLM defines standard sub-criteria (Phase 1) ──────────────────

interface RawSubCriteriaDefinition {
  name: string;
  description: string;
}

async function defineSubCriteria(
  criterionId: CriterionId,
  entries: LabelEntry[]
): Promise<RawSubCriteriaDefinition[]> {
  const userPrompt = buildSubCriteriaDefinitionPrompt(criterionId, entries);
  const result = await callGeminiJSON<{ sub_criteria: RawSubCriteriaDefinition[] }>(
    SUB_CRITERIA_DEFINITION_SYSTEM_PROMPT,
    userPrompt
  );

  if (!Array.isArray(result?.sub_criteria) || result.sub_criteria.length === 0) {
    throw new Error(`Sub-criteria definition failed for ${criterionId}: ${JSON.stringify(result)}`);
  }

  return result.sub_criteria;
}

// ── Step 3c: embedding similarity assignment (Phase 2) ────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, x, i) => sum + x * b[i], 0);
  const normA = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const normB = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}

async function assignLabelsToSubCriteria(
  criterionId: CriterionId,
  entries: LabelEntry[],
  definitions: RawSubCriteriaDefinition[],
  cachePath: string
): Promise<StandardSubCriteria[]> {
  const labels = entries.map(e => e.label);
  const descTexts = definitions.map(d => `${d.name}：${d.description}`);

  const allEmbeddings = await embedTexts([...labels, ...descTexts], cachePath);
  const labelEmbeddings = allEmbeddings.slice(0, labels.length);
  const descEmbeddings = allEmbeddings.slice(labels.length);

  const buckets: string[][] = definitions.map(() => []);

  for (let i = 0; i < labels.length; i++) {
    let bestIdx = 0;
    let bestSim = -Infinity;
    for (let j = 0; j < descEmbeddings.length; j++) {
      const sim = cosineSimilarity(labelEmbeddings[i], descEmbeddings[j]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = j;
      }
    }
    buckets[bestIdx].push(labels[i]);
  }

  return definitions.map((def, i) => ({
    id: `${criterionId}_S${i + 1}`,
    name: def.name,
    description: def.description,
    raw_labels: buckets[i],
  }));
}

// ── Step 3 main orchestrator ───────────────────────────────────────────────

export async function buildStandardDictionary(outputDir: string): Promise<StandardDictionary> {
  console.log('\n[Step 3] Collecting raw sub-criteria labels from output files...');
  const rawByC = collectRawLabels(outputDir);

  let dictionary: StandardDictionary = {};
  const dictPath = path.join(outputDir, 'standard_dictionary.json');
  if (fs.existsSync(dictPath)) {
    dictionary = JSON.parse(fs.readFileSync(dictPath, 'utf-8')) as StandardDictionary;
    console.log('[Step 3] Found existing dictionary — will skip completed criteria.');
  }

  const cachePath = path.join(outputDir, 'embeddings_cache.json');
  const criteria = Object.keys(CRITERIA) as CriterionId[];

  for (let ci = 0; ci < criteria.length; ci++) {
    const criterionId = criteria[ci];
    const entries = rawByC[criterionId];

    console.log(`\n[Step 3] ${criterionId}: ${entries.length} raw labels`);

    // Phase 1 已完成但 Phase 2 未完成：raw_labels 全為空陣列
    const phase1Done =
      dictionary[criterionId] !== undefined &&
      dictionary[criterionId]!.every(sc => sc.raw_labels.length === 0);

    if (dictionary[criterionId] !== undefined && !phase1Done) {
      console.log(`[Step 3] ${criterionId}: already in dictionary, skipping`);
      continue;
    }

    if (entries.length === 0) {
      console.warn(`[Step 3] ${criterionId}: no labels found, skipping`);
      dictionary[criterionId] = [];
      continue;
    }

    let definitions: RawSubCriteriaDefinition[];

    if (phase1Done) {
      // 從 dictionary 還原 Phase 1 結果，直接跳到 Phase 2
      console.log(`[Step 3] ${criterionId}: Phase 1 already done, resuming Phase 2...`);
      definitions = dictionary[criterionId]!.map(sc => ({ name: sc.name, description: sc.description }));
    } else {
      // Phase 1: LLM看全部 raw labels，定義 ≤10 個標準 sub-criteria
      console.log(`[Step 3] ${criterionId}: defining standard sub-criteria via LLM (${entries.length} labels)...`);
      definitions = await defineSubCriteria(criterionId, entries);
      console.log(`[Step 3] ${criterionId}: ${definitions.length} sub-criteria defined`);
      for (const d of definitions) {
        console.log(`  · "${d.name}": ${d.description}`);
      }
      // Phase 1 完成，立刻存檔（raw_labels 暫為空，標記 Phase 2 待做）
      dictionary[criterionId] = definitions.map((def, i) => ({
        id: `${criterionId}_S${i + 1}`,
        name: def.name,
        description: def.description,
        raw_labels: [],
      }));
      saveStandardDictionary(outputDir, dictionary);
    }

    // Phase 2: embedding similarity 將每個 raw label 指派到最近的 sub-criteria
    console.log(`[Step 3] ${criterionId}: assigning labels via embedding similarity...`);
    const subCriteria = await assignLabelsToSubCriteria(criterionId, entries, definitions, cachePath);

    for (const sc of subCriteria) {
      console.log(`  → ${sc.id} "${sc.name}": ${sc.raw_labels.length} labels`);
    }

    dictionary[criterionId] = subCriteria;
    saveStandardDictionary(outputDir, dictionary);

    if (ci < criteria.length - 1) {
      await new Promise(r => setTimeout(r, INTER_CRITERION_DELAY_MS));
    }
  }

  return dictionary;
}

export function saveStandardDictionary(outputDir: string, dictionary: StandardDictionary): string {
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
