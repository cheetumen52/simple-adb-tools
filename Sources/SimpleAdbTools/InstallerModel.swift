import AppKit
import Foundation
import UserNotifications

enum AppTab: Int, CaseIterable, Identifiable {
    case requirements, install, toolset, support
    var id: Int { rawValue }
    var number: String { String(format: "%02d", rawValue + 1) }
    var title: String {
        switch self {
        case .requirements: "Systémové požadavky"
        case .install: "Instalace aplikací"
        case .toolset: "ADB toolset"
        case .support: "Support"
        }
    }
    var shortTitle: String {
        switch self {
        case .requirements: "Požadavky"
        case .install: "Instalace"
        case .toolset: "ADB toolset"
        case .support: "Support"
        }
    }
}

@MainActor
final class InstallerModel: ObservableObject {
    static let shared = InstallerModel()

    let toolchain = Toolchain()

    @Published var tab: AppTab = .install
    @Published private(set) var devices: [Device] = []
    @Published var selected: Set<String> = []
    @Published private(set) var details: [String: DeviceDetails] = [:]
    @Published private(set) var apks: [ApkFile] = []
    @Published private(set) var info: [String: ApkInfo] = [:]
    @Published private(set) var installed: [String: InstalledVersion?] = [:]
    @Published private(set) var log: [LogLine] = []
    @Published private(set) var running = false
    @Published private(set) var currentTitle = ""
    @Published private(set) var startedAt: Date?
    @Published private(set) var lastResult: Bool?
    @Published private(set) var queuedCount = 0
    @Published var failureHint: FailureHint?
    @Published var reinstallMode = false

    @Published var watchedFolders: [String] { didSet { UserDefaults.standard.set(watchedFolders, forKey: "watchedFolders") } }
    @Published var autoInstall: Bool { didSet { UserDefaults.standard.set(autoInstall, forKey: "autoInstall") } }
    @Published var launchAfterInstall: Bool { didSet { UserDefaults.standard.set(launchAfterInstall, forKey: "launchAfterInstall") } }

    private var queue: [JobKind] = []
    private var known: Set<String> = []
    private var seenApks: Set<String> = []
    private var pendingApks: Set<String> = []
    private var loadingInstalled: Set<String> = []
    private var firstScan = true
    private var timer: Timer?

    static let downloads = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Downloads").path

    private init() {
        let defaults = UserDefaults.standard
        watchedFolders = defaults.stringArray(forKey: "watchedFolders") ?? [Self.downloads]
        autoInstall = defaults.bool(forKey: "autoInstall")
        launchAfterInstall = defaults.bool(forKey: "launchAfterInstall")
    }

    var readyDevices: [Device] { devices.filter(\.ready) }
    var targets: [Device] { readyDevices.filter { selected.contains($0.serial) } }
    var canInstall: Bool { toolchain.adbPath != nil && (readyDevices.isEmpty || !targets.isEmpty) }
    var primaryTarget: Device? { targets.first }

    func start() {
        toolchain.check()
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        timer = Timer.scheduledTimer(withTimeInterval: 2.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        tick()
    }

    func tick() {
        if !running { refreshDevices() }
        scanApks()
    }

    // MARK: - Devices

    func refreshDevices() {
        guard let adb = toolchain.adbPath else {
            if !devices.isEmpty { devices = [] }
            return
        }
        Task {
            let result = await Shell.runAsync(adb, ["devices", "-l"])
            applyDevices(Self.parseDevices(result.output))
        }
    }

    nonisolated static func parseDevices(_ out: String) -> [Device] {
        out.split(separator: "\n").dropFirst().compactMap { line in
            let parts = line.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
            guard parts.count >= 2, !parts[0].hasPrefix("emulator-"), !parts[0].hasPrefix("*") else { return nil }
            let model = parts.first { $0.hasPrefix("model:") }.map { String($0.dropFirst(6)).replacingOccurrences(of: "_", with: " ") }
            return Device(serial: parts[0], state: parts[1], model: model)
        }
    }

    private func applyDevices(_ parsed: [Device]) {
        for d in parsed where !known.contains(d.serial) {
            known.insert(d.serial)
            selected.insert(d.serial)
        }
        if parsed != devices { devices = parsed }
        for d in parsed where d.ready && details[d.serial] == nil {
            loadDetails(d)
        }
        loadInstalledVersions()
    }

    private func loadDetails(_ device: Device) {
        guard let adb = toolchain.adbPath else { return }
        details[device.serial] = DeviceDetails(android: "…", manufacturer: "")
        Task {
            let r = await Shell.runAsync(adb, ["-s", device.serial, "shell", "getprop ro.build.version.release; getprop ro.product.manufacturer"])
            let lines = r.output.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            details[device.serial] = DeviceDetails(
                android: lines.first ?? "?",
                manufacturer: lines.count > 1 ? lines[1].capitalized : ""
            )
        }
    }

    func restartAdb() {
        guard let adb = toolchain.adbPath, !running else { return }
        append(.command, "adb kill-server && adb start-server")
        Task {
            _ = await Shell.runAsync(adb, ["kill-server"])
            _ = await Shell.runAsync(adb, ["start-server"])
            append(.info, "adb znovu běží")
            refreshDevices()
        }
    }

    func screenshot(_ device: Device) {
        guard let adb = toolchain.adbPath else { return }
        append(.command, "adb exec-out screencap -p → \(device.displayName)")
        Task {
            let (status, data) = await withCheckedContinuation { cont in
                DispatchQueue.global().async { cont.resume(returning: Shell.runData(adb, ["-s", device.serial, "exec-out", "screencap", "-p"])) }
            }
            guard status == 0, data.count > 8, data.starts(with: [0x89, 0x50, 0x4E, 0x47]) else {
                append(.error, "Screenshot selhal: \(String(decoding: data.prefix(200), as: UTF8.self))")
                return
            }
            let stamp = Date().formatted(.iso8601.year().month().day().time(includingFractionalSeconds: false)).replacingOccurrences(of: ":", with: "-")
            let name = "\(device.displayName.replacingOccurrences(of: " ", with: "-"))_\(stamp).png"
            let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Desktop").appendingPathComponent(name)
            do {
                try data.write(to: url)
                append(.success, "Screenshot uložen na plochu: \(name)")
                NSWorkspace.shared.open(url)
            } catch {
                append(.error, "Screenshot nejde uložit: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - APK files

    func scanApks() {
        let fm = FileManager.default
        var found: [ApkFile] = []
        for dir in watchedFolders {
            let urls = (try? fm.contentsOfDirectory(at: URL(fileURLWithPath: dir), includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey])) ?? []
            for url in urls where url.pathExtension.lowercased() == "apk" {
                let v = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
                found.append(ApkFile(url: url, modified: v?.contentModificationDate ?? .distantPast, size: Int64(v?.fileSize ?? 0)))
            }
        }
        let sorted = found.sorted { $0.modified > $1.modified }
        let top = Array(sorted.prefix(15))
        if top != apks { apks = top }
        loadInfo(for: top)
        detectNewApks(sorted)
    }

    private func detectNewApks(_ all: [ApkFile]) {
        if firstScan {
            seenApks = Set(all.map(\.cacheKey))
            firstScan = false
            return
        }
        for apk in all where !seenApks.contains(apk.cacheKey) {
            // Same name+mtime on two consecutive scans = download finished.
            guard pendingApks.contains(apk.cacheKey) else {
                pendingApks.insert(apk.cacheKey)
                continue
            }
            pendingApks.remove(apk.cacheKey)
            seenApks.insert(apk.cacheKey)
            guard autoInstall else { continue }
            append(.info, "Nové APK \(apk.url.lastPathComponent), instaluji automaticky")
            enqueueInstall([apk.url], reinstall: reinstallMode)
        }
    }

    private func loadInfo(for files: [ApkFile]) {
        guard let aapt2 = toolchain.aapt2Path else { return }
        for apk in files where info[apk.cacheKey] == nil {
            info[apk.cacheKey] = ApkInfo(label: nil, package: "", versionName: "…", versionCode: nil)
            Task {
                let r = await Shell.runAsync(aapt2, ["dump", "badging", apk.url.path])
                if let parsed = ApkInfo.parse(aapt2Output: r.output) {
                    info[apk.cacheKey] = parsed
                    loadInstalledVersions()
                }
            }
        }
    }

    func info(for apk: ApkFile) -> ApkInfo? {
        guard let i = info[apk.cacheKey], !i.package.isEmpty else { return nil }
        return i
    }

    private func loadInstalledVersions() {
        guard let adb = toolchain.adbPath, !running else { return }
        let packages = Set(info.values.map(\.package).filter { !$0.isEmpty })
        for device in readyDevices {
            for pkg in packages {
                let key = "\(device.serial)|\(pkg)"
                guard installed.index(forKey: key) == nil, !loadingInstalled.contains(key) else { continue }
                loadingInstalled.insert(key)
                Task {
                    let r = await Shell.runAsync(adb, ["-s", device.serial, "shell", "dumpsys", "package", pkg])
                    installed[key] = .some(InstalledVersion.parse(dumpsys: r.output, package: pkg))
                    loadingInstalled.remove(key)
                }
            }
        }
    }

    /// nil while the device's version is still loading.
    func comparison(for apk: ApkFile, on device: Device) -> (VersionComparison, InstalledVersion?)? {
        guard let apkInfo = info(for: apk), let entry = installed["\(device.serial)|\(apkInfo.package)"] else { return nil }
        return (VersionComparison.compare(apk: apkInfo, installed: entry), entry)
    }

    private func invalidateInstalled(_ pkg: String?) {
        guard let pkg else { return }
        for key in installed.keys where key.hasSuffix("|\(pkg)") {
            installed.removeValue(forKey: key)
        }
    }

    func addFolder() {
        let panel = NSOpenPanel()
        panel.title = "Sledovat složku s APK"
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = true
        guard panel.runModal() == .OK else { return }
        for url in panel.urls where !watchedFolders.contains(url.path) {
            watchedFolders.append(url.path)
        }
        scanApks()
    }

    func removeFolder(_ path: String) {
        watchedFolders.removeAll { $0 == path }
        scanApks()
    }

    // MARK: - Queue

    func enqueueInstall(_ files: [URL], reinstall: Bool) {
        let apks = files.filter { $0.pathExtension.lowercased() == "apk" }
        guard !apks.isEmpty else {
            append(.error, "Mezi soubory není žádné .apk")
            return
        }
        tab = .install
        enqueue(.install(files: apks, reinstall: reinstall))
    }

    func enqueueUninstall(_ pkg: String) {
        enqueue(.uninstall(package: pkg))
    }

    private func enqueue(_ job: JobKind) {
        queue.append(job)
        queuedCount = queue.count
        updateDockBadge()
        pump()
    }

    private func pump() {
        guard !running, !queue.isEmpty else { return }
        let job = queue.removeFirst()
        queuedCount = queue.count
        Task { await run(job) }
    }

    private func run(_ job: JobKind) async {
        running = true
        startedAt = Date()
        lastResult = nil
        failureHint = nil
        updateDockBadge()

        switch job {
        case let .install(files, reinstall):
            currentTitle = files.map(\.lastPathComponent).joined(separator: ", ")
            append(.info, "\(reinstall ? "Reinstall" : "Instalace"): \(currentTitle)")
        case let .uninstall(pkg):
            currentTitle = pkg
            append(.info, "Odinstalace: \(pkg)")
        }

        var ok = false
        if let adb = toolchain.adbPath, let devices = await waitForTargets(adb) {
            ok = true
            switch job {
            case let .install(files, reinstall):
                for file in files {
                    let pkg = await packageName(of: file)
                    for device in devices {
                        let success = await installOne(adb: adb, device: device, file: file, package: pkg, reinstall: reinstall)
                        ok = ok && success
                    }
                    invalidateInstalled(pkg)
                }
            case let .uninstall(pkg):
                for device in devices {
                    append(.command, "adb uninstall \(pkg) → \(device.displayName)")
                    let r = await Shell.stream(adb, ["-s", device.serial, "uninstall", pkg]) { line in
                        Task { @MainActor in self.append(.output, line) }
                    }
                    ok = ok && r.ok
                }
                invalidateInstalled(pkg)
            }
        } else if toolchain.adbPath == nil {
            append(.error, "adb není k dispozici. Doinstaluj ho v Systémových požadavcích.")
            tab = .requirements
        }

        finish(ok)
    }

    private func waitForTargets(_ adb: String) async -> [Device]? {
        if !targets.isEmpty { return targets }
        if !readyDevices.isEmpty {
            append(.error, "Žádné zařízení není vybrané. Zaškrtni telefon v seznamu.")
            return nil
        }
        append(.command, "Nevidím telefon, restartuji adb…")
        _ = await Shell.runAsync(adb, ["kill-server"])
        _ = await Shell.runAsync(adb, ["start-server"])

        var announced = false
        let deadline = Date().addingTimeInterval(90)
        while Date() < deadline {
            let r = await Shell.runAsync(adb, ["devices", "-l"])
            applyDevices(Self.parseDevices(r.output))
            if !targets.isEmpty { return targets }
            if !announced {
                announced = true
                let unauthorized = devices.contains { $0.state == "unauthorized" }
                append(.info, unauthorized ? "Potvrď na telefonu „Povolit ladění USB“…" : "Čekám na připojení telefonu (max. 90 s)…")
            }
            try? await Task.sleep(for: .seconds(2))
        }
        append(.error, "Telefon se do 90 s nepřipojil.")
        return nil
    }

    private func packageName(of file: URL) async -> String? {
        if let cached = apks.first(where: { $0.url == file }).flatMap({ info(for: $0) }) { return cached.package }
        guard let aapt2 = toolchain.aapt2Path else { return nil }
        return ApkInfo.parse(aapt2Output: await Shell.runAsync(aapt2, ["dump", "badging", file.path]).output)?.package
    }

    private func installOne(adb: String, device: Device, file: URL, package: String?, reinstall: Bool) async -> Bool {
        let name = file.lastPathComponent
        let label = device.displayName
        let log: (String) -> Void = { line in Task { @MainActor in self.append(.output, line) } }

        if reinstall {
            if let package {
                append(.command, "adb uninstall \(package) → \(label)")
                _ = await Shell.stream(adb, ["-s", device.serial, "uninstall", package], onLine: log)
            } else {
                append(.error, "Bez aapt2 neznám název balíčku, reinstall přeskakuji")
            }
        }

        let attempts: [[String]] = [["install", "-r", "-d"], ["install"], ["install", "-r", "-d"]]
        var lastOutput = ""
        for (index, args) in attempts.enumerated() {
            if index > 0 {
                append(.info, "Zkouším znovu (\(index + 1)/\(attempts.count))…")
                try? await Task.sleep(for: .seconds(index == 2 ? 2 : 0.5))
            }
            append(.command, "adb \(args.joined(separator: " ")) \(name) → \(label)")
            let r = await Shell.stream(adb, ["-s", device.serial] + args + [file.path], onLine: log)
            if r.ok, r.output.contains("Success") {
                append(.success, "✓ \(name) → \(label)")
                if launchAfterInstall, let package { await launch(adb: adb, device: device, package: package) }
                return true
            }
            lastOutput = r.output
            if !FailureHint.parse(lastOutput).retryable { break }
        }
        var hint = FailureHint.parse(lastOutput)
        hint.file = file
        failureHint = hint
        append(.error, "✗ \(name) → \(label): \(hint.message)")
        return false
    }

    private func launch(adb: String, device: Device, package: String) async {
        append(.command, "Spouštím \(package) → \(device.displayName)")
        _ = await Shell.runAsync(adb, ["-s", device.serial, "shell", "monkey", "-p", package, "-c", "android.intent.category.LAUNCHER", "1"])
    }

    private func finish(_ ok: Bool) {
        let title = currentTitle
        running = false
        currentTitle = ""
        startedAt = nil
        lastResult = ok
        append(ok ? .success : .error, ok ? "Hotovo" : "Selhalo")
        updateDockBadge()
        notify(ok: ok, title: title)
        refreshDevices()
        pump()
    }

    // MARK: - Feedback

    func append(_ kind: LogLine.Kind, _ text: String) {
        log.append(LogLine(kind: kind, text: text))
        if log.count > 2000 { log.removeFirst(log.count - 1500) }
    }

    func clearLog() { log.removeAll() }

    func copyLog() {
        let f = Date.FormatStyle(date: .omitted, time: .standard)
        let text = log.map { "\($0.time.formatted(f))  \($0.text)" }.joined(separator: "\n")
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    private func updateDockBadge() {
        let pending = queue.count + (running ? 1 : 0)
        NSApp.dockTile.badgeLabel = pending > 0 ? "\(pending)" : nil
    }

    private func notify(ok: Bool, title: String) {
        guard !NSApp.isActive else { return }
        NSApp.requestUserAttention(.informationalRequest)
        let content = UNMutableNotificationContent()
        content.title = ok ? "Nainstalováno ✓" : "Instalace selhala ✗"
        content.body = title
        content.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
    }

    func diagnostics() -> String {
        let os = ProcessInfo.processInfo.operatingSystemVersionString
        func describe(_ s: ToolStatus) -> String {
            switch s {
            case .checking: "kontroluji"
            case .missing: "chybí"
            case let .found(path, version): "\(version) – \(path)"
            case let .broken(path, error): "nefunkční (\(error)) – \(path)"
            }
        }
        var lines = [
            "\(Brand.appName) \(Brand.version)",
            "macOS \(os)",
            "adb: \(describe(toolchain.adb))",
            "aapt2: \(describe(toolchain.aapt2))",
        ]
        for d in devices {
            let det = details[d.serial].map { " · Android \($0.android) · \($0.manufacturer)" } ?? ""
            lines.append("zařízení: \(d.displayName) [\(d.serial)] \(d.state)\(det)")
        }
        return lines.joined(separator: "\n")
    }
}
