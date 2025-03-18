<script>
	import { fade, slide } from "svelte/transition";

	let {
		togglePopup,
		mc_versions,
		toggleVersion,
		selectedVersions,
		cancelFilters,
		applyFilters,
        versionSearch
	} = $props();

</script>

<div class="popup-overlay" out:fade>
	<div class="popup minecraft-panel">
		<div class="popup-header">
			<h2>Select Minecraft Versions</h2>
			<button class="close-button" onclick={togglePopup}>✕</button>
		</div>

		<div class="popup-content">
			<div class="search-box">
				<input
					type="text"
					placeholder="Search versions..."
					bind:value={versionSearch}
					class="minecraft-input"
				/>
			</div>

			<div class="version-list" transition:slide>
				{#each Object.entries(mc_versions) as [name, version]}
					{#if name.includes(versionSearch)}
						<button
							class="version-item"
							class:selected={version}
							onclick={() => toggleVersion(name)}
						>
							<div
								class="checkbox"
								class:checked={selectedVersions.includes(name)}
							></div>
							<span>{name}</span>
						</button>
					{/if}
				{/each}
			</div>
		</div>

		<div class="popup-footer">
			<button class="minecraft-button cancel" onclick={cancelFilters}
				>Cancel</button
			>
			<button class="minecraft-button apply" onclick={applyFilters}
				>Apply</button
			>
		</div>
	</div>
</div>
