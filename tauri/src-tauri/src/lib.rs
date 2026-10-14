mod files;
mod net;
mod proc;
mod toolchain;

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

/// APKs opened via Finder/Explorer ("Open with", drag onto the Dock icon) before or while the UI runs.
#[derive(Default)]
struct PendingFiles(Mutex<Vec<String>>);

fn apk_paths(args: impl IntoIterator<Item = String>) -> Vec<String> {
    args.into_iter()
        .filter(|a| a.to_lowercase().ends_with(".apk"))
        .collect()
}

fn deliver(app: &AppHandle, files: Vec<String>) {
    if files.is_empty() {
        return;
    }
    app.state::<PendingFiles>()
        .0
        .lock()
        .expect("pending files")
        .extend(files);
    let _ = app.emit("open-files", ());
}

#[tauri::command]
fn take_pending_files(state: State<'_, PendingFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().expect("pending files"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // A second launch (e.g. "Open with" on Windows) forwards its APK arguments to the running window.
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            deliver(app, apk_paths(argv.into_iter().skip(1)));
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(toolchain::Toolchain::default())
        .manage(proc::Streams::default())
        .manage(PendingFiles::default())
        .setup(|app| {
            let files = apk_paths(std::env::args().skip(1));
            app.state::<PendingFiles>()
                .0
                .lock()
                .expect("pending files")
                .extend(files);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_files,
            toolchain::toolchain_check,
            toolchain::toolchain_install,
            proc::run_tool,
            proc::run_tool_to_file,
            proc::stream_tool,
            proc::stop_stream,
            net::probe_tcp,
            files::list_apks,
            files::system_paths,
            files::write_text,
            files::make_dir,
            files::path_exists,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Simple ADB tools")
        .run(|app, event| match event {
            #[cfg(target_os = "macos")]
            RunEvent::Opened { urls } => {
                let files = urls
                    .into_iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.display().to_string());
                deliver(app, apk_paths(files));
            }
            RunEvent::Exit => {
                // Close scrcpy windows and finalize recordings when the app quits.
                tauri::async_runtime::block_on(proc::stop_all(&app.state::<proc::Streams>()));
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::apk_paths;

    #[test]
    fn only_apk_arguments_are_taken() {
        let args = [
            "--flag",
            "C:\\Users\\z\\Downloads\\app-debug (1).APK",
            "/tmp/readme.txt",
            "/tmp/x.apk",
        ]
        .map(String::from);
        assert_eq!(
            apk_paths(args),
            ["C:\\Users\\z\\Downloads\\app-debug (1).APK", "/tmp/x.apk"]
        );
    }
}
