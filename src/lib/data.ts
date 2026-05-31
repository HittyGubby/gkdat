import type {
  RawData,
  ProvinceEntry,
  ProvinceProcessed,
  ProvinceStats,
} from "./types";

export function preprocessData(
  raw: RawData,
): Record<string, ProvinceProcessed> {
  const result: Record<string, ProvinceProcessed> = {};

  for (const [province, scoreMap] of Object.entries(raw)) {
    const entries = computeEntries(scoreMap);
    const stats = computeStats(province, entries);
    result[province] = { entries, stats };
  }

  return result;
}

function computeEntries(scoreMap: Record<string, number>): ProvinceEntry[] {
  const parsed: { score: number; rankEnd: number }[] = [];

  for (const [s, r] of Object.entries(scoreMap)) {
    parsed.push({ score: parseInt(s), rankEnd: r });
  }

  parsed.sort((a, b) => b.score - a.score);

  // total should be the rankEnd of the LOWEST score (last after desc sort),
  // which represents the total number of students scoring >= that score.
  const total = parsed[parsed.length - 1]?.rankEnd ?? 0;
  const entries: ProvinceEntry[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const { score, rankEnd } = parsed[i];
    const sameScoreCount = i === 0 ? rankEnd : rankEnd - parsed[i - 1].rankEnd;
    const cdf = rankEnd / total;
    const survivalRate = 1 - cdf;
    const percentile = survivalRate * 100;
    const density = sameScoreCount / total;

    entries.push({
      score,
      rankEnd,
      sameScoreCount,
      percentile,
      survivalRate,
      cdf,
      zScore: 0,
      density,
    });
  }

  // Compute mean
  let weightedSum = 0;
  for (const e of entries) {
    weightedSum += e.score * e.sameScoreCount;
  }
  const mean = weightedSum / total;

  // Compute variance
  let varianceSum = 0;
  for (const e of entries) {
    varianceSum += e.sameScoreCount * (e.score - mean) ** 2;
  }
  const variance = varianceSum / total;
  const std = Math.sqrt(variance);

  // Assign zScores
  for (const e of entries) {
    e.zScore = std > 0 ? (e.score - mean) / std : 0;
  }

  return entries;
}

function computeStats(
  province: string,
  entries: ProvinceEntry[],
): ProvinceStats {
  if (entries.length === 0) {
    return {
      province,
      total: 0,
      mean: 0,
      std: 0,
      variance: 0,
      skewness: 0,
      kurtosis: 0,
    };
  }

  // total is the rankEnd of the LOWEST score entry (last element, since entries are sorted descending)
  const total = entries[entries.length - 1].rankEnd;

  // Mean
  let mean = 0;
  for (const e of entries) {
    mean += e.score * e.sameScoreCount;
  }
  mean /= total;

  // Variance
  let variance = 0;
  for (const e of entries) {
    variance += e.sameScoreCount * (e.score - mean) ** 2;
  }
  variance /= total;
  const std = Math.sqrt(variance);

  // Skewness
  let skewness = 0;
  if (std > 0) {
    for (const e of entries) {
      skewness += e.sameScoreCount * ((e.score - mean) / std) ** 3;
    }
    skewness /= total;
  }

  // Kurtosis
  let kurtosis = 0;
  if (std > 0) {
    for (const e of entries) {
      kurtosis += e.sameScoreCount * ((e.score - mean) / std) ** 4;
    }
    kurtosis /= total;
  }

  return { province, total, mean, std, variance, skewness, kurtosis };
}

// Gaussian KDE
export function computeKDE(
  entries: ProvinceEntry[],
  bandwidth: number,
  xMin: number,
  xMax: number,
  xType: "score" | "zscore" | "percentile",
): [number, number][] {
  const numPoints = 200;
  const step = (xMax - xMin) / (numPoints - 1);
  const result: [number, number][] = [];

  // Prepare weighted points
  const points: { x: number; w: number }[] = [];
  // total is the rankEnd of the LOWEST score entry
  const total = entries[entries.length - 1]?.rankEnd ?? 1;

  for (const e of entries) {
    let x: number;
    if (xType === "score") x = e.score;
    else if (xType === "zscore") x = e.zScore;
    else x = e.percentile;
    points.push({ x, w: e.sameScoreCount / total });
  }

  for (let i = 0; i < numPoints; i++) {
    const x = xMin + i * step;
    let density = 0;
    for (const p of points) {
      const u = (x - p.x) / bandwidth;
      density += p.w * gaussianKernel(u);
    }
    // No extra bandwidth division needed: each kernel already includes 1/bandwidth
    result.push([x, density]);
  }

  return result;
}

function gaussianKernel(u: number): number {
  return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
}

// Normal distribution PDF
export function normalPDF(x: number, mean: number, std: number): number {
  if (std <= 0) return 0;
  const z = (x - mean) / std;
  return Math.exp(-0.5 * z * z) / (std * Math.sqrt(2 * Math.PI));
}

// Compute normal fit curve data (density values, comparable to KDE output)
export function computeNormalFit(
  mean: number,
  std: number,
  xMin: number,
  xMax: number,
  xType: "score" | "zscore" | "percentile",
): [number, number][] {
  if (std <= 0) return [];
  const numPoints = 200;
  const step = (xMax - xMin) / (numPoints - 1);
  const result: [number, number][] = [];

  for (let i = 0; i < numPoints; i++) {
    const x = xMin + i * step;
    let val: number;

    if (xType === "score") {
      val = normalPDF(x, mean, std);
    } else if (xType === "zscore") {
      val = normalPDF(x, 0, 1);
    } else {
      // percentile x-axis: map percentile back to z-score then compute density
      // x is a percentile (0-100). Convert to probability, then to z-score.
      const p = x / 100;
      const z = Math.sqrt(2) * inverseErf(2 * p - 1);
      val = normalPDF(z, 0, 1);
    }
    result.push([x, val]);
  }

  return result;
}

// Inverse error function using rational approximation
function inverseErf(x: number): number {
  if (x <= -1) return -Infinity;
  if (x >= 1) return Infinity;
  const a = 0.147;
  const ln = Math.log(1 - x * x);
  const part1 = 2 / (Math.PI * a) + ln / 2;
  const part2 = ln / a;
  const sign = x >= 0 ? 1 : -1;
  return sign * Math.sqrt(Math.sqrt(part1 * part1 - part2) - part1);
}

export function computeResiduals(
  entries: ProvinceEntry[],
  mean: number,
  std: number,
  xMin: number,
  xMax: number,
  bandwidth: number,
  xType: "score" | "zscore" | "percentile",
): [number, number][] {
  if (std <= 0) return [];
  const kdeData = computeKDE(entries, bandwidth, xMin, xMax, xType);
  const result: [number, number][] = [];

  for (const [x, kdeVal] of kdeData) {
    let normalVal: number;
    if (xType === "score") {
      normalVal = normalPDF(x, mean, std);
    } else if (xType === "zscore") {
      normalVal = normalPDF(x, 0, 1);
    } else {
      const p = x / 100;
      const z = Math.sqrt(2) * inverseErf(2 * p - 1);
      normalVal = normalPDF(z, 0, 1);
    }
    result.push([x, kdeVal - normalVal]);
  }

  return result;
}
