// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
// use serde::{Deserialize, Serialize}
// use tauri_plugin_http::reqwest;

// #[tauri::command]
// async fn fetch(mc_id: String, search_query: String, search_page: String, api_key: String) -> Result<serde_json::Value, String> {
//     let params = [("gameId", mc_id), ("searchFilter", search_query), ("index", search_page)];
//     let client = reqwest::Client::new();
//     let res = client.get("https://api.curseforge.com/v1/mods/search").header("x-api-key", api_key).form(&params);
//     let json_res = res.json::<serde_json::Value>().await;
//     Ok(json_res)
// }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // .invoke_handler(tauri::generate_handler![fetch])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
