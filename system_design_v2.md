# 審查系統設計文件 v2

## 技術架構

- **後端**：Node.js + TypeScript（ts-node）
- **LLM**：Gemini API（文字切割、標註、Sub-criteria 命名、Hashtag 篩選）
- **Embedding**：Gemini Embedding API（`gemini-embedding-2`）
- **分群**：K-Means + GMM（本地計算，無 Vector DB）
- **視覺化**：UMAP + Plotly.js（輸出靜態 HTML）
- **Criteria**：由校務會議預先定義，共 4 個，系統不自動探索

## 預定義 Criteria

| 編號 | 名稱 |
|------|------|
| C1 | 學術根基與跨域修課表現 |
| C2 | 專題實作與技術應用能力 |
| C3 | 問題解決與批判性思考 |
| C4 | 專業傳遞與自我成長規劃 |

## 輸入文件類型

- 自傳
- 讀書計畫
- 其他加分文件（得獎紀錄、課堂作品、專題報告等）

---

## Pipeline 流程

### 步驟 1 — Idea Unit 分割

- 輸入：申請者文件
- 用 LLM 依語意切割成 Idea Units，每個語意完整不可再分
- 條列式活動紀錄：每條切為獨立 Idea Unit
- 輸出：`candidate.json`，含 `idea_units[]`

**指令**：`npm run pipeline` / `npm run pipeline:mock`

---

### 步驟 2 — Idea Unit 標註

對每個 Idea Unit，LLM 執行三件事：

1. 映射到 **1–2 個** Criteria
2. 對每個映射到的 Criterion，自由命名一個 **raw sub-criteria label**
3. 提取 **hashtag 關鍵字**（全體共用，不分 Criterion）

輸出欄位（寫入 IdeaUnit）：
- `criteria: CriterionId[]`
- `sub_criteria_map: Partial<Record<CriterionId, string>>`
- `hashtags: string[]`

**指令**：`npm run step2` / `npm run step2:mock`

---

### 步驟 3 — Sub-criteria 收斂

**針對每個 Criterion 分別處理（全部候選人）：**

1. 收集該 Criterion 下所有候選人的 raw sub-criteria labels
2. 對 labels 做 Gemini Embedding，結果快取至 `embeddings_cache.json`（按 model name 失效）
3. 同時試 **K-Means**（K 範圍 3–10，Silhouette Score 選最佳 K）與 **GMM**（BIC 選最佳 K）
4. Silhouette Score 低於 0 的點標為 outlier，歸入 **「其他面向」** bucket
5. 單一 LLM call 對所有群同時命名（確保 mutual exclusivity），產出標準 sub-criteria 名稱
6. 增量存檔：每個 Criterion 完成後立即寫入 `standard_dictionary.json`（支援中斷續跑）

輸出：`standard_dictionary.json`，每個 Criterion 底下若干標準 Sub-criteria（含 `id`、`name`、`raw_labels[]`）

**指令**：`npm run step3` / `npm run step3:mock`

---

### 步驟 4 — Relabeling

- 讀取 `standard_dictionary.json`，建立 `rawLabel → standardName` 反查表
- 為每個 Idea Unit 新增 `standard_sub_criteria_map`（保留原始 `sub_criteria_map` 不動）
- Skip 邏輯：已有 `standard_sub_criteria_map` 的 Idea Unit 不重複處理

輸出欄位（新增至 IdeaUnit）：
- `standard_sub_criteria_map: Partial<Record<CriterionId, string>>`

**指令**：`npm run step4` / `npm run step4:mock`

---

### 步驟 5 — 全量處理（略過）

因所有候選人已在步驟 2 完成標註，步驟 5 暫不需要。

---

### 步驟 6 — 候選人特徵向量建構

1. 從 `standard_dictionary.json` 建立有序 sub-criteria index（C1 → C4，others 置後）
2. 對每個候選人，統計 `standard_sub_criteria_map` 中各 sub-criteria 的出現次數 → 計數向量
3. **L2 正規化**（消除文件量多寡導致的計數偏差，保留各 sub-criteria 的比例分布）
4. 同時統計各 Criterion 的 Idea Unit 數量 → `radar_chart_data`
5. Skip 邏輯：已有 `feature_vector` 的候選人不重複處理（可用 `FORCE=1` 強制重建）

輸出欄位（寫入 Candidate）：
- `feature_vector: number[]`（42 維，L2 正規化）
- `radar_chart_data: Record<CriterionId, number>`

**指令**：`npm run step6` / `npm run step6:mock`

---

### 步驟 7 — 候選人分群

1. 讀取所有候選人 `feature_vector`
2. 同時試 **K-Means**（Silhouette Score 選最佳 K）與 **GMM**（BIC 選最佳 K）
   - K 範圍：2–6
3. 選 Silhouette Score 較高的演算法與 K 值作為最終結果
4. **Medoid 選取**：每個 cluster 內平均歐氏距離最小的成員，標記 `is_medoid: true`
5. **UMAP 降至 2D**，以 Plotly.js 產生互動式 HTML（`umap.html`）
6. 結果寫回每個候選人檔案，並輸出 `clusters.json`

輸出欄位（寫入 Candidate）：
- `cluster_id: number`
- `is_medoid: boolean`

輸出檔案：
- `clusters.json`（ClusterSummary，含每個 cluster 的成員與 medoid）
- `umap.html`（互動式散點圖）

**指令**：`npm run step7` / `npm run step7:mock`

---

### 步驟 8 — 群體命名

1. 對每個 cluster，統計成員中最高頻的 **top-5 sub-criteria**（出現次數）與 **top-10 hashtags**（按擁有該 tag 的候選人數量計）
2. 將統計結果交給 LLM，產出 **4–8 字中文群名**
3. Skip 邏輯：已有 `cluster_name` 的 cluster 不重複命名
4. 將名稱與統計寫回 `clusters.json`，並寫入每個成員的 `cluster_name` 欄位

輸出欄位（寫入 Candidate）：
- `cluster_name: string`

**指令**：`npm run step8` / `npm run step8:mock`

---

### 步驟 9 — Distinctive Hashtag 篩選

對每個候選人，用 LLM 從其所有 hashtag（去重後）中選出 3–4 個最能代表其亮點的標籤：

**Prompt 選擇標準：**

技術專長：
- 具體技術領域（如「硬體安全」「生醫訊號處理」「編譯器設計」）
- 特定研究主題（如「DDoS防禦」「FPGA加速」「語音辨識」）
- 有鑑別力的工具或方法（如「RISC-V」「形式化驗證」「圖神經網路」）

特殊經歷：
- 競賽或檢定（如「ICPC」「程式競賽金牌」）
- 研究或業界實績（如「論文發表」「專利申請」「開源貢獻」）
- 值得注意的實習（如「Google實習」「竹科IC設計實習」）
- 明顯突出的跨域成就（如「醫學×AI聯合專題」）

排除：學校名稱、一般社團、運動、音樂才藝、個人特質、太通用的技術詞

Skip 邏輯：已有 `distinctive_hashtags` 的候選人不重複處理

輸出欄位（寫入 Candidate）：
- `distinctive_hashtags: string[]`（3–4 個）

**指令**：`npm run step9` / `npm run step9:mock`

---

### 步驟 10 — UI 資料準備（待實作）

---

## 資料模型

### IdeaUnit

```typescript
{
  id: string;
  candidate_id: string;
  section: '自傳' | '讀書計畫' | '加分文件' | '其他';
  content: string;
  // Step 2:
  criteria: CriterionId[];
  sub_criteria_map: Partial<Record<CriterionId, string>>;
  hashtags: string[];
  // Step 4:
  standard_sub_criteria_map?: Partial<Record<CriterionId, string>>;
}
```

### Candidate

```typescript
{
  candidate_id: string;
  source_files: string[];
  idea_units: IdeaUnit[];
  // Step 6:
  feature_vector?: number[];           // 42 維，L2 正規化
  radar_chart_data?: Record<CriterionId, number>;
  // Step 7:
  cluster_id?: number;
  is_medoid?: boolean;
  // Step 8:
  cluster_name?: string;
  // Step 9:
  distinctive_hashtags?: string[];
}
```

### ClusterSummary（clusters.json）

```typescript
{
  algorithm: 'kmeans' | 'gmm';
  k: number;
  silhouette: number;
  clusters: Array<{
    cluster_id: number;
    size: number;
    medoid: string;
    members: string[];
    cluster_name?: string;
    top_sub_criteria?: Array<{ name: string; count: number }>;
    top_hashtags?: Array<{ tag: string; count: number }>;
  }>;
}
```

### StandardDictionary（standard_dictionary.json）

```typescript
{
  [criterionId: string]: Array<{
    id: string;          // e.g. "C1_S1"
    name: string;        // 標準 sub-criteria 名稱
    raw_labels: string[];
  }>
}
```

---

## Output 目錄結構

```
output_mock/
├── mock_01.json          # Candidate（含所有步驟輸出欄位）
├── mock_02.json
├── ...
├── standard_dictionary.json   # Step 3 產出
├── embeddings_cache.json      # Step 3 embedding 快取
├── clusters.json              # Step 7+8 產出
└── umap.html                  # Step 7 視覺化
```

---

## 限制事項

- **不得產生任何數值分數**供展示
- 所有分群邏輯基於向量距離與語意相似度
- LLM 呼叫不得在 prompt 中包含候選人姓名等識別資訊
