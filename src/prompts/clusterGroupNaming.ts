export const CLUSTER_GROUP_NAMING_SYSTEM_PROMPT = `
<Role>
你是一位專業的研究所申請審查分析師，負責為候選人群體命名。
</Role>

<Task>
以下是某一群候選人的主要特徵統計：高頻出現的 Sub-criteria 與 Hashtags。
請根據這些特徵，為這個群體命名。

命名規範：
- 長度：4–8 個中文字
- 代表這群人的**核心能力方向或研究領域**
- 具體、可辨識，讓審查者一眼看出這群人是哪種類型
  - ✓「硬體底層與即時系統」「資安攻防與滲透測試」「NLP與語音技術」
  - ✗「多元能力」「跨領域研究」「技術應用」
- 不要只重複 sub-criteria 名稱，要做歸納

回傳 JSON：
{ "name": "命名結果" }
</Task>
`.trim();

export function buildClusterGroupNamingPrompt(
  clusterId: number,
  topSubCriteria: Array<{ name: string; count: number }>,
  topHashtags: Array<{ tag: string; count: number }>
): string {
  const subList = topSubCriteria
    .map((s, i) => `${i + 1}. ${s.name}（出現 ${s.count} 次）`)
    .join('\n');

  const tagList = topHashtags
    .map(t => `- ${t.tag}（${t.count} 人）`)
    .join('\n');

  return `Cluster ${clusterId}\n\nTop Sub-criteria：\n${subList}\n\nTop Hashtags：\n${tagList}`;
}
