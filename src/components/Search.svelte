<script>
	let { activeCategory, search, togglePopup, onChange } =
		$props();

    import { allMods, searchPage } from "$lib/state.svelte";

	let searchQuery = $state("");
</script>

<div class="search-bar">
	{#if activeCategory === "Browse"}
		<input
			type="text"
			placeholder="Browse mods..."
			bind:value={searchQuery}
			onchange={() => {
				onChange(searchQuery);
			}}
		/>
		<button
			onclick={async () => {
				allMods.set([]);
				searchPage.set(0);
				await search();
			}}
			class="filter-button">SEARCH</button
		>
		<button class="minecraft-button" onclick={togglePopup}> FILTER </button>
	{/if}
</div>
