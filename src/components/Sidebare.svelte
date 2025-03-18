<script>
	let { activeCategory, selectCategory } = $props();
</script>

<div class="sidebar">
	<button
		class:active={activeCategory === "Browse"}
		onclick={() => selectCategory("Browse")}
	>
		Browse
	</button>
	<button
		class:active={activeCategory === "Installed"}
		onclick={() => selectCategory("Installed")}
	>
		Installed
	</button>
	<button
		class:active={activeCategory === "Downloads"}
		onclick={() => selectCategory("Downloads")}
	>
		Downloads
	</button>

	<button
		class:active={activeCategory === "Settings"}
		onclick={() => selectCategory("Settings")}
	>
		Settings
	</button>
</div>
