export const CLUSTER_GROUP_NAMING_SYSTEM_PROMPT = `
<Role>
你是一位專業的研究所申請審查分析師，負責為候選人群體命名並描述其特色。
</Role>

<Task>
以下是所有分群的主要特徵統計（各群 Top Sub-criteria）。
請為**每一個群體**同時命名，並寫一段描述說明這個群體的特色。

命名規範：
- 長度：4–8 個中文字
- 代表這群人的**核心能力方向或研究領域**
- 具體、可辨識，讓審查者一眼看出這群人是哪種類型
  - ✓「硬體底層與即時系統」「資安攻防與滲透測試」「NLP與語音技術」
  - ✗「多元能力」「跨領域研究」「技術應用」
- 不要只重複 sub-criteria 名稱，要做歸納
- 各群名稱必須互相區分，不得使用相同或高度相似的詞彙

描述規範：
- 2–3 句話，描述這群人是什麼樣的申請者
- 用自然語言說明這個群體的特色，讓審查者能快速掌握這群人的輪廓
- 不要提及統計數字或 sub-criteria 名稱，直接描述人的特質與能力方向
  - ✓「這群申請者普遍具備深厚的演算法基礎，傾向以數學方法解決複雜問題，研究興趣多集中在最佳化或理論計算領域。」
  - ✗「因為跨域學科整合出現最多次，所以這群人擅長跨域。」

回傳 JSON（key 為 cluster id 字串）：
{
  "clusters": {
    "0": { "name": "第一群名稱", "description": "這群申請者..." },
    "1": { "name": "第二群名稱", "description": "這群申請者..." }
  }
}
</Task>
`.trim();

export function buildClusterGroupNamingPrompt(
  clusters: Array<{
    clusterId: number;
    size: number;
    topSubCriteria: Array<{ name: string; count: number }>;
  }>
): string {
  const sections = clusters.map(c => {
    const subList = c.topSubCriteria
      .map((s, i) => `  ${i + 1}. ${s.name}（出現 ${s.count} 次）`)
      .join('\n');
    return `Cluster ${c.clusterId}（${c.size} 人）\nTop Sub-criteria：\n${subList}`;
  });

  return sections.join('\n\n');
}
