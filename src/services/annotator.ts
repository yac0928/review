import fs from 'fs';
import path from 'path';
import { callGeminiJSON } from './gemini';
import { ANNOTATE_SYSTEM_PROMPT, buildAnnotateUserPrompt } from '../prompts/annotate';
import { IdeaUnit, CriterionId, Candidate } from '../types';

const BATCH_SIZE = 10;

interface AnnotationResult {
  id: string;
  criteria: CriterionId[];
  sub_criteria_map: Partial<Record<CriterionId, string>>;
  hashtags: string[];
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function annotateBatch(units: IdeaUnit[]): Promise<AnnotationResult[]> {
  const input = units.map(u => ({ id: u.id, content: u.content }));
  const userPrompt = buildAnnotateUserPrompt(input);

  const raw = await callGeminiJSON<AnnotationResult[]>(
    ANNOTATE_SYSTEM_PROMPT,
    userPrompt
  );

  if (!Array.isArray(raw)) {
    throw new Error('Annotator: Gemini returned non-array response');
  }
  return raw;
}

function applyAnnotations(units: IdeaUnit[], results: AnnotationResult[]): void {
  const resultMap = new Map(results.map(r => [r.id, r]));
  for (const unit of units) {
    const annotation = resultMap.get(unit.id);
    if (!annotation) {
      console.warn(`[Annotator] No annotation returned for unit ${unit.id}`);
      continue;
    }
    unit.criteria = annotation.criteria ?? [];
    unit.sub_criteria_map = annotation.sub_criteria_map ?? {};
    unit.hashtags = annotation.hashtags ?? [];
  }
}

export async function annotateCandidate(candidate: Candidate): Promise<void> {
  const units = candidate.idea_units;
  const total = units.length;
  let processed = 0;

  for (let i = 0; i < units.length; i += BATCH_SIZE) {
    const batch = units.slice(i, i + BATCH_SIZE);
    console.log(`[Step 2] ${candidate.candidate_id}: annotating units ${i + 1}-${Math.min(i + BATCH_SIZE, total)}/${total}`);

    const results = await annotateBatch(batch);
    applyAnnotations(batch, results);
    processed += batch.length;

    if (i + BATCH_SIZE < units.length) {
      await sleep(1500);
    }
  }

  console.log(`[Step 2] ${candidate.candidate_id}: done (${processed} units annotated)`);
}

export function loadCandidate(outputDir: string, candidateId: string): Candidate {
  const filePath = path.join(outputDir, `${candidateId}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Output file not found: ${filePath}. Run Step 1 first.`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Candidate;
}

export function saveCandidate(outputDir: string, candidate: Candidate): void {
  const filePath = path.join(outputDir, `${candidate.candidate_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(candidate, null, 2), 'utf-8');
  console.log(`[Output] Updated → ${filePath}`);
}
