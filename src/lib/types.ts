export interface ProvinceEntry {
  score: number;
  rankEnd: number;
  sameScoreCount: number;
  percentile: number;
  survivalRate: number;
  cdf: number;
  zScore: number;
  density: number;
}

export interface ProvinceStats {
  province: string;
  total: number;
  mean: number;
  std: number;
  variance: number;
  skewness: number;
  kurtosis: number;
}

export interface ProvinceProcessed {
  entries: ProvinceEntry[];
  stats: ProvinceStats;
}

export type RawData = Record<string, Record<string, number>>;

export type XAxisType = "score" | "zscore" | "percentile";
export type YAxisType = "count" | "density" | "cdf" | "survival" | "rank";

export type DisplayMode = "histogram" | "kde" | "normalFit";

export interface LayerOptions {
  mode: DisplayMode;
  mean: boolean;
  sigma1: boolean;
  sigma2: boolean;
  sigma3: boolean;
}

export interface CoordOptions {
  logY: boolean;
  logX: boolean;
  smoothLines: boolean;
  showPoints: boolean;
}

export interface AppState {
  selectedProvinces: string[];
  xAxis: XAxisType;
  yAxis: YAxisType;
  normalizeY: boolean;
  layers: LayerOptions;
  kdeBandwidth: number;
  coord: CoordOptions;
}
