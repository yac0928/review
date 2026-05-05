import fs from 'fs';
import path from 'path';
import { Candidate, CriterionId, CRITERIA, StandardDictionary } from '../types';
import { loadStandardDictionary } from './subCriteriaClusterer';

const EXCLUDED = new Set(['standard_dictionary.json', 'embeddings_cache.json', 'clusters.json']);

// Returns ordered list of sub-criteria IDs from the dictionary (C1 first, others last per criterion)
function buildSubCriteriaIndex(dictionary: StandardDictionary): string[] {
  const index: string[] = [];
  for (const criterionId of Object.keys(CRITERIA) as CriterionId[]) {
    for (const sub of dictionary[criterionId] ?? []) {
      index.push(sub.id);
    }
  }
  return index;
}

// Maps sub-criteria name → sub-criteria ID (for lookup during counting)
function buildNameToIdMap(dictionary: StandardDictionary): Map<string, string> {
  const map = new Map<string, string>();
  for (const subList of Object.values(dictionary)) {
    for (const sub of subList ?? []) {
      map.set(sub.name, sub.id);
    }
  }
  return map;
}

function l2Normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? v.slice() : v.map(x => x / norm);
}

function buildCandidateFeature(
  candidate: Candidate,
  index: string[],
  nameToId: Map<string, string>
): { vector: number[]; radar: Record<CriterionId, number> } {
  const counts = new Array(index.length).fill(0);
  const indexPos = new Map(index.map((id, i) => [id, i]));

  const radar: Record<CriterionId, number> = { C1: 0, C2: 0, C3: 0, C4: 0 };

  for (const unit of candidate.idea_units) {
    // Radar: count idea units per criterion
    for (const criterionId of unit.criteria) {
      radar[criterionId] = (radar[criterionId] ?? 0) + 1;
    }

    // Feature vector: count standard sub-criteria occurrences
    if (!unit.standard_sub_criteria_map) continue;
    for (const standardName of Object.values(unit.standard_sub_criteria_map)) {
      if (!standardName) continue;
      const subId = nameToId.get(standardName);
      if (!subId) continue;
      const pos = indexPos.get(subId);
      if (pos !== undefined) counts[pos]++;
    }
  }

  return { vector: l2Normalize(counts), radar };
}

function loadCandidate(outputDir: string, file: string): Candidate {
  return JSON.parse(fs.readFileSync(path.join(outputDir, file), 'utf-8')) as Candidate;
}

function saveCandidate(outputDir: string, candidate: Candidate) {
  fs.writeFileSync(
    path.join(outputDir, `${candidate.candidate_id}.json`),
    JSON.stringify(candidate, null, 2),
    'utf-8'
  );
}

export async function buildAllFeatureVectors(outputDir: string, force = false): Promise<void> {
  const dictionary = loadStandardDictionary(outputDir);
  const index = buildSubCriteriaIndex(dictionary);
  const nameToId = buildNameToIdMap(dictionary);

  console.log(`[Step 6] Sub-criteria index: ${index.length} dimensions`);
  console.log(`[Step 6] Dimensions: ${index.join(', ')}`);

  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.json') && !EXCLUDED.has(f));
  console.log(`[Step 6] Processing ${files.length} candidate(s)...\n`);

  let done = 0;
  let skipped = 0;

  for (const file of files) {
    const candidate = loadCandidate(outputDir, file);

    if (!force && candidate.feature_vector) {
      skipped++;
      continue;
    }

    const { vector, radar } = buildCandidateFeature(candidate, index, nameToId);
    candidate.feature_vector = vector;
    candidate.radar_chart_data = radar;

    saveCandidate(outputDir, candidate);
    done++;
  }

  console.log(`[Step 6] Done. ${done} candidate(s) updated, ${skipped} already had feature vectors.`);
}
