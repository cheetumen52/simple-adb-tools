import AppKit
import Foundation

struct MirrorOptions: Codable, Equatable {
    enum Source: String, Codable, CaseIterable, Identifiable {
        case screen, frontCamera, backCamera
        var id: String { rawValue }
        var title: String {
            switch self {
            case .screen: "Obrazovka"
            case .frontCamera: "Přední kamera"
            case .backCamera: "Zadní kamera"
            }
        }
    }

    var source: Source = .screen
    var maxSize = 0
    var audio = true
    var turnScreenOff = false
    var stayAwake = true
    var showTouches = false
    var alwaysOnTop = false
    var viewOnly = false
    var record = false

    static let sizes: [(Int, String)] = [(0, "Plné"), (1920, "1920 px"), (1280, "1280 px"), (1024, "1024 px"), (800, "800 px")]
}

/// Runs scrcpy windows, one per device.
@MainActor
final class MirrorController: ObservableObject {
    static let shared = MirrorController()

    @Published var options: MirrorOptions {
        didSet {
            if let data = try? JSONEncoder().encode(options) { UserDefaults.standard.set(data, forKey: "mirrorOptions") }
        }
    }
    @Published private(set) var running: [String: Date] = [:]
    private var processes: [String: Process] = [:]
    private var recordings: [String: URL] = [:]

    private var installer: InstallerModel { .shared }

    private init() {
        options = UserDefaults.standard.data(forKey: "mirrorOptions")
            .flatMap { try? JSONDecoder().decode(MirrorOptions.self, from: $0) } ?? MirrorOptions()
    }

    var isAvailable: Bool { installer.toolchain.scrcpyPath != nil }

    func isMirroring(_ device: Device) -> Bool { running[device.serial] != nil }

    func toggle(_ device: Device) {
        if isMirroring(device) { stop(device) } else { start(device) }
    }

    func start(_ device: Device) {
        guard let scrcpy = installer.toolchain.scrcpyPath, let adb = installer.toolchain.adbPath, processes[device.serial] == nil else {
            if installer.toolchain.scrcpyPath == nil {
                installer.append(.error, "Zrcadlení potřebuje scrcpy. Doinstaluj ho v Systémových požadavcích.")
            }
            return
        }
        let o = options
        var args = ["-s", device.serial, "--window-title", "\(device.displayName) · \(Brand.appName)"]
        if o.maxSize > 0 { args += ["--max-size", "\(o.maxSize)"] }
        if !o.audio { args.append("--no-audio") }
        switch o.source {
        case .screen:
            if o.viewOnly {
                args.append("--no-control")
            } else {
                if o.turnScreenOff { args.append("--turn-screen-off") }
                if o.stayAwake { args.append("--stay-awake") }
            }
            if o.showTouches { args.append("--show-touches") }
        case .frontCamera:
            args += ["--video-source=camera", "--camera-facing=front", "--no-control"]
        case .backCamera:
            args += ["--video-source=camera", "--camera-facing=back", "--no-control"]
        }
        if o.alwaysOnTop { args.append("--always-on-top") }
        if o.record {
            let stamp = Date().formatted(.iso8601.year().month().day().time(includingFractionalSeconds: false)).replacingOccurrences(of: ":", with: "-")
            let url = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Desktop/\(device.displayName.replacingOccurrences(of: " ", with: "-"))_mirror_\(stamp).mp4")
            args += ["--record", url.path]
            recordings[device.serial] = url
        }

        let p = Process()
        p.executableURL = URL(fileURLWithPath: scrcpy)
        p.arguments = args
        var env = ProcessInfo.processInfo.environment
        // Same adb binary as the app, otherwise two adb versions keep killing each other's server.
        env["ADB"] = adb
        p.environment = env
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = pipe
        let lines = LineCollector { line in
            Task { @MainActor in self.installer.append(.output, "scrcpy: \(line)") }
        }
        pipe.fileHandleForReading.readabilityHandler = { h in
            let data = h.availableData
            if !data.isEmpty { lines.append(data, final: false) }
        }
        let serial = device.serial
        let name = device.displayName
        p.terminationHandler = { proc in
            pipe.fileHandleForReading.readabilityHandler = nil
            lines.append(pipe.fileHandleForReading.readDataToEndOfFile(), final: true)
            Task { @MainActor in self.finished(serial: serial, name: name, status: proc.terminationStatus) }
        }

        installer.append(.command, "scrcpy \(args.joined(separator: " "))")
        do {
            try p.run()
            processes[serial] = p
            running[serial] = Date()
        } catch {
            installer.append(.error, "scrcpy nejde spustit: \(error.localizedDescription)")
            recordings.removeValue(forKey: serial)
        }
    }

    func stop(_ device: Device) {
        // SIGINT lets scrcpy finalize a running recording.
        processes[device.serial]?.interrupt()
    }

    func stopAll() {
        processes.values.forEach { $0.interrupt() }
    }

    private func finished(serial: String, name: String, status: Int32) {
        processes.removeValue(forKey: serial)
        running.removeValue(forKey: serial)
        let recording = recordings.removeValue(forKey: serial)
        if status == 0 || status == 2 || status == 130 {
            installer.append(.info, "Zrcadlení \(name) ukončeno")
        } else {
            installer.append(.error, "scrcpy skončil s chybou (exit \(status)). Detail je ve výpisu výše.")
        }
        if let recording, FileManager.default.fileExists(atPath: recording.path) {
            installer.append(.success, "✓ Záznam uložen na plochu: \(recording.lastPathComponent)")
            NSWorkspace.shared.activateFileViewerSelecting([recording])
        }
    }
}
