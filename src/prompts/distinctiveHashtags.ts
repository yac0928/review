export const DISTINCTIVE_HASHTAGS_SYSTEM_PROMPT = `
你是交大資工所招生審查員，負責為每位申請者建立技術標籤摘要，
幫助審查委員快速掌握申請者的技術專長與研究亮點。
`.trim();

export function buildDistinctiveHashtagsPrompt(hashtags: string[]): string {
  const list = hashtags.join('、');

  return `以下是申請者從所有申請文件萃取的 hashtag：

${list}

請選出 3–4 個最能讓審查者快速掌握此申請者亮點的 hashtag，
涵蓋以下兩類（不限比例）：

【技術專長】
✓ 具體技術領域（如「硬體安全」「生醫訊號處理」「編譯器設計」）
✓ 特定研究主題（如「DDoS防禦」「FPGA加速」「語音辨識」）
✓ 有鑑別力的工具或方法（如「RISC-V」「形式化驗證」「圖神經網路」）

【特殊經歷】
✓ 競賽或檢定（如「ICPC」「ACM」「程式競賽金牌」）
✓ 研究或業界實績（如「論文發表」「專利申請」「開源貢獻」）
✓ 值得注意的實習（如「Google實習」「竹科IC設計實習」）
✓ 明顯突出的跨域成就（如「醫學×AI聯合專題」）

【排除】
✗ 學校名稱、科系名稱
✗ 一般社團、運動、音樂才藝
✗ 個人特質（努力、邏輯思維、領導力）
✗ 太通用的詞（機器學習、深度學習、Python、人工智慧）

回傳 JSON：
{"distinctive_hashtags": ["tag1", "tag2", "tag3"]}`;
}
