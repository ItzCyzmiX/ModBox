<script>
	import { fade, fly, scale, slide } from "svelte/transition";
	import { onMount } from "svelte";
	import {
		BaseDirectory,
		readFile,
		exists,
		writeTextFile,
		remove,
		stat,
	} from "@tauri-apps/plugin-fs";
	import { open, confirm } from "@tauri-apps/plugin-dialog";
	import { path } from "@tauri-apps/api";
	// import { fetch } from "@tauri-apps/plugin-http";
	import { download } from "@tauri-apps/plugin-upload";
	import { exit } from "@tauri-apps/plugin-process";

	async function changeMCDir() {
		while (true) {
			const dir = await open({
				multiple: false,
				directory: true,
			});

			config = {
				...config,
				"mc-dir": dir,
			};

			let mods_dir = await path.join(dir, "mods");

			const mods_dir_exists = await exists(mods_dir);

			if (!mods_dir_exists) {
				let conf = await confirm(
					"The selected path is not a valid minecraft path, you will be asked to re-enter another one",
					{
						title: "MC path Error",
						kind: "error",
						okLabel: "retry",
						cancelLabel: "exit",
					},
				);

				if (!conf) {
					exit(1);
				}
				continue;
			}

			await writeTextFile("config.json", JSON.stringify(config), {
				baseDir: BaseDirectory.AppData,
			});
			break;
		}
	}

	onMount(async () => {
		console.log(PUBLIC_FORGE_API)
		const decoder = new TextDecoder();
		const config_file_exists = await exists("config.json", {
			baseDir: BaseDirectory.AppData,
		});

		let config_file;

		if (!config_file_exists) {
			await writeTextFile(
				"config.json",
				JSON.stringify({
					"mc-dir": false,
				}),
				{
					baseDir: BaseDirectory.AppData,
				},
			);
		}

		config_file = await readFile("config.json", {
			baseDir: BaseDirectory.AppData,
		});

		config = JSON.parse(decoder.decode(config_file));

		if (!config["mc-dir"]) {
			await changeMCDir();
		}
		if (config.installed) {
			installedMods = config.installed;
		}

		let res = await fetch(
			"https://api.curseforge.com/v1/minecraft/version",
			{
				method: "GET",
				headers: {
					Accept: "application/json",
					"x-api-key": "$2a$10$3MKF0WNYQh7DwMyDsQEZOuomuqV8vjxy5k64wt4AhmRv8tMsmu6TC",
				},
			},
		);

		const json = await res.json();

		const versions = json.data;

		for (let v of versions) {
			mc_versions = {
				...mc_versions,
				[v.versionString]: v.gameVersionId,
			};
		}
	});

	// Mock data for installed mods
	let loading = $state(false);
	let downloadingMods = $state([]);
	let config = $state({
		installed: [],
	});
	let installedMods = $state([]);
	let showPopup = $state(false);
	let selectedVersions = $state([]);
	let versionSearch = $state("");
	let statusMessage = $state("");
	let statusType = $state("");

	// State variables
	const MC_GAME_ID = 432;
	let mc_versions = $state({});
	let activeCategory = $state("Installed");
	let searchQuery = $state("");
	let allMods = $state([]);
	let filteredMods = $state([]);
	let modsToShow = $derived(
		activeCategory === "Browse"
			? selectedVersions.length > 0
				? filteredMods
				: allMods
			: activeCategory === "Installed"
				? installedMods
				: [],
	);
	let searchPage = $state(0);
	// Filter mods based on search query

	// Category click handler
	function selectCategory(category) {
		activeCategory = category;
	}

	function showStatusMessage(message, type) {
		statusMessage = message;
		statusType = type;
		setTimeout(() => {
			statusMessage = "";
		}, 3000);
	}

	async function search() {
		if (activeCategory === "Browse") {
			loading = true;
			let mods = [];
			let json = {}
			try {
				const res = await fetch(
					`https://api.curseforge.com/v1/mods/search?gameId=${MC_GAME_ID}&searchFilter=${searchQuery}&index=${searchPage}`,
					{
						method: "GET",
						headers: {
							Accept: "application/json",
							"x-api-key": "$2a$10$3MKF0WNYQh7DwMyDsQEZOuomuqV8vjxy5k64wt4AhmRv8tMsmu6TC",
						},
					},
				);

				console.log(res)
				console.log(res.statusText)

				json = await res.json();

				mods = json.data;
			} catch (e) {
				throw e;
			}

			let _allMods = mods.map((v) => {
				return {
					id: v.id,
					name: v.name,
					downloads: v.downloadCount,
					description: `${v.summary.slice(0, 80).trimEnd()} ${v.summary.length > 80 ? "..." : ""} `,
					author: v.authors.reduce((p, c) => {
						return p + c.name;
					}, ""),
					version: v.latestFiles[0].gameVersions,
					file: v.latestFiles[0].downloadUrl,
					fileSize: v.latestFiles[0].fileSizeOnDisk,
				};
			});

			allMods = [...allMods, ..._allMods];

			searchPage += json.pagination.index;

			loading = false;
		}
	}

	async function downloadMod(id) {
		const downloadLink = allMods[id].file;
		const fileNameList = downloadLink.split("/");
		const fileName = fileNameList[fileNameList.length - 1];

		const modsPath = await path.join(config["mc-dir"], "mods", fileName);

		const i = downloadingMods.length;
		downloadingMods = [
			...downloadingMods,
			{
				...allMods[id],
				downloadProgress: 0,
				bytesWritten: 0,
				status: "pending",
				fileName: fileName,
			},
		];

		await download(
			downloadLink,
			modsPath,
			({ progress, progressTotal }) => {
				downloadingMods = downloadingMods.map((v, ind) => {
					if (ind === i) {
						const isComplete = progress === 0;
						if (isComplete) {
							const newMod = {
								...allMods[id],
								fileName: fileName,
							};
							// Force reactivity by creating new array
							installedMods = [...installedMods, newMod];
							// Update config
							config = {
								...config,
								installed: installedMods,
							};
							// Save to config file
							writeTextFile(
								"config.json",
								JSON.stringify(config),
								{
									baseDir: BaseDirectory.AppData,
								},
							);
						}
						return {
							...v,
							downloadProgress:
								progress === 0
									? 100
									: (progressTotal * 100) / v.fileSize,
							bytesWritten:
								progress === 0 ? v.fileSize : progressTotal,
							status: progress === 0 ? "complete" : "pending",
						};
					}
					return v;
				});
			},
		);
	}

	function togglePopup() {
		showPopup = !showPopup;
	}

	function clearFilters() {
		selectedVersions = [];
	}

	function toggleVersion(name) {
		const ex = selectedVersions.indexOf(name);
		if (ex !== -1) {
			selectedVersions = selectedVersions.filter((v, i) => {
				return v !== name;
			});
		} else {
			if (mc_versions[name]) {
				selectedVersions = [...selectedVersions, name];
			}
		}
	}

	function applyFilters() {
		filteredMods = allMods.filter((mod, i) => {
			return mod.version.some((version) =>
				selectedVersions.includes(version),
			);
		});
		console.log(filteredMods);
		showPopup = false;
	}

	function cancelFIlters() {
		clearFilters();
		showPopup = false;
	}

	async function removeMod(id) {
		if (installedMods[id]) {
			const modPath = await path.join(
				config["mc-dir"],
				"mods",
				installedMods[id].fileName,
			);

			try {
				await remove(modPath);
			} catch (e) {
				console.error(e);
			} finally {
				installedMods = installedMods.filter((v, i) => {
					return i !== id;
				});
				config = {
					...config,
					installed: installedMods,
				};
				// Save to config file
				writeTextFile("config.json", JSON.stringify(config), {
					baseDir: BaseDirectory.AppData,
				});
			}
		}
	}
</script>

<main class="minecraft-app">
	<div class="header">
		<h1 class="title">ModBox</h1>
	</div>

	<div class="content">
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

		<div class="main-content">
			<div class="search-bar">
				<input
					type="text"
					placeholder="Search mods..."
					bind:value={searchQuery}
				/>
				{#if activeCategory === "Browse"}
					<button
						onclick={async () => {
							allMods = [];
							searchPage = 0;
							await search();
						}}
						class="filter-button">SEARCH</button
					>
					<button class="minecraft-button" onclick={togglePopup}>
						FILTER
					</button>
				{/if}
			</div>
			{#if activeCategory === "Browse" || activeCategory === "Installed"}
				{#if selectedVersions.length > 0}
					<div class="selected-filters">
						<span
							>Active filters: {selectedVersions.join(", ")}</span
						>
						<button class="clear-button" onclick={clearFilters}
							>CLEAR</button
						>
					</div>
				{/if}
				<div class="mod-grid">
					{#each modsToShow as mod, id}
						<div
							class="mod-card"
							in:fly={{ delay: ((id % 50) + 1) * 80 }}
						>
							<div class="mod-header"></div>
							<div class="mod-content">
								<h3>{mod.name}</h3>
								<p class="version">
									{mod.version.join(" / ")}
								</p>
								<p class="description">{mod.description}</p>
								<div class="mod-footer">
									<span>By {mod.author}</span>
									<span>{mod.downloads} downloads</span>
								</div>
							</div>
							<div class="mod-actions">
								<button
									onclick={async () => {
										if (activeCategory === "Browse") {
											selectCategory("Downloads");
											await downloadMod(id);
										}
									}}
									class="action-button update"
									>{activeCategory === "Browse"
										? "INSTALL"
										: "UPDATE"}</button
								>
								<!-- <button class="action-button config">CONFIG</button> -->
								{#if activeCategory === "Installed"}
									<button
										onclick={async () => {
											await removeMod(id);
										}}
										class="action-button remove"
										>REMOVE</button
									>
								{/if}
							</div>
						</div>
					{/each}
					<!-- <button onclick={search}>LOAD MORE</button> -->
				</div>
			{:else if activeCategory === "Downloads"}
				<!-- Multiple Downloads Example -->
				<div class="minecraft-downloads-queue">
					<!-- Downloading -->
					{#each downloadingMods as mod}
						<div
							class="minecraft-download-container"
							class:minecraft-download-complete={mod.status ===
								"complete"}
							class:minecraft-download-active={mod.status ===
								"pending"}
						>
							<div class="minecraft-download-header">
								<h3 class="minecraft-download-title">
									{mod.name}
								</h3>
								<span class="minecraft-download-percentage"
									>{mod.downloadProgress}%</span
								>
							</div>

							<div class="minecraft-download-bar-container">
								<div
									class="minecraft-download-bar"
									style={`width: ${mod.downloadProgress}%;`}
								></div>
							</div>

							<div class="minecraft-download-info">
								<span class="minecraft-download-file"
									>{mod.fileName}</span
								>
								<span class="minecraft-download-speed"
									>{mod.status === "pending"
										? `${mod.bytesWritten}/${mod.fileSize}`
										: "Complete"}</span
								>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="setting-item">
					<h2>Minecraft Installation</h2>
					<label for="minecraft-path"
						>Minecraft Installation Path:</label
					>
					<div class="path-input">
						<input
							type="text"
							id="minecraft-path"
							class="minecraft-input"
							bind:value={config["mc-dir"]}
							readonly
						/>
						<button class="filter-button" onclick={changeMCDir}>
							Browse...
						</button>
					</div>
				</div>
			{/if}
			{#if activeCategory === "Browse" && modsToShow.length > 0}
				<div class="load-more-container">
					<button
						onclick={search}
						disabled={loading}
						class="load-more-button"
					>
						<span class="button-text">LOAD MORE MODS</span>
						<!-- <div class="button-animation"></div> -->
					</button>
				</div>
			{/if}
		</div>
	</div>
	{#if loading}
		<div class="minecraft-spinner-container">
			<div class="minecraft-spinner">
				<div class="minecraft-spinner-face"></div>
				<div class="minecraft-spinner-face"></div>
				<div class="minecraft-spinner-face"></div>
				<div class="minecraft-spinner-face"></div>
				<div class="minecraft-spinner-face"></div>
				<div class="minecraft-spinner-face"></div>
			</div>
			<div class="minecraft-spinner-fallback">
				<div></div>
				<div></div>
				<div></div>
				<div></div>
			</div>
		</div>
	{/if}

	{#if showPopup}
		<div class="popup-overlay" out:fade>
			<div class="popup minecraft-panel">
				<div class="popup-header">
					<h2>Select Minecraft Versions</h2>
					<button class="close-button" onclick={togglePopup}>✕</button
					>
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
										class:checked={selectedVersions.includes(
											name,
										)}
									></div>
									<span>{name}</span>
								</button>
							{/if}
						{/each}
					</div>
				</div>

				<div class="popup-footer">
					<button
						class="minecraft-button cancel"
						onclick={cancelFIlters}>Cancel</button
					>
					<button
						class="minecraft-button apply"
						onclick={applyFilters}>Apply</button
					>
				</div>
			</div>
		</div>
	{/if}
</main>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: "MinecraftFont", monospace;
		background-color: #1e1e1e;
		color: #ffffff;
	}

	@font-face {
		font-family: "MinecraftFont";
		src: url("https://cdnjs.cloudflare.com/ajax/libs/font-minecraft/1.0.0/MinecraftRegular-Bmg3.otf");
		font-weight: normal;
		font-style: normal;
	}

	.minecraft-app {
		display: flex;
		flex-direction: column;
		height: 100vh;
		width: 100%;
		box-sizing: border-box;
		overflow: hidden;
		border: 6px solid #555555;
	}

	.header {
		height: 60px;
		background-color: #2c2c2c;
		border-bottom: 6px solid #555555;
		position: relative;
		display: flex;
		align-items: center;
		padding: 0 20px;
	}

	.header::before {
		content: "";
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 10px;
		background-color: #1a1a1a;
	}

	.title {
		font-size: 24px;
		color: #55ff55;
		font-weight: bold;
		margin: 0;
		z-index: 1;
	}

	.content {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	.sidebar {
		width: 250px;
		background-color: #2c2c2c;
		border-right: 6px solid #555555;
		display: flex;
		flex-direction: column;
		padding: 10px;
		gap: 10px;
	}

	.sidebar button {
		height: 50px;
		background-color: #3c3c3c;
		border: 4px solid #555555;
		color: #ffffff;
		text-align: left;
		padding: 0 20px;
		font-size: 18px;
		font-family: "MinecraftFont", monospace;
		cursor: pointer;
		transition: all 0.2s ease;
	}
	.settings-section h2 {
		margin-top: 0;
		margin-bottom: 15px;
		color: #333333;
		border-bottom: 2px solid #5a5a5a;
		padding-bottom: 5px;
		text-shadow: 1px 1px 0 #aaaaaa;
	}

	.setting-item {
		margin-bottom: 15px;
	}

	.setting-item label {
		display: block;
		margin-bottom: 5px;
		color: #333333;
		font-weight: bold;
	}

	/* Input styling */
	.minecraft-input {
		width: 100%;
		border: 2px solid #000;
		border-bottom-width: 4px;
		border-right-width: 4px;
		background-color: #8b8b8b;
		color: white;
		padding: 8px;
	}

	.path-input {
		display: flex;
		gap: 10px;
	}

	.path-input .minecraft-input {
		flex: 1;
	}
	.sidebar button:hover {
		background-color: #4c4c4c;
	}

	.sidebar button.active {
		border-color: #55ff55;
		color: #55ff55;
	}

	.main-content {
		flex: 1;
		background-color: #2c2c2c;
		padding: 20px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.search-bar {
		display: flex;
		gap: 20px;
	}

	.search-bar input {
		flex: 1;
		height: 40px;
		background-color: #3c3c3c;
		border: 3px solid #555555;
		color: #ffffff;
		font-family: "MinecraftFont", monospace;
		font-size: 16px;
		padding: 0 10px;
	}

	.search-bar input::placeholder {
		color: #888888;
	}

	.filter-button {
		width: 160px;
		height: 50px;
		background-color: #427a16;
		border: 3px solid #55ff55;
		color: #ffffff;
		font-family: "MinecraftFont", monospace;
		font-size: 16px;
		cursor: pointer;
		transition: all 0.2s ease;
		margin-top: -3px;
	}

	.filter-button:hover {
		background-color: #55aa21;
	}

	.filter-button:active {
		transform: translateY(6px);
	}

	.mod-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
		gap: 20px;
	}

	.mod-card {
		background-color: #3c3c3c;
		border: 3px solid #555555;
		display: flex;
		flex-direction: column;
		height: 250px;
		position: relative;
		transition: all 0.2s ease;
	}

	.mod-card:hover {
		transform: translateY(-5px);
		box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
	}

	.mod-header {
		height: 15px;
		background-color: #427a16;
	}

	.mod-content {
		padding: 15px;
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.mod-content h3 {
		margin: 0;
		font-size: 18px;
		color: #ffffff;
	}

	.mod-content .version {
		color: #55ff55;
		font-size: 14px;
		margin: 5px 0 10px;
	}

	.mod-content .description {
		font-size: 14px;
		color: #cccccc;
		flex: 1;
		margin: 0;
	}

	.mod-footer {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
		color: #999999;
		margin-top: 10px;
	}

	.mod-actions {
		display: flex;
		border-top: 2px solid #555555;
	}

	.action-button {
		flex: 1;
		padding: 8px 0;
		font-family: "MinecraftFont", monospace;
		font-size: 12px;
		cursor: pointer;
		border: none;
		color: white;
		transition: all 0.2s ease;
	}

	.action-button.update {
		background-color: #427a16;
	}

	.action-button.update:hover {
		background-color: #55aa21;
	}

	.action-button.config {
		background-color: #7e5e1c;
	}

	.action-button.config:hover {
		background-color: #aa8021;
	}

	.action-button.remove {
		background-color: #8b2d2d;
	}

	.action-button.remove:hover {
		background-color: #aa3636;
	}

	/* Custom scrollbar */
	::-webkit-scrollbar {
		width: 12px;
	}

	::-webkit-scrollbar-track {
		background: #1e1e1e;
	}

	::-webkit-scrollbar-thumb {
		background: #555555;
		border: 2px solid #1e1e1e;
	}

	::-webkit-scrollbar-thumb:hover {
		background: #55ff55;
	}

	/* Minecraft Loading Spinner CSS */

	.minecraft-spinner-container {
		display: flex;
		justify-content: center;
		align-items: center;
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(30, 30, 30, 0.8);
		z-index: 1000;
	}

	.minecraft-spinner {
		position: relative;
		width: 80px;
		height: 80px;
		transform-style: preserve-3d;
		animation: minecraft-spin 3s infinite linear;
	}

	.minecraft-spinner-face {
		position: absolute;
		width: 100%;
		height: 100%;
		border: 4px solid #555555;
		box-sizing: border-box;
	}

	/* Front face - grass block top */
	.minecraft-spinner-face:nth-child(1) {
		background-color: #55aa21;
		transform: translateZ(40px);
	}

	/* Back face */
	.minecraft-spinner-face:nth-child(2) {
		background-color: #7e5e1c;
		transform: rotateY(180deg) translateZ(40px);
	}

	/* Right face */
	.minecraft-spinner-face:nth-child(3) {
		background-color: #7e5e1c;
		transform: rotateY(90deg) translateZ(40px);
	}

	/* Left face */
	.minecraft-spinner-face:nth-child(4) {
		background-color: #7e5e1c;
		transform: rotateY(-90deg) translateZ(40px);
	}

	/* Top face - with pixelated pattern */
	.minecraft-spinner-face:nth-child(5) {
		background-color: #55aa21;
		transform: rotateX(90deg) translateZ(40px);
		position: relative;
		overflow: hidden;
	}

	.minecraft-spinner-face:nth-child(5)::before {
		content: "";
		position: absolute;
		top: 0;
		left: 0;
		width: 50%;
		height: 50%;
		background-color: #427a16;
		box-sizing: border-box;
	}

	.minecraft-spinner-face:nth-child(5)::after {
		content: "";
		position: absolute;
		bottom: 0;
		right: 0;
		width: 50%;
		height: 50%;
		background-color: #427a16;
		box-sizing: border-box;
	}

	.minecraft-spinner-face:nth-child(6) {
		background-color: #7e5e1c;
		transform: rotateX(-90deg) translateZ(-40px);
	}

	@keyframes minecraft-spin {
		0% {
			transform: rotateX(0deg) rotateY(0deg);
			scale: 0%;
		}
		25% {
			transform: rotateX(90deg) rotateY(90deg);
			scale: 80%;
		}
		50% {
			transform: rotateX(180deg) rotateY(180deg);
			scale: 100%;
		}
		75% {
			transform: rotateX(270deg) rotateY(270deg);
		}
		100% {
			transform: rotateX(360deg) rotateY(360deg);
		}
	}

	/* Loading text */
	.minecraft-loading-text {
		position: absolute;
		bottom: -50px;
		font-family: "MinecraftFont", monospace;
		font-size: 20px;
		color: #55ff55;
		text-shadow: 2px 2px #1e1e1e;
		animation: minecraft-text-pulse 1.5s infinite;
	}

	@keyframes minecraft-text-pulse {
		0%,
		100% {
			opacity: 0.7;
		}
		50% {
			opacity: 1;
		}
	}

	/* Alternative simple spinner for browsers with limited 3D support */
	.minecraft-spinner-fallback {
		width: 50px;
		height: 50px;
		position: relative;
		display: none;
	}

	.setting-item label {
		display: block;
		margin-bottom: 5px;
		color: #333333;
		font-weight: bold;
	}

	.minecraft-spinner-fallback div {
		position: absolute;
		width: 24px;
		height: 24px;
		background-color: #55aa21;
		border: 3px solid #555555;
		animation: minecraft-spinner-fallback 1.2s cubic-bezier(0, 0.5, 0.5, 1)
			infinite;
	}

	.minecraft-spinner-fallback div:nth-child(1) {
		top: 0;
		left: 0;
		animation-delay: 0s;
	}

	.minecraft-spinner-fallback div:nth-child(2) {
		top: 0;
		right: 0;
		animation-delay: 0.3s;
	}

	.minecraft-spinner-fallback div:nth-child(3) {
		bottom: 0;
		right: 0;
		animation-delay: 0.6s;
	}

	.minecraft-spinner-fallback div:nth-child(4) {
		bottom: 0;
		left: 0;
		animation-delay: 0.9s;
	}

	@keyframes minecraft-spinner-fallback {
		0% {
			transform: scale(1);
		}
		50%,
		100% {
			transform: scale(0.5);
		}
	}

	/* Fallback trigger for browsers with limited 3D support */
	@media (prefers-reduced-motion) {
		.minecraft-spinner {
			display: none;
		}
		.minecraft-spinner-fallback {
			display: block;
		}
	}

	/* Load More button styling */
	.load-more-container {
		display: flex;
		justify-content: center;
		margin-top: 30px;
		margin-bottom: 20px;
		position: relative;
	}

	.load-more-button {
		position: relative;
		background-color: #3c3c3c;
		border: 4px solid #555555;
		padding: 12px 30px;
		font-family: "MinecraftFont", monospace;
		font-size: 18px;
		color: #ffffff;
		cursor: pointer;
		transform: translateY(0);
		transition: all 0.2s ease;
		overflow: hidden;
		width: 300px;
		height: 55px;
		text-align: center;
	}

	.load-more-button::before {
		content: "";
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 4px;
		background-color: #1e1e1e;
	}

	.load-more-button:hover {
		transform: translateY(-4px);
		background-color: #4c4c4c;
		border-color: #55ff55;
		color: #55ff55;
		box-shadow: 0 4px 0 0 #333333;
	}

	.load-more-button:active {
		transform: translateY(0);
		box-shadow: none;
	}

	.button-text {
		position: relative;
		z-index: 2;
	}

	.button-animation {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		height: 4px;
		background-color: #55ff55;
		transform: translateX(-100%);
	}

	.load-more-button:hover .button-animation {
		animation: load-progress 1.5s infinite linear;
	}

	@keyframes load-progress {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(100%);
		}
	}

	/* Minecraft-styled Download Progress Bar */

	.minecraft-download-container {
		width: 100%;
		max-width: 500px;
		margin: 13px auto;
		padding: 15px;
		background-color: #3c3c3c;
		border: 4px solid #555555;
		position: relative;
	}

	/* Top edge shadow effect */
	.minecraft-download-container::before {
		content: "";
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 4px;
		background-color: #1e1e1e;
	}

	.minecraft-download-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 10px;
	}

	.minecraft-download-title {
		font-family: "MinecraftFont", monospace;
		font-size: 16px;
		color: #ffffff;
		margin: 0;
	}

	.minecraft-download-percentage {
		font-family: "MinecraftFont", monospace;
		font-size: 16px;
		color: #55ff55;
		margin: 0;
	}

	.minecraft-download-bar-container {
		height: 20px;
		background-color: #2c2c2c;
		border: 3px solid #555555;
		position: relative;
		overflow: hidden;
	}

	.minecraft-download-bar {
		height: 100%;
		background-color: #427a16;
		width: 0%;
		transition: width 0.3s ease;
		position: relative;
	}

	/* Pixelated pattern in progress bar */
	.minecraft-download-bar::after {
		content: "";
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-image: linear-gradient(
			135deg,
			rgba(85, 170, 33, 0.8) 25%,
			transparent 25%,
			transparent 50%,
			rgba(85, 170, 33, 0.8) 50%,
			rgba(85, 170, 33, 0.8) 75%,
			transparent 75%,
			transparent
		);
		background-size: 8px 8px;
	}

	.minecraft-download-info {
		display: flex;
		justify-content: space-between;
		margin-top: 10px;
	}

	.minecraft-download-file {
		font-family: "MinecraftFont", monospace;
		font-size: 12px;
		color: #cccccc;
	}

	.minecraft-download-speed {
		font-family: "MinecraftFont", monospace;
		font-size: 12px;
		color: #aaaaaa;
	}

	/* Download states */
	.minecraft-download-complete .minecraft-download-bar {
		background-color: #55ff55;
		width: 100%;
	}

	.minecraft-download-complete .minecraft-download-percentage {
		color: #55ff55;
	}

	.minecraft-download-error .minecraft-download-bar {
		background-color: #aa3636;
		width: 100%;
	}

	.minecraft-download-error .minecraft-download-percentage {
		color: #ff5555;
	}

	/* Animation for when download is in progress */
	@keyframes download-pulse {
		0% {
			background-position: 0 0;
		}
		100% {
			background-position: 16px 0;
		}
	}

	.minecraft-download-active .minecraft-download-bar::after {
		animation: download-pulse 1s linear infinite;
	}

	/* Cancel button */
	.minecraft-download-cancel {
		background-color: #8b2d2d;
		border: 2px solid #555555;
		color: #ffffff;
		font-family: "MinecraftFont", monospace;
		font-size: 12px;
		padding: 3px 8px;
		cursor: pointer;
		margin-top: 10px;
		align-self: flex-end;
		transition: all 0.2s ease;
	}

	.minecraft-download-cancel:hover {
		background-color: #aa3636;
		border-color: #ff5555;
	}

	/* Multiple downloads queue styling */
	.minecraft-downloads-queue {
		display: flex;
		flex-direction: column;

		max-height: 500px;
		overflow-y: auto;
	}

	/* ScrollBar styling to match Minecraft theme */
	.minecraft-downloads-queue::-webkit-scrollbar {
		width: 10px;
	}

	.minecraft-downloads-queue::-webkit-scrollbar-track {
		background: #1e1e1e;
	}

	.minecraft-downloads-queue::-webkit-scrollbar-thumb {
		background: #555555;
		border: 2px solid #1e1e1e;
	}

	.minecraft-downloads-queue::-webkit-scrollbar-thumb:hover {
		background: #55ff55;
	}

	/* Popup styles */
	.popup-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.7);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
	}

	.popup {
		width: 90%;
		max-width: 500px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		border: 6px solid #555;
		box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
	}

	/* Minecraft panel with dirt texture */
	.minecraft-panel {
		background-color: #8b8b8b;
		background-image: linear-gradient(45deg, #7d7d7d 25%, transparent 25%),
			linear-gradient(-45deg, #7d7d7d 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #7d7d7d 75%),
			linear-gradient(-45deg, transparent 75%, #7d7d7d 75%);
		background-size: 4px 4px;
		position: relative;
		padding: 4px;
	}

	.popup-header {
		background-color: #5a5a5a;
		border-bottom: 4px solid #555;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px;
	}

	.popup-header h2 {
		margin: 0;
		color: #ffffff;
		text-shadow: 2px 2px 0 #3a3a3a;
		font-size: 18px;
	}

	.close-button {
		background: none;
		border: none;
		font-size: 18px;
		cursor: pointer;
		color: #ffffff;
	}

	.popup-content {
		padding: 10px;
		background-color: #c6c6c6;
		overflow-y: auto;
		flex-grow: 1;
	}

	.popup-footer {
		display: flex;
		justify-content: space-between;
		padding: 10px;
		background-color: #5a5a5a;
		border-top: 4px solid #555;
	}

	/* Minecraft button style */
	.minecraft-button {
		background-color: #757575;
		border: 2px solid #000;
		border-bottom-width: 4px;
		border-right-width: 4px;
		color: white;
		text-shadow: 2px 2px 0 #3a3a3a;
		padding: 8px 12px;
		font-size: 14px;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 0.1s;
	}

	.minecraft-button:hover {
		background-color: #8b8b8b;
	}

	.minecraft-button:active {
		border-bottom-width: 2px;
		border-right-width: 2px;
		transform: translate(2px, 2px);
	}

	.minecraft-button.apply {
		background-color: #546d1b; /* Green for "Apply" */
	}

	.minecraft-button.apply:hover {
		background-color: #6a8c34;
	}

	.minecraft-button.cancel {
		background-color: #754343; /* Redstone-ish for "Cancel" */
	}

	.minecraft-button.cancel:hover {
		background-color: #8a5151;
	}

	/* Input styling */
	.minecraft-input {
		width: 93%;
		border: 2px solid #000;
		border-bottom-width: 4px;
		border-right-width: 4px;
		background-color: #8b8b8b;
		color: white;
		padding: 14px;
		margin-bottom: 15px;
	}

	.minecraft-input::placeholder {
		color: #ccc;
	}

	/* Version list styling */
	.version-list {
		max-height: 300px;
		overflow-y: auto;
		border: 4px solid #555;
		background-color: #8b8b8b;
	}

	.version-item {
		display: flex;
		align-items: center;
		padding: 8px 12px;
		cursor: pointer;
		color: white;
		text-shadow: 1px 1px 0 #3a3a3a;
		border-bottom: 2px solid #555;
		width: 100%;
	}

	.version-item:hover {
		background-color: rgba(255, 255, 255, 0.1);
	}

	.version-item.selected {
		background-color: rgba(
			84,
			109,
			27,
			0.3
		); /* Green tint for selected items */
	}

	/* Checkbox styling to look like Minecraft UI */
	.checkbox {
		width: 20px;
		height: 20px;
		border: 2px solid #000;
		background-color: #5a5a5a;
		margin-right: 10px;
		position: relative;
	}

	.checkbox.checked {
		background-color: #546d1b;
	}

	.checkbox.checked::after {
		content: "✓";
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: white;
	}

	/* Selected filters display */
	.selected-filters {
		margin-top: 10px;
		padding: 8px;
		background-color: rgba(84, 109, 27, 0.2);
		border: 2px solid #546d1b;
		color: white;
		display: flex;
		justify-content: space-between;
	}

	.clear-button {
		background: none;
		border: none;
		color: #ff8888;
		cursor: pointer;
		text-decoration: underline;
	}

	/* Custom scrollbar to match Minecraft theme */
	.version-list::-webkit-scrollbar {
		width: 12px;
	}

	.version-list::-webkit-scrollbar-track {
		background: #5a5a5a;
	}

	.version-list::-webkit-scrollbar-thumb {
		background: #757575;
		border: 2px solid #000;
	}
</style>
