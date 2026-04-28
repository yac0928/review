# 審查系統設計文件

## 技術架構

- **後端**：Node.js + Express + TypeScript
- **NLP**：Gemini API（文字切割、標註、Sub-criteria 命名）
- **Embedding**：Gemini Embedding API
- **Vector DB**：ChromaDB 或 Qdrant（本地 Docker）
- **Criteria**：由校務會議預先定義，共 4 個，系統不自動探索

## 預定義 Criteria

| 編號 | 名稱 |
|---|---|
| C1 | 學術根基與跨域修課表現 (Academic Foundation & Interdisciplinary Learning) |
| C2 | 專題實作與技術應用能力 (Project Implementation & Technical Skills) |
| C3 | 問題解決與批判性思考 (Problem Solving & Critical Thinking) |
| C4 | 專業傳遞與自我成長規劃 (Knowledge Transfer & Career Roadmap) |

## 輸入文件類型

- 自傳
- 讀書計畫
- 其他加分文件（得獎紀錄、課堂作品、專題報告等）

> **注意**：不同候選人文件結構差異大（段落式 vs 條列式 vs OCR 掃描件）。  
> Pre-processing 階段需清理 OCR 噪音後再進行 Idea Unit 切割。

---

## Pipeline 流程

### 步驟 0 — Pre-processing

- 清理 OCR 噪音（亂碼、錯位數字、掃描殘影）
- 保留文件結構標記（自傳 / 讀書計畫 / 加分文件）供後續 LLM 參考

### 步驟 1 — Idea Unit 分割

- 輸入：申請者文件（已清理）
- 用 LLM 根據語意將文件切割成 Idea Units
- 每個 Idea Unit 必須語意完整、不可再分
- 對「活動紀錄型條列文字」需特別處理：每條活動切為獨立 Idea Unit，避免語意過薄

### 步驟 2 — Seed Batch 標註（前 30 份文件）

對每個 Idea Unit，LLM 執行三件事：

1. 映射到 **1-2 個** Criteria
2. **對每個映射到的 Criterion**，各自在該 Criterion 的範疇內自由命名一個 **raw Sub-criteria label**
3. 提取 **Hashtag 關鍵字**（全體共用，不分 Criterion）

> **設計決策**：一個 Idea Unit 若映射到 2 個 Criteria，則建立 2 個 Sub-criteria label（每個 Criterion 各一個），因為同一內容透過不同 Criterion 視角會產生不同的語意框架。
>
> 例：「在產學合作中帶領同學用 ML 解決真實問題」
> - C2 視角 → `產學實作與ML技術落地`
> - C3 視角 → `真實場景問題建構能力`

輸出：每個 Idea Unit 帶有 `criteria[]`、`sub_criteria_map: { [criterion]: raw_label }`、`hashtags[]`

### 步驟 3 — Sub-criteria 收斂（Hybrid Clustering）

**針對每個 Criterion 分別處理：**

- **Step 3a**：收集該 Criterion 下所有 30 份文件的 raw sub-criteria labels
- **Step 3b**：對這批 labels 做 embedding，用 BIC-K-Means 找出最佳 K（目標 4-6 群）
- **Step 3c**：將每群的 labels 清單交給 LLM，歸納命名出該群的**標準 Sub-criteria**
- **Step 3d**：**人工 review** 確認最終標準字典後鎖定

輸出：每個 Criterion 底下 4-6 個標準 Sub-criteria，形成**標準字典**

### 步驟 4 — Relabeling（前 30 份文件）

- 將步驟 2 中 30 份文件的所有 raw sub-criteria labels，重新對應至標準字典
- 更新資料庫中每個 Idea Unit 的 `sub_criteria_map` 欄位

### 步驟 5 — 全量處理（剩餘文件）

- 以步驟 3 鎖定的標準字典，對所有剩餘文件執行與步驟 2 相同的標註流程
- 差異：sub-criteria 直接從標準字典中選取，不再自由命名

---

## 資料模型（草稿）

### Idea Unit

```typescript
{
  id: string,
  candidate_id: string,
  content: string,
  criteria: string[],                          // 1-2 個 Criterion ID（e.g. ["C1", "C3"]）
  sub_criteria_map: { [criterion: string]: string },  // 每個 Criterion 各自的 Sub-criteria label
  hashtags: string[],                          // 全體共用
  embedding?: number[]                         // 待定（sub_criteria + hashtags 的向量）
}
```

### Candidate

```typescript
{
  candidate_id: string,
  idea_units: IdeaUnit[],
  // 以下欄位於第四階段填入
  feature_matrix?: object,
  cluster_id?: number,
  is_medoid?: boolean,
  distinctive_hashtags?: string[]
}
```

---

## 個資保護注意事項

- LLM API 呼叫不得在 prompt 外洩露候選人姓名、學校等識別資訊
- 系統 log 不得記錄原始文件內容
- candidate_id 與真實身份的對應表應獨立儲存，與分析資料庫隔離

---

## 待定：第四階段 — 候選人特徵矩陣

> 目前方向：以 4 個 Criteria 作為維度，用每個 Idea Unit 的 **sub-criteria label + hashtags** 作為 embedding 輸入（避免 raw text 的噪音），在每個 Criterion 維度下做**平均聚合**（避免因 Idea Unit 數量差異造成偏差），形成候選人的代表向量，後續用於跨候選人的分群。
>
> **尚未決定**：最終向量結構（4 個向量 concat vs 其他）、Clustering 演算法細節。

---

## 限制事項

- **不得產生任何數值分數**供展示
- 所有分群邏輯必須基於向量距離與語意相似度
