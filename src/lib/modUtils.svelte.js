// @ts-nocheck
import { get } from "svelte/store";

import { path } from "@tauri-apps/api";
import { BaseDirectory, writeTextFile, remove } from "@tauri-apps/plugin-fs";
import { download } from "@tauri-apps/plugin-upload";

import {
	allMods,
	config,
	downloadingMods,
	activeCategory,
	installedMods,
} from "./state.svelte";

async function downloadMod(id) {
	const downloadLink = get(allMods)[id].file;
	const fileNameList = downloadLink.split("/");
	const fileName = fileNameList[fileNameList.length - 1];

	const modsPath = await path.join(get(config)["mc-dir"], "mods", fileName);

	const i = get(downloadingMods).length;
	downloadingMods.set([
		...get(downloadingMods),

		{
			...get(allMods)[id],
			downloadProgress: 0,
			bytesWritten: 0,
			status: "pending",
			fileName: fileName,
		},
	]);

	await download(downloadLink, modsPath, ({ progress, progressTotal }) => {
		downloadingMods.set(
			get(downloadingMods).map((v, ind) => {
				if (ind === i) {
					const isComplete = progress === 0;
					if (isComplete) {
						const newMod = {
							...get(allMods)[id],
							fileName: fileName,
						};
						// Force reactivity by creating new array

						installedMods.set([...get(installedMods), newMod]);
						// Update config
						config.set({
							...get(config),
							installed: get(installedMods),
						});
						// Save to config file
						writeTextFile(
							"config.json",
							JSON.stringify(get(config)),
							{
								baseDir: BaseDirectory.AppData,
							}
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
			})
		);
	});
}

async function updateMod(id) {
	const mod_id = get(installedMods)[id].id;
	const res = await fetch(`https://api.curseforge.com/v1/mods/${mod_id}`, {
		method: "GET",
		headers: {
			Accept: "application/json",
			"x-api-key":
				"$2a$10$3MKF0WNYQh7DwMyDsQEZOuomuqV8vjxy5k64wt4AhmRv8tMsmu6TC",
		},
	});

	const json = await res.json();
	let mod = json.data;
	let mod_latest_date = new Date(mod.latestFiles[0].fileDate);

	let mod_current_date = new Date(get(installedMods)[id].fileDate);

	if (mod_latest_date > mod_current_date) {
		activeCategory.set("Downloads");
		alert("New version found downloading!");

		const downloadLink = get(installedMods)[id].file;
		const fileNameList = downloadLink.split("/");
		const fileName = fileNameList[fileNameList.length - 1];

		const modsPath = await path.join(
			get(config)["mc-dir"],
			"mods",
			fileName
		);

		const i = get(downloadingMods).length;
		downloadingMods.set([
			...get(downloadingMods),

			{
				...get(installedMods)[id],
				downloadProgress: 0,
				bytesWritten: 0,
				status: "pending",
				fileName: fileName,
			},
		]);

		await download(
			downloadLink,
			modsPath,
			({ progress, progressTotal }) => {
				downloadingMods.set(
					get(downloadingMods).map((v, ind) => {
						if (ind === i) {
							const isComplete = progress === 0;
							if (isComplete) {
								const newMod = {
									...get(installedMods)[id],
									fileName: fileName,
									fileDate: mod.latestFiles[0].fileDate,
								};
								// Force reactivity by creating new array
								installedMods.set(
									get(installedMods).filter((mmod, iii) => {
										return iii !== id;
									})
								);
								installedMods.set([
									...get(installedMods),

									newMod,
								]);
								// Update config
								config.set({
									...get(config),
									installed: get(installedMods),
								});
								// Save to config file
								writeTextFile(
									"config.json",
									JSON.stringify(get(config)),
									{
										baseDir: BaseDirectory.AppData,
									}
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
					})
				);
			}
		);
	} else {
		alert("Mod is already up to date!");
	}
}

async function removeMod(id) {
	if (get(installedMods)[id]) {
		const modPath = await path.join(
			get(config)["mc-dir"],
			"mods",

			get(installedMods)[id].fileName
		);

		try {
			await remove(modPath);
		} catch (e) {
			console.error(e);
		} finally {
			installedMods.set(
				get(installedMods).filter((v, i) => {
					return i !== id;
				})
			);
			config.set({
				...get(config),
				installed: get(installedMods),
			});
			// Save to config file
			writeTextFile("config.json", JSON.stringify(get(config)), {
				baseDir: BaseDirectory.AppData,
			});
		}
	}
}

export { removeMod, updateMod, downloadMod };
