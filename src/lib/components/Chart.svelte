<script lang="ts">
  import { onMount, onDestroy, tick, createEventDispatcher } from "svelte";
  import {
    selectedProvinces,
    xAxis,
    yAxis,
    normalizeY,
    layers,
    kdeBandwidth,
    coord,
  } from "$lib/stores";
  import type {
    ProvinceProcessed,
    ProvinceEntry,
    XAxisType,
    YAxisType,
  } from "$lib/types";
  import {
    computeKDE,
    normalPDF,
    computeNormalFit,
    computeResiduals,
  } from "$lib/data";

  export let allData: Record<string, ProvinceProcessed>;
  export let highlightedProvince: string | null = null;

  const dispatch = createEventDispatcher<{ highlight: string | null }>();

  const COLORS = [
    "#5470c6",
    "#91cc75",
    "#fac858",
    "#ee6666",
    "#73c0de",
    "#3ba272",
    "#fc8452",
    "#9a60b4",
    "#ea7ccc",
    "#5ab1ef",
    "#d87c7c",
    "#8d98b3",
    "#e5cf0d",
    "#97b552",
    "#95706d",
    "#dc69aa",
    "#07a2a4",
    "#9a7fd1",
    "#588dd5",
    "#f5994e",
    "#59678c",
    "#c9ab00",
    "#7eb00a",
    "#fe8463",
    "#9b8e8e",
  ];

  const DARK_THEME = {
    bg: "#1a1d2e",
    text: "#ccc",
    axisLine: "#3a3d4e",
    splitLine: "#2a2d3e",
  };

  let mainContainer: HTMLDivElement;
  let residualContainer: HTMLDivElement;
  let mainChart: any;
  let residualChart: any;
  let echartsModule: any;
  let updateTimer: ReturnType<typeof setTimeout> | null = null;

  // Pre-computed data point cache: Map<cacheKey, sortedPoints>
  const dataCache: Map<string, { x: number; y: number; meta: any }[]> =
    new Map();

  function getEcharts() {
    return echartsModule?.default ?? echartsModule;
  }

  function getColor(index: number): string {
    return COLORS[index % COLORS.length];
  }

  function xLabel(xType: XAxisType): string {
    switch (xType) {
      case "score":
        return "分数";
      case "zscore":
        return "Z-Score";
      case "percentile":
        return "百分位";
      default:
        return "分数";
    }
  }

  function yLabel(yType: YAxisType, normalized: boolean): string {
    const suffix = normalized ? " (比例)" : "";
    switch (yType) {
      case "count":
        return `同分人数${suffix}`;
      case "survival":
        return "超越率";
      case "rank":
        return `累计排名${suffix}`;
      default:
        return `同分人数${suffix}`;
    }
  }

  function getXValue(entry: ProvinceEntry, xType: XAxisType): number {
    switch (xType) {
      case "score":
        return entry.score;
      case "zscore":
        return entry.zScore;
      case "percentile":
        return entry.percentile;
      default:
        return entry.score;
    }
  }

  function getYValue(
    entry: ProvinceEntry,
    yType: YAxisType,
    normalized: boolean,
    total: number,
  ): number {
    switch (yType) {
      case "count":
        return normalized ? entry.sameScoreCount / total : entry.sameScoreCount;
      case "survival":
        return entry.survivalRate;
      case "rank":
        return normalized ? entry.rankEnd / total : entry.rankEnd;
      default:
        return entry.sameScoreCount;
    }
  }

  function makeMeta(entry: ProvinceEntry, province: string) {
    return {
      province,
      score: entry.score,
      sameScoreCount: entry.sameScoreCount,
      rankEnd: entry.rankEnd,
      survivalRate: entry.survivalRate,
      percentile: entry.percentile,
      zScore: entry.zScore,
      density: entry.density,
    };
  }

  function getCacheKey(
    province: string,
    xType: XAxisType,
    yType: YAxisType,
    normalized: boolean,
  ): string {
    return `${province}|${xType}|${yType}|${normalized}`;
  }

  function getCachedDataPoints(
    province: string,
    xType: XAxisType,
    yType: YAxisType,
    normalized: boolean,
  ): { x: number; y: number; meta: any }[] {
    const key = getCacheKey(province, xType, yType, normalized);
    let cached = dataCache.get(key);
    if (!cached) {
      const pd = allData[province];
      if (!pd) return [];
      const { entries, stats } = pd;
      cached = entries
        .map((e: ProvinceEntry) => ({
          x: getXValue(e, xType),
          y: getYValue(e, yType, normalized, stats.total),
          meta: makeMeta(e, province),
        }))
        .sort((a, b) => a.x - b.x);
      dataCache.set(key, cached);
    }
    return cached;
  }

  // Binary search to find the nearest data point to a given x value
  function findNearestPoint(
    sortedPoints: { x: number; y: number; meta: any }[],
    targetX: number,
  ): { x: number; y: number; meta: any } | null {
    if (sortedPoints.length === 0) return null;
    if (sortedPoints.length === 1) return sortedPoints[0];

    let lo = 0;
    let hi = sortedPoints.length - 1;

    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (sortedPoints[mid].x < targetX) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    // lo is now the first point with x >= targetX
    // Compare with the previous point to find the closest
    if (lo > 0) {
      const prev = sortedPoints[lo - 1];
      const curr = sortedPoints[lo];
      if (Math.abs(prev.x - targetX) <= Math.abs(curr.x - targetX)) {
        return prev;
      }
    }
    return sortedPoints[lo];
  }

  function formatXValue(val: number, xType: XAxisType): string {
    switch (xType) {
      case "zscore":
        return val.toFixed(2);
      case "percentile":
        return val.toFixed(1);
      default:
        return val.toFixed(0);
    }
  }

  function formatYValue(
    val: number,
    yType: YAxisType,
    normalized: boolean,
  ): string {
    if (normalized) {
      if (val === 0) return "0";
      if (Math.abs(val) >= 1) return val.toFixed(4);
      const digits = Math.max(4, -Math.floor(Math.log10(Math.abs(val))) + 3);
      return val.toFixed(Math.min(digits, 8));
    }
    switch (yType) {
      case "survival":
        return (val * 100).toFixed(2) + "%";
      case "rank":
        return Math.round(val).toLocaleString();
      default:
        return Math.round(val).toLocaleString();
    }
  }

  function buildMainOption(
    provinces: string[],
    xType: XAxisType,
    yType: YAxisType,
    normalized: boolean,
    layerOpts: typeof $layers,
    bandwidth: number,
    coordOpts: typeof $coord,
  ) {
    const series: any[] = [];
    const legendData: string[] = [];
    const displayMode = layerOpts.mode;

    // Track global xMin/xMax across all provinces for dynamic range
    let globalXMin = Infinity;
    let globalXMax = -Infinity;

    provinces.forEach((province, idx) => {
      const pd = allData[province];
      if (!pd) return;
      const { entries, stats } = pd;
      const color = getColor(idx);

      // Use cached sorted data points
      const sortedPoints = getCachedDataPoints(
        province,
        xType,
        yType,
        normalized,
      );
      let dataPoints = sortedPoints.map((p) => ({
        value: [p.x, p.y],
        meta: p.meta,
      }));
      // Filter out non-positive values when log scale is on
      if (coordOpts.logY) {
        dataPoints = dataPoints.filter((d) => d.value[1] > 0);
      }
      if (coordOpts.logX) {
        dataPoints = dataPoints.filter((d) => d.value[0] > 0);
      }

      // Update global x range
      if (sortedPoints.length > 0) {
        globalXMin = Math.min(globalXMin, sortedPoints[0].x);
        globalXMax = Math.max(
          globalXMax,
          sortedPoints[sortedPoints.length - 1].x,
        );
      }

      const markLineData: any[] = [];

      // Mean line
      if (layerOpts.mean) {
        let meanX: number;
        if (xType === "score") meanX = stats.mean;
        else if (xType === "zscore") meanX = 0;
        else meanX = 50;
        markLineData.push({
          xAxis: meanX,
          lineStyle: { color, type: "solid", width: 1.5, opacity: 0.7 },
          label: { show: true, formatter: `${province} μ`, fontSize: 10 },
        });
      }

      // Sigma lines
      const sigmaConfigs: [boolean, number, string, string][] = [
        [layerOpts.sigma1, 1, "#fac858", "dashed"],
        [layerOpts.sigma2, 2, "#fc8452", "dashdot"],
        [layerOpts.sigma3, 3, "#ee6666", "dotted"],
      ];

      for (const [enabled, n, sigmaColor, lineType] of sigmaConfigs) {
        if (!enabled) continue;
        if (xType === "score") {
          for (const sign of [-1, 1]) {
            const xVal = stats.mean + sign * n * stats.std;
            markLineData.push({
              xAxis: xVal,
              lineStyle: {
                color: sigmaColor,
                type: lineType,
                width: 1,
                opacity: 0.6,
              },
              label: {
                show: true,
                formatter: `${sign > 0 ? "+" : ""}${n}σ`,
                fontSize: 9,
              },
            });
          }
        } else if (xType === "zscore") {
          for (const sign of [-1, 1]) {
            markLineData.push({
              xAxis: sign * n,
              lineStyle: {
                color: sigmaColor,
                type: lineType,
                width: 1,
                opacity: 0.6,
              },
              label: {
                show: true,
                formatter: `${sign > 0 ? "+" : ""}${n}σ`,
                fontSize: 9,
              },
            });
          }
        } else {
          // percentile: use normal CDF to find percentile at ±nσ
          for (const sign of [-1, 1]) {
            const z = sign * n;
            const pctl = ((1 + erf(z / Math.SQRT2)) / 2) * 100;
            markLineData.push({
              xAxis: pctl,
              lineStyle: {
                color: sigmaColor,
                type: lineType,
                width: 1,
                opacity: 0.6,
              },
              label: {
                show: true,
                formatter: `${sign > 0 ? "+" : ""}${n}σ`,
                fontSize: 9,
              },
            });
          }
        }
      }

      // Histogram (bar/line) series - shown in histogram mode
      if (displayMode === "histogram") {
        series.push({
          name: province,
          type: "line",
          smooth: coordOpts.smoothLines ? 0.5 : 0,
          showSymbol: coordOpts.showPoints,
          symbolSize: 4,
          lineStyle: { width: 2, color },
          itemStyle: { color },
          emphasis: { lineStyle: { width: 3 } },
          data: dataPoints,
          markLine:
            markLineData.length > 0
              ? { silent: true, symbol: "none", data: markLineData }
              : undefined,
        });
        legendData.push(province);
      }

      // x range for overlays (filtered for log mode)
      let xValues = sortedPoints.map((p) => p.x);
      if (coordOpts.logX) {
        xValues = xValues.filter((x) => x > 0);
      }
      const xMin = xValues.length > 0 ? xValues[0] : 1;
      const xMax = xValues.length > 0 ? xValues[xValues.length - 1] : 100;

      // KDE curve - shown in KDE mode
      if (displayMode === "kde") {
        let kdeData = computeKDE(entries, bandwidth, xMin, xMax, xType);
        if (coordOpts.logY) {
          kdeData = kdeData.filter(([x, y]) => y > 0);
        }
        if (coordOpts.logX) {
          kdeData = kdeData.filter(([x, y]) => x > 0);
        }
        series.push({
          name: province,
          type: "line",
          smooth: 0.6,
          showSymbol: false,
          lineStyle: { width: 2, color },
          itemStyle: { color },
          data: kdeData.map(([x, y]: [number, number]) => [x, y]),
          markLine:
            markLineData.length > 0
              ? { silent: true, symbol: "none", data: markLineData }
              : undefined,
        });
        legendData.push(province);
      }

      // Normal fit curve - shown in normalFit mode
      if (displayMode === "normalFit") {
        let fitData = computeNormalFit(
          stats.mean,
          stats.std,
          xMin,
          xMax,
          xType,
        );
        if (coordOpts.logY) {
          fitData = fitData.filter(([x, y]) => y > 0);
        }
        if (coordOpts.logX) {
          fitData = fitData.filter(([x, y]) => x > 0);
        }
        series.push({
          name: province,
          type: "line",
          smooth: 0.6,
          showSymbol: false,
          lineStyle: { width: 2, color },
          itemStyle: { color },
          data: fitData.map(([x, y]: [number, number]) => [x, y]),
          markLine:
            markLineData.length > 0
              ? { silent: true, symbol: "none", data: markLineData }
              : undefined,
        });
        legendData.push(province);
      }
    });

    // Dynamic x-axis range
    let xMinVal: number | undefined = undefined;
    let xMaxVal: number | undefined = undefined;
    if (xType === "score") {
      xMinVal = 200;
      xMaxVal = globalXMax < Infinity ? globalXMax : undefined;
    } else if (globalXMin < Infinity) {
      xMinVal = globalXMin;
      xMaxVal = globalXMax < Infinity ? globalXMax : undefined;
    }

    return {
      backgroundColor: DARK_THEME.bg,
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(26, 29, 46, 0.95)",
        borderColor: "#3a3d4e",
        textStyle: { color: DARK_THEME.text, fontSize: 12 },
        axisPointer: {
          type: "cross" as const,
          crossStyle: { color: "#666" },
          lineStyle: { color: "#666", type: "dashed" as const },
        },
        formatter: (params: any) => {
          let xVal: number | undefined;
          if (Array.isArray(params) && params.length > 0) {
            xVal = params[0].value?.[0] ?? params[0].data?.[0];
          }
          if (xVal === undefined) return "";

          // Build a map from seriesName to param for color lookup
          const paramMap = new Map<string, any>();
          if (Array.isArray(params)) {
            for (const p of params) {
              paramMap.set(p.seriesName, p);
            }
          }

          const lines: string[] = [
            `<strong>${xLabel(xType)}: ${formatXValue(xVal, xType)}</strong>`,
          ];

          for (let idx = 0; idx < provinces.length; idx++) {
            const province = provinces[idx];
            const color = getColor(idx);
            const sortedPoints = getCachedDataPoints(
              province,
              xType,
              yType,
              normalized,
            );
            const nearest = findNearestPoint(sortedPoints, xVal);
            if (!nearest) continue;

            // Get y-value: prefer the series value if available, otherwise use cached
            const p = paramMap.get(province);
            const yVal = p?.value?.[1] !== undefined ? p.value[1] : nearest.y;

            const m = nearest.meta;
            const yFormatted =
              typeof yVal === "number"
                ? formatYValue(yVal, yType, normalized)
                : String(yVal);

            lines.push(
              `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px;"></span>` +
                `<strong>${m.province}</strong>: ${yLabel(yType, normalized)}=${yFormatted} ` +
                `<span style="color:#888;font-size:11px">(分:${m.score} 排:${m.rankEnd.toLocaleString()} 超:${(m.survivalRate * 100).toFixed(1)}%)</span>`,
            );
          }
          return lines.join("<br/>");
        },
      },
      legend: {
        type: "scroll" as const,
        top: 10,
        textStyle: { color: DARK_THEME.text },
        data: legendData,
        pageTextStyle: { color: DARK_THEME.text },
        inactiveColor: "#555",
      },
      grid: {
        left: 60,
        right: 50,
        top: 60,
        bottom: 80,
      },
      dataZoom: [
        { type: "inside", xAxisIndex: 0, start: 0, end: 100 },
        {
          type: "slider",
          xAxisIndex: 0,
          bottom: 10,
          height: 25,
          start: 0,
          end: 100,
        },
        { type: "inside", yAxisIndex: 0, start: 0, end: 100 },
        {
          type: "slider",
          yAxisIndex: 0,
          right: 10,
          width: 25,
          start: 0,
          end: 100,
        },
      ],
      xAxis: {
        type: coordOpts.logX ? ("log" as const) : ("value" as const),
        name: xLabel(xType),
        nameTextStyle: { color: DARK_THEME.text },
        axisLine: { lineStyle: { color: DARK_THEME.axisLine } },
        axisLabel: { color: DARK_THEME.text },
        splitLine: { lineStyle: { color: DARK_THEME.splitLine } },
        ...(xMinVal !== undefined ? { min: xMinVal } : {}),
        ...(xMaxVal !== undefined ? { max: xMaxVal } : {}),
      },
      yAxis: {
        type: coordOpts.logY ? ("log" as const) : ("value" as const),
        name: yLabel(yType, normalized),
        nameTextStyle: { color: DARK_THEME.text },
        axisLine: { lineStyle: { color: DARK_THEME.axisLine } },
        axisLabel: { color: DARK_THEME.text },
        splitLine: { lineStyle: { color: DARK_THEME.splitLine } },
      },
      series,
    };
  }

  // Approximation of the error function
  function erf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = x >= 0 ? 1 : -1;
    const t = 1 / (1 + p * Math.abs(x));
    const y =
      1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }

  function buildResidualOption(
    provinces: string[],
    xType: XAxisType,
    bandwidth: number,
    coordOpts: typeof $coord,
  ) {
    const series: any[] = [];

    provinces.forEach((province, idx) => {
      const pd = allData[province];
      if (!pd) return;
      const { entries, stats } = pd;
      const color = getColor(idx);

      const xValuesRaw = entries.map((e: ProvinceEntry) => getXValue(e, xType));
      let xValues = xValuesRaw;
      if (coordOpts.logX) {
        xValues = xValues.filter((x) => x > 0);
      }
      const xMin = xValues.length > 0 ? Math.min(...xValues) : 1;
      const xMax = xValues.length > 0 ? Math.max(...xValues) : 100;

      let residualData = computeResiduals(
        entries,
        stats.mean,
        stats.std,
        xMin,
        xMax,
        bandwidth,
        xType,
      );
      if (coordOpts.logX) {
        residualData = residualData.filter(([x]) => x > 0);
      }
      series.push({
        name: province,
        type: "line",
        showSymbol: false,
        lineStyle: { width: 1.5, color },
        itemStyle: { color },
        data: residualData.sort(
          (a: [number, number], b: [number, number]) => a[0] - b[0],
        ),
      });
    });

    // Zero baseline
    series.push({
      name: "y=0",
      type: "line",
      showSymbol: false,
      lineStyle: { color: "#666", type: "solid", width: 1 },
      data: [],
      markLine: {
        silent: true,
        symbol: "none",
        data: [
          { yAxis: 0, lineStyle: { color: "#666", type: "solid", width: 1 } },
        ],
      },
    });

    // Determine xAxis min for residual
    let xMinVal: number | undefined = undefined;
    if (xType === "score") {
      xMinVal = 200;
    }

    return {
      backgroundColor: DARK_THEME.bg,
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(26, 29, 46, 0.95)",
        borderColor: "#3a3d4e",
        textStyle: { color: DARK_THEME.text, fontSize: 12 },
      },
      legend: {
        top: 5,
        textStyle: { color: DARK_THEME.text },
        inactiveColor: "#555",
      },
      grid: {
        left: 60,
        right: 30,
        top: 40,
        bottom: 50,
      },
      dataZoom: [
        { type: "inside", xAxisIndex: 0, start: 0, end: 100 },
        {
          type: "slider",
          xAxisIndex: 0,
          bottom: 5,
          height: 20,
          start: 0,
          end: 100,
        },
      ],
      xAxis: {
        type: coordOpts.logX ? ("log" as const) : ("value" as const),
        name: xLabel(xType),
        nameTextStyle: { color: DARK_THEME.text },
        axisLine: { lineStyle: { color: DARK_THEME.axisLine } },
        axisLabel: { color: DARK_THEME.text },
        splitLine: { lineStyle: { color: DARK_THEME.splitLine } },
        ...(xMinVal !== undefined ? { min: xMinVal } : {}),
      },
      yAxis: {
        type: "value" as const,
        name: "残差",
        nameTextStyle: { color: DARK_THEME.text },
        axisLine: { lineStyle: { color: DARK_THEME.axisLine } },
        axisLabel: { color: DARK_THEME.text },
        splitLine: { lineStyle: { color: DARK_THEME.splitLine } },
      },
      series,
    };
  }

  function syncDataZoom(source: any, target: any) {
    if (!source || !target) return;
    source.on("dataZoom", (params: any) => {
      const option = source.getOption();
      const dz = option.dataZoom;
      target.dispatchAction({
        type: "dataZoom",
        start: dz[0].start,
        end: dz[0].end,
      });
    });
  }

  function initMainChart() {
    if (!mainContainer) return;
    const ec = getEcharts();
    if (!ec) return;
    if (mainChart) mainChart.dispose();
    mainChart = ec.init(mainContainer);
    mainChart.on("mouseover", (params: any) => {
      const meta = params.data?.meta;
      if (meta?.province) {
        dispatch("highlight", meta.province);
      }
    });
    mainChart.on("mouseout", () => {
      dispatch("highlight", null);
    });
    // Left-click handler for crosshair comparison tooltip
    mainChart.on("click", (params: any) => {
      if (params.componentType === "series") {
        // The axis tooltip already shows on hover, click just ensures it stays
        // We could add additional behavior here if needed
      }
    });
    if (residualChart) syncDataZoom(mainChart, residualChart);
  }

  function initResidualChart() {
    if (!residualContainer) return;
    const ec = getEcharts();
    if (!ec) return;
    if (residualChart) residualChart.dispose();
    residualChart = ec.init(residualContainer);
    if (mainChart) syncDataZoom(mainChart, residualChart);
    // Also sync residual -> main
    if (mainChart) syncDataZoom(residualChart, mainChart);
  }

  function scheduleUpdate() {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      updateTimer = null;
      performUpdate();
    }, 50); // 50ms debounce
  }

  function performUpdate() {
    if (!mainChart) return;

    const provinces = $selectedProvinces;
    const xType = $xAxis;
    const yType = $yAxis;
    const normalized = $normalizeY;
    const layerOpts = $layers;
    const bw = $kdeBandwidth;
    const coordOpts = $coord;

    const mainOption = buildMainOption(
      provinces,
      xType,
      yType,
      normalized,
      layerOpts,
      bw,
      coordOpts,
    );
    mainChart.setOption(mainOption, true);

    if ($layers.mode === "normalFit" && residualChart) {
      const resOption = buildResidualOption(provinces, xType, bw, coordOpts);
      residualChart.setOption(resOption, true);
    }
  }

  // Clear cache when relevant inputs change
  function clearCache() {
    dataCache.clear();
  }

  // Reactive update: watch all stores and allData with debounce
  $: ($selectedProvinces,
    $xAxis,
    $yAxis,
    $normalizeY,
    $layers,
    $kdeBandwidth,
    $coord,
    allData,
    clearCache(),
    scheduleUpdate());

  // Re-init residual chart when it gets shown
  $: if ($layers.mode === "normalFit") {
    tick().then(() => {
      initResidualChart();
      performUpdate();
    });
  }

  // Highlight effect
  $: if (mainChart && highlightedProvince !== undefined) {
    if (highlightedProvince) {
      mainChart.dispatchAction({
        type: "highlight",
        seriesName: highlightedProvince,
      });
    } else {
      mainChart.dispatchAction({ type: "downplay" });
    }
  }

  function handleResize() {
    mainChart?.resize();
    residualChart?.resize();
  }

  onMount(async () => {
    echartsModule = await import("echarts");
    initMainChart();
    if ($layers.mode === "normalFit") {
      await tick();
      initResidualChart();
    }
    performUpdate();
    window.addEventListener("resize", handleResize);
  });

  onDestroy(() => {
    window.removeEventListener("resize", handleResize);
    if (updateTimer) clearTimeout(updateTimer);
    mainChart?.dispose();
    residualChart?.dispose();
  });
</script>

<div class="chart-wrapper">
  <div class="main-chart" bind:this={mainContainer}></div>
  {#if $layers.mode === "normalFit"}
    <div class="residual-chart" bind:this={residualContainer}></div>
  {/if}
</div>

<style>
  .chart-wrapper {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }

  .main-chart {
    flex: 1;
    min-height: 500px;
    width: 100%;
  }

  .residual-chart {
    height: 250px;
    width: 100%;
    margin-top: 4px;
  }
</style>
