use std::{
    collections::HashMap,
    io::Read,
    path::{Path, PathBuf},
};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{io::AsyncWriteExt, sync::RwLock};

use crate::proc::command;

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum Tool {
    Adb,
    Aapt2,
    Scrcpy,
}

impl Tool {
    pub fn parse(s: &str) -> Option<Tool> {
        match s {
            "adb" => Some(Tool::Adb),
            "aapt2" => Some(Tool::Aapt2),
            "scrcpy" => Some(Tool::Scrcpy),
            _ => None,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Tool::Adb => "adb",
            Tool::Aapt2 => "aapt2",
            Tool::Scrcpy => "scrcpy",
        }
    }

    fn exe(self) -> String {
        if cfg!(windows) {
            format!("{}.exe", self.name())
        } else {
            self.name().to_string()
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ToolStatus {
    Missing,
    Found {
        path: String,
        version: String,
        managed: bool,
    },
    Broken {
        path: String,
        error: String,
    },
}

#[derive(Default)]
pub struct Toolchain {
    paths: RwLock<HashMap<Tool, PathBuf>>,
}

impl Toolchain {
    pub async fn path(&self, tool: Tool) -> Option<PathBuf> {
        self.paths.read().await.get(&tool).cloned()
    }
}

fn managed_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("tools"))
        .map_err(|e| e.to_string())
}

fn sdk_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = ["ANDROID_HOME", "ANDROID_SDK_ROOT"]
        .iter()
        .filter_map(|k| std::env::var_os(k).map(PathBuf::from))
        .collect();
    if let Ok(home) = app.path().home_dir() {
        if cfg!(target_os = "macos") {
            roots.push(home.join("Library/Android/sdk"));
        } else if cfg!(target_os = "linux") {
            roots.push(home.join("Android/Sdk"));
        }
    }
    if cfg!(windows)
        && let Some(local) = std::env::var_os("LOCALAPPDATA")
    {
        roots.push(PathBuf::from(local).join("Android").join("Sdk"));
    }
    roots
}

/// GUI apps on macOS get a minimal PATH, so the usual Homebrew prefixes are added explicitly.
fn path_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    if cfg!(target_os = "macos") {
        dirs.push("/opt/homebrew/bin".into());
        dirs.push("/usr/local/bin".into());
    }
    dirs
}

fn candidates(app: &AppHandle, tool: Tool, custom_adb: Option<&str>) -> Vec<PathBuf> {
    let managed = managed_dir(app).ok();
    let exe = tool.exe();
    let mut list = Vec::new();
    match tool {
        Tool::Adb => {
            if let Some(custom) = custom_adb.filter(|c| !c.is_empty()) {
                list.push(PathBuf::from(custom));
            }
            list.extend(
                sdk_roots(app)
                    .into_iter()
                    .map(|r| r.join("platform-tools").join(&exe)),
            );
            if let Some(m) = &managed {
                list.push(m.join("platform-tools").join(&exe));
            }
        }
        Tool::Aapt2 => {
            for root in sdk_roots(app) {
                let dir = root.join("build-tools");
                let mut versions: Vec<String> = std::fs::read_dir(&dir)
                    .map(|rd| {
                        rd.filter_map(|e| e.ok())
                            .map(|e| e.file_name().to_string_lossy().into_owned())
                            .collect()
                    })
                    .unwrap_or_default();
                versions.sort_by(|a, b| compare_versions(b, a));
                list.extend(versions.into_iter().map(|v| dir.join(v).join(&exe)));
            }
            if let Some(m) = &managed {
                list.push(m.join("build-tools").join(&exe));
            }
        }
        Tool::Scrcpy => {
            if let Some(m) = &managed {
                list.push(m.join("scrcpy").join(&exe));
            }
        }
    }
    list.extend(path_dirs().into_iter().map(|d| d.join(&exe)));
    list
}

fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let parse = |s: &str| -> Vec<u64> {
        s.split(|c: char| !c.is_ascii_digit())
            .filter_map(|p| p.parse().ok())
            .collect()
    };
    parse(a).cmp(&parse(b))
}

async fn probe(tool: Tool, path: &Path, managed_root: Option<&Path>) -> Option<ToolStatus> {
    if !path.is_file() {
        return None;
    }
    let arg = if tool == Tool::Scrcpy {
        "--version"
    } else {
        "version"
    };
    let managed = managed_root.is_some_and(|m| path.starts_with(m));
    match command(path).arg(arg).output().await {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout).into_owned()
                + &String::from_utf8_lossy(&out.stderr);
            let version = match tool {
                Tool::Adb => text
                    .lines()
                    .find_map(|l| l.strip_prefix("Version "))
                    .unwrap_or("?")
                    .to_string(),
                Tool::Aapt2 => text.split_whitespace().last().unwrap_or("?").to_string(),
                Tool::Scrcpy => text
                    .lines()
                    .next()
                    .and_then(|l| l.split_whitespace().nth(1))
                    .unwrap_or("?")
                    .to_string(),
            };
            Some(ToolStatus::Found {
                path: path.display().to_string(),
                version,
                managed,
            })
        }
        Ok(out) => {
            let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
            Some(ToolStatus::Broken {
                path: path.display().to_string(),
                error: if err.is_empty() {
                    format!("exit {}", out.status.code().unwrap_or(-1))
                } else {
                    err
                },
            })
        }
        Err(e) => Some(ToolStatus::Broken {
            path: path.display().to_string(),
            error: e.to_string(),
        }),
    }
}

#[tauri::command]
pub async fn toolchain_check(
    app: AppHandle,
    toolchain: State<'_, Toolchain>,
    custom_adb: Option<String>,
) -> Result<HashMap<String, ToolStatus>, String> {
    let managed = managed_dir(&app).ok();
    let mut result = HashMap::new();
    let mut paths = HashMap::new();
    for tool in [Tool::Adb, Tool::Aapt2, Tool::Scrcpy] {
        let mut status = ToolStatus::Missing;
        for candidate in candidates(&app, tool, custom_adb.as_deref()) {
            match probe(tool, &candidate, managed.as_deref()).await {
                Some(found @ ToolStatus::Found { .. }) => {
                    paths.insert(tool, candidate);
                    status = found;
                    break;
                }
                Some(broken) if matches!(status, ToolStatus::Missing) => status = broken,
                _ => {}
            }
        }
        result.insert(tool.name().to_string(), status);
    }
    *toolchain.paths.write().await = paths;
    Ok(result)
}

#[derive(Clone, Serialize)]
struct Progress {
    tool: String,
    progress: f64,
}

#[tauri::command]
pub async fn toolchain_install(app: AppHandle, tool: String) -> Result<(), String> {
    let tool = Tool::parse(&tool).ok_or("Neznámý nástroj")?;
    let dir = managed_dir(&app)?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;
    match tool {
        Tool::Adb => install_platform_tools(&app, &dir).await,
        Tool::Aapt2 => install_aapt2(&app, &dir).await,
        Tool::Scrcpy => install_scrcpy(&app, &dir).await,
    }
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(concat!("SimpleAdbTools/", env!("CARGO_PKG_VERSION")))
        .build()
        .expect("http client")
}

async fn download(app: &AppHandle, tool: Tool, url: &str, dest: &Path) -> Result<(), String> {
    let response = client().get(url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Server vrátil HTTP {}", response.status().as_u16()));
    }
    let total = response.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();
    let mut written: u64 = 0;
    let mut last_emit = 0.0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        written += chunk.len() as u64;
        if total > 0 {
            let progress = written as f64 / total as f64;
            if progress - last_emit >= 0.01 || progress >= 1.0 {
                last_emit = progress;
                let _ = app.emit(
                    "install-progress",
                    Progress {
                        tool: tool.name().into(),
                        progress,
                    },
                );
            }
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    Ok(())
}

fn platform_suffix() -> &'static str {
    if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(windows) {
        "windows"
    } else {
        "linux"
    }
}

async fn install_platform_tools(app: &AppHandle, dir: &Path) -> Result<(), String> {
    let url = format!(
        "https://dl.google.com/android/repository/platform-tools-latest-{}.zip",
        platform_suffix()
    );
    let archive = dir.join("platform-tools.download");
    download(app, Tool::Adb, &url, &archive).await?;
    let target = dir.to_path_buf();
    let archive_clone = archive.clone();
    let result = tokio::task::spawn_blocking(move || {
        let _ = std::fs::remove_dir_all(target.join("platform-tools"));
        extract_zip(&archive_clone, &target)
    })
    .await
    .map_err(|e| e.to_string())?;
    let _ = tokio::fs::remove_file(&archive).await;
    result?;
    if !dir.join("platform-tools").join(Tool::Adb.exe()).is_file() {
        return Err("V archivu platform-tools chybí adb.".into());
    }
    Ok(())
}

async fn install_aapt2(app: &AppHandle, dir: &Path) -> Result<(), String> {
    let metadata = client()
        .get("https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/maven-metadata.xml")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    // Stable versions only: "8.7.3-12006047", not "9.0.0-alpha01-…".
    let version = metadata
        .split("<version>")
        .skip(1)
        .filter_map(|chunk| chunk.split("</version>").next())
        .filter(|v| {
            let mut parts = v.split('-');
            let semver = parts.next().unwrap_or("");
            let build = parts.next().unwrap_or("");
            parts.next().is_none()
                && semver.split('.').count() == 3
                && semver
                    .split('.')
                    .all(|p| p.chars().all(|c| c.is_ascii_digit()))
                && !build.is_empty()
                && build.chars().all(|c| c.is_ascii_digit())
        })
        .max_by(|a, b| compare_versions(a, b))
        .ok_or("Nenašel jsem stabilní verzi aapt2.")?
        .to_string();
    let classifier = match platform_suffix() {
        "darwin" => "osx",
        other => other,
    };
    let url = format!(
        "https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/{version}/aapt2-{version}-{classifier}.jar"
    );
    let archive = dir.join("aapt2.download");
    download(app, Tool::Aapt2, &url, &archive).await?;
    let out_dir = dir.join("build-tools");
    let archive_clone = archive.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<(), String> {
        std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
        let file = std::fs::File::open(&archive_clone).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        let name = Tool::Aapt2.exe();
        let mut entry = zip
            .by_name(&name)
            .map_err(|_| format!("V archivu chybí {name}"))?;
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        let dest = out_dir.join(&name);
        std::fs::write(&dest, bytes).map_err(|e| e.to_string())?;
        set_executable(&dest)
    })
    .await
    .map_err(|e| e.to_string())?;
    let _ = tokio::fs::remove_file(&archive).await;
    result
}

#[derive(Deserialize)]
struct Release {
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

async fn install_scrcpy(app: &AppHandle, dir: &Path) -> Result<(), String> {
    let release: Release = client()
        .get("https://api.github.com/repos/Genymobile/scrcpy/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let (prefix, suffix) = if cfg!(target_os = "macos") {
        (
            if cfg!(target_arch = "aarch64") {
                "scrcpy-macos-aarch64-"
            } else {
                "scrcpy-macos-x86_64-"
            },
            ".tar.gz",
        )
    } else if cfg!(windows) {
        ("scrcpy-win64-", ".zip")
    } else {
        ("scrcpy-linux-x86_64-", ".tar.gz")
    };
    let asset = release
        .assets
        .iter()
        .find(|a| a.name.starts_with(prefix) && a.name.ends_with(suffix))
        .ok_or("V posledním vydání scrcpy chybí build pro tento systém.")?;

    let archive = dir.join("scrcpy.download");
    download(app, Tool::Scrcpy, &asset.browser_download_url, &archive).await?;

    if let Some(sums) = release.assets.iter().find(|a| a.name == "SHA256SUMS.txt") {
        let text = client()
            .get(&sums.browser_download_url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;
        let expected = text
            .lines()
            .find(|l| l.trim_end().ends_with(&asset.name))
            .and_then(|l| l.split_whitespace().next())
            .map(str::to_lowercase);
        let bytes = tokio::fs::read(&archive).await.map_err(|e| e.to_string())?;
        let actual = hex::encode(Sha256::digest(&bytes));
        if expected.as_deref() != Some(actual.as_str()) {
            let _ = tokio::fs::remove_file(&archive).await;
            return Err("Kontrolní součet staženého scrcpy nesedí, instalaci jsem zrušil.".into());
        }
    }

    let tmp = dir.join("scrcpy.tmp");
    let target = dir.join("scrcpy");
    let is_zip = suffix == ".zip";
    let archive_clone = archive.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
        if is_zip {
            extract_zip(&archive_clone, &tmp)?;
        } else {
            let file = std::fs::File::open(&archive_clone).map_err(|e| e.to_string())?;
            tar::Archive::new(flate2::read::GzDecoder::new(file))
                .unpack(&tmp)
                .map_err(|e| e.to_string())?;
        }
        let binary =
            find_file(&tmp, &Tool::Scrcpy.exe()).ok_or("V archivu scrcpy chybí binárka.")?;
        let folder = binary
            .parent()
            .ok_or("Neplatná struktura archivu.")?
            .to_path_buf();
        let _ = std::fs::remove_dir_all(&target);
        // The binary needs scrcpy-server (and on Windows its DLLs) next to it, so keep the whole folder.
        std::fs::rename(&folder, &target).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_dir_all(&tmp);
        set_executable(&target.join(Tool::Scrcpy.exe()))
    })
    .await
    .map_err(|e| e.to_string())?;
    let _ = tokio::fs::remove_file(&archive).await;
    result
}

fn extract_zip(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };
        let out = dest.join(relative);
        if entry.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut file = std::fs::File::create(&out).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut file).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        if let Some(mode) = entry.unix_mode() {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&out, std::fs::Permissions::from_mode(mode));
        }
    }
    Ok(())
}

fn find_file(dir: &Path, name: &str) -> Option<PathBuf> {
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_file(&path, name) {
                return Some(found);
            }
        } else if path.file_name().is_some_and(|n| n == name) {
            return Some(path);
        }
    }
    None
}

fn set_executable(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }
    let _ = path;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sat-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn build_tools_versions_sort_numerically() {
        let mut v = vec!["9.0.0", "37.0.0", "36.1.0", "36.0.0"];
        v.sort_by(|a, b| compare_versions(b, a));
        assert_eq!(v, ["37.0.0", "36.1.0", "36.0.0", "9.0.0"]);
        assert_eq!(
            compare_versions("8.7.3-12006047", "8.7.3-9"),
            std::cmp::Ordering::Greater
        );
    }

    #[test]
    fn tool_names_round_trip() {
        for tool in [Tool::Adb, Tool::Aapt2, Tool::Scrcpy] {
            assert_eq!(Tool::parse(tool.name()), Some(tool));
        }
        assert_eq!(Tool::parse("rm"), None);
    }

    #[test]
    fn zip_extraction_keeps_layout_and_blocks_traversal() {
        let dir = temp_dir("zip");
        let archive = dir.join("a.zip");
        {
            let mut zip = zip::ZipWriter::new(std::fs::File::create(&archive).unwrap());
            let opts = zip::write::SimpleFileOptions::default().unix_permissions(0o755);
            zip.start_file("platform-tools/adb", opts).unwrap();
            zip.write_all(b"#!/bin/sh\n").unwrap();
            zip.start_file("../escape.txt", opts).unwrap();
            zip.write_all(b"nope").unwrap();
            zip.finish().unwrap();
        }
        let out = dir.join("out");
        extract_zip(&archive, &out).unwrap();
        let adb = out.join("platform-tools/adb");
        assert!(adb.is_file());
        assert!(!dir.join("escape.txt").exists());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&adb).unwrap().permissions().mode() & 0o777,
                0o755
            );
        }
        assert_eq!(find_file(&out, "adb"), Some(adb));
        assert_eq!(find_file(&out, "scrcpy"), None);
        let _ = std::fs::remove_dir_all(dir);
    }
}
