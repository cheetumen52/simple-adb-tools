use std::{collections::HashMap, path::Path, process::Stdio, time::Duration};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, BufReader},
    process::Command,
    sync::{Mutex, mpsc, oneshot},
};

use crate::toolchain::{Tool, Toolchain};

#[derive(Serialize)]
pub struct RunResult {
    pub status: i32,
    pub output: String,
}

struct StreamHandle {
    #[cfg_attr(not(unix), allow(dead_code))]
    pid: Option<u32>,
    kill: Option<oneshot::Sender<()>>,
}

#[derive(Default)]
pub struct Streams(Mutex<HashMap<String, StreamHandle>>);

#[derive(Clone, Serialize)]
struct LinesEvent {
    id: String,
    lines: Vec<String>,
}

#[derive(Clone, Serialize)]
struct ExitEvent {
    id: String,
    status: i32,
}

/// A command that never flashes a console window on Windows.
pub fn command(program: &Path) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    cmd.stdin(Stdio::null()).kill_on_drop(true);
    cmd
}

async fn prepare(toolchain: &Toolchain, tool: &str) -> Result<Command, String> {
    let tool = Tool::parse(tool).ok_or_else(|| format!("Neznámý nástroj {tool}"))?;
    let path = toolchain
        .path(tool)
        .await
        .ok_or_else(|| format!("{} není k dispozici", tool.name()))?;
    let mut cmd = command(&path);
    // scrcpy must talk to the same adb binary, otherwise two adb versions keep killing each other's server.
    if tool == Tool::Scrcpy
        && let Some(adb) = toolchain.path(Tool::Adb).await
    {
        cmd.env("ADB", adb);
    }
    Ok(cmd)
}

#[tauri::command]
pub async fn run_tool(
    toolchain: State<'_, Toolchain>,
    tool: String,
    args: Vec<String>,
    timeout_ms: Option<u64>,
) -> Result<RunResult, String> {
    let mut cmd = prepare(&toolchain, &tool).await?;
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let child = cmd.spawn().map_err(|e| e.to_string())?;
    let output = match timeout_ms {
        Some(ms) => {
            match tokio::time::timeout(Duration::from_millis(ms), child.wait_with_output()).await {
                Ok(result) => result.map_err(|e| e.to_string())?,
                Err(_) => {
                    return Ok(RunResult {
                        status: -2,
                        output: "Časový limit vypršel".into(),
                    });
                }
            }
        }
        None => child.wait_with_output().await.map_err(|e| e.to_string())?,
    };
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    Ok(RunResult {
        status: output.status.code().unwrap_or(-1),
        output: text,
    })
}

/// Writes raw stdout to a file (e.g. `adb exec-out screencap -p`); `output` carries stderr.
#[tauri::command]
pub async fn run_tool_to_file(
    toolchain: State<'_, Toolchain>,
    tool: String,
    args: Vec<String>,
    path: String,
) -> Result<RunResult, String> {
    let mut cmd = prepare(&toolchain, &tool).await?;
    let output = cmd.args(&args).output().await.map_err(|e| e.to_string())?;
    let png = output.stdout.starts_with(&[0x89, b'P', b'N', b'G']);
    if output.status.success() && !output.stdout.is_empty() && (png || !path.ends_with(".png")) {
        tokio::fs::write(&path, &output.stdout)
            .await
            .map_err(|e| e.to_string())?;
        return Ok(RunResult {
            status: 0,
            output: String::from_utf8_lossy(&output.stderr).into_owned(),
        });
    }
    let mut text = String::from_utf8_lossy(&output.stderr).into_owned();
    if text.trim().is_empty() {
        text = String::from_utf8_lossy(&output.stdout[..output.stdout.len().min(300)]).into_owned();
    }
    Ok(RunResult {
        status: output.status.code().unwrap_or(-1).max(1),
        output: text,
    })
}

/// Streams output as batched `proc-lines` events and finishes with `proc-exit`.
#[tauri::command]
pub async fn stream_tool(
    app: AppHandle,
    toolchain: State<'_, Toolchain>,
    streams: State<'_, Streams>,
    id: String,
    tool: String,
    args: Vec<String>,
) -> Result<(), String> {
    let mut cmd = prepare(&toolchain, &tool).await?;
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    let (line_tx, mut line_rx) = mpsc::unbounded_channel::<String>();
    if let Some(out) = child.stdout.take() {
        tokio::spawn(read_lines(out, line_tx.clone()));
    }
    if let Some(err) = child.stderr.take() {
        tokio::spawn(read_lines(err, line_tx.clone()));
    }
    drop(line_tx);

    let (kill_tx, kill_rx) = oneshot::channel();
    streams.0.lock().await.insert(
        id.clone(),
        StreamHandle {
            pid: child.id(),
            kill: Some(kill_tx),
        },
    );

    // Batch lines so a chatty logcat does not flood the webview with one event per line.
    let emit_app = app.clone();
    let emit_id = id.clone();
    let emitter = tokio::spawn(async move {
        let mut batch = Vec::new();
        let mut tick = tokio::time::interval(Duration::from_millis(120));
        loop {
            tokio::select! {
                line = line_rx.recv() => match line {
                    Some(line) => {
                        batch.push(line);
                        if batch.len() >= 500 {
                            let _ = emit_app.emit("proc-lines", LinesEvent { id: emit_id.clone(), lines: std::mem::take(&mut batch) });
                        }
                    }
                    None => break,
                },
                _ = tick.tick() => {
                    if !batch.is_empty() {
                        let _ = emit_app.emit("proc-lines", LinesEvent { id: emit_id.clone(), lines: std::mem::take(&mut batch) });
                    }
                }
            }
        }
        if !batch.is_empty() {
            let _ = emit_app.emit(
                "proc-lines",
                LinesEvent {
                    id: emit_id,
                    lines: batch,
                },
            );
        }
    });

    let streams_app = app.clone();
    tokio::spawn(async move {
        let status = tokio::select! {
            status = child.wait() => status,
            _ = kill_rx => {
                let _ = child.start_kill();
                child.wait().await
            }
        };
        let _ = emitter.await;
        let code = status.ok().and_then(|s| s.code()).unwrap_or(-1);
        if let Some(streams) = streams_app.try_state::<Streams>() {
            streams.0.lock().await.remove(&id);
        }
        let _ = streams_app.emit("proc-exit", ExitEvent { id, status: code });
    });
    Ok(())
}

async fn read_lines<R: AsyncRead + Unpin>(reader: R, tx: mpsc::UnboundedSender<String>) {
    let mut reader = BufReader::new(reader);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match reader.read_until(b'\n', &mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                let line = String::from_utf8_lossy(&buf).trim().to_string();
                if !line.is_empty() && tx.send(line).is_err() {
                    break;
                }
            }
        }
    }
}

/// `interrupt` sends SIGINT on Unix so scrcpy/screenrecord can finalize their files; otherwise kills.
#[tauri::command]
pub async fn stop_stream(
    streams: State<'_, Streams>,
    id: String,
    interrupt: bool,
) -> Result<(), String> {
    let mut map = streams.0.lock().await;
    let Some(handle) = map.get_mut(&id) else {
        return Ok(());
    };
    #[cfg(unix)]
    if interrupt && let Some(pid) = handle.pid {
        unsafe { libc::kill(pid as i32, libc::SIGINT) };
        return Ok(());
    }
    let _ = interrupt;
    if let Some(kill) = handle.kill.take() {
        let _ = kill.send(());
    }
    Ok(())
}

pub async fn stop_all(streams: &Streams) {
    let mut map = streams.0.lock().await;
    for handle in map.values_mut() {
        #[cfg(unix)]
        if let Some(pid) = handle.pid {
            unsafe { libc::kill(pid as i32, libc::SIGINT) };
            continue;
        }
        if let Some(kill) = handle.kill.take() {
            let _ = kill.send(());
        }
    }
}
