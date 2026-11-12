//! Path Conduit desktop shell.
//! WebView data lives in a process-unique temp directory and is deleted on exit.
//! No plugins (no http, shell, updater, or fs). The frontend never uses web storage.

use std::fs;
use std::path::PathBuf;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

fn ephemeral_dir() -> PathBuf {
    let p = std::env::temp_dir().join(format!("path-conduit-ephemeral-{}", std::process::id()));
    let _ = fs::create_dir_all(&p);
    p
}

fn wipe(path: &PathBuf) {
    let _ = fs::remove_dir_all(path);
}

/// Also remove a default app-data folder if the webview or OS created one.
fn wipe_app_data(app: &tauri::AppHandle) {
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = fs::remove_dir_all(&dir);
    }
    if let Ok(dir) = app.path().app_cache_dir() {
        let _ = fs::remove_dir_all(&dir);
    }
    if let Ok(dir) = app.path().app_local_data_dir() {
        let _ = fs::remove_dir_all(&dir);
    }
    if let Ok(dir) = app.path().app_log_dir() {
        let _ = fs::remove_dir_all(&dir);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = ephemeral_dir();
    let data_dir_for_window = data_dir.clone();
    let data_dir_for_exit = data_dir.clone();

    let app = tauri::Builder::default()
        .setup(move |app| {
            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Path Conduit")
                .inner_size(420.0, 640.0)
                .min_inner_size(360.0, 480.0)
                .resizable(true)
                .decorations(false)
                .fullscreen(false)
                .visible(true)
                .data_directory(data_dir_for_window);

            #[cfg(windows)]
            {
                builder = builder
                    .transparent(true)
                    .shadow(true)
                    // InPrivate-style WebView2: avoid writing a persistent user profile.
                    .additional_browser_args("--inprivate --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection");
            }

            #[cfg(not(windows))]
            {
                builder = builder.transparent(true);
            }

            builder.build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Path Conduit");

    app.run(move |app_handle, event| {
        if let RunEvent::Exit = event {
            wipe(&data_dir_for_exit);
            wipe_app_data(app_handle);
        }
    });
}
