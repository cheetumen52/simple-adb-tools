use std::{path::PathBuf, time::UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApkEntry {
    path: String,
    name: String,
    folder: String,
    modified_ms: f64,
    size: u64,
}

#[tauri::command]
pub async fn list_apks(folders: Vec<String>, limit: usize) -> Vec<ApkEntry> {
    tokio::task::spawn_blocking(move || {
        let mut found = Vec::new();
        for folder in folders {
            let Ok(entries) = std::fs::read_dir(&folder) else { continue };
            for entry in entries.flatten() {
                let path = entry.path();
                let is_apk = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("apk"));
                let Ok(meta) = entry.metadata() else { continue };
                if !is_apk || !meta.is_file() {
                    continue;
                }
                let modified_ms = meta
                    .modified()
                    .ok()
                    .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as f64)
                    .unwrap_or(0.0);
                found.push(ApkEntry {
                    name: entry.file_name().to_string_lossy().into_owned(),
                    path: path.display().to_string(),
                    folder: folder.clone(),
                    modified_ms,
                    size: meta.len(),
                });
            }
        }
        found.sort_by(|a, b| b.modified_ms.total_cmp(&a.modified_ms));
        found.truncate(limit);
        found
    })
    .await
    .unwrap_or_default()
}

#[derive(Serialize)]
pub struct Paths {
    home: String,
    desktop: String,
    downloads: String,
    platform: String,
}

#[tauri::command]
pub fn system_paths(app: AppHandle) -> Result<Paths, String> {
    let path = app.path();
    let home = path.home_dir().map_err(|e| e.to_string())?;
    let desktop = path.desktop_dir().unwrap_or_else(|_| home.join("Desktop"));
    let downloads = path.download_dir().unwrap_or_else(|_| home.join("Downloads"));
    let platform = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(windows) {
        "windows"
    } else {
        "linux"
    };
    Ok(Paths {
        home: home.display().to_string(),
        desktop: desktop.display().to_string(),
        downloads: downloads.display().to_string(),
        platform: platform.into(),
    })
}

#[tauri::command]
pub async fn write_text(path: String, contents: String) -> Result<(), String> {
    tokio::fs::write(path, contents).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn make_dir(path: String) -> Result<(), String> {
    tokio::fs::create_dir_all(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    PathBuf::from(path).exists()
}
