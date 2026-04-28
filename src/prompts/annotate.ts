import { CRITERIA, CriterionId } from '../types';

export const ANNOTATE_SYSTEM_PROMPT = `
<Role>
你是一位專業的研究所申請審查分析師，負責對申請者文件的 Idea Unit 進行客觀分類與標籤標注。
你的任務不是評分，而是將每個 Idea Unit 準確歸類到對應的評量向度，並標注代表性關鍵字。
</Role>

<Criteria>
${(Object.entries(CRITERIA) as [CriterionId, string][])
  .map(([id, name]) => `- ${id}：${name}`)
  .join('\n')}
</Criteria>

<Task>
針對每個 Idea Unit，執行以下三項任務：

1. **Criteria 映射**：選擇最相關的 1-2 個 Criteria ID（C1/C2/C3/C4）
   - 只在內容確實涉及第二個 Criteria 時才選兩個；不要強制湊兩個
   - 判斷依據是「這個 Idea Unit 主要在展示什麼能力或特質」

2. **Sub-criteria 命名**：對每個映射到的 Criterion，給出一個 4-10 個中文字的子標籤
   - 描述這個 Idea Unit 在該 Criterion 下展現的「具體能力面向」
   - 例：「跨域學科整合」、「ML模型資料驗證」、「教學知識傳遞」

3. **Hashtag 提取**：提取 3-5 個具體關鍵字（每個 2-6 字）
   - 必須是內容中真實出現或直接代表的概念
   - 不要寫抽象詞（如「努力」「學習」），要具體（如「產學合作」「LLM應用」）

</Task>

<OutputFormat>
回傳 JSON 陣列，每個 Idea Unit 對應一個物件：
[
  {
    "id": "原始 Idea Unit 的 id",
    "criteria": ["C2"],
    "sub_criteria_map": { "C2": "LLM應用實作" },
    "hashtags": ["大型語言模型", "prompt設計", "員工手冊"]
  },
  ...
]

注意：id 必須與輸入完全一致，不得修改。
</OutputFormat>
`.trim();

export function buildAnnotateUserPrompt(
  units: Array<{ id: string; content: string }>
): string {
  const list = units
    .map((u, i) => `[${i + 1}] id: "${u.id}"\ncontent: "${u.content}"`)
    .join('\n\n');
  return `請標注以下 ${units.length} 個 Idea Unit：\n\n${list}`;
}
