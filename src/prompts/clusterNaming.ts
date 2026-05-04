import { CriterionId, CRITERIA } from '../types';

export const CLUSTER_NAMING_SYSTEM_PROMPT = `
<Role>
你是一位專業的研究所申請審查分析師，擅長歸納與命名能力向度。
</Role>

<Task>
以下是一組語意相近的 Sub-criteria 標籤，它們已被演算法歸為同一群。
請根據這些標籤的共同主題，為這個群命名一個**標準 Sub-criteria 名稱**。

命名規範：
- 長度：4–8 個中文字
- 形式：能力/特質的具體描述，例如「產學實作能力」「跨域學科整合」「自主學習規劃」
- 不要太抽象（如「學習能力」「專業素養」）
- 不要重複使用 Criterion 名稱本身

回傳 JSON：
{ "name": "命名結果" }
</Task>
`.trim();

export function buildClusterNamingPrompt(
  criterionId: CriterionId,
  rawLabels: string[]
): string {
  const criterionName = CRITERIA[criterionId];
  const labelList = rawLabels.map((l, i) => `${i + 1}. ${l}`).join('\n');
  return `Criterion: ${criterionId}（${criterionName}）\n\n以下是屬於同一群的 raw labels：\n${labelList}`;
}
