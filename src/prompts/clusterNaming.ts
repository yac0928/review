import { CriterionId, CRITERIA } from '../types';

export const CLUSTER_NAMING_SYSTEM_PROMPT = `
<Role>
你是一位專業的研究所申請審查分析師，負責為候選人能力群組命名。
</Role>

<Task>
以下是同一個 Criterion 下，K-Means 演算法分出的多個群組，每個群組包含語意相近的 raw labels。
請**同時**為所有群組命名，確保整組命名符合以下四條原則：

1. **Mutually Exclusive**：每個名稱的涵蓋範疇不得與其他名稱重疊，名稱之間須能明確區分
2. **Descriptive**：名稱須讓審查者一眼看出這個 sub-criteria 代表什麼樣的能力或行為
3. **Actionable**：描述具體可觀察的能力面向，而非抽象概念
   - ✓「產學實作研究」「自然語言處理應用」「教學與知識傳遞」「實驗設計執行」
   - ✗「研究能力」「學習態度」「相關經驗」「專業素養」
4. 長度：每個名稱 4–8 個中文字，不得重複使用 Criterion 名稱本身

回傳 JSON，names 陣列的順序須與輸入群組的順序完全一致：
{ "names": ["群組1名稱", "群組2名稱", ...] }
</Task>
`.trim();

export function buildAllClustersNamingPrompt(
  criterionId: CriterionId,
  clusters: Array<{ labels: string[] }>
): string {
  const criterionName = CRITERIA[criterionId];
  const grouped = clusters
    .map((c, i) => {
      const labelList = c.labels.map(l => `  - ${l}`).join('\n');
      return `群組 ${i + 1}（${c.labels.length} 個標籤）：\n${labelList}`;
    })
    .join('\n\n');
  return `Criterion: ${criterionId}（${criterionName}）\n\n請為以下 ${clusters.length} 個群組命名：\n\n${grouped}`;
}
