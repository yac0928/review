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

function collectSubCriteria(
  outputDir: string,
  memberIds: string[]
): Array<{ name: string; count: number }> {
  const subCount = new Map<string, number>();

  for (const id of memberIds) {
    const candidate = loadCandidate(outputDir, id);
    for (const unit of candidate.idea_units) {
      for (const name of Object.values(unit.standard_sub_criteria_map ?? {})) {
        if (name) subCount.set(name, (subCount.get(name) ?? 0) + 1);
      }
    }
  }

  return [...subCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_SUB_CRITERIA)
    .map(([name, count]) => ({ name, count }));
}

export async function nameAllClusters(outputDir: string): Promise<void> {
  const clustersPath = path.join(outputDir, 'clusters.json');
  if (!fs.existsSync(clustersPath)) {
    throw new Error('clusters.json not found. Run Step 7 first.');
  }

  const summary: ClusterSummary = JSON.parse(fs.readFileSync(clustersPath, 'utf-8'));

  // Skip if all clusters already named
  const unnamed = summary.clusters.filter(c => !c.cluster_name);
  if (unnamed.length === 0) {
    console.log('[Step 8] All clusters already named, skipping.');
    return;
  }

  console.log(`[Step 8] Naming ${summary.clusters.length} cluster(s) in one LLM call...\n`);

  // Collect sub-criteria for all clusters
  const clusterFeatures = summary.clusters.map(cluster => {
    const topSubCriteria = collectSubCriteria(outputDir, cluster.members);
    console.log(`[Step 8] Cluster ${cluster.cluster_id} (${cluster.members.length} members)`);
    console.log(`  Sub-criteria: ${topSubCriteria.map(s => `${s.name}(${s.count})`).join(', ')}`);
    return {
      clusterId: cluster.cluster_id,
      size: cluster.members.length,
      topSubCriteria,
    };
  });

  // Single LLM call for all clusters
  const userPrompt = buildClusterGroupNamingPrompt(clusterFeatures);
  const result = await callGeminiJSON<{
    clusters: Record<string, { name: string; description: string }>;
  }>(CLUSTER_GROUP_NAMING_SYSTEM_PROMPT, userPrompt);

  if (!result?.clusters || typeof result.clusters !== 'object') {
    throw new Error(`Cluster naming returned invalid result: ${JSON.stringify(result)}`);
  }

  console.log('\n[Step 8] Names assigned:');

  // Write names and descriptions back
  for (const cluster of summary.clusters) {
    const entry = result.clusters[String(cluster.cluster_id)];
    if (!entry?.name || typeof entry.name !== 'string' || entry.name.trim().length === 0) {
      console.warn(`[Step 8] Cluster ${cluster.cluster_id}: no name returned, skipping`);
      continue;
    }

    const trimmedName = entry.name.trim();
    const trimmedDesc = (entry.description ?? '').trim();
    console.log(`  Cluster ${cluster.cluster_id} → "${trimmedName}"`);
    if (trimmedDesc) console.log(`    ${trimmedDesc}`);

    (cluster as any).cluster_name = trimmedName;
    (cluster as any).cluster_description = trimmedDesc;
    (cluster as any).top_sub_criteria = clusterFeatures.find(
      f => f.clusterId === cluster.cluster_id
    )?.topSubCriteria ?? [];

    for (const memberId of cluster.members) {
      const candidate = loadCandidate(outputDir, memberId);
      candidate.cluster_name = trimmedName;
      candidate.cluster_description = trimmedDesc;
      saveCandidate(outputDir, candidate);
    }
  }

  fs.writeFileSync(clustersPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log('\n[Step 8] clusters.json updated with cluster names.');
}
