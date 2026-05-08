"""
One-time script: extract GPA, school, field from all mock_N.json files
Output: output_mock/metadata.json
"""

import json
import os
import re

INPUT_DIR = r"D:\研究\審查系統\Project\app\output_mock"
OUTPUT_FILE = os.path.join(INPUT_DIR, "metadata.json")

# ---------------------------------------------------------------------------
# School normalization
# ---------------------------------------------------------------------------
SCHOOL_PATTERNS = [
    (["臺灣大學", "台灣大學", "台大資", "台大電", "台大資工", "NTU"], "台灣大學"),
    (["清華大學", "清大"], "清華大學"),
    (["陽明交通大學", "交通大學", "交大資", "交大電", "陽明交大", "NYCU", "NCTU"], "陽明交通大學"),
    (["中央大學", "中大資", "中大電"], "中央大學"),
    (["中正大學", "中正資", "中正電"], "中正大學"),
    (["政治大學", "政大"], "政治大學"),
    (["成功大學", "成大"], "成功大學"),
    (["中山大學", "中山資", "中山電"], "中山大學"),
    (["台北科技大學", "臺北科技大學", "北科大"], "台北科技大學"),
    (["中興大學", "興大"], "中興大學"),
    (["弘光大學", "弘光科技"], "弘光大學"),
    (["台灣科技大學", "臺灣科技大學", "台科大"], "台灣科技大學"),
    (["師範大學", "師大"], "師範大學"),
    (["高雄大學", "中山大學高雄"], "高雄大學"),
    (["長庚大學"], "長庚大學"),
    (["輔仁大學", "輔大"], "輔仁大學"),
    (["逢甲大學", "逢甲"], "逢甲大學"),
    (["淡江大學", "淡江"], "淡江大學"),
    (["元智大學", "元智"], "元智大學"),
    (["暨南大學", "暨南"], "暨南大學"),
    (["東海大學", "東海"], "東海大學"),
    (["銘傳大學", "銘傳"], "銘傳大學"),
    (["文化大學"], "文化大學"),
    (["東吳大學"], "東吳大學"),
]

def normalize_school(raw):
    """Map raw school text fragment to canonical name."""
    for aliases, canonical in SCHOOL_PATTERNS:
        for alias in aliases:
            if alias in raw:
                return canonical
    return raw  # return as-is if unknown

def extract_school(data):
    """
    Strategy:
    1. First idea_unit hashtags  (most reliable — typically the student's intro sentence)
    2. "就讀於/來自/目前就讀" pattern in cleaned_text
    3. All hashtags
    """
    idea_units = data.get("idea_units", [])
    cleaned_text = data.get("cleaned_text", "")

    # 1. First idea_unit hashtags
    if idea_units:
        first_tags = " ".join(idea_units[0].get("hashtags", []))
        for aliases, canonical in SCHOOL_PATTERNS:
            for alias in aliases:
                if alias in first_tags:
                    return canonical

    # 2. Context pattern in full text
    ctx_pattern = re.compile(
        r'(?:就讀(?:於)?|來自|目前就讀(?:於)?)[^\n，。]{0,8}'
        r'((?:國立|私立)?[^\n，。\s]{2,10}(?:大學|科技大學|學院))'
    )
    match = ctx_pattern.search(cleaned_text[:1200])
    if match:
        return normalize_school(match.group(1))

    # 3. All hashtags
    all_tags = " ".join(
        tag for unit in idea_units for tag in unit.get("hashtags", [])
    )
    for aliases, canonical in SCHOOL_PATTERNS:
        for alias in aliases:
            if alias in all_tags:
                return canonical

    return "不明"

# ---------------------------------------------------------------------------
# GPA extraction
# ---------------------------------------------------------------------------
def extract_gpa(text):
    """
    Handles formats like:
      3.85/4.00  |  4.1 / 4.3  |  GPA維持在3.8  |  學業成績是 3.28
      修課平均達到 4.01  |  績點 3.5  |  平均成績約 3.2
    """
    # Pattern A: X.XX / 4.X  (numerator / denominator)
    m = re.search(r'(\d\.\d{1,2})\s*[/／]\s*4\.\d', text)
    if m:
        val = float(m.group(1))
        if 0.0 <= val <= 4.5:
            return val

    # Pattern B: keyword then number
    kw_pattern = re.compile(
        r'(?:GPA|績點|學業成績|修課平均|平均GPA|平均成績|在校成績|課業成績)'
        r'[^0-9\n]{0,25}(\d\.\d{1,2})',
        re.IGNORECASE
    )
    m = kw_pattern.search(text)
    if m:
        val = float(m.group(1))
        if 0.0 <= val <= 4.5:
            return val

    return None

# ---------------------------------------------------------------------------
# Field classification
# ---------------------------------------------------------------------------
# Keywords scored per category. More specific = higher weight.
FIELD_KEYWORDS = {
    "Cybersecurity": [
        # High-specificity security terms
        "資安", "資訊安全", "網路安全", "滲透測試", "漏洞", "惡意程式", "惡意軟體",
        "入侵偵測", "IDS", "側通道", "Side-channel", "SCA", "硬體特洛伊",
        "Hardware Trojan", "OSCP", "CTF", "惡意代碼", "惡意流量", "攻擊偵測",
        "資安攻防", "Fuzzing", "逆向工程", "智慧合約安全", "Solidity漏洞",
        "靜態分析安全", "動態分析安全", "Slither", "Echidna", "形式化驗證安全",
        "網頁漏洞", "SQL注入", "XSS", "緩衝區溢位", "BufferOverflow",
        "韌體安全", "安全審計", "SIEM", "日誌分析", "威脅情報",
        "Actor-Critic攻擊", "SYNFlood", "PortScan", "資安計畫",
    ],
    "Computer Architecture": [
        "FPGA", "Verilog", "SystemVerilog", "VHDL", "HDL", "RTL",
        "計算機架構", "嵌入式系統", "微控制器", "硬體加速", "晶片設計",
        "RISC-V", "ARM Cortex", "VLSI", "SoC", "IC設計", "EDA",
        "HLS", "High-Level Synthesis", "管線化", "Pipelining",
        "記憶體系統", "DRAM", "NAND Flash", "電路設計", "數位電路",
        "計算機組織", "處理器設計", "抗量子硬體", "PQC硬體",
        "密碼硬體", "安全晶片", "TrustZone", "TEE可信",
        "Xilinx", "Cadence", "Synopsys", "gem5",
    ],
    "Computer Vision": [
        "電腦視覺", "影像辨識", "影像分析", "影像分割", "影像生成",
        "目標偵測", "物件偵測", "U-Net", "YOLO", "醫學影像",
        "圖像", "視覺辨識", "人臉辨識", "姿態估計", "深度估計",
        "MRI", "CT掃描", "DICOM", "腦腫瘤", "醫療影像診斷",
        "OpenCV", "OCR", "場景理解", "語義分割", "實例分割",
        "ResNet視覺", "VGG", "GAN影像生成",
    ],
    "Natural Language Processing": [
        "自然語言", "NLP", "語音辨識", "文字分析", "情感分析",
        "機器翻譯", "問答系統", "對話系統", "文本分類", "語料",
        "詞向量", "Word2Vec", "語意分析", "命名實體辨識", "NER",
        "摘要生成", "低資源語言", "方言", "語義理解", "文章生成",
        "語言理解", "智慧診斷輔助", "醫療NLP",
        "Prompt Engineering", "RAG", "LLM應用", "大型語言模型應用",
    ],
    "Machine Learning": [
        "機器學習", "強化學習", "半監督學習", "遷移學習",
        "推薦系統", "預測模型", "監督學習", "特徵工程",
        "資料探勘", "GNN", "圖神經網路", "生成對抗網路", "GAN訓練",
        "SHAP", "LIME", "XAI可解釋", "時間序列", "異常偵測數據",
        "分類器", "RandomForest", "XGBoost", "K-Means聚類", "GMM",
        "資料合成", "半監督", "資料不平衡", "SMOTE", "ADASYN",
        "可解釋AI", "資料科學", "大數據分析", "電商預測",
    ],
}

def classify_field(idea_units, cleaned_text):
    """Score each category; highest wins. Ties broken by priority order."""
    all_tags = " ".join(
        tag for unit in idea_units for tag in unit.get("hashtags", [])
    )
    # Use hashtags + first 3000 chars of text
    search_corpus = all_tags + " " + cleaned_text[:3000]

    scores = {field: 0 for field in FIELD_KEYWORDS}
    for field, keywords in FIELD_KEYWORDS.items():
        for kw in keywords:
            if kw in search_corpus:
                scores[field] += 1

    best_score = max(scores.values())
    if best_score == 0:
        return "其他"

    # Priority for ties: Security > Arch > CV > NLP > ML
    priority = ["Cybersecurity", "Computer Architecture",
                "Computer Vision", "Natural Language Processing",
                "Machine Learning"]
    for field in priority:
        if scores[field] == best_score:
            return field

    return "其他"

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    files = sorted(
        [f for f in os.listdir(INPUT_DIR) if re.match(r'^mock_\d+\.json$', f)],
        key=lambda x: int(re.search(r'\d+', x).group())
    )

    results = {}
    missing_gpa = []
    missing_school = []

    for filename in files:
        filepath = os.path.join(INPUT_DIR, filename)
        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)

        cid = data.get("candidate_id", filename.replace(".json", ""))
        cleaned_text = data.get("cleaned_text", "")
        idea_units = data.get("idea_units", [])

        gpa = extract_gpa(cleaned_text)
        school = extract_school(data)
        field = classify_field(idea_units, cleaned_text)

        results[cid] = {"gpa": gpa, "school": school, "field": field}

        status = f"GPA={gpa or '?':>5}  school={school:<12}  field={field}"
        print(f"{cid:<12} {status}")

        if gpa is None:
            missing_gpa.append(cid)
        if school == "不明":
            missing_school.append(cid)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n{'─'*60}")
    print(f"Done: {len(results)} files → {OUTPUT_FILE}")
    if missing_gpa:
        print(f"GPA not found ({len(missing_gpa)}): {', '.join(missing_gpa)}")
    if missing_school:
        print(f"School not found ({len(missing_school)}): {', '.join(missing_school)}")

if __name__ == "__main__":
    main()
