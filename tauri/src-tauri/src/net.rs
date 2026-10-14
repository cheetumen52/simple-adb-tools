use std::{io::ErrorKind, time::Duration};

use tokio::net::TcpStream;

/// Connects from the app itself, which also triggers the macOS Local Network prompt for this app.
/// Returns "reachable", "refused", "blocked" (no route / Local Network denied) or "timeout".
#[tauri::command]
pub async fn probe_tcp(host: String, port: u16, timeout_ms: Option<u64>) -> String {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(4000));
    match tokio::time::timeout(timeout, TcpStream::connect((host.as_str(), port))).await {
        Ok(Ok(_)) => "reachable",
        Ok(Err(e)) => match e.kind() {
            ErrorKind::ConnectionRefused => "refused",
            ErrorKind::HostUnreachable | ErrorKind::NetworkUnreachable | ErrorKind::NetworkDown => "blocked",
            ErrorKind::TimedOut => "timeout",
            _ => match e.raw_os_error() {
                // EHOSTUNREACH / ENETUNREACH / ENETDOWN on macOS, WSAE* equivalents on Windows.
                Some(65 | 51 | 50 | 10065 | 10051 | 10050) => "blocked",
                Some(61 | 10061) => "refused",
                _ => "timeout",
            },
        },
        Err(_) => "timeout",
    }
    .to_string()
}
