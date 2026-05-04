export interface KMeansResult {
  labels: number[];
  centroids: number[][];
  inertia: number;
}

function euclideanSq(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return sum;
}

function norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

function normalizeVectors(vectors: number[][]): number[][] {
  return vectors.map(v => {
    const n = norm(v);
    return n > 0 ? v.map(x => x / n) : v;
  });
}

function initKMeansPlusPlus(vectors: number[][], k: number): number[][] {
  const n = vectors.length;
  const centroids: number[][] = [];
  centroids.push([...vectors[Math.floor(Math.random() * n)]]);

  for (let c = 1; c < k; c++) {
    const dists = vectors.map(v =>
      Math.min(...centroids.map(cent => euclideanSq(v, cent)))
    );
    const total = dists.reduce((s, d) => s + d, 0);
    let rand = Math.random() * total;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      rand -= dists[i];
      if (rand <= 0) { chosen = i; break; }
    }
    centroids.push([...vectors[chosen]]);
  }

  return centroids;
}

export function kMeans(vectors: number[][], k: number, maxIter = 150): KMeansResult {
  const normalized = normalizeVectors(vectors);
  const n = normalized.length;
  const d = normalized[0].length;
  let centroids = initKMeansPlusPlus(normalized, k);
  let labels = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Assignment
    const newLabels = normalized.map(v => {
      let minDist = Infinity;
      let minIdx = 0;
      for (let c = 0; c < k; c++) {
        const dist = euclideanSq(v, centroids[c]);
        if (dist < minDist) { minDist = dist; minIdx = c; }
      }
      return minIdx;
    });

    if (newLabels.every((l, i) => l === labels[i])) break;
    labels = newLabels;

    // Update centroids
    const sums = Array.from({ length: k }, () => new Array(d).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      counts[c]++;
      for (let j = 0; j < d; j++) sums[c][j] += normalized[i][j];
    }

    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centroids[c] = sums[c].map(x => x / counts[c]);
        const cn = norm(centroids[c]);
        if (cn > 0) centroids[c] = centroids[c].map(x => x / cn);
      }
    }
  }

  const inertia = normalized.reduce(
    (sum, v, i) => sum + euclideanSq(v, centroids[labels[i]]),
    0
  );

  return { labels, centroids, inertia };
}

// Average silhouette score: higher is better (range [-1, 1])
export function silhouetteScore(vectors: number[][], labels: number[]): number {
  const normalized = normalizeVectors(vectors);
  const n = normalized.length;
  const k = Math.max(...labels) + 1;

  if (k < 2 || k >= n) return 0;

  const scores: number[] = [];

  for (let i = 0; i < n; i++) {
    // intra-cluster mean distance
    const sameCluster = normalized.filter((_, j) => j !== i && labels[j] === labels[i]);
    const a = sameCluster.length === 0
      ? 0
      : sameCluster.reduce((s, v) => s + Math.sqrt(euclideanSq(normalized[i], v)), 0) / sameCluster.length;

    // nearest other-cluster mean distance
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === labels[i]) continue;
      const other = normalized.filter((_, j) => labels[j] === c);
      if (other.length === 0) continue;
      const meanDist = other.reduce((s, v) => s + Math.sqrt(euclideanSq(normalized[i], v)), 0) / other.length;
      if (meanDist < b) b = meanDist;
    }

    const maxAB = Math.max(a, b);
    scores.push(maxAB === 0 ? 0 : (b - a) / maxAB);
  }

  return scores.reduce((s, x) => s + x, 0) / scores.length;
}

export function findBestK(
  vectors: number[][],
  minK = 2,
  maxK = 6,
  numRuns = 3
): { k: number; result: KMeansResult } {
  const effectiveMax = Math.min(maxK, vectors.length - 1);
  const effectiveMin = Math.min(minK, effectiveMax);

  let bestK = effectiveMin;
  let bestScore = -Infinity;
  let bestResult: KMeansResult | null = null;

  for (let k = effectiveMin; k <= effectiveMax; k++) {
    let best: KMeansResult | null = null;
    for (let run = 0; run < numRuns; run++) {
      const result = kMeans(vectors, k);
      if (!best || result.inertia < best.inertia) best = result;
    }
    if (!best) continue;

    const score = silhouetteScore(vectors, best.labels);
    console.log(`  K=${k}: silhouette=${score.toFixed(4)}, inertia=${best.inertia.toFixed(4)}`);

    if (score > bestScore) {
      bestScore = score;
      bestK = k;
      bestResult = best;
    }
  }

  return { k: bestK, result: bestResult! };
}
