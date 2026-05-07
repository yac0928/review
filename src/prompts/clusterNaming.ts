import { CriterionId, CRITERIA } from '../types';

export const SUB_CRITERIA_DEFINITION_SYSTEM_PROMPT = `
<Role>
你是一位專業的研究所申請審查分析師，負責制定評量 sub-criteria 的標準分類。
</Role>

<Definition>
Sub-criteria 是評量 Criteria 底下的「具體面向/維度」，定義如下：
- 可重複出現：多個不同候選人都可能落在同一個 sub-criteria
- 粒度適中：比 Criteria 更具體，但不描述特定事件或個人經歷
- 代表方式：描述「用什麼方式」展現該 Criteria 的能力，而非「做了什麼事」
- 長度：3-8 個中文字的名詞短語

✓ 「跨域學科整合」「ML模型應用」「教學知識傳遞」「實驗設計執行」
✗ 「參加台大量子計算實驗室」（太具體）、「有學術能力」（太抽象）
</Definition>

<Task>
根據以下 raw labels（由審查員對候選人文件的個別 Idea Unit 自由標注），
歸納出 ≤10 個標準 sub-criteria，要求：
1. Mutually Exclusive：各 sub-criteria 涵蓋範圍須有區別，不重疊
2. Collectively Exhaustive：所有 raw labels 都應能被至少一個 sub-criteria 涵蓋
3. 每個 sub-criteria 的 description 需說明「哪些類型的 idea unit 屬於此分類」（2-3 句話），
   description 會用於後續 embedding 比對，請寫得具體可辨識

輸出格式（JSON）：
{ "sub_criteria": [{"name": "跨域學科整合", "description": "..."}, ...] }
</Task>
`.trim();

export function buildSubCriteriaDefinitionPrompt(
  criterionId: CriterionId,
  entries: Array<{ label: string; count: number }>
): string {
  const criterionName = CRITERIA[criterionId];
  const labelList = entries
    .map(e => `  - ${e.label}（出現 ${e.count} 次）`)
    .join('\n');
  return `Criterion: ${criterionId}（${criterionName}）\n\nRaw labels（共 ${entries.length} 個，依頻率排序）：\n${labelList}`;
}
