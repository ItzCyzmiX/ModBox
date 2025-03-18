<script>
	import "../app.css";
	import { fly } from "svelte/transition";
	import { onMount } from "svelte";
	import {
		BaseDirectory,
		readFile,
		exists,
		writeTextFile,
		remove,
		mkdir,
	} from "@tauri-apps/plugin-fs";
	import { open, confirm } from "@tauri-apps/plugin-dialog";
	import { path } from "@tauri-apps/api";
	import { download } from "@tauri-apps/plugin-upload";
	import { exit } from "@tauri-apps/plugin-process";
	import Versions from "../components/Versions.svelte";
	import Loading from "../components/Loading.svelte";
	import LoadMore from "../components/LoadMore.svelte";
	import Settings from "../components/Settings.svelte";
	import Sidebare from "../components/Sidebare.svelte";

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
		const decoder = new TextDecoder();

		const app_data_path = await path.appDataDir();

		const app_data_exists = await exists(app_data_path);

		if (!app_data_exists) {
			await mkdir(app_data_path);
		}

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
					"x-api-key":
						"$2a$10$3MKF0WNYQh7DwMyDsQEZOuomuqV8vjxy5k64wt4AhmRv8tMsmu6TC",
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
	let filteredInstalledMods = $state([]);
	let modsToShow = $derived(
		activeCategory === "Browse"
			? selectedVersions.length > 0
				? filteredMods
				: allMods
			: activeCategory === "Installed"
				? filteredInstalledMods.length > 0
					? filteredInstalledMods
					: installedMods
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
			let json = {};
			try {
				const res = await fetch(
					`https://api.curseforge.com/v1/mods/search?gameId=${MC_GAME_ID}&searchFilter=${searchQuery}&index=${searchPage}`,
					{
						method: "GET",
						headers: {
							Accept: "application/json",
							"x-api-key":
								"$2a$10$3MKF0WNYQh7DwMyDsQEZOuomuqV8vjxy5k64wt4AhmRv8tMsmu6TC",
						},
					},
				);

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
					alrInstalled: installedMods.some((vx, i) => {
						return vx.id === v.id;
					}),
					fileDate: v.latestFiles[0].fileDate,
				};
			});

			allMods = [...allMods, ..._allMods];

			searchPage += json.pagination.index;

			if (selectedVersions.length > 0) {
				applyFilters();
			}
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

	async function updateMod(id) {
		const mod_id = installedMods[id].id;
		const res = await fetch(
			`https://api.curseforge.com/v1/mods/${mod_id}`,
			{
				method: "GET",
				headers: {
					Accept: "application/json",
					"x-api-key":
						"$2a$10$3MKF0WNYQh7DwMyDsQEZOuomuqV8vjxy5k64wt4AhmRv8tMsmu6TC",
				},
			},
		);

		const json = await res.json();
		let mod = json.data;
		let mod_latest_date = new Date(mod.latestFiles[0].fileDate);
		let mod_current_date = new Date(installedMods[id].fileDate);

		if (mod_latest_date > mod_current_date) {
			activeCategory = "Downloads";
			alert("New version found downloading!");
			const downloadLink = installedMods[id].file;
			const fileNameList = downloadLink.split("/");
			const fileName = fileNameList[fileNameList.length - 1];

			const modsPath = await path.join(
				config["mc-dir"],
				"mods",
				fileName,
			);

			const i = downloadingMods.length;
			downloadingMods = [
				...downloadingMods,
				{
					...installedMods[id],
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
									...installedMods[id],
									fileName: fileName,
									fileDate: mod.latestFiles[0].fileDate,
								};
								// Force reactivity by creating new array
								installedMods = installedMods.filter(
									(mmod, iii) => {
										return iii !== id;
									},
								);
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
		} else {
			alert("Mod is already up to date!");
		}
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

		showPopup = false;
	}

	function cancelFilters() {
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
		<Sidebare {activeCategory} {selectCategory} />

		<div class="main-content">
			{#if activeCategory === "Browse" || activeCategory === "Installed"}
				<div class="search-bar">
					{#if activeCategory === "Browse"}
						<input
							type="text"
							placeholder="Browse mods..."
							bind:value={searchQuery}
						/>
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
									<p>already installed</p>
								{/if}

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
				</div>
			{:else if activeCategory === "Downloads"}
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
								<span class="minecraft-download-file"
									>{mod.fileName}</span
								>
								<span class="minecraft-download-speed"
									>{mod.status === "pending"
										? `${(mod.bytesWritten * 0.001).toFixed(0)}Kb/${mod.fileSize * 0.001 || "??"}Kb`
										: "Complete"}</span
								>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<Settings {changeMCDir} dir={config["mc-dir"]} />
			{/if}
			{#if activeCategory === "Browse" && modsToShow.length > 0}
				<LoadMore {search} {loading} />
			{/if}
		</div>
	</div>
	{#if loading}
		<Loading />
	{/if}

	{#if showPopup}
		<Versions
			{selectedVersions}
			{togglePopup}
			{toggleVersion}
			{mc_versions}
			{applyFilters}
			{cancelFilters}
			{versionSearch}
		/>
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
</style>
