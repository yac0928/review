import express from 'express';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { splitIdeaUnits, splitIdeaUnitsFromText } from './services/ideaUnitSplitter';

const app = express();
app.use(express.json({ limit: '10mb' }));

// Process a single file by path
app.post('/pipeline/file', async (req, res) => {
  const { candidate_id, file_path } = req.body as { candidate_id?: string; file_path?: string };

  if (!candidate_id || !file_path) {
    res.status(400).json({ error: 'candidate_id and file_path are required' });
    return;
  }
  if (!fs.existsSync(file_path)) {
    res.status(404).json({ error: `File not found: ${file_path}` });
    return;
  }

  try {
    const candidate = await splitIdeaUnits(file_path, candidate_id);
    saveOutput(candidate_id, candidate);
    res.json({ candidate_id, idea_unit_count: candidate.idea_units.length, idea_units: candidate.idea_units });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// Process raw text directly
app.post('/pipeline/text', async (req, res) => {
  const { candidate_id, text } = req.body as { candidate_id?: string; text?: string };

  if (!candidate_id || !text) {
    res.status(400).json({ error: 'candidate_id and text are required' });
    return;
  }

  try {
    const candidate = await splitIdeaUnitsFromText(text, candidate_id);
    saveOutput(candidate_id, candidate);
    res.json({ candidate_id, idea_unit_count: candidate.idea_units.length, idea_units: candidate.idea_units });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// Run batch on all files in data/
app.post('/pipeline/batch', async (_req, res) => {
  if (!fs.existsSync(config.dataDir)) {
    res.status(404).json({ error: `Data directory not found: ${config.dataDir}` });
    return;
  }

  const files = fs.readdirSync(config.dataDir).filter(f => f.endsWith('.txt'));
  res.json({ message: `Starting batch for ${files.length} files`, files });

  // Run in background (fire and forget for now)
  runBatch(files).catch(console.error);
});

async function runBatch(files: string[]) {
  for (const file of files) {
    const candidateId = path.basename(file, '.txt');
    const filePath = path.join(config.dataDir, file);
    try {
      const candidate = await splitIdeaUnits(filePath, candidateId);
      saveOutput(candidateId, candidate);
    } catch (err) {
      console.error(`[Batch] Failed for ${file}:`, err);
    }
  }
  console.log('[Batch] Complete');
}

function saveOutput(candidateId: string, data: object) {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }
  const outPath = path.join(config.outputDir, `${candidateId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`[Output] Saved: ${outPath}`);
}

app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});
