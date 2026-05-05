import fs from 'fs';
import path from 'path';
import { Candidate, CriterionId, StandardDictionary } from '../types';
import { loadStandardDictionary } from './subCriteriaClusterer';

interface ReverseMap {
  rawToStandard: Map<string, Map<string, string>>; // criterionId → rawLabel → standardName
  standardNames: Map<string, Set<string>>;          // criterionId → set of standard names
}

function buildReverseMap(dictionary: StandardDictionary): ReverseMap {
  const rawToStandard = new Map<string, Map<string, string>>();
  const standardNames = new Map<string, Set<string>>();

  for (const [criterionId, subList] of Object.entries(dictionary)) {
    const labelMap = new Map<string, string>();
    const nameSet = new Set<string>();

    for (const sub of subList ?? []) {
      nameSet.add(sub.name);
      for (const rawLabel of sub.raw_labels) {
        labelMap.set(rawLabel, sub.name);
      }
    }

    rawToStandard.set(criterionId, labelMap);
    standardNames.set(criterionId, nameSet);
  }

  return { rawToStandard, standardNames };
}

interface RelabelResult {
  updated: number;
  alreadyStandard: number;
  unmapped: string[];
}

export function relabelCandidate(
  candidate: Candidate,
  reverseMap: ReverseMap
): RelabelResult {
  let updated = 0;
  let alreadyStandard = 0;
  const unmapped: string[] = [];

  for (const unit of candidate.idea_units) {
    if (!unit.standard_sub_criteria_map) unit.standard_sub_criteria_map = {};

    for (const criterionId of Object.keys(unit.sub_criteria_map) as CriterionId[]) {
      const rawLabel = unit.sub_criteria_map[criterionId];
      if (!rawLabel) continue;

      // Already written — skip
      if (unit.standard_sub_criteria_map[criterionId]) {
        alreadyStandard++;
        continue;
      }

      const standardName = reverseMap.rawToStandard.get(criterionId)?.get(rawLabel);
      if (standardName) {
        unit.standard_sub_criteria_map[criterionId] = standardName;
        updated++;
      } else {
        unmapped.push(`${criterionId}: "${rawLabel}"`);
      }
    }
  }

  return { updated, alreadyStandard, unmapped };
}

export function loadCandidate(outputDir: string, candidateId: string): Candidate {
  const filePath = path.join(outputDir, `${candidateId}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Candidate;
}

export function saveCandidate(outputDir: string, candidate: Candidate) {
  const filePath = path.join(outputDir, `${candidate.candidate_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(candidate, null, 2), 'utf-8');
}

export async function relabelAll(outputDir: string): Promise<void> {
  const dictionary = loadStandardDictionary(outputDir);
  const reverseMap = buildReverseMap(dictionary);

  const EXCLUDED = new Set(['standard_dictionary.json', 'embeddings_cache.json', 'clusters.json']);
  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.json') && !EXCLUDED.has(f));

  console.log(`[Step 4] ${files.length} candidate(s) to relabel`);

  let totalUpdated = 0;
  let totalUnmapped = 0;

  for (const file of files) {
    const candidateId = path.basename(file, '.json');
    const candidate = loadCandidate(outputDir, candidateId);
    const { updated, alreadyStandard, unmapped } = relabelCandidate(candidate, reverseMap);

    if (unmapped.length > 0) {
      console.warn(`[Step 4] [${candidateId}] ${unmapped.length} unmapped label(s):`);
      for (const u of unmapped) console.warn(`    · ${u}`);
    }

    if (updated > 0) {
      saveCandidate(outputDir, candidate);
      console.log(`[Step 4] [${candidateId}] ${updated} label(s) updated, ${alreadyStandard} already standard`);
    } else if (alreadyStandard > 0) {
      console.log(`[Step 4] [${candidateId}] already relabeled, skipped`);
    }

    totalUpdated += updated;
    totalUnmapped += unmapped.length;
  }

  console.log(`\n[Step 4] Done. ${totalUpdated} label(s) updated across all candidates.`);
  if (totalUnmapped > 0) {
    console.warn(`[Step 4] Warning: ${totalUnmapped} unmapped label(s) — check standard_dictionary.json`);
  }
}
