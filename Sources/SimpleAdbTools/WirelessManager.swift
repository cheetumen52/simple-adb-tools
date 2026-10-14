import AppKit
import Foundation
import Network

struct KnownWirelessDevice: Codable, Identifiable, Equatable {
    var address: String
    var name: String
    var hardwareSerial: String?
    var lastConnected: Date
    var id: String { hardwareSerial ?? address }
}

enum WirelessState: Equatable {
    case connected, reconnecting, waiting, unreachable, paused, disconnected
}

/// Remembers Wi‑Fi devices and re-establishes dropped adb connections.
@MainActor
final class WirelessManager: ObservableObject {
    static let shared = WirelessManager()

    @Published private(set) var known: [KnownWirelessDevice] {
        didSet {
            if let data = try? JSONEncoder().encode(known) { UserDefaults.standard.set(data, forKey: "knownWireless") }
        }
    }
    @Published var autoReconnect: Bool {
        didSet { UserDefaults.standard.set(autoReconnect, forKey: "autoReconnect") }
    }
    @Published private(set) var states: [String: WirelessState] = [:]
    /// macOS Local Network privacy is denying this app (and the adb server it spawned).
    @Published private(set) var localNetworkBlocked = false
    private var restartedServerForLAN = false

    static let localNetworkSettingsURL = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork")!

    private var failures: [String: Int] = [:]
    private var nextAttempt: [String: Date] = [:]
    private var inFlight: Set<String> = []
    private var paused: Set<String> = []
    private var timer: Timer?

    /// ~4 min of retries (5, 10, 20, 40, 60, 60… s) before auto-reconnect gives up.
    private let maxFailures = 8

    private var installer: InstallerModel { .shared }

    private init() {
        known = UserDefaults.standard.data(forKey: "knownWireless")
            .flatMap { try? JSONDecoder().decode([KnownWirelessDevice].self, from: $0) } ?? []
        autoReconnect = UserDefaults.standard.object(forKey: "autoReconnect") as? Bool ?? true
    }

    func start() {
        timer = Timer.scheduledTimer(withTimeInterval: 4, repeats: true) { _ in
            Task { @MainActor in self.tick() }
        }
    }

    func status(_ device: KnownWirelessDevice) -> WirelessState {
        if connectedDevice(for: device) != nil { return .connected }
        if paused.contains(device.id) { return .paused }
        if let state = states[device.id], state != .connected { return state }
        return autoReconnect ? .waiting : .disconnected
    }

    var reconnecting: [KnownWirelessDevice] {
        known.filter { [.reconnecting, .waiting].contains(status($0)) && autoReconnect }
    }

    private func connectedDevice(for k: KnownWirelessDevice) -> Device? {
        installer.devices.first { d in
            guard d.ready, d.isWireless else { return false }
            if d.serial == k.address { return true }
            guard let hw = k.hardwareSerial else { return false }
            return installer.details[d.serial]?.hardwareSerial == hw
        }
    }

    private func tick() {
        guard installer.toolchain.adbPath != nil else { return }
        record()
        guard autoReconnect else { return }
        let now = Date()
        for k in known where connectedDevice(for: k) == nil
            && !paused.contains(k.id)
            && !inFlight.contains(k.id)
            && (failures[k.id] ?? 0) < maxFailures
            && (nextAttempt[k.id] ?? .distantPast) <= now {
            reconnect(k, manual: false)
        }
    }

    /// Adds or refreshes every wireless device that is currently online.
    private func record() {
        for d in installer.devices where d.ready && d.isWireless {
            let hw = installer.details[d.serial]?.hardwareSerial
            if let index = known.firstIndex(where: { ($0.hardwareSerial != nil && $0.hardwareSerial == hw) || $0.address == d.serial }) {
                var k = known[index]
                if k.address != d.serial || k.name != d.displayName || (k.hardwareSerial == nil && hw != nil) || states[k.id] != .connected {
                    k.address = d.serial
                    k.name = d.displayName
                    k.hardwareSerial = k.hardwareSerial ?? hw
                    k.lastConnected = Date()
                    known[index] = k
                }
                markConnected(k)
            } else if hw != nil || !d.serial.contains("._adb-tls-") {
                let k = KnownWirelessDevice(address: d.serial, name: d.displayName, hardwareSerial: hw, lastConnected: Date())
                known.append(k)
                markConnected(k)
            }
        }
    }

    private func markConnected(_ k: KnownWirelessDevice) {
        states[k.id] = .connected
        failures[k.id] = 0
        nextAttempt[k.id] = nil
    }

    func reconnect(_ k: KnownWirelessDevice, manual: Bool) {
        guard let adb = installer.toolchain.adbPath, !inFlight.contains(k.id) else { return }
        if manual {
            paused.remove(k.id)
            failures[k.id] = 0
        } else if (failures[k.id] ?? 0) == 0 {
            installer.append(.info, "Wi‑Fi spojení s \(k.name) spadlo, obnovuji…")
        }
        inFlight.insert(k.id)
        states[k.id] = .reconnecting

        Task {
            var target = k.address
            // Android 11+ wireless debugging picks a new port each time; mDNS tells us the current one.
            if let hw = k.hardwareSerial {
                let services = await Shell.runAsync(adb, ["mdns", "services"]).output
                for line in services.split(separator: "\n") where line.contains(hw) && line.contains("_adb-tls-connect") {
                    if let addr = line.split(whereSeparator: { $0 == "\t" || $0 == " " }).last.map(String.init), addr.contains(":") {
                        target = addr
                    }
                }
            }
            if installer.devices.contains(where: { $0.serial == target && !$0.ready }) {
                _ = await Shell.runAsync(adb, ["disconnect", target])
            }
            let ok = await connect(target, verbose: manual, allowServerRestart: manual || !restartedServerForLAN)
            inFlight.remove(k.id)

            if ok {
                if let index = known.firstIndex(where: { $0.id == k.id }) { known[index].address = target }
                markConnected(k)
                installer.append(.success, "✓ \(k.name) znovu připojeno přes Wi‑Fi (\(target))")
                installer.refreshDevices()
            } else {
                let count = (failures[k.id] ?? 0) + 1
                failures[k.id] = count
                let delay = min(60, 5 * pow(2, Double(count - 1)))
                nextAttempt[k.id] = Date().addingTimeInterval(delay)
                if count >= maxFailures {
                    states[k.id] = .unreachable
                    installer.append(.error, "\(k.name) není přes Wi‑Fi dostupné. Automatické obnovení jsem zastavil, zkus „Znovu připojit“.")
                } else {
                    states[k.id] = .waiting
                }
            }
        }
    }

    enum Probe { case reachable, blocked, refused, timeout }

    /// `adb connect` with diagnosis: when it fails, the app probes the phone itself to tell
    /// a macOS Local Network denial apart from a closed port or a phone on another network.
    @discardableResult
    func connect(_ address: String, verbose: Bool = true, allowServerRestart: Bool = true) async -> Bool {
        guard let adb = installer.toolchain.adbPath else { return false }
        if verbose { installer.append(.command, "adb connect \(address)") }
        var r = await Shell.runAsync(adb, ["connect", address])
        if r.output.contains("connected to") {
            localNetworkBlocked = false
            return true
        }

        let parts = address.split(separator: ":")
        guard parts.count == 2, let port = UInt16(parts[1]) else {
            if verbose { installer.append(.error, r.output.trimmingCharacters(in: .whitespacesAndNewlines)) }
            return false
        }
        switch await diagnose(host: String(parts[0]), port: port, allowServerRestart: allowServerRestart, verbose: verbose) {
        case .reachable:
            guard allowServerRestart else { return false }
            r = await Shell.runAsync(adb, ["connect", address])
            if r.output.contains("connected to") {
                localNetworkBlocked = false
                installer.append(.success, "✓ Připojeno přes Wi‑Fi (\(address))")
                installer.refreshDevices()
                return true
            }
            if verbose { installer.append(.error, r.output.trimmingCharacters(in: .whitespacesAndNewlines)) }
        default:
            break
        }
        return false
    }

    /// Probes the phone from the app. On `.reachable` the adb server is restarted under this app
    /// (it was spawned by a process without Local Network access); other outcomes are explained in the log.
    func diagnose(host: String, port: UInt16, allowServerRestart: Bool = true, verbose: Bool = true) async -> Probe {
        let result = await Self.probe(host: host, port: port)
        switch result {
        case .reachable:
            guard allowServerRestart, let adb = installer.toolchain.adbPath else { break }
            restartedServerForLAN = true
            installer.append(.info, "Telefon je v síti dostupný, ale adb server do ní nesmí. Restartuji adb server pod Simple ADB tools…")
            _ = await Shell.runAsync(adb, ["kill-server"])
            _ = await Shell.runAsync(adb, ["start-server"])
        case .blocked:
            localNetworkBlocked = true
            installer.append(.error, "macOS blokuje Simple ADB tools přístup do místní sítě. Povol ho v Nastavení → Soukromí a zabezpečení → Místní síť.")
        case .refused:
            localNetworkBlocked = false
            if verbose {
                installer.append(.error, "Telefon \(host) na portu \(port) neposlouchá. Android 10 a starší: připoj kabel a dej „Přepnout na Wi‑Fi“. Android 11+: zkontroluj port na obrazovce Bezdrátové ladění.")
            }
        case .timeout:
            if verbose {
                installer.append(.error, "Telefon \(host) neodpovídá. Je zapnutý a ve stejné Wi‑Fi síti jako Mac?")
            }
        }
        return result
    }

    nonisolated static func probe(host: String, port: UInt16, timeout: Double = 4) async -> Probe {
        await withCheckedContinuation { cont in
            guard let nwPort = NWEndpoint.Port(rawValue: port) else {
                cont.resume(returning: .timeout)
                return
            }
            let connection = NWConnection(host: NWEndpoint.Host(host), port: nwPort, using: .tcp)
            let once = ProbeOnce { result in
                connection.cancel()
                cont.resume(returning: result)
            }
            connection.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    once.finish(.reachable)
                case let .waiting(error), let .failed(error):
                    if connection.currentPath?.unsatisfiedReason == .localNetworkDenied {
                        once.finish(.blocked)
                    } else if case let .posix(code) = error {
                        switch code {
                        case .ECONNREFUSED: once.finish(.refused)
                        case .EHOSTUNREACH, .ENETDOWN, .ENETUNREACH: once.finish(.blocked)
                        default: break
                        }
                    }
                default:
                    break
                }
            }
            connection.start(queue: .global())
            DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { once.finish(.timeout) }
        }
    }

    func openLocalNetworkSettings() {
        NSWorkspace.shared.open(Self.localNetworkSettingsURL)
    }

    func forget(_ k: KnownWirelessDevice) {
        known.removeAll { $0.id == k.id }
        states.removeValue(forKey: k.id)
        failures.removeValue(forKey: k.id)
        paused.remove(k.id)
    }

    /// Called on an explicit "disconnect all" so the user's intent wins over auto-reconnect.
    func pauseAll() {
        for k in known {
            paused.insert(k.id)
            states[k.id] = .paused
        }
    }

    /// After a network change or restart, give every device a fresh retry budget.
    func resumeAll() {
        paused.removeAll()
        failures.removeAll()
        nextAttempt.removeAll()
    }
}

/// Resolves a probe exactly once; state updates and the timeout race on different threads.
private final class ProbeOnce: @unchecked Sendable {
    private let lock = NSLock()
    private var done = false
    private let onFinish: (WirelessManager.Probe) -> Void

    init(_ onFinish: @escaping (WirelessManager.Probe) -> Void) {
        self.onFinish = onFinish
    }

    func finish(_ result: WirelessManager.Probe) {
        lock.lock()
        guard !done else { lock.unlock(); return }
        done = true
        lock.unlock()
        onFinish(result)
    }
}
