import { writable } from "svelte/store";

let allMods = writable([]);
let downloadingMods = writable([]);
let installedMods = writable([]);
let config = writable({
	"mc-dir": false,
	installed: [],
});
let activeCategory = writable("Installed");
let searchPage = writable(0)
export { activeCategory, installedMods, downloadingMods, config, allMods, searchPage };
