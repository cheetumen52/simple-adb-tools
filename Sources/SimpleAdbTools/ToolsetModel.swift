import AppKit
import Foundation

enum ToolsetSection: String, CaseIterable, Identifiable {
    case overview = "Přehled"
    case apps = "Aplikace"
    case logcat = "Logcat"
    case control = "Ovládání"
    case wireless = "Wi‑Fi"
    case developer = "Vývojář"
    case shell = "Shell"
    var id: String { rawValue }

    var icon: String {
        switch self {
        case .overview: "info.circle"
        case .apps: "square.grid.2x2"
        case .logcat: "text.alignleft"
        case .control: "hand.tap"
        case .wireless: "wifi"
        case .developer: "hammer"
        case .shell: "terminal"
        }
    }
}

struct InfoRow: Identifiable, Hashable {
    let label: String
    let value: String
    var id: String { label }
}

struct LogcatLine: Identifiable {
    let id = UUID()
    let level: Character
    let text: String
}

struct ShellEntry: Identifiable {
    let id = UUID()
    let command: String
    let output: String
    let ok: Bool
}

enum DevToggle: String, CaseIterable, Identifiable {
    case showTouches, pointerLocation, animationsOff, darkMode, stayAwake, layoutBounds
    var id: String { rawValue }

    var title: String {
        switch self {
        case .showTouches: "Zobrazovat dotyky"
        case .pointerLocation: "Poloha ukazatele"
        case .animationsOff: "Vypnout animace"
        case .darkMode: "Tmavý režim"
        case .stayAwake: "Nezhasínat při nabíjení"
        case .layoutBounds: "Hranice layoutu"
        }
    }

    var help: String {
        switch self {
        case .showTouches: "Kolečko v místě každého dotyku. Ideální pro nahrávání videí a demo."
        case .pointerLocation: "Souřadnice dotyku a stopa pohybu v horní liště."
        case .animationsOff: "Nastaví všechna měřítka animací na 0. Rychlejší UI testy, méně flaky."
        case .darkMode: "Přepne systémový tmavý vzhled. Rychlý test dark mode."
        case .stayAwake: "Displej nezhasne, dokud je telefon na kabelu."
        case .layoutBounds: "Vykreslí okraje a marginy všech view. Projeví se po přepnutí aplikace."
        }
    }
}

enum LogLevel: String, CaseIterable, Identifiable {
    case verbose = "V", debug = "D", info = "I", warn = "W", error = "E"
    var id: String { rawValue }
    var title: String {
        switch self {
        case .verbose: "Verbose"
        case .debug: "Debug"
        case .info: "Info"
        case .warn: "Warning"
        case .error: "Error"
        }
    }
}

@MainActor
final class ToolsetModel: ObservableObject {
    static let shared = ToolsetModel()

    private var installer: InstallerModel { .shared }
    private var adb: String? { installer.toolchain.adbPath }

    @Published var serial: String?
    @Published var section: ToolsetSection = .overview

    @Published private(set) var info: [InfoRow] = []
    @Published private(set) var loadingInfo = false

    @Published private(set) var packages: [String] = []
    @Published private(set) var loadingPackages = false
    @Published var includeSystem = false
    @Published var packageQuery = ""
    @Published var selectedPackage: String?
    @Published private(set) var packageDetails: [InfoRow] = []

    @Published private(set) var logcat: [LogcatLine] = []
    @Published private(set) var logcatRunning = false
    @Published var logcatLevel: LogLevel = .debug
    @Published var logcatPackage = ""
    @Published var logcatFilter = ""
    @Published var logcatPaused = false
    private var logcatProcess: Process?
    private var logcatBuffer: LogcatBuffer?
    private var logcatTimer: Timer?

    @Published private(set) var recordingSince: Date?
    private var recordProcess: Process?
    private var recordSerial: String?

    @Published private(set) var toggles: [DevToggle: Bool] = [:]

    @Published var shellCommand = ""
    @Published private(set) var shellHistory: [ShellEntry] = []
    @Published private(set) var shellRunning = false

    @Published var typeText = ""
    @Published var deepLink = ""
    @Published var deepLinkHistory: [String] { didSet { UserDefaults.standard.set(deepLinkHistory, forKey: "deepLinkHistory") } }
    @Published var connectHost = ""
    @Published var pairHost = ""
    @Published var pairCode = ""

    private init() {
        deepLinkHistory = UserDefaults.standard.stringArray(forKey: "deepLinkHistory") ?? []
    }

    var device: Device? {
        let ready = installer.readyDevices
        return ready.first { $0.serial == serial } ?? ready.first
    }

    // MARK: - Helpers

    /// Single-quotes a value for the device's /system/bin/sh.
    nonisolated static func quote(_ s: String) -> String {
        "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    private func shell(_ command: String, on device: Device) async -> Shell.Result {
        guard let adb else { return Shell.Result(status: -1, output: "adb chybí") }
        return await Shell.runAsync(adb, ["-s", device.serial, "shell", command])
    }

    private func adbRun(_ args: [String], device: Device? = nil, log: Bool = true) async -> Shell.Result {
        guard let adb else { return Shell.Result(status: -1, output: "adb chybí") }
        let full = (device.map { ["-s", $0.serial] } ?? []) + args
        if log { installer.append(.command, "adb \(args.joined(separator: " "))\(device.map { " → \($0.displayName)" } ?? "")") }
        let r = await Shell.runAsync(adb, full)
        if log {
            let out = r.output.trimmingCharacters(in: .whitespacesAndNewlines)
            if !out.isEmpty { installer.append(r.ok ? .output : .error, out) }
        }
        return r
    }

    private func run(_ title: String, _ command: String) {
        guard let device else { return }
        installer.append(.command, "\(title) → \(device.displayName)")
        Task {
            let r = await shell(command, on: device)
            let out = r.output.trimmingCharacters(in: .whitespacesAndNewlines)
            if !out.isEmpty { installer.append(r.ok ? .output : .error, out) }
        }
    }

    /// Splits `echo @@key; cmd` style output into a dictionary.
    nonisolated private static func sections(_ out: String) -> [String: String] {
        var result: [String: String] = [:]
        var key: String?
        var lines: [String] = []
        for raw in out.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if line.hasPrefix("@@") {
                if let key { result[key] = lines.joined(separator: "\n") }
                key = String(line.dropFirst(2))
                lines = []
            } else if !line.isEmpty {
                lines.append(line)
            }
        }
        if let key { result[key] = lines.joined(separator: "\n") }
        return result
    }

    func reload() {
        guard device != nil else { return }
        switch section {
        case .overview: loadInfo()
        case .apps: if packages.isEmpty { loadPackages() }
        case .developer: loadToggles()
        default: break
        }
    }

    func deviceChanged() {
        info = []
        packages = []
        selectedPackage = nil
        packageDetails = []
        toggles = [:]
        if logcatRunning { stopLogcat() }
        reload()
    }

    // MARK: - Overview

    func loadInfo() {
        guard let device else { return }
        loadingInfo = true
        let script = [
            "echo @@manufacturer; getprop ro.product.manufacturer",
            "echo @@model; getprop ro.product.model",
            "echo @@release; getprop ro.build.version.release",
            "echo @@sdk; getprop ro.build.version.sdk",
            "echo @@abi; getprop ro.product.cpu.abi",
            "echo @@build; getprop ro.build.display.id",
            "echo @@size; wm size",
            "echo @@density; wm density",
            "echo @@battery; dumpsys battery",
            "echo @@storage; df -h /data | tail -1",
            "echo @@ip; ip -f inet addr show wlan0",
            "echo @@uptime; uptime",
        ].joined(separator: "; ")
        Task {
            let s = Self.sections(await shell(script, on: device).output)
            func last(_ key: String) -> String { s[key]?.split(separator: "\n").last.map { String($0) } ?? "–" }
            func afterColon(_ key: String) -> String {
                last(key).components(separatedBy: ":").last?.trimmingCharacters(in: .whitespaces) ?? "–"
            }
            func battery(_ field: String) -> String? {
                s["battery"]?.split(separator: "\n").first { $0.trimmingCharacters(in: .whitespaces).hasPrefix("\(field):") }
                    .map { String($0.split(separator: ":", maxSplits: 1)[1]).trimmingCharacters(in: .whitespaces) }
            }
            let statusMap = ["1": "neznámý", "2": "nabíjí se", "3": "vybíjí se", "4": "nenabíjí", "5": "nabito"]
            var batteryText = "–"
            if let level = battery("level") {
                batteryText = "\(level) %"
                if let st = battery("status"), let label = statusMap[st] { batteryText += " · \(label)" }
                if let t = battery("temperature"), let tv = Double(t) { batteryText += " · \(String(format: "%.1f", tv / 10)) °C" }
            }
            let storageParts = last("storage").split(separator: " ", omittingEmptySubsequences: true)
            let storage = storageParts.count >= 4 ? "volno \(storageParts[3]) z \(storageParts[1])" : "–"
            let ip = s["ip"].flatMap { text in
                text.range(of: #"inet (\d+\.\d+\.\d+\.\d+)"#, options: .regularExpression).map { String(text[$0].dropFirst(5)) }
            } ?? "nepřipojeno k Wi‑Fi"
            let uptime = s["uptime"].flatMap { text in
                text.range(of: #"up [^,]+"#, options: .regularExpression).map { String(text[$0].dropFirst(3)) }
            }.map(Self.czechUptime) ?? "–"

            info = [
                InfoRow(label: "Výrobce", value: last("manufacturer").capitalized),
                InfoRow(label: "Model", value: last("model")),
                InfoRow(label: "Android", value: "\(last("release")) (API \(last("sdk")))"),
                InfoRow(label: "Procesor (ABI)", value: last("abi")),
                InfoRow(label: "Build", value: last("build")),
                InfoRow(label: "Rozlišení", value: afterColon("size")),
                InfoRow(label: "Hustota", value: "\(afterColon("density")) dpi"),
                InfoRow(label: "Baterie", value: batteryText),
                InfoRow(label: "Úložiště", value: storage),
                InfoRow(label: "IP adresa", value: ip),
                InfoRow(label: "Zapnuto", value: uptime),
                InfoRow(label: "Sériové číslo", value: device.serial),
            ]
            loadingInfo = false
        }
    }

    /// "19 days" / "1 day" / "3:12" / "42 min" from toybox uptime.
    nonisolated private static func czechUptime(_ raw: String) -> String {
        let parts = raw.split(separator: " ")
        guard parts.count == 2, let n = Int(parts[0]) else {
            if raw.contains(":") { return raw + " h" }
            return raw
        }
        switch parts[1] {
        case "day", "days": return "\(n) \(n == 1 ? "den" : (2...4).contains(n) ? "dny" : "dní")"
        case "min", "mins": return "\(n) min"
        default: return raw
        }
    }

    func reboot(_ mode: String?) {
        guard let device else { return }
        Task { _ = await adbRun(["reboot"] + (mode.map { [$0] } ?? []), device: device) }
    }

    func push(_ urls: [URL]) {
        guard let device else { return }
        Task {
            for url in urls {
                let r = await adbRun(["push", url.path, "/sdcard/Download/"], device: device)
                installer.append(r.ok ? .success : .error, r.ok ? "✓ \(url.lastPathComponent) je v telefonu ve složce Download" : "✗ \(url.lastPathComponent) se nepodařilo nahrát")
            }
        }
    }

    // MARK: - Apps

    var filteredPackages: [String] {
        let q = packageQuery.trimmingCharacters(in: .whitespaces).lowercased()
        return q.isEmpty ? packages : packages.filter { $0.lowercased().contains(q) }
    }

    func loadPackages() {
        guard let device else { return }
        loadingPackages = true
        let cmd = includeSystem ? "pm list packages" : "pm list packages -3"
        Task {
            let r = await shell(cmd, on: device)
            packages = r.output.split(separator: "\n")
                .compactMap { $0.hasPrefix("package:") ? String($0.dropFirst(8)).trimmingCharacters(in: .whitespaces) : nil }
                .sorted()
            loadingPackages = false
            if let selected = selectedPackage, !packages.contains(selected) { selectedPackage = nil }
        }
    }

    func select(_ pkg: String) {
        selectedPackage = pkg
        packageDetails = []
        guard let device else { return }
        Task {
            let out = await shell("dumpsys package \(Self.quote(pkg))", on: device).output
            func value(_ key: String) -> String? {
                guard let r = out.range(of: key) else { return nil }
                return out[r.upperBound...].split(separator: "\n").first.map { String($0).trimmingCharacters(in: .whitespaces) }
            }
            let version = value("versionName=") ?? "?"
            let code = value("versionCode=")?.split(separator: " ").first.map(String.init) ?? "?"
            let target = value("targetSdk=")?.split(separator: " ").first.map(String.init) ?? "?"
            guard selectedPackage == pkg else { return }
            packageDetails = [
                InfoRow(label: "Verze", value: "\(version) (\(code))"),
                InfoRow(label: "Target SDK", value: target),
                InfoRow(label: "Nainstalováno", value: value("firstInstallTime=") ?? "?"),
                InfoRow(label: "Aktualizováno", value: value("lastUpdateTime=") ?? "?"),
            ]
        }
    }

    func launch(_ pkg: String) { run("Spouštím \(pkg)", "monkey -p \(Self.quote(pkg)) -c android.intent.category.LAUNCHER 1") }
    func forceStop(_ pkg: String) { run("Zastavuji \(pkg)", "am force-stop \(Self.quote(pkg))") }
    func clearData(_ pkg: String) { run("Mažu data \(pkg)", "pm clear \(Self.quote(pkg))") }
    func openSettings(_ pkg: String) {
        run("Otevírám nastavení \(pkg)", "am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d \(Self.quote("package:\(pkg)"))")
    }

    func uninstall(_ pkg: String) {
        guard let device else { return }
        Task {
            let r = await adbRun(["uninstall", pkg], device: device)
            if r.ok {
                packages.removeAll { $0 == pkg }
                if selectedPackage == pkg { selectedPackage = nil }
            }
        }
    }

    func pullApk(_ pkg: String) {
        guard let device else { return }
        Task {
            let paths = await shell("pm path \(Self.quote(pkg))", on: device).output.split(separator: "\n")
                .compactMap { $0.hasPrefix("package:") ? String($0.dropFirst(8)).trimmingCharacters(in: .whitespaces) : nil }
            guard !paths.isEmpty else {
                installer.append(.error, "Cestu k APK pro \(pkg) se nepodařilo zjistit")
                return
            }
            let downloads = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Downloads")
            var target = downloads.appendingPathComponent("\(pkg).apk")
            if paths.count > 1 {
                target = downloads.appendingPathComponent(pkg)
                try? FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
            }
            var ok = true
            for remote in paths {
                let local = paths.count > 1 ? target.appendingPathComponent((remote as NSString).lastPathComponent) : target
                ok = await adbRun(["pull", remote, local.path], device: device).ok && ok
            }
            if ok {
                installer.append(.success, "✓ APK uloženo: \((target.path as NSString).abbreviatingWithTildeInPath)\(paths.count > 1 ? " (split APK, \(paths.count) souborů)" : "")")
                NSWorkspace.shared.activateFileViewerSelecting([target])
            }
        }
    }

    func showCurrentActivity() {
        run("Aktuální aktivita", "dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' | head -2")
    }

    // MARK: - Logcat

    var visibleLogcat: [LogcatLine] {
        let q = logcatFilter.trimmingCharacters(in: .whitespaces)
        return q.isEmpty ? logcat : logcat.filter { $0.text.localizedCaseInsensitiveContains(q) }
    }

    func startLogcat() {
        guard let adb, let device, !logcatRunning else { return }
        let pkg = logcatPackage.trimmingCharacters(in: .whitespaces)
        Task {
            var args = ["-s", device.serial, "logcat", "-v", "time", "-T", "300"]
            if !pkg.isEmpty {
                let pid = await shell("pidof \(Self.quote(pkg))", on: device).output
                    .trimmingCharacters(in: .whitespacesAndNewlines).split(separator: " ").first.map(String.init)
                guard let pid, Int(pid) != nil else {
                    installer.append(.error, "\(pkg) neběží. Spusť aplikaci a zkus to znovu.")
                    return
                }
                args.append("--pid=\(pid)")
            }
            args.append("*:\(logcatLevel.rawValue)")

            let buffer = LogcatBuffer()
            let p = Process()
            p.executableURL = URL(fileURLWithPath: adb)
            p.arguments = args
            let pipe = Pipe()
            p.standardOutput = pipe
            p.standardError = pipe
            pipe.fileHandleForReading.readabilityHandler = { h in
                let data = h.availableData
                if !data.isEmpty { buffer.append(data) }
            }
            p.terminationHandler = { _ in
                pipe.fileHandleForReading.readabilityHandler = nil
                Task { @MainActor in
                    self.drainLogcat()
                    self.logcatRunning = false
                    self.logcatProcess = nil
                    self.logcatTimer?.invalidate()
                }
            }
            do {
                try p.run()
            } catch {
                installer.append(.error, "Logcat nejde spustit: \(error.localizedDescription)")
                return
            }
            logcatBuffer = buffer
            logcatProcess = p
            logcatRunning = true
            logcatTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { _ in
                Task { @MainActor in self.drainLogcat() }
            }
        }
    }

    func stopLogcat() {
        logcatProcess?.terminate()
    }

    private func drainLogcat() {
        guard let buffer = logcatBuffer, !logcatPaused else { return }
        let lines = buffer.drain()
        guard !lines.isEmpty else { return }
        logcat.append(contentsOf: lines.map { LogcatLine(level: Self.level(of: $0), text: $0) })
        if logcat.count > 5000 { logcat.removeFirst(logcat.count - 4000) }
    }

    nonisolated private static func level(of line: String) -> Character {
        // "-v time": "10-13 15:04:02.123 E/Tag( 1234): message"
        let parts = line.split(separator: " ", maxSplits: 2)
        guard parts.count == 3, let c = parts[2].first, "VDIWEF".contains(c) else { return "I" }
        return c
    }

    func clearLogcat() {
        logcat.removeAll()
        guard let device else { return }
        Task { _ = await adbRun(["logcat", "-c"], device: device, log: false) }
    }

    func saveLogcat() {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "logcat_\(Date().formatted(.iso8601.year().month().day().time(includingFractionalSeconds: false)).replacingOccurrences(of: ":", with: "-")).txt"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        try? visibleLogcat.map(\.text).joined(separator: "\n").write(to: url, atomically: true, encoding: .utf8)
    }

    // MARK: - Screen

    func screenshot() {
        guard let device else { return }
        installer.screenshot(device)
    }

    func toggleRecording() {
        if recordProcess != nil { stopRecording() } else { startRecording() }
    }

    private static let remoteRecording = "/sdcard/simple-adb-tools-recording.mp4"

    private func startRecording() {
        guard let adb, let device else { return }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: adb)
        p.arguments = ["-s", device.serial, "shell", "screenrecord", "--bit-rate", "8000000", Self.remoteRecording]
        p.standardOutput = Pipe()
        p.standardError = Pipe()
        p.terminationHandler = { _ in
            Task { @MainActor in await self.finishRecording() }
        }
        do {
            try p.run()
            recordProcess = p
            recordSerial = device.serial
            recordingSince = Date()
            installer.append(.command, "adb shell screenrecord → \(device.displayName) (max. 3 min)")
        } catch {
            installer.append(.error, "Nahrávání nejde spustit: \(error.localizedDescription)")
        }
    }

    private func stopRecording() {
        guard let adb, let serial = recordSerial else { return }
        Task { _ = await Shell.runAsync(adb, ["-s", serial, "shell", "pkill", "-INT", "screenrecord"]) }
    }

    private func finishRecording() async {
        guard let adb, let serial = recordSerial else { return }
        recordProcess = nil
        recordingSince = nil
        recordSerial = nil
        try? await Task.sleep(for: .seconds(1))
        let name = "recording_\(Date().formatted(.iso8601.year().month().day().time(includingFractionalSeconds: false)).replacingOccurrences(of: ":", with: "-")).mp4"
        let local = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Desktop").appendingPathComponent(name)
        let r = await Shell.runAsync(adb, ["-s", serial, "pull", Self.remoteRecording, local.path])
        _ = await Shell.runAsync(adb, ["-s", serial, "shell", "rm", "-f", Self.remoteRecording])
        if r.ok {
            installer.append(.success, "✓ Video uloženo na plochu: \(name)")
            NSWorkspace.shared.open(local)
        } else {
            installer.append(.error, "Video se nepodařilo stáhnout: \(r.output.trimmingCharacters(in: .whitespacesAndNewlines))")
        }
    }

    // MARK: - Input

    func key(_ code: Int, _ label: String) { run("Klávesa \(label)", "input keyevent \(code)") }

    func sendText() {
        let text = typeText
        guard !text.isEmpty else { return }
        let escaped = text.replacingOccurrences(of: " ", with: "%s")
        run("Píšu text", "input text \(Self.quote(escaped))")
        typeText = ""
    }

    func openDeepLink(_ link: String? = nil) {
        let url = (link ?? deepLink).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !url.isEmpty else { return }
        run("Otevírám \(url)", "am start -W -a android.intent.action.VIEW -d \(Self.quote(url))")
        deepLinkHistory.removeAll { $0 == url }
        deepLinkHistory.insert(url, at: 0)
        if deepLinkHistory.count > 8 { deepLinkHistory.removeLast(deepLinkHistory.count - 8) }
    }

    func openDeveloperOptions() { run("Možnosti pro vývojáře", "am start -a android.settings.APPLICATION_DEVELOPMENT_SETTINGS") }

    // MARK: - Wireless

    func switchToWifi() {
        guard let device else { return }
        Task {
            let out = await shell("ip -f inet addr show wlan0", on: device).output
            guard let r = out.range(of: #"inet (\d+\.\d+\.\d+\.\d+)"#, options: .regularExpression) else {
                installer.append(.error, "Telefon není připojený k Wi‑Fi.")
                return
            }
            let ip = String(out[r].dropFirst(5))
            _ = await adbRun(["tcpip", "5555"], device: device)
            try? await Task.sleep(for: .seconds(2))
            let c = await adbRun(["connect", "\(ip):5555"])
            installer.append(c.output.contains("connected") ? .success : .error,
                             c.output.contains("connected") ? "✓ Připojeno přes Wi‑Fi (\(ip):5555). Kabel můžeš odpojit." : "Připojení přes Wi‑Fi se nepovedlo")
            installer.refreshDevices()
        }
    }

    func connect() {
        let host = connectHost.trimmingCharacters(in: .whitespaces)
        guard !host.isEmpty else { return }
        Task {
            _ = await adbRun(["connect", host.contains(":") ? host : "\(host):5555"])
            installer.refreshDevices()
        }
    }

    func pair() {
        let host = pairHost.trimmingCharacters(in: .whitespaces)
        let code = pairCode.trimmingCharacters(in: .whitespaces)
        guard !host.isEmpty, !code.isEmpty else { return }
        Task {
            let r = await adbRun(["pair", host, code])
            if r.output.localizedCaseInsensitiveContains("success") {
                installer.append(.success, "✓ Spárováno. Teď se připoj přes adresu z obrazovky Bezdrátové ladění.")
                pairCode = ""
            }
        }
    }

    func disconnectAll() {
        Task {
            _ = await adbRun(["disconnect"])
            installer.refreshDevices()
        }
    }

    // MARK: - Developer toggles

    func loadToggles() {
        guard let device else { return }
        let script = [
            "echo @@touches; settings get system show_touches",
            "echo @@pointer; settings get system pointer_location",
            "echo @@anim; settings get global window_animation_scale",
            "echo @@night; cmd uimode night",
            "echo @@stay; settings get global stay_on_while_plugged_in",
            "echo @@layout; getprop debug.layout",
        ].joined(separator: "; ")
        Task {
            let s = Self.sections(await shell(script, on: device).output)
            let anim = s["anim"] ?? "1"
            toggles = [
                .showTouches: s["touches"] == "1",
                .pointerLocation: s["pointer"] == "1",
                .animationsOff: anim == "0" || anim == "0.0",
                .darkMode: s["night"]?.localizedCaseInsensitiveContains("yes") ?? false,
                .stayAwake: !(["0", "", "null"].contains(s["stay"] ?? "0")),
                .layoutBounds: s["layout"] == "true",
            ]
        }
    }

    func set(_ toggle: DevToggle, _ on: Bool) {
        guard let device else { return }
        toggles[toggle] = on
        let cmd: String
        switch toggle {
        case .showTouches: cmd = "settings put system show_touches \(on ? 1 : 0)"
        case .pointerLocation: cmd = "settings put system pointer_location \(on ? 1 : 0)"
        case .animationsOff:
            let v = on ? "0" : "1"
            cmd = ["window_animation_scale", "transition_animation_scale", "animator_duration_scale"]
                .map { "settings put global \($0) \(v)" }.joined(separator: "; ")
        case .darkMode: cmd = "cmd uimode night \(on ? "yes" : "no")"
        case .stayAwake: cmd = "svc power stayon \(on ? "true" : "false")"
        case .layoutBounds: cmd = "setprop debug.layout \(on ? "true" : "false"); service call activity 1599295570 > /dev/null"
        }
        installer.append(.command, "\(toggle.title): \(on ? "zapnuto" : "vypnuto") → \(device.displayName)")
        Task {
            let r = await shell(cmd, on: device)
            if !r.ok { installer.append(.error, r.output.trimmingCharacters(in: .whitespacesAndNewlines)) }
            loadToggles()
        }
    }

    // MARK: - Shell

    func runShell(_ command: String? = nil) {
        let cmd = (command ?? shellCommand).trimmingCharacters(in: .whitespacesAndNewlines)
        guard let device, !cmd.isEmpty, !shellRunning else { return }
        shellRunning = true
        Task {
            let r = await shell(cmd, on: device)
            shellHistory.append(ShellEntry(command: cmd, output: r.output.trimmingCharacters(in: .newlines), ok: r.ok))
            if shellHistory.count > 60 { shellHistory.removeFirst(shellHistory.count - 60) }
            shellRunning = false
            if command == nil { shellCommand = "" }
        }
    }

    func clearShell() { shellHistory.removeAll() }
}

/// Collects logcat output off the main thread; the UI drains it on a timer to avoid per-line redraws.
private final class LogcatBuffer: @unchecked Sendable {
    private let lock = NSLock()
    private var partial = Data()
    private var lines: [String] = []

    func append(_ data: Data) {
        lock.lock()
        defer { lock.unlock() }
        partial.append(data)
        while let nl = partial.firstIndex(of: 0x0A) {
            let line = String(decoding: partial[partial.startIndex..<nl], as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
            partial.removeSubrange(partial.startIndex...nl)
            if !line.isEmpty, !line.hasPrefix("--------- beginning of") { lines.append(line) }
        }
    }

    func drain() -> [String] {
        lock.lock()
        defer { lock.unlock() }
        let out = lines
        lines.removeAll()
        return out
    }
}
