export type SectionType = '自傳' | '讀書計畫' | '加分文件' | '其他';

export type CriterionId = 'C1' | 'C2' | 'C3' | 'C4';

export const CRITERIA: Record<CriterionId, string> = {
  C1: '學術根基與跨域修課表現',
  C2: '專題實作與技術應用能力',
  C3: '問題解決與批判性思考',
  C4: '專業傳遞與自我成長規劃',
};

export interface RawIdeaUnit {
  section: SectionType;
  content: string;
}

export interface IdeaUnit {
  id: string;
  candidate_id: string;
  section: SectionType;
  content: string;
  // Filled in Step 2:
  criteria: CriterionId[];
  sub_criteria_map: Partial<Record<CriterionId, string>>;
  hashtags: string[];
  // Filled in Step 4:
  standard_sub_criteria_map?: Partial<Record<CriterionId, string>>;
  // Filled later:
  embedding?: number[];
}

export interface Candidate {
  candidate_id: string;
  source_files: string[];
  raw_text?: string;
  cleaned_text?: string;
  idea_units: IdeaUnit[];
  // Filled in Step 6:
  feature_vector?: number[];
  radar_chart_data?: Record<CriterionId, number>;
  // Filled in Step 7+:
  cluster_id?: number;
  cluster_name?: string;
  is_medoid?: boolean;
  distinctive_hashtags?: string[];
}

export interface PipelineResult {
  candidate_id: string;
  idea_unit_count: number;
  idea_units: IdeaUnit[];
}

export interface StandardSubCriteria {
  id: string;                 // e.g. "C1_S1"
  name: string;               // LLM-generated Chinese name, e.g. "跨域學科整合"
  raw_labels: string[];       // original raw labels that fall into this cluster
}

export type StandardDictionary = Partial<Record<CriterionId, StandardSubCriteria[]>>;
