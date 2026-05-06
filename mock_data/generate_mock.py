#!/usr/bin/env python3
"""
Mock 推甄文件生成器 — 使用 Gemini API

用法:
  python generate_mock.py --phase 1   # 將 high_level_mock.txt 擴充到 100 筆
  python generate_mock.py --phase 2   # 對每筆屬性生成 mock_N.txt
  python generate_mock.py             # 依序執行兩個階段
"""

import os
import re
import time
import random
import argparse
from pathlib import Path

from dotenv import load_dotenv
import google.generativeai as genai

# ── 路徑設定 ──────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
PROMPT_DIR = SCRIPT_DIR / "prompt"

load_dotenv(SCRIPT_DIR.parent / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL   = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY 未設定，請確認 .env 檔案存在且包含此變數")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel(GEMINI_MODEL)

# ── 讀取來源檔案 ───────────────────────────────────────────────────────────────
distribution    = (PROMPT_DIR / "distribution.txt").read_text(encoding="utf-8")
high_level_path = PROMPT_DIR / "high_level_mock.txt"

TARGET_COUNT = 100
DELAY        = 4.5  # 秒；Gemini free tier 上限 15 RPM，4.5s ≈ 13 RPM

# ── 名字池（Python 選，不讓 Gemini 決定，避免名字趨同）────────────────────────────
_SURNAMES = [
    "陳", "林", "黃", "張", "李", "王", "吳", "劉", "蔡", "楊",
    "許", "鄭", "謝", "洪", "郭", "邱", "曾", "廖", "賴", "徐",
    "周", "葉", "蘇", "莊", "呂", "江", "何", "蕭", "羅", "高",
    "潘", "簡", "董", "柯", "魏", "余", "盧", "梁", "杜", "侯",
    "沈", "韓", "曹", "歐", "孫", "方", "唐", "姚", "范", "朱",
]
_GIVEN_NAMES = [
    # 男性傾向
    "建宏", "志豪", "家豪", "俊廷", "宗翰", "彥廷", "冠霖", "昱成", "哲維", "承翰",
    "韋翰", "彥博", "育辰", "承佑", "宏彥", "瑋翔", "冠宇", "致遠", "文凱", "宥廷",
    "霆宇", "彥睿", "俊安", "子揚", "宇翔", "承霖", "育翔", "宗諺", "煦陽", "柏勳",
    "浩然", "家銘", "冠廷", "立恆", "泓睿", "紹宇", "奕碩", "竣傑", "俊賢", "瑞麟",
    "哲銘", "育菘", "嘉偉", "松霖", "岳廷", "晉安", "炳勳", "柏丞", "耀宗", "睿恩",
    "俊哲", "永誠", "庭安", "竑勝", "崇智", "秉宸", "宣霖", "詠恩", "允儒", "正威",
    # 女性傾向
    "怡君", "雅婷", "佩君", "思婷", "欣儀", "雅雯", "柔安", "佳穎", "宜蓁", "品妍",
    "子涵", "筱涵", "亭妤", "宛蓉", "晨恩", "宜珊", "柏妤", "旻芳", "玟秀", "芷瑄",
    "靖雯", "沛妍", "語嫣", "妍希", "芸萱", "姿穎", "語彤", "采霓", "若涵", "欣妤",
    "映彤", "婕妤", "恩慈", "依蓁", "詩涵", "曉彤", "佳蓉", "采瑜", "禹彤", "湘婷",
    "珮綺", "安琪", "雅琳", "倩如", "欣純", "璦婷", "靜宜", "念慈", "凌芸", "薇安",
    "珺瑤", "婉昀", "姿儀", "昕蓉", "丹妮", "珮瑜", "韻如", "湘云", "奕蓁", "庭瑜",
    # 中性
    "昱翔", "子晴", "品睿", "宥彤", "宸維", "語函", "昀蓁", "沛宸", "奕辰", "羽彤",
    "宇晴", "品諺", "沐恩", "昕彤", "澄宇", "宸瑜", "奕安", "羿晨", "弈辰", "昀霖",
    "宸安", "昱晨", "沛霖", "宥蓁", "承晴", "品宸", "昀翔", "沐霖", "奕蓉", "語辰",
]


# ── 解析 high_level_mock.txt ───────────────────────────────────────────────────
def parse_students(text: str) -> list[tuple[str, str]]:
    """回傳 [(id, 屬性文字塊), ...]，id 為兩位數字串如 '06'。"""
    students: list[tuple[str, str]] = []
    current_id: str | None = None
    current_lines: list[str] = []

    for line in text.strip().splitlines()[1:]:   # 跳過標題列
        stripped = line.strip()
        if not stripped:
            continue
        match = re.match(r"^(\d{2})\t", stripped)
        if match:
            if current_id:
                students.append((current_id, "\n".join(current_lines)))
            current_id = match.group(1)
            current_lines = [stripped]
        elif current_id:
            current_lines.append(stripped)

    if current_id:
        students.append((current_id, "\n".join(current_lines)))

    return students


# ── Phase 1：擴充學生屬性清單 ──────────────────────────────────────────────────
def phase1_extend_student_list() -> None:
    current_text = high_level_path.read_text(encoding="utf-8")
    students = parse_students(current_text)
    current_count = len(students)

    if current_count >= TARGET_COUNT:
        print(f"[SKIP] 已有 {current_count} 筆，不需要擴充")
        return

    need = TARGET_COUNT - current_count
    print(f"[GEN]  從 {current_count} 筆擴充到 {TARGET_COUNT} 筆（新增 {need} 筆）…")

    prompt = f"""你正在協助建立台灣資工系推甄申請的模擬資料集。

## 現有學生屬性清單（共 {current_count} 筆）
{current_text}

## 統計分佈規則
{distribution}

## 任務
目前清單共 {current_count} 筆，請繼續生成編號 {current_count+1:02d} 至 {TARGET_COUNT:02d} 的學生屬性，共 {need} 筆。

生成規則：
1. 合計 {TARGET_COUNT} 筆後，學校比例須符合：頂大(台大/清大/交大/成大) 約40%、中字輩(中央/中山/中興/中正) 約40%、其他(北科/台科/元智/淡江等) 約20%
2. 合計 {TARGET_COUNT} 筆後，領域比例須符合：軟體 約60%、硬體 約20%、韌體 約10%、跨域 約10%
3. 小方向標籤從 distribution.txt 的清單中選取，每位學生 1-2 個
4. 跨領域亮點必須多樣化，不可與現有 {current_count} 筆重複
5. 台大/清大/交大/成大不可與現有的重複（要換不同頂大）

## 輸出格式（嚴格遵守，用 tab 分隔，每筆一行）
NN[tab]學校類型[tab]主要領域[tab]小方向標籤[tab]跨領域興趣/亮點

輸出範例：
{current_count+1:02d}\t頂大 (台大)\t軟體\t機器學習、智慧型計算\t統計建模競賽

只輸出編號 {current_count+1:02d}–{TARGET_COUNT:02d} 共 {need} 行，不含標題列，不含現有資料。"""

    response = model.generate_content(prompt)
    new_entries = response.text.strip()

    updated = current_text.rstrip() + "\n" + new_entries + "\n"
    high_level_path.write_text(updated, encoding="utf-8")

    verified = parse_students(updated)
    print(f"[DONE] 已儲存，目前共 {len(verified)} 筆 → {high_level_path}")


# ── 個人化屬性（deterministic，以 student_id 為隨機種子）────────────────────────
def get_persona_attributes(student_id: int, student_block: str) -> dict:
    """根據學生 ID 決定性地指派書寫風格屬性，使每位學生的文件具有獨特性。"""
    rng = random.Random(student_id * 31337)

    # 背景類型：決定學生的主要大學經歷走向
    background_types = ["技術型", "社團型", "打工型", "創業型", "跨域型"]
    background_weights = [0.40, 0.15, 0.15, 0.15, 0.15]
    background_type = rng.choices(background_types, weights=background_weights)[0]

    # GPA：學校類型決定基本區間，背景類型可壓低上限
    if "頂大" in student_block:
        base_lo, base_hi = 3.0, 4.3
    elif "中字輩" in student_block or "其他國立" in student_block:
        base_lo, base_hi = 2.5, 4.0
    else:
        base_lo, base_hi = 2.0, 3.8

    if background_type == "社團型":
        gpa = round(rng.uniform(base_lo, min(base_hi, 3.0)), 2)
    elif background_type == "打工型":
        gpa = round(rng.uniform(base_lo, min(base_hi, 3.3)), 2)
    else:
        gpa = round(rng.uniform(base_lo, base_hi), 2)

    # 文件格式風格
    styles = ["標準段落", "條列式", "散文式", "混搭", "過渡引導"]
    weights = [0.25, 0.20, 0.20, 0.20, 0.15]
    doc_style = rng.choices(styles, weights=weights)[0]

    # 文件長度
    doc_length = rng.choices(["短", "中", "長"], weights=[0.20, 0.40, 0.40])[0]

    # 撰寫品質（與 GPA 鬆散相關，社團型/打工型傾向偏低）
    if background_type in ("社團型", "打工型"):
        q_weights = [0.05, 0.35, 0.60]
    elif gpa >= 3.8:
        q_weights = [0.55, 0.35, 0.10]
    elif gpa >= 3.2:
        q_weights = [0.25, 0.50, 0.25]
    else:
        q_weights = [0.10, 0.35, 0.55]
    writing_quality = rng.choices(["精心", "一般", "草率"], weights=q_weights)[0]

    # 研究室 / 業界經驗（背景類型決定機率）
    research_prob = {"技術型": 0.75, "社團型": 0.10, "打工型": 0.15,
                     "創業型": 0.40, "跨域型": 0.45}
    has_research   = rng.random() < research_prob[background_type]
    has_internship = rng.random() < 0.50

    # 申請動機清晰度
    motivation_clarity = rng.choices(["明確", "模糊"], weights=[0.60, 0.40])[0]

    # 姓名：由 Python 決定，不讓 Gemini 選
    name = rng.choice(_SURNAMES) + rng.choice(_GIVEN_NAMES)

    return {
        "gpa": gpa,
        "name": name,
        "background_type": background_type,
        "doc_style": doc_style,
        "doc_length": doc_length,
        "writing_quality": writing_quality,
        "has_research": has_research,
        "has_internship": has_internship,
        "motivation_clarity": motivation_clarity,
    }


# ── 書寫風格說明表 ─────────────────────────────────────────────────────────────
_STYLE_DESC = {
    "標準段落": (
        "使用 `##` 作為主要段落標題（`## 自傳`、`## 讀書計畫`），"
        "重要子段落用 `###` 或 `**粗體**` 標記（如 `### 研究經歷`、`**短期計畫**`），"
        "每段開頭有清楚主旨句，整體層次分明、閱讀流暢。"
    ),
    "條列式": (
        "主要段落用 `##` 標題，每個經歷或計畫項目以 `- ` 條列呈現，"
        "條列前有 1–2 句引言說明脈絡，再展開細節列點，"
        "讀書計畫依短中長期分組條列，整體清晰易讀。"
    ),
    "散文式": (
        "段落以 `**粗體**` 標記主題（如 `**自傳**`、`**讀書計畫**`），"
        "內文以連貫段落書寫，段落間留空行，語氣自然流暢，"
        "風格接近學術申請信，有一定的敘事節奏。"
    ),
    "混搭": (
        "自傳部分用 `##` 標題搭配散文段落，敘述較完整；"
        "讀書計畫部分改用 `- ` 條列，風格偏簡潔；"
        "整體格式不完全統一，但各段落內部仍保持一致性。"
    ),
    "過渡引導": (
        "不使用 `##` 標題，改以過渡語句自然引導段落切換"
        "（如「在讀書計畫方面，」「談到研究方向，」），"
        "段落間有空行，整體可讀性尚可，只是視覺上缺少明確分區。"
    ),
}

_LENGTH_DESC = {
    "短": "整份文件總字數約 500–800 字，言簡意賅，只點出最重要的 2–3 個經歷或計畫重點。",
    "中": "整份文件總字數約 900–1500 字，涵蓋主要經歷與讀書計畫，但不過度鋪陳細節。",
    "長": "整份文件總字數約 1600–2500 字，詳細展開多個經歷，每個主題段落有充分論述。",
}

_QUALITY_DESC = {
    "精心": (
        "文句流暢、邏輯清晰，經歷有具體數字、工具名稱、成果描述，"
        "動機與研究方向有說服力，顯示申請者認真準備。"
    ),
    "一般": (
        "文句尚通順，有些具體細節，但部分段落較籠統，偶有語氣重複或贅詞，"
        "整體中規中矩，看得出有準備但不夠細膩。"
    ),
    "草率": (
        "文句有時不夠流暢，大量使用模糊描述（如「學到很多」、「獲益良多」、"
        "「培養了能力」），缺乏具體數字與成果，讀書計畫流於泛泛，"
        "顯示準備時間不足或表達能力有限。"
    ),
}

# ── 背景類型說明（決定學生的大學經歷走向）────────────────────────────────────────
_BACKGROUND_DESC = {
    "技術型": (
        "大學期間以技術能力培養為主，有研究室、產學合作、或自學開發專案，"
        "自傳著重技術成長歷程與研究經驗，讀書計畫有明確的研究方向。"
    ),
    "社團型": (
        "大學期間主要時間花在社團活動（如學生會、樂團、球隊、營隊），"
        "成績偏低，技術深度不足。自傳著重領導力與人際關係，"
        "申請動機模糊（如「想提升自己」），讀書計畫空泛。"
        "注意：這類學生沒有研究室經驗，技術描述要淺，不能捏造。"
    ),
    "打工型": (
        "大學期間以打工維生為主（餐飲業、服務業、家教、超商等非技術性工作），"
        "技術能力主要來自課程，缺乏研究或開發專案。"
        "自傳中打工經驗佔重要篇幅，申請動機是「想轉換跑道」或「想精進技術」。"
        "注意：打工內容要具體（店名可虛構），不要美化成技術相關。"
    ),
    "創業型": (
        "曾嘗試創業、接案、或經營自媒體，有實際商業場景的產品開發經驗，"
        "技術廣度高但學術深度不足。自傳著重創業歷程、遇到的挫折與學到的教訓，"
        "申請動機是「想補足理論基礎」或「想讓技術更系統化」。"
    ),
    "跨域型": (
        "本科非純資工（如電機、工業工程、財金、生醫、物理），"
        "或資工系但主要興趣在跨領域應用，有明顯的跨域學習歷程。"
        "自傳要說明跨域的動機與轉折點，讀書計畫著重如何結合兩個領域。"
    ),
}

# ── 真實感規則（從真實學生文件歸納，依品質等級分層）─────────────────────────────
# 來源：data/1.txt（匿名版）、data/2.txt（中央大學，OCR掃描）、data/3.txt（師大，portfolio格式）
# 這三份文件的「聲音」不放進 prompt，只把它們教會我們的寫法規則放進來
_AUTHENTICITY_RULES = {
    "精心": """\
- 數字要具體：不寫「協助許多學生」，寫「協助 200 位高中生」；不寫「成績不錯」，帶出具體學業分數
- 工具要具名：不寫「機器學習工具」，寫「使用 scikit-learn 的 Random Forest」或「以 PyTorch 訓練 CNN」
- 時間要明確：不寫「大學期間」，寫「大二寒假」、「112-1 學期」、「大三下專題期間」
- 反思要具體：不寫「獲益良多」，寫「才意識到資料品質對模型效能的決定性影響」或「第一次體會到系統測試的重要性」
- 讀書計畫要有具體課程名稱或研究主題，不只是「修進階課程」""",

    "一般": """\
- 至少一半的經歷帶有具體工具名或數字，另一半可以較籠統
- 時間點偶爾出現（「大三時」、「上學期」），不需要每句都有
- 反思不要全是「獲益良多」，至少 1–2 句說出學到的具體觀念
- 讀書計畫有方向但細節不深（「想修機器學習相關課程」可以接受）""",

    "草率": """\
- 允許大量模糊描述（「學到很多」、「培養了能力」、「對我很有幫助」）
- 工具名稱可以缺席，只說「用程式做了分析」、「跑了模型」
- 時間描述籠統（「大學期間」、「之前有做過」、「有一段時間」）
- 反思可以是事後諸葛型（「做完才發現原來這麼難」、「沒想到會遇到這個問題」）
- 讀書計畫泛泛（「努力學習」、「多修課」、「跟著教授做研究」），讓人感覺是考前才寫的""",
}


# ── 建立 Phase 2 文件生成 Prompt ───────────────────────────────────────────────
def build_document_prompt(student_block: str, persona: dict, avoid_clause: str) -> str:
    gpa               = persona["gpa"]
    name              = persona["name"]
    background_type   = persona["background_type"]
    doc_style         = persona["doc_style"]
    doc_length        = persona["doc_length"]
    writing_quality   = persona["writing_quality"]
    has_research      = persona["has_research"]
    has_internship    = persona["has_internship"]
    motivation_clarity = persona["motivation_clarity"]

    experience_lines = []
    if has_research:
        experience_lines.append(
            "有研究室或產學合作的實際研究經驗，請在自傳中具體描述（實驗室名稱可虛構，"
            "但研究主題、使用方法、遇到的問題要符合技術領域）。"
        )
    else:
        experience_lines.append(
            "沒有正式研究室或產學合作經驗，主要靠修課與自學累積能力；"
            "不要捏造研究室經歷，但可提到課程專題或個人 side project。"
        )
    if has_internship:
        experience_lines.append(
            "有業界實習或兼職開發經驗，可在自傳自然帶到（公司名可虛構，"
            "但職責與技術細節要合理）。"
        )

    if motivation_clarity == "明確":
        motivation_note = (
            "申請動機明確，能清楚說明為何選擇此所、想投入的研究主題或方向，"
            "並與過往經歷有邏輯連結。"
        )
    else:
        motivation_note = (
            "申請動機較模糊，文件中雖提到「想繼續深造」或「對資工有興趣」，"
            "但缺乏具體方向，理由偏向泛泛而談。"
        )

    experience_text = "\n".join(f"  - {e}" for e in experience_lines)

    return f"""你是一位台灣大學生，正在以第一人稱撰寫申請交大資工所的推甄文件。
請根據以下學生屬性與個人化參數，生成具有真實感且與其他申請者明顯不同的文件。

## 學生基本屬性
{student_block}

## 個人化生成參數（嚴格遵守）

**姓名**：{name}（直接使用這個名字，不要修改、不要用括號佔位符）
**就讀系所**：根據學生背景填入具體系所全名（如「資訊工程學系」「電機工程學系」），禁止使用括號佔位符。

**大學成績**：{gpa}（在自傳中自然帶入，避免直接說「GPA」，可說「學業成績」或「修課平均」）

**背景類型**：{background_type}
{_BACKGROUND_DESC[background_type]}

**文件格式風格**：{doc_style}
{_STYLE_DESC[doc_style]}

**文件長度**：{doc_length}
{_LENGTH_DESC[doc_length]}

**撰寫品質**：{writing_quality}
{_QUALITY_DESC[writing_quality]}

**經驗背景**：
{experience_text}

**申請動機**：{motivation_note}

## 真實感規則（依撰寫品質等級執行）
{_AUTHENTICITY_RULES[writing_quality]}

## 輸出要求
使用 **Markdown 語法**輸出，標題、條列、粗體等格式依照上方「文件格式風格」屬性決定。
只生成以下兩個部分（不生成其他加分文件）：
1. 自傳
2. 讀書計畫

段落標題與整體格式請完全依照「文件格式風格」屬性決定，不要預設使用統一的標準格式。
讀書計畫的結構（短中長期、條列、散文等）也根據風格屬性自由決定，不要千篇一律。

{avoid_clause}
## 注意事項
- 內容必須符合學生的主要研究領域與跨領域亮點
- 不同格式風格的文件在視覺結構上必須有明顯差異
- 直接輸出文件本文，不加任何前言或說明"""


# ── Phase 2：生成推甄文件 ──────────────────────────────────────────────────────
def phase2_generate_documents(limit: int = 0) -> None:
    current_text = high_level_path.read_text(encoding="utf-8")
    students = parse_students(current_text)
    total = len(students)
    print(f"[INFO] 共 {total} 筆學生資料，開始生成文件…\n")
    generated = 0

    used_highlights: list[str] = []

    for idx, (student_id, student_block) in enumerate(students, 1):
        sid = int(student_id)
        output_path = SCRIPT_DIR / f"mock_{sid}.md"

        if output_path.exists():
            print(f"[SKIP] mock_{sid}.md 已存在 ({idx}/{total})")
            used_highlights.append(student_block)
            continue

        persona = get_persona_attributes(sid, student_block)
        print(
            f"[GEN]  生成 mock_{sid}.md ({idx}/{total})  "
            f"背景={persona['background_type']}  GPA={persona['gpa']}  "
            f"風格={persona['doc_style']}  長度={persona['doc_length']}  品質={persona['writing_quality']} …"
        )

        avoid_clause = ""
        if used_highlights:
            recent = used_highlights[-20:]
            avoid_clause = (
                "## 已使用的亮點摘要（禁止重複，確保這份文件的核心亮點與以下不同）\n"
                + "　".join(recent)
                + "\n"
            )

        prompt = build_document_prompt(student_block, persona, avoid_clause)

        try:
            response = model.generate_content(prompt)
            content = response.text
            output_path.write_text(content, encoding="utf-8")
            print(f"[DONE] 已儲存 mock_{sid}.md")
            used_highlights.append(student_block)
            generated += 1
        except Exception as exc:
            print(f"[ERR]  學生 {student_id} 失敗：{exc}")

        if limit and generated >= limit:
            print(f"\n[LIMIT] 已達 --limit {limit}，提前結束。")
            break

        time.sleep(DELAY)

    print(f"\n完成。共處理 {total} 筆。")


# ── 入口 ──────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Mock 推甄文件生成器",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="不指定 --phase 時依序執行 Phase 1 → Phase 2",
    )
    parser.add_argument(
        "--phase",
        type=int,
        choices=[1, 2],
        help="1=擴充學生屬性清單  2=生成推甄文件",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        metavar="N",
        help="Phase 2 最多生成 N 筆新文件後停止（0=不限，用於測試）",
    )
    args = parser.parse_args()

    if args.phase == 1:
        phase1_extend_student_list()
    elif args.phase == 2:
        phase2_generate_documents(limit=args.limit)
    else:
        phase1_extend_student_list()
        print()
        phase2_generate_documents(limit=args.limit)


if __name__ == "__main__":
    main()
