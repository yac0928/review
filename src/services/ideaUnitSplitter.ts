import { v4 as uuidv4 } from 'uuid';
import { callGeminiJSON } from './gemini';
import { readAndPreprocess } from './preprocessor';
import { IDEA_UNIT_SYSTEM_PROMPT, buildUserPrompt } from '../prompts/ideaUnitSplit';
import { RawIdeaUnit, IdeaUnit, SectionType, Candidate } from '../types';

const VALID_SECTIONS: SectionType[] = ['自傳', '讀書計畫', '加分文件', '其他'];

function validateSection(section: unknown): SectionType {
  if (typeof section === 'string' && VALID_SECTIONS.includes(section as SectionType)) {
    return section as SectionType;
  }
  return '其他';
}

function toIdeaUnits(raw: RawIdeaUnit[], candidateId: string): IdeaUnit[] {
  return raw
    .filter(u => typeof u.content === 'string' && u.content.trim().length > 10)
    .map(u => ({
      id: uuidv4(),
      candidate_id: candidateId,
      section: validateSection(u.section),
      content: u.content.trim(),
      criteria: [],
      sub_criteria_map: {},
      hashtags: [],
    }));
}

export async function splitIdeaUnits(
  filePath: string,
  candidateId: string
): Promise<Candidate> {
  console.log(`[Step 0] Preprocessing: ${filePath}`);
  const cleanedText = readAndPreprocess(filePath);

  console.log(`[Step 1] Splitting into Idea Units: ${candidateId}`);
  const userPrompt = buildUserPrompt(cleanedText);

  const raw = await callGeminiJSON<RawIdeaUnit[]>(
    IDEA_UNIT_SYSTEM_PROMPT,
    userPrompt
  );

  if (!Array.isArray(raw)) {
    throw new Error(`Gemini returned unexpected structure for candidate ${candidateId}`);
  }

  const ideaUnits = toIdeaUnits(raw, candidateId);
  console.log(`[Step 1] ${candidateId}: ${ideaUnits.length} Idea Units extracted`);

  return {
    candidate_id: candidateId,
    source_files: [filePath],
    cleaned_text: cleanedText,
    idea_units: ideaUnits,
  };
}

export async function splitIdeaUnitsFromText(
  rawText: string,
  candidateId: string
): Promise<Candidate> {
  const { preprocessDocument } = await import('./preprocessor');
  const cleanedText = preprocessDocument(rawText);

  console.log(`[Step 1] Splitting into Idea Units: ${candidateId}`);
  const userPrompt = buildUserPrompt(cleanedText);

  const raw = await callGeminiJSON<RawIdeaUnit[]>(
    IDEA_UNIT_SYSTEM_PROMPT,
    userPrompt
  );

  if (!Array.isArray(raw)) {
    throw new Error(`Gemini returned unexpected structure for candidate ${candidateId}`);
  }

  const ideaUnits = toIdeaUnits(raw, candidateId);
  console.log(`[Step 1] ${candidateId}: ${ideaUnits.length} Idea Units extracted`);

  return {
    candidate_id: candidateId,
    source_files: [],
    cleaned_text: cleanedText,
    idea_units: ideaUnits,
  };
}
