import fs from 'fs';
import path from 'path';
import { UMAP } from 'umap-js';
import { Candidate, CriterionId } from '../types';
import { findBestK, silhouetteScore } from '../utils/kmeans';
import { findBestGMMK } from '../utils/gmm';

const EXCLUDED = new Set(['standard_dictionary.json', 'embeddings_cache.json']);

// ── Data loading ───────────────────────────────────────────────────────────

interface CandidateEntry {
  id: string;
  vector: number[];
  file: string;
}

function loadEntries(outputDir: string): CandidateEntry[] {
  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.json') && !EXCLUDED.has(f));
  const entries: CandidateEntry[] = [];

  for (const file of files) {
    const candidate: Candidate = JSON.parse(fs.readFileSync(path.join(outputDir, file), 'utf-8'));
    if (!candidate.feature_vector || candidate.feature_vector.length === 0) {
      console.warn(`[Step 7] ${candidate.candidate_id}: missing feature_vector, skipping`);
      continue;
    }
    entries.push({ id: candidate.candidate_id, vector: candidate.feature_vector, file });
  }

  return entries;
}

// ── Medoid detection ───────────────────────────────────────────────────────

function euclidean(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
}

function findMedoids(entries: CandidateEntry[], labels: number[], k: number): Map<number, string> {
  const medoids = new Map<number, string>();

  for (let c = 0; c < k; c++) {
    const members = entries.filter((_, i) => labels[i] === c);
    if (members.length === 0) continue;

    let bestId = members[0].id;
    let bestAvgDist = Infinity;

    for (const m of members) {
      const avgDist = members.reduce((s, other) => s + euclidean(m.vector, other.vector), 0) / members.length;
      if (avgDist < bestAvgDist) { bestAvgDist = avgDist; bestId = m.id; }
    }

    medoids.set(c, bestId);
  }

  return medoids;
}

// ── UMAP + HTML generation ─────────────────────────────────────────────────

const CLUSTER_COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4'];

function runUMAP(vectors: number[][], n: number): number[][] {
  const nNeighbors = Math.min(15, Math.max(2, Math.floor(n / 3)));
  const umap = new UMAP({ nComponents: 2, nNeighbors, minDist: 0.1 });
  return umap.fit(vectors);
}

function generateHtml(
  points2d: number[][],
  entries: CandidateEntry[],
  labels: number[],
  medoids: Map<number, string>,
  k: number,
  algorithm: string,
  silhouette: number
): string {
  // Build one trace per cluster
  const traces: object[] = [];

  for (let c = 0; c < k; c++) {
    const color = CLUSTER_COLORS[c % CLUSTER_COLORS.length];
    const memberIndices = entries.map((_, i) => i).filter(i => labels[i] === c);

    const normal = memberIndices.filter(i => medoids.get(c) !== entries[i].id);
    const medoidIdx = memberIndices.find(i => medoids.get(c) === entries[i].id);

    if (normal.length > 0) {
      traces.push({
        x: normal.map(i => points2d[i][0]),
        y: normal.map(i => points2d[i][1]),
        text: normal.map(i => entries[i].id),
        mode: 'markers',
        type: 'scatter',
        name: `Cluster ${c}`,
        marker: { color, size: 10, symbol: 'circle' },
        hovertemplate: '%{text}<extra></extra>',
      });
    }

    if (medoidIdx !== undefined) {
      traces.push({
        x: [points2d[medoidIdx][0]],
        y: [points2d[medoidIdx][1]],
        text: [entries[medoidIdx].id + ' ★'],
        mode: 'markers',
        type: 'scatter',
        name: `Cluster ${c} (medoid)`,
        marker: { color, size: 16, symbol: 'star', line: { color: '#000', width: 1 } },
        hovertemplate: '%{text}<extra></extra>',
        showlegend: false,
      });
    }
  }

  const tracesJson = JSON.stringify(traces);
  const title = `Candidate Clustering — ${algorithm.toUpperCase()} K=${k}  |  Silhouette=${silhouette.toFixed(3)}`;

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<title>Candidate Clustering</title>
<script src="https://cdn.plot.ly/plotly-2.26.0.min.js"></script>
<style>body { margin: 0; font-family: sans-serif; } #plot { width: 100vw; height: 100vh; }</style>
</head>
<body>
<div id="plot"></div>
<script>
Plotly.newPlot('plot', ${tracesJson}, {
  title: { text: ${JSON.stringify(title)}, font: { size: 15 } },
  xaxis: { title: 'UMAP-1', zeroline: false },
  yaxis: { title: 'UMAP-2', zeroline: false },
  hovermode: 'closest',
  legend: { orientation: 'v' },
});
</script>
</body>
</html>`;
}

// ── Step 7 main ────────────────────────────────────────────────────────────

export interface ClusterSummary {
  algorithm: string;
  k: number;
  silhouette: number;
  clusters: Array<{
    cluster_id: number;
    size: number;
    medoid: string;
    members: string[];
  }>;
}

export async function clusterCandidates(
  outputDir: string,
  minK = 2,
  maxK = 6
): Promise<ClusterSummary> {
  const entries = loadEntries(outputDir);
  const n = entries.length;
  const vectors = entries.map(e => e.vector);

  if (n < 2) throw new Error('[Step 7] Need at least 2 candidates with feature vectors');

  // ── K-Means ──
  console.log('\n[Step 7] Running K-Means...');
  const { k: kmK, result: kmResult } = findBestK(vectors, minK, maxK);
  const kmSil = silhouetteScore(vectors, kmResult.labels);
  console.log(`  K-Means best K=${kmK}, silhouette=${kmSil.toFixed(4)}`);

  // ── GMM ──
  console.log('\n[Step 7] Running GMM...');
  const { k: gmmK, result: gmmResult } = findBestGMMK(vectors, minK, maxK);
  const gmmSil = silhouetteScore(vectors, gmmResult.labels);
  console.log(`  GMM best K=${gmmK}, silhouette=${gmmSil.toFixed(4)}`);

  // ── Pick winner by silhouette ──
  const useKMeans = kmSil >= gmmSil;
  const winAlgo = useKMeans ? 'kmeans' : 'gmm';
  const winK = useKMeans ? kmK : gmmK;
  const winLabels = useKMeans ? kmResult.labels : gmmResult.labels;
  const winSil = useKMeans ? kmSil : gmmSil;
  console.log(`\n[Step 7] Winner: ${winAlgo.toUpperCase()} K=${winK} (silhouette=${winSil.toFixed(4)})`);

  // ── Medoids ──
  const medoids = findMedoids(entries, winLabels, winK);

  // ── Update candidate files ──
  for (let i = 0; i < entries.length; i++) {
    const filePath = path.join(outputDir, entries[i].file);
    const candidate: Candidate = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    candidate.cluster_id = winLabels[i];
    candidate.is_medoid = medoids.get(winLabels[i]) === entries[i].id;
    fs.writeFileSync(filePath, JSON.stringify(candidate, null, 2), 'utf-8');
  }

  // ── Build + save summary ──
  const summary: ClusterSummary = {
    algorithm: winAlgo,
    k: winK,
    silhouette: winSil,
    clusters: Array.from({ length: winK }, (_, c) => ({
      cluster_id: c,
      size: winLabels.filter(l => l === c).length,
      medoid: medoids.get(c) ?? '',
      members: entries.filter((_, i) => winLabels[i] === c).map(e => e.id),
    })),
  };

  fs.writeFileSync(path.join(outputDir, 'clusters.json'), JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`[Step 7] Saved clusters.json`);

  // ── UMAP + HTML ──
  console.log('\n[Step 7] Running UMAP...');
  const points2d = runUMAP(vectors, n);
  const html = generateHtml(points2d, entries, winLabels, medoids, winK, winAlgo, winSil);
  const htmlPath = path.join(outputDir, 'umap.html');
  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log(`[Step 7] Saved umap.html → open in browser to view`);

  return summary;
}
