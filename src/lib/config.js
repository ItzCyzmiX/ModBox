import { exists, BaseDirectory, writeTextFile, readFile } from "@tauri-apps/plugin-fs";
import { path } from "@tauri-apps/api";
import { config, installedMods } from "./state";
import { confirm } from "@tauri-apps/plugin-dialog";
import { exit } from "@tauri-apps/plugin-process";


export async function initConfig() {
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
			}
		);
	}

	config_file = await readFile("config.json", {
		baseDir: BaseDirectory.AppData,
	});

	config = JSON.parse(decoder.decode(config_file));

	if (!config["mc-dir"]) {
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
					}
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
	if (config.installed) {
		installedMods = config.installed;
	}
}
