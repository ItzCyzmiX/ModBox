<script>
	import { fly } from "svelte/transition";

	let { modsToShow, activeCategory, selectCategory, downloadMod, updateMod, removeMod } = $props()
</script>

<div class="mod-grid">
	{#each modsToShow as mod, id}
		<div class="mod-card" in:fly={{ delay: ((id % 50) + 1) * 80 }}>
			<div class="mod-header"></div>
			<div class="mod-content">
				<h3>{mod.name}</h3>
				<p class="version">
					{mod.version.length > 15 ? mod.version.join(' / ').slice(0, 90).trimEnd() + "..."  : mod.version.join(" / ")}
				</p>
				<p class="description">{mod.description}</p>
				<div class="mod-footer">
					<span>By {mod.author}</span>
					<span>{mod.downloads} downloads</span>
				</div>
			</div>
			<div class="mod-actions">
				{#if !mod.alrInstalled}
					<button
						onclick={async () => {
							if (activeCategory === "Browse") {
								selectCategory("Downloads");
								await downloadMod(id);
							} else {
								await updateMod(id);
							}
						}}
						class="action-button update"
						>{activeCategory === "Browse"
							? "INSTALL"
							: "UPDATE"}</button
					>
				{:else}
					<p>mod already installed</p>
				{/if}

				{#if activeCategory === "Installed"}
					<button
						onclick={async () => {
							await removeMod(id);
						}}
						class="action-button remove">REMOVE</button
					>
				{/if}
			</div>
		</div>
	{/each}
</div>
