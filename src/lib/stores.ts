import { writable } from "svelte/store";
import type { XAxisType, YAxisType, LayerOptions, CoordOptions } from "./types";

export const selectedProvinces = writable<string[]>([]);
export const xAxis = writable<XAxisType>("score");
export const yAxis = writable<YAxisType>("count");
export const normalizeY = writable(false);
export const layers = writable<LayerOptions>({
  mode: "histogram",
  mean: false,
  sigma1: false,
  sigma2: false,
  sigma3: false,
});
export const kdeBandwidth = writable(5);
export const coord = writable<CoordOptions>({
  logY: false,
  logX: false,
  smoothLines: false,
  showPoints: false,
});
