import fs from 'fs';

// Matches lines/spans that are clearly numeric data dumps from OCR
// e.g. "21.99 22 array( (22.83335333, 22.01555333..."
const NUMERIC_ARRAY_RE = /[\d.]+(?:[,\s]+[\d.eE+\-]+){4,}/g;

// Matches lines where the majority of content is garbled OCR (code variable names)
// e.g. "private int heartRate piriouts Ent restingcertat"
const GARBLED_CODE_RE = /^(?:private|public|int|float|void|string|bool)\s+\w+.*$/gm;

// Matches isolated page numbers (a line with only digits)
const PAGE_NUMBER_RE = /^\s*\d{1,3}\s*$/gm;

// Matches sequences of dots used as filler in OCR (e.g. "......")
const DOT_FILLER_RE = /\.{4,}/g;

// Excessive whitespace
const MULTI_SPACE_RE = /[ \t]{2,}/g;
const MULTI_NEWLINE_RE = /\n{3,}/g;

export function preprocessDocument(rawText: string): string {
  let text = rawText;

  // Replace numeric data arrays with a placeholder to preserve context
  text = text.replace(NUMERIC_ARRAY_RE, '[數據略]');

  // Remove garbled OCR code lines
  text = text.replace(GARBLED_CODE_RE, '');

  // Remove isolated page numbers
  text = text.replace(PAGE_NUMBER_RE, '');

  // Remove dot fillers
  text = text.replace(DOT_FILLER_RE, '');

  // Normalize whitespace
  text = text.replace(MULTI_SPACE_RE, ' ');
  text = text.replace(MULTI_NEWLINE_RE, '\n\n');

  return text.trim();
}

export function readAndPreprocess(filePath: string): string {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return preprocessDocument(raw);
}
