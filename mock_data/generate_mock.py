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
import argparse
from pathlib import Path

from dotenv import load_dotenv
import google.generativeai as genai

# ── 路徑設定 ──────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
PROMPT_DIR = SCRIPT_DIR / "prompt"

# 從專案根目錄的 .env 載入（與 TypeScript 主程式共用同一份）
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
template        = (PROMPT_DIR / "1.txt").read_text(encoding="utf-8")

TARGET_COUNT = 100
DELAY        = 4.5  # 秒；Gemini free tier 上限 15 RPM，4.5s ≈ 13 RPM


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

    # 統計現有分佈，方便計算剩餘配額
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

    # 驗證實際新增筆數
    verified = parse_students(updated)
    print(f"[DONE] 已儲存，目前共 {len(verified)} 筆 → {high_level_path}")


# ── Phase 2：生成推甄文件 ──────────────────────────────────────────────────────
def phase2_generate_documents() -> None:
    current_text = high_level_path.read_text(encoding="utf-8")
    students = parse_students(current_text)
    total = len(students)
    print(f"[INFO] 共 {total} 筆學生資料，開始生成文件…\n")

    # 收集已使用過的亮點，傳給後續 prompt 避免重複
    used_highlights: list[str] = []

    for idx, (student_id, student_block) in enumerate(students, 1):
        output_path = SCRIPT_DIR / f"mock_{int(student_id)}.txt"

        if output_path.exists():
            print(f"[SKIP] mock_{int(student_id)}.txt 已存在 ({idx}/{total})")
            # 仍記錄亮點，避免後續生成時重複
            used_highlights.append(student_block)
            continue

        print(f"[GEN]  生成 mock_{int(student_id)}.txt ({idx}/{total}) …")

        avoid_clause = ""
        if used_highlights:
            # 只傳最近 20 筆，避免 prompt 過長
            recent = used_highlights[-20:]
            avoid_clause = f"""
## 已使用的亮點摘要（禁止重複）
{"　".join(recent[-20:])}
"""

        prompt = f"""你是一位協助台灣資工系學生撰寫申請交大資工所推甄文件的顧問。請生成高品質、具學術深度的完整推甄文件。

## 生成規則與領域範圍
{distribution}

## 範本（敘事結構與技術細節深度的基準）
{template}

## 重要限制
- 禁止直接使用範本中的具體細節（勤業眾信理專不當行為偵測、捷智商訊、熱舞社等專有名詞）
- 產學合作、課外活動、研究方向必須根據學生屬性全新創作，內容具體且符合技術領域
- 技術描述的深度與密度需比照範本（要有具體工具名、方法名、數字）
- GPA 在自傳中自然帶到：頂大 3.8–4.3，中字輩 3.5–4.0，其他 3.0–3.8
{avoid_clause}
## 當前學生屬性
{student_block}

## 輸出要求
生成完整推甄文件，段落標題格式與範本相同：
1. 自傳（關於我 / 求學經歷含產學或研究細節 / 跨領域學習）
2. 動機
3. 研究方向與動機
4. 讀書計畫（短期 / 中期 / 長期）
5. 其他加分文件摘要

直接輸出文件本文，不加任何前言或說明。"""

        try:
            response = model.generate_content(prompt)
            content = response.text
            output_path.write_text(content, encoding="utf-8")
            print(f"[DONE] 已儲存 mock_{int(student_id)}.txt")
            used_highlights.append(student_block)
        except Exception as exc:
            print(f"[ERR]  學生 {student_id} 失敗：{exc}")

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
    args = parser.parse_args()

    if args.phase == 1:
        phase1_extend_student_list()
    elif args.phase == 2:
        phase2_generate_documents()
    else:
        phase1_extend_student_list()
        print()
        phase2_generate_documents()


if __name__ == "__main__":
    main()
