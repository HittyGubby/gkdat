<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import {
    selectedProvinces,
    xAxis,
    yAxis,
    normalizeY,
    layers,
    kdeBandwidth,
    coord,
  } from "$lib/stores";
  import type { XAxisType, YAxisType, DisplayMode } from "$lib/types";

  export let allProvinces: string[];

  const pinyinSort = new Intl.Collator("zh-CN").compare;
  $: sortedProvinces = [...allProvinces].sort(pinyinSort);

  const dispatch = createEventDispatcher<{ close: void }>();

  const PROVINCE_NOTES: Record<string, string> = {
    浙江: "（一卷/3+3模式）",
    山东: "（一卷/3+3模式）",
    海南: "（二卷/3+3模式）",
    安徽: "（一卷）",
    江苏: "（一卷）",
    河北: "（一卷）",
    河南: "（一卷）",
    福建: "（一卷）",
    江西: "（一卷）",
    湖北: "（一卷）",
    湖南: "（一卷）",
    广东: "（一卷）",
    重庆: "（二卷）",
    贵州: "（二卷）",
    广西: "（二卷）",
    甘肃: "（二卷）",
    四川: "（二卷）",
    云南: "（二卷）",
    辽宁: "（二卷）",
    吉林: "（二卷）",
    黑龙江: "（二卷）",
    内蒙古: "（二卷）",
    陕西: "（二卷）",
    青海: "（二卷）",
    宁夏: "（二卷）",
    山西: "（二卷）",
  };

  function toggleProvince(province: string) {
    selectedProvinces.update((list) =>
      list.includes(province)
        ? list.filter((p) => p !== province)
        : [...list, province],
    );
  }

  function selectAll() {
    selectedProvinces.set([...sortedProvinces]);
  }

  function deselectAll() {
    selectedProvinces.set([]);
  }

  function invertSelection() {
    selectedProvinces.update((list) => {
      const set = new Set(list);
      return sortedProvinces.filter((p) => !set.has(p));
    });
  }

  function setDisplayMode(mode: DisplayMode) {
    layers.update((l) => ({ ...l, mode }));
  }

  const xAxisOptions: { value: XAxisType; label: string }[] = [
    { value: "score", label: "分数" },
    { value: "zscore", label: "Z分数" },
    { value: "percentile", label: "百分位" },
  ];

  const yAxisOptions: { value: YAxisType; label: string }[] = [
    { value: "count", label: "人数" },
    { value: "survival", label: "超越率" },
    { value: "rank", label: "排名" },
  ];

  const displayModeOptions: { value: DisplayMode; label: string }[] = [
    { value: "histogram", label: "柱状图" },
    { value: "kde", label: "KDE 曲线" },
    { value: "normalFit", label: "正态拟合" },
  ];
</script>

<aside
  class="flex flex-col h-full w-[320px] min-w-[320px] bg-dark-sidebar border-r border-dark-border text-gray-100"
>
  <!-- Header -->
  <div
    class="flex items-center justify-between px-4 py-3 border-b border-dark-border shrink-0"
  >
    <h2 class="text-base font-semibold">控制面板</h2>
    <button
      on:click={() => dispatch("close")}
      class="p-1 rounded hover:bg-dark-card transition-colors"
      aria-label="关闭侧栏"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>

  <!-- Scrollable Content -->
  <div class="flex-1 overflow-y-auto px-4 py-3 space-y-4">
    <!-- Section 1: 省份选择 -->
    <section class="sidebar-section">
      <h3 class="sidebar-label">省份选择</h3>

      <!-- Province list -->
      <div
        class="max-h-[200px] overflow-y-auto space-y-0.5 mb-2 border border-dark-border rounded bg-dark-card"
      >
        {#each sortedProvinces as province (province)}
          <label
            class="flex items-center gap-2 px-2.5 py-1 text-sm cursor-pointer hover:bg-white/5 transition-colors"
          >
            <input
              type="checkbox"
              checked={$selectedProvinces.includes(province)}
              on:change={() => toggleProvince(province)}
              class="accent-blue-500 w-3.5 h-3.5 rounded"
            />
            <span class="truncate"
              >{province}{PROVINCE_NOTES[province] ?? ""}</span
            >
          </label>
        {/each}
        {#if sortedProvinces.length === 0}
          <p class="px-2.5 py-2 text-xs text-gray-500">加载中…</p>
        {/if}
      </div>

      <!-- Bulk actions -->
      <div class="flex gap-2 text-xs">
        <button on:click={selectAll} class="control-btn flex-1"> 全选 </button>
        <button on:click={deselectAll} class="control-btn flex-1">
          全不选
        </button>
        <button on:click={invertSelection} class="control-btn flex-1">
          反选
        </button>
      </div>
    </section>

    <!-- Section 2: 显示模式 -->
    <section class="sidebar-section">
      <h3 class="sidebar-label">显示模式</h3>
      <div class="flex gap-1.5">
        {#each displayModeOptions as opt}
          <button
            class="control-btn flex-1 {$layers.mode === opt.value
              ? 'active'
              : ''}"
            on:click={() => setDisplayMode(opt.value)}
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </section>

    <!-- Section 3: KDE 参数 (only shown when KDE mode is selected) -->
    {#if $layers.mode === "kde"}
      <section class="sidebar-section">
        <h3 class="sidebar-label">KDE 参数</h3>
        <label class="block">
          <span class="text-sm text-gray-400">带宽 (Bandwidth)</span>
          <div class="flex items-center gap-3 mt-1">
            <input
              type="range"
              min="0.5"
              max="20"
              step="0.5"
              bind:value={$kdeBandwidth}
              class="flex-1 accent-blue-500 h-1"
            />
            <span class="text-sm text-gray-300 w-10 text-right tabular-nums">
              {$kdeBandwidth.toFixed(1)}
            </span>
          </div>
        </label>
      </section>
    {/if}

    <!-- Section 4: 参考线 (all in one row) -->
    <section class="sidebar-section">
      <h3 class="sidebar-label">参考线</h3>
      <div class="flex flex-wrap gap-x-4 gap-y-1.5">
        <label class="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={$layers.mean}
            on:change={() => layers.update((l) => ({ ...l, mean: !l.mean }))}
            class="accent-blue-500 w-3.5 h-3.5"
          />
          <span>均值线</span>
        </label>
        <label class="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={$layers.sigma1}
            on:change={() =>
              layers.update((l) => ({ ...l, sigma1: !l.sigma1 }))}
            class="accent-blue-500 w-3.5 h-3.5"
          />
          <span>±1σ</span>
        </label>
        <label class="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={$layers.sigma2}
            on:change={() =>
              layers.update((l) => ({ ...l, sigma2: !l.sigma2 }))}
            class="accent-blue-500 w-3.5 h-3.5"
          />
          <span>±2σ</span>
        </label>
        <label class="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={$layers.sigma3}
            on:change={() =>
              layers.update((l) => ({ ...l, sigma3: !l.sigma3 }))}
            class="accent-blue-500 w-3.5 h-3.5"
          />
          <span>±3σ</span>
        </label>
      </div>
    </section>

    <!-- Section 5: 横轴 -->
    <section class="sidebar-section">
      <h3 class="sidebar-label">横轴</h3>
      <div class="flex gap-1.5">
        {#each xAxisOptions as opt}
          <button
            class="control-btn flex-1 {$xAxis === opt.value ? 'active' : ''}"
            on:click={() => xAxis.set(opt.value)}
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </section>

    <!-- Section 6: 纵轴 + 归一化 -->
    <section class="sidebar-section">
      <div class="flex items-center justify-between mb-1.5">
        <h3 class="sidebar-label mb-0">纵轴</h3>
        <label class="flex items-center gap-1.5 cursor-pointer">
          <span class="text-xs text-gray-400">归一化</span>
          <button
            role="switch"
            aria-checked={$normalizeY}
            on:click={() => normalizeY.update((v) => !v)}
            class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors
                 {$normalizeY ? 'bg-blue-600' : 'bg-gray-600'}"
          >
            <span
              class="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform
                   {$normalizeY ? 'translate-x-[18px]' : 'translate-x-[3px]'}"
            />
          </button>
        </label>
      </div>
      <div class="flex gap-1.5">
        {#each yAxisOptions as opt}
          <button
            class="control-btn flex-1 {$yAxis === opt.value ? 'active' : ''}"
            on:click={() => yAxis.set(opt.value)}
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </section>

    <!-- Section 7: 坐标设置 (compact) -->
    <section class="sidebar-section">
      <h3 class="sidebar-label">坐标设置</h3>
      <div class="flex gap-4">
        <label class="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={$coord.logX}
            on:change={() => coord.update((c) => ({ ...c, logX: !c.logX }))}
            class="accent-blue-500 w-3.5 h-3.5"
          />
          <span>对数 X</span>
        </label>
        <label class="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={$coord.logY}
            on:change={() => coord.update((c) => ({ ...c, logY: !c.logY }))}
            class="accent-blue-500 w-3.5 h-3.5"
          />
          <span>对数 Y</span>
        </label>
      </div>
    </section>
  </div>
</aside>
