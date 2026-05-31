<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { selectedProvinces } from "$lib/stores";
  import type { ProvinceProcessed } from "$lib/types";

  export let allData: Record<string, ProvinceProcessed>;

  const dispatch = createEventDispatcher<{
    highlight: string | null;
    solo: string;
  }>();

  let collapsed = false;
  let highlightedProvince: string | null = null;

  function formatCount(n: number): string {
    return n.toLocaleString("zh-CN");
  }

  function formatDecimal(n: number, digits: number): string {
    return n.toFixed(digits);
  }

  function toggle() {
    collapsed = !collapsed;
  }

  function onEnter(province: string) {
    highlightedProvince = province;
    dispatch("highlight", province);
  }

  function onLeave() {
    highlightedProvince = null;
    dispatch("highlight", null);
  }

  function onDblClick(province: string) {
    dispatch("solo", province);
  }

  $: provinces = $selectedProvinces.filter((p: string) => allData[p]);
</script>

<div class="mt-4">
  <!-- Header -->
  <button
    class="w-full flex items-center justify-between px-4 py-2 bg-dark-card border border-dark-border rounded-lg hover:border-gray-600 transition-colors cursor-pointer"
    on:click={toggle}
  >
    <span class="text-sm font-semibold text-gray-200">统计面板</span>
    <svg
      class="w-4 h-4 text-gray-400 transition-transform"
      class:rotate-180={collapsed}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M19 9l-7 7-7-7"
      />
    </svg>
  </button>

  <!-- Cards grid -->
  {#if !collapsed}
    <div
      class="mt-3 max-h-[28rem] overflow-y-auto rounded-lg border border-dark-border bg-dark-bg/50 p-3"
    >
      {#if provinces.length === 0}
        <p class="text-sm text-gray-500 text-center py-8">未选择省份</p>
      {:else}
        <div
          class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3"
        >
          {#each provinces as province (province)}
            {@const stats = allData[province].stats}
            <div
              class="stat-card"
              class:highlighted={highlightedProvince === province}
              on:mouseenter={() => onEnter(province)}
              on:mouseleave={onLeave}
              on:dblclick={() => onDblClick(province)}
              role="button"
              tabindex="0"
            >
              <h3
                class="text-base font-bold text-gray-100 mb-2 truncate"
                title={province}
              >
                {province}
              </h3>
              <dl class="space-y-1 text-xs">
                <div class="flex justify-between">
                  <dt class="text-gray-400">N:</dt>
                  <dd class="text-gray-200 font-mono">
                    {formatCount(stats.total)}
                  </dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-400">Mean:</dt>
                  <dd class="text-gray-200 font-mono">
                    {formatDecimal(stats.mean, 2)}
                  </dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-400">Std:</dt>
                  <dd class="text-gray-200 font-mono">
                    {formatDecimal(stats.std, 2)}
                  </dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-400">Variance:</dt>
                  <dd class="text-gray-200 font-mono">
                    {formatDecimal(stats.variance, 2)}
                  </dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-400">Skewness:</dt>
                  <dd class="text-gray-200 font-mono">
                    {formatDecimal(stats.skewness, 4)}
                  </dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-400">Kurtosis:</dt>
                  <dd class="text-gray-200 font-mono">
                    {formatDecimal(stats.kurtosis, 4)}
                  </dd>
                </div>
              </dl>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
