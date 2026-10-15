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
            ErrorKind::HostUnreachable | ErrorKind::NetworkUnreachable | ErrorKind::NetworkDown => {
                "blocked"
            }
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

/// The computer's primary LAN address, for pointing a phone's proxy at it. Connecting a UDP socket only
/// picks the outgoing interface; no packet is sent.
#[tauri::command]
pub fn local_ips() -> Vec<String> {
    let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") else {
        return Vec::new();
    };
    if socket.connect("192.0.2.1:80").is_err() {
        return Vec::new();
    }
    match socket.local_addr() {
        Ok(addr) if !addr.ip().is_loopback() && !addr.ip().is_unspecified() => {
            vec![addr.ip().to_string()]
        }
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::probe_tcp;

    #[tokio::test]
    async fn reachable_and_refused() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let open = listener.local_addr().unwrap().port();
        assert_eq!(
            probe_tcp("127.0.0.1".into(), open, Some(2000)).await,
            "reachable"
        );

        // Bind and drop to get a closed port. Windows retries SYN before reporting the refusal (~2 s).
        let closed = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        assert_eq!(
            probe_tcp("127.0.0.1".into(), closed, Some(6000)).await,
            "refused"
        );
    }
}
