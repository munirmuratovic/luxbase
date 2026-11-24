function mean(vectors: number[][]): number[] {
  const dim = vectors[0].length;
  const out = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  return out.map((s) => s / vectors.length);
}

function subtractMean(vectors: number[][], m: number[]): number[][] {
  return vectors.map((v) => v.map((x, i) => x - m[i]));
}

function covarianceMatrix(centered: number[][]): number[][] {
  const dim = centered[0].length;
  const cov = Array.from({ length: dim }, () => new Array(dim).fill(0));
  for (const v of centered) {
    for (let i = 0; i < dim; i++) {
      for (let j = i; j < dim; j++) {
        cov[i][j] += v[i] * v[j];
      }
    }
  }
  const n = centered.length - 1 || 1;
  for (let i = 0; i < dim; i++) {
    for (let j = i; j < dim; j++) {
      cov[i][j] /= n;
      cov[j][i] = cov[i][j];
    }
  }
  return cov;
}

function matVec(m: number[][], v: number[]): number[] {
  return m.map((row) => row.reduce((sum, x, i) => sum + x * v[i], 0));
}

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function dot(a: number[], b: number[]): number {
  return a.reduce((s, x, i) => s + x * b[i], 0);
}

// Power iteration to find the top-k eigenvectors of a symmetric matrix.
function topEigenvectors(cov: number[][], k: number, iterations = 200): number[][] {
  const dim = cov.length;
  const eigenvectors: number[][] = [];

  for (let e = 0; e < k; e++) {
    let v = normalize(Array.from({ length: dim }, () => Math.random() - 0.5));
    for (let iter = 0; iter < iterations; iter++) {
      let next = matVec(cov, v);
      for (const prev of eigenvectors) {
        const proj = dot(next, prev);
        next = next.map((x, i) => x - proj * prev[i]);
      }
      next = normalize(next);
      v = next;
    }
    eigenvectors.push(v);
  }

  return eigenvectors;
}

export function pca2d(vectors: number[][]): { x: number; y: number }[] {
  if (vectors.length === 0) return [];
  if (vectors.length === 1) return [{ x: 0, y: 0 }];

  const m = mean(vectors);
  const centered = subtractMean(vectors, m);
  const cov = covarianceMatrix(centered);
  const [pc1, pc2] = topEigenvectors(cov, 2);

  return centered.map((v) => ({
    x: dot(v, pc1),
    y: dot(v, pc2),
  }));
}
