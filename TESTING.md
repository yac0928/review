# 操作手冊

## 環境設定（第一次使用）

```powershell
# 1. 安裝套件
npm install

# 2. 複製 .env 範本並填入 API key
copy .env.example .env
# 用 VSCode 開啟 .env，填入：
#   GEMINI_API_KEY=your_key_here
#   GEMINI_MODEL=gemini-2.5-flash

# 3. 確認可用模型（可選）
npm run models
```

---

## Step 0 + 1：切割 Idea Units

> 輸入：`data/*.txt`
> 輸出：`output/{id}.json`（含 idea_units，criteria 欄位為空）

### 單一候選人

```powershell
# 格式：$env:CANDIDATE_ID="候選人ID"; $env:CANDIDATE_FILE="data/檔名.txt"; npm run pipeline
$env:CANDIDATE_ID="1"; $env:CANDIDATE_FILE="data/1.txt"; npm run pipeline
$env:CANDIDATE_ID="2"; $env:CANDIDATE_FILE="data/2.txt"; npm run pipeline
$env:CANDIDATE_ID="3"; $env:CANDIDATE_FILE="data/3.txt"; npm run pipeline
```

### 批次（data/ 下所有 .txt）

```powershell
npm run pipeline
```

> 批次會在每份文件之間等待 3 秒，避免 rate limit。

---

## Step 2：標注 Criteria / Sub-criteria / Hashtags

> 輸入：`output/{id}.json`（Step 1 的輸出）
> 輸出：同一個檔案，in-place 更新（criteria、sub_criteria_map、hashtags 欄位）

### 單一候選人

```powershell
# 格式：$env:CANDIDATE_ID="候選人ID"; npm run step2
$env:CANDIDATE_ID="1"; npm run step2
$env:CANDIDATE_ID="2"; npm run step2
$env:CANDIDATE_ID="3"; npm run step2
```

### 批次（output/ 下所有已完成 Step 1 的 .json）

```powershell
npm run step2
```

---

## 完整流程（單一候選人從頭跑）

```powershell
# Step 1
$env:CANDIDATE_ID="1"; $env:CANDIDATE_FILE="data/1.txt"; npm run pipeline

# Step 2
$env:CANDIDATE_ID="1"; npm run step2
```

## 完整流程（全部批次）

```powershell
npm run pipeline   # Step 1：全部文件
npm run step2      # Step 2：全部候選人
```

---

## 工具指令

```powershell
# 列出你的 API key 可用的所有模型
npm run models
```

---

## 環境變數速查

| 變數名 | 用途 | 範例 |
|---|---|---|
| `GEMINI_API_KEY` | Gemini API 金鑰（必填） | `AIza...` |
| `GEMINI_MODEL` | 使用的模型（預設 gemini-2.5-flash） | `gemini-2.5-flash` |
| `CANDIDATE_ID` | 指定單一候選人 ID（Step 1、Step 2） | `1` |
| `CANDIDATE_FILE` | 指定輸入檔路徑（僅 Step 1 需要） | `data/1.txt` |
| `PORT` | Express 伺服器 port（預設 3000） | `3000` |

PowerShell 設定環境變數語法：
```powershell
$env:VARIABLE_NAME="value"
```

多個變數可以用分號串接：
```powershell
$env:CANDIDATE_ID="1"; $env:CANDIDATE_FILE="data/1.txt"; npm run pipeline
```

---

## 輸出檔案說明

所有輸出存放在 `output/` 資料夾：

```
output/
  1.json    ← 候選人 1 的完整資料
  2.json
  3.json
```

### Step 1 完成後的結構
```json
{
  "candidate_id": "1",
  "idea_units": [
    {
      "id": "uuid",
      "section": "自傳",
      "content": "...",
      "criteria": [],          ← 空，Step 2 填入
      "sub_criteria_map": {},  ← 空，Step 2 填入
      "hashtags": []           ← 空，Step 2 填入
    }
  ]
}
```

### Step 2 完成後的結構
```json
{
  "idea_units": [
    {
      "criteria": ["C2"],
      "sub_criteria_map": { "C2": "LLM應用實作" },
      "hashtags": ["大型語言模型", "prompt設計", "員工手冊"]
    }
  ]
}
```

---

## 錯誤排除

| 錯誤 | 原因 | 解法 |
|---|---|---|
| `429 Too Many Requests` | Rate limit，系統會自動 retry | 等待，不需手動操作 |
| `503 Service Unavailable` | 模型暫時過載，系統會自動 retry | 等待，不需手動操作 |
| `404 Not Found` + "no longer available" | 模型已停用 | 換 `GEMINI_MODEL=gemini-2.5-flash` |
| `404 Not Found` + "not found for API version" | 模型名稱錯誤 | 執行 `npm run models` 查看可用清單 |
| `Output file not found` | 還沒跑 Step 1 | 先跑 `npm run pipeline` |
| `Missing required environment variable` | `.env` 沒有設定 API key | 確認 `.env` 有 `GEMINI_API_KEY` |
