// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[tauri::command]
fn hide_window(window: tauri::Window) {
    window.hide().unwrap();
    println!("Window hidden");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![hide_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
