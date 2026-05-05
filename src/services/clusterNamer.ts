import fs from 'fs';
import path from 'path';
import { Candidate } from '../types';
import { callGeminiJSON } from './gemini';
import { ClusterSummary } from './candidateClusterer';
import {
  CLUSTER_GROUP_NAMING_SYSTEM_PROMPT,
  buildClusterGroupNamingPrompt,
} from '../prompts/clusterGroupNaming';

const EXCLUDED = new Set(['standard_dictionary.json', 'embeddings_cache.json', 'clusters.json']);
const TOP_SUB_CRITERIA = 5;
const TOP_HASHTAGS = 10;
const INTER_CLUSTER_DELAY_MS = 1_500;

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function loadCandidate(outputDir: string, id: string): Candidate {
  return JSON.parse(fs.readFileSync(path.join(outputDir, `${id}.json`), 'utf-8')) as Candidate;
}

function saveCandidate(outputDir: string, candidate: Candidate) {
  fs.writeFileSync(
    path.join(outputDir, `${candidate.candidate_id}.json`),
    JSON.stringify(candidate, null, 2),
    'utf-8'
  );
}

function collectClusterFeatures(
  outputDir: string,
  memberIds: string[]
): {
  topSubCriteria: Array<{ name: string; count: number }>;
  topHashtags: Array<{ tag: string; count: number }>;
} {
  const subCount = new Map<string, number>();
  const tagCount = new Map<string, number>();

  for (const id of memberIds) {
    const candidate = loadCandidate(outputDir, id);

    for (const unit of candidate.idea_units) {
      // Sub-criteria from standard map
      for (const name of Object.values(unit.standard_sub_criteria_map ?? {})) {
        if (name) subCount.set(name, (subCount.get(name) ?? 0) + 1);
      }
      // Hashtags — count per candidate (not per unit) to avoid inflation
    }

    // Count hashtag presence per candidate (not per idea unit)
    const candidateTags = new Set<string>();
    for (const unit of candidate.idea_units) {
      for (const tag of unit.hashtags ?? []) candidateTags.add(tag);
    }
    for (const tag of candidateTags) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }
  }

  const topSubCriteria = [...subCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_SUB_CRITERIA)
    .map(([name, count]) => ({ name, count }));

  const topHashtags = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_HASHTAGS)
    .map(([tag, count]) => ({ tag, count }));

  return { topSubCriteria, topHashtags };
}

async function nameCluster(
  clusterId: number,
  topSubCriteria: Array<{ name: string; count: number }>,
  topHashtags: Array<{ tag: string; count: number }>
): Promise<string> {
  const userPrompt = buildClusterGroupNamingPrompt(clusterId, topSubCriteria, topHashtags);
  const result = await callGeminiJSON<{ name: string }>(
    CLUSTER_GROUP_NAMING_SYSTEM_PROMPT,
    userPrompt
  );
  if (typeof result?.name !== 'string' || result.name.trim().length === 0) {
    throw new Error(`Cluster ${clusterId} naming returned invalid result`);
  }
  return result.name.trim();
}

export async function nameAllClusters(outputDir: string): Promise<void> {
  const clustersPath = path.join(outputDir, 'clusters.json');
  if (!fs.existsSync(clustersPath)) {
    throw new Error('clusters.json not found. Run Step 7 first.');
  }

  const summary: ClusterSummary = JSON.parse(fs.readFileSync(clustersPath, 'utf-8'));

  console.log(`[Step 8] Naming ${summary.clusters.length} cluster(s)...\n`);

  for (let i = 0; i < summary.clusters.length; i++) {
    const cluster = summary.clusters[i];

    if (cluster.cluster_name) {
      console.log(`[Step 8] Cluster ${cluster.cluster_id}: already named "${cluster.cluster_name}", skipping`);
      continue;
    }

    const { topSubCriteria, topHashtags } = collectClusterFeatures(outputDir, cluster.members);
    const name = await nameCluster(cluster.cluster_id, topSubCriteria, topHashtags);
    console.log(`[Step 8] Cluster ${cluster.cluster_id} → "${name}"`);
    console.log(`  Sub-criteria: ${topSubCriteria.map(s => `${s.name}(${s.count})`).join(', ')}`);
    console.log(`  Hashtags: ${topHashtags.slice(0, 5).map(t => `${t.tag}(${t.count})`).join(', ')}`);

    // Write name + stats back to summary
    (cluster as any).cluster_name = name;
    (cluster as any).top_sub_criteria = topSubCriteria;
    (cluster as any).top_hashtags = topHashtags;

    // Write cluster_name to every member's candidate file
    for (const memberId of cluster.members) {
      const candidate = loadCandidate(outputDir, memberId);
      candidate.cluster_name = name;
      saveCandidate(outputDir, candidate);
    }

    if (i < summary.clusters.length - 1) {
      await sleep(INTER_CLUSTER_DELAY_MS);
    }
  }

  fs.writeFileSync(clustersPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log('\n[Step 8] clusters.json updated with cluster names.');
}
