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
	import Filters from "../components/Filters.svelte";
	import Search from "../components/Search.svelte";
	import ModCard from "../components/ModGrid.svelte";
	import ModGrid from "../components/ModGrid.svelte";
	import DownloadQueue from "../components/DownloadQueue.svelte";
	import { downloadMod, updateMod, removeMod } from "$lib/modUtils.svelte";
	import {
		config,
		allMods,
		installedMods,
		downloadingMods,
		activeCategory,
		searchPage,
	} from "$lib/state.svelte";

	async function changeMCDir() {
		while (true) {
			const dir = await open({
				multiple: false,
				directory: true,
			});

			if (dir === null) {
				return;
			}
			config.set({
				...$config,
				"mc-dir": dir,
			});

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

			await writeTextFile("config.json", JSON.stringify($config), {
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

		config.set(JSON.parse(decoder.decode(config_file)));

		if (!$config["mc-dir"]) {
			await changeMCDir();
		}
		if ($config.installed) {
			installedMods.set($config.installed);
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
	// let downloadingMods = $state([]);
	// let config = $state({
	// 	installed: [],
	// });
	// let installedMods = $state([]);
	let showPopup = $state(false);
	let selectedVersions = $state([]);
	let versionSearch = $state("");
	let statusMessage = $state("");
	let statusType = $state("");

	// State variables
	const MC_GAME_ID = 432;
	let mc_versions = $state({});
	// let activeCategory = $state("Installed");
	let searchQuery = $state("");
	// let allMods = $state([]);
	let filteredMods = $state([]);
	let filteredInstalledMods = $state([]);
	let modsToShow = $derived(
		$activeCategory === "Browse"
			? selectedVersions.length > 0
				? filteredMods
				: $allMods
			: $activeCategory === "Installed"
				? filteredInstalledMods.length > 0
					? filteredInstalledMods
					: $installedMods
				: [],
	);

	function selectCategory(category) {
		activeCategory.set(category);
	}

	function showStatusMessage(message, type) {
		statusMessage = message;
		statusType = type;
		setTimeout(() => {
			statusMessage = "";
		}, 3000);
	}

	async function search() {
		if ($activeCategory === "Browse") {
			loading = true;
			let mods = [];
			let json = {};
			try {
				const res = await fetch(
					`https://api.curseforge.com/v1/mods/search?gameId=${MC_GAME_ID}&searchFilter=${searchQuery}&index=${$searchPage}`,
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
					alrInstalled: $installedMods.some((vx, i) => {
						return vx.id === v.id;
					}),
					fileDate: v.latestFiles[0].fileDate,
				};
			});

			allMods.set([...$allMods, ..._allMods]);

			searchPage.set(($searchPage += json.pagination.index));

			if (selectedVersions.length > 0) {
				applyFilters();
			}
			loading = false;
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
			if (mc_versions?.[name]) {
				selectedVersions = [...selectedVersions, name];
			}
		}
	}

	function applyFilters() {
		filteredMods = $allMods.filter((mod, i) => {
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
</script>

<main class="minecraft-app">
	<div class="header">
		<h1 class="title">ModBox</h1>
	</div>

	<div class="content">
		<Sidebare activeCategory={$activeCategory} {selectCategory} />

		<div class="main-content">
			{#if $activeCategory === "Browse" || $activeCategory === "Installed"}
				<Search
					activeCategory={$activeCategory}
					{search}
					onChange={(q) => {
						searchQuery = q;
					}}
					{togglePopup}
				/>
				{#if $activeCategory === "Browse" && selectedVersions.length > 0}
					<Filters {clearFilters} {selectedVersions} />
				{/if}
				<ModGrid
					activeCategory={$activeCategory}
					{removeMod}
					{downloadMod}
					{updateMod}
					{modsToShow}
					{selectCategory}
				/>
			{:else if $activeCategory === "Downloads"}
				<DownloadQueue downloadingMods={$downloadingMods} />
			{:else}
				<Settings {changeMCDir} dir={$config["mc-dir"]} />
			{/if}
			{#if $activeCategory === "Browse" && modsToShow.length > 0}
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
