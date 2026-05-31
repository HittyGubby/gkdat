<script lang="ts">
  import { onMount } from "svelte";
  import type { RawData, ProvinceProcessed } from "$lib/types";
  import { preprocessData } from "$lib/data";
  import { selectedProvinces } from "$lib/stores";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Chart from "$lib/components/Chart.svelte";
  import StatsPanel from "$lib/components/StatsPanel.svelte";

  let allData: Record<string, ProvinceProcessed> = {};
  let allProvinces: string[] = [];
  let loading = true;
  let sidebarOpen = true;
  let highlightedProvince: string | null = null;

  onMount(async () => {
    try {
      const resp = await fetch("/gkdat.json");
      const raw: RawData = await resp.json();
      allData = preprocessData(raw);
      allProvinces = Object.keys(allData).sort();
      selectedProvinces.set(allProvinces);
      loading = false;
    } catch (e) {
      console.error("Failed to load data:", e);
    }
  });

  function handleHighlight(e: CustomEvent<string | null>) {
    highlightedProvince = e.detail;
  }

  function handleSoloProvince(e: CustomEvent<string>) {
    selectedProvinces.set([e.detail]);
  }
</script>

<svelte:head>
  <title>高考一分一段统计分析</title>
</svelte:head>

{#if loading}
  <div class="flex items-center justify-center h-screen bg-dark-bg">
    <div class="text-center">
      <div
        class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"
      ></div>
      <p class="text-gray-400">加载数据中...</p>
    </div>
  </div>
{:else}
  <div class="flex h-screen overflow-hidden bg-dark-bg">
    <!-- Sidebar -->
    {#if sidebarOpen}
      <Sidebar {allProvinces} on:close={() => (sidebarOpen = false)} />
    {/if}

    <!-- Main content -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Top bar -->
      <div
        class="flex items-center h-10 px-4 bg-dark-sidebar border-b border-dark-border shrink-0"
      >
        {#if !sidebarOpen}
          <button
            class="p-1 rounded hover:bg-dark-border mr-3"
            on:click={() => (sidebarOpen = true)}
            title="展开侧边栏"
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
              ><rect width="18" height="18" x="3" y="3" rx="2" /><path
                d="M9 3v18"
              /></svg
            >
          </button>
        {/if}
        <h1 class="text-sm font-semibold text-gray-300">
          高考一分一段统计分析平台
        </h1>
      </div>

      <!-- Charts area -->
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <Chart {allData} {highlightedProvince} on:highlight={handleHighlight} />
        <StatsPanel
          {allData}
          on:highlight={handleHighlight}
          on:solo={handleSoloProvince}
        />
      </div>
    </div>
  </div>
{/if}
