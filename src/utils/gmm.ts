import { kMeans } from './kmeans';

export interface GMMResult {
  labels: number[];
  logLikelihood: number;
  bic: number;
}

function logSumExp(vals: number[]): number {
  const max = Math.max(...vals);
  if (!isFinite(max)) return -Infinity;
  return max + Math.log(vals.reduce((s, v) => s + Math.exp(v - max), 0));
}

// Diagonal covariance Gaussian log PDF
function logPdf(x: number[], mean: number[], variance: number[]): number {
  let lp = 0;
  for (let d = 0; d < x.length; d++) {
    const v = Math.max(variance[d], 1e-6);
    lp += -0.5 * (Math.log(2 * Math.PI * v) + (x[d] - mean[d]) ** 2 / v);
  }
  return lp;
}

export function fitGMM(
  vectors: number[][],
  k: number,
  maxIter = 100,
  tol = 1e-4
): GMMResult {
  const n = vectors.length;
  const D = vectors[0].length;

  // Warm-start from K-Means
  const init = kMeans(vectors, k);
  const weights = new Array(k).fill(1 / k);
  const means: number[][] = init.centroids.map(c => [...c]);
  const variances: number[][] = Array.from({ length: k }, () => new Array(D).fill(1.0));

  // Initialize variances from K-Means assignments
  const counts = new Array(k).fill(0);
  for (let i = 0; i < n; i++) counts[init.labels[i]]++;
  for (let c = 0; c < k; c++) {
    const members = vectors.filter((_, i) => init.labels[i] === c);
    if (members.length === 0) continue;
    weights[c] = members.length / n;
    for (let d = 0; d < D; d++) {
      const v = members.reduce((s, x) => s + (x[d] - means[c][d]) ** 2, 0) / members.length;
      variances[c][d] = Math.max(v, 1e-6);
    }
  }

  let prevLL = -Infinity;

  for (let iter = 0; iter < maxIter; iter++) {
    // E-step: log responsibilities
    const logResp: number[][] = [];
    let totalLL = 0;

    for (let i = 0; i < n; i++) {
      const logProbs = Array.from({ length: k }, (_, c) =>
        Math.log(Math.max(weights[c], 1e-300)) + logPdf(vectors[i], means[c], variances[c])
      );
      const logZ = logSumExp(logProbs);
      logResp.push(logProbs.map(lp => lp - logZ));
      totalLL += logZ;
    }

    if (Math.abs(totalLL - prevLL) < tol) { prevLL = totalLL; break; }
    prevLL = totalLL;

    // M-step
    for (let c = 0; c < k; c++) {
      const resp = logResp.map(r => Math.exp(r[c]));
      const Nc = Math.max(resp.reduce((s, r) => s + r, 0), 1e-10);
      weights[c] = Nc / n;
      for (let d = 0; d < D; d++) {
        means[c][d] = resp.reduce((s, r, i) => s + r * vectors[i][d], 0) / Nc;
        variances[c][d] = Math.max(
          resp.reduce((s, r, i) => s + r * (vectors[i][d] - means[c][d]) ** 2, 0) / Nc,
          1e-6
        );
      }
    }
  }

  // Hard assignments
  const labels = vectors.map(v => {
    const logProbs = Array.from({ length: k }, (_, c) =>
      Math.log(Math.max(weights[c], 1e-300)) + logPdf(v, means[c], variances[c])
    );
    return logProbs.indexOf(Math.max(...logProbs));
  });

  // BIC: diagonal covariance has k*(2D+1)-1 free parameters
  const numParams = k * (2 * D + 1) - 1;
  const bic = numParams * Math.log(n) - 2 * prevLL;

  return { labels, logLikelihood: prevLL, bic };
}

export function findBestGMMK(
  vectors: number[][],
  minK = 2,
  maxK = 6,
  numRuns = 3
): { k: number; result: GMMResult } {
  const effectiveMax = Math.min(maxK, vectors.length - 1);
  const effectiveMin = Math.min(minK, effectiveMax);

  let bestK = effectiveMin;
  let bestBIC = Infinity;
  let bestResult: GMMResult | null = null;

  for (let k = effectiveMin; k <= effectiveMax; k++) {
    let best: GMMResult | null = null;
    for (let run = 0; run < numRuns; run++) {
      try {
        const result = fitGMM(vectors, k);
        if (!best || result.bic < best.bic) best = result;
      } catch { /* degenerate run, skip */ }
    }
    if (!best) continue;

    console.log(`  GMM K=${k}: BIC=${best.bic.toFixed(1)}, logL=${best.logLikelihood.toFixed(2)}`);

    if (best.bic < bestBIC) {
      bestBIC = best.bic;
      bestK = k;
      bestResult = best;
    }
  }

  return { k: bestK, result: bestResult! };
}
