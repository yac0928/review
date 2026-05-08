/**
 * Copies mock_01~35 from output_mock_old into output_mock as mock_101~135.
 * - Updates candidate_id and idea_unit ids
 * - Clears: standard_sub_criteria_map, feature_vector, radar_chart_data,
 *           cluster_id, cluster_name, is_medoid, distinctive_hashtags
 *
 * Usage:
 *   npm run copy:old-mocks
 */
import fs from 'fs';
import path from 'path';
import { Candidate } from '../src/types';

const OLD_DIR = path.resolve(__dirname, '../output_mock_old');
const NEW_DIR = path.resolve(__dirname, '../output_mock');
const EXCLUDED = new Set(['standard_dictionary.json', 'embeddings_cache.json', 'clusters.json']);

function main() {
  const files = fs.readdirSync(OLD_DIR)
    .filter(f => f.endsWith('.json') && !EXCLUDED.has(f))
    .sort();

  console.log(`[CopyOldMocks] Found ${files.length} candidate file(s) in output_mock_old`);

  for (const file of files) {
    const m = file.match(/^mock_(\d+)\.json$/);
    if (!m) {
      console.warn(`[CopyOldMocks] Skipping unexpected file: ${file}`);
      continue;
    }

    const oldNum = parseInt(m[1], 10);
    const newNum = oldNum + 100;
    const oldId = `mock_${m[1]}`;           // e.g. "mock_01"
    const newId = `mock_${newNum}`;          // e.g. "mock_101"

    const candidate: Candidate = JSON.parse(
      fs.readFileSync(path.join(OLD_DIR, file), 'utf-8')
    );

    candidate.candidate_id = newId;

    // Clear candidate-level derived fields
    delete candidate.feature_vector;
    delete candidate.radar_chart_data;
    delete candidate.cluster_id;
    delete candidate.cluster_name;
    delete candidate.is_medoid;
    delete candidate.distinctive_hashtags;

    // Update each idea unit
    for (const unit of candidate.idea_units) {
      unit.candidate_id = newId;
      unit.id = unit.id.replace(new RegExp(`^${oldId}`), newId);
      delete unit.standard_sub_criteria_map;
      delete unit.embedding;
    }

    const outPath = path.join(NEW_DIR, `${newId}.json`);

    if (fs.existsSync(outPath)) {
      console.warn(`[CopyOldMocks] ${newId}.json already exists — overwriting`);
    }

    fs.writeFileSync(outPath, JSON.stringify(candidate, null, 2), 'utf-8');
    console.log(`[CopyOldMocks] ${file} → ${newId}.json`);
  }

  console.log(`[CopyOldMocks] Done. ${files.length} file(s) copied.`);
}

main();
