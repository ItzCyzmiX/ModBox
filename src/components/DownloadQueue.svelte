<script>
	let { downloadingMods } = $props();
</script>

<div class="minecraft-downloads-queue">
	<!-- Downloading -->
	{#each downloadingMods as mod}
		<div
			class="minecraft-download-container"
			class:minecraft-download-complete={mod.status === "complete"}
			class:minecraft-download-active={mod.status === "pending"}
		>
			<div class="minecraft-download-header">
				<h3 class="minecraft-download-title">
					{mod.name}
				</h3>
				<span class="minecraft-download-percentage"
					>{mod.downloadProgress || "??"}%</span
				>
			</div>

			<div class="minecraft-download-bar-container">
				<div
					class="minecraft-download-bar"
					style={`width: ${mod.downloadProgress}%;`}
				></div>
			</div>

			<div class="minecraft-download-info">
				<span class="minecraft-download-file">{mod.fileName}</span>
				<span class="minecraft-download-speed"
					>{mod.status === "pending"
						? `${(mod.bytesWritten * 0.001).toFixed(0)}Kb/${mod.fileSize * 0.001 || "??"}Kb`
						: "Complete"}</span
				>
			</div>
		</div>
	{/each}
</div>
