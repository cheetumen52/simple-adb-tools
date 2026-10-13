import AppKit
import Foundation

enum ToolStatus: Equatable {
    case checking
    case missing
    case found(path: String, version: String)
    case broken(path: String, error: String)

    var path: String? {
        switch self {
        case let .found(path, _), let .broken(path, _): path
        default: nil
        }
    }

    var isReady: Bool { if case .found = self { true } else { false } }
}

enum Tool: String, CaseIterable {
    case adb, aapt2
}

@MainActor
final class Toolchain: ObservableObject {
    @Published private(set) var adb: ToolStatus = .checking
    @Published private(set) var aapt2: ToolStatus = .checking
    @Published private(set) var installing: Tool?
    @Published private(set) var progress: Double = 0
    @Published var installError: String?
    @Published private(set) var checkedOnce = false

    static let platformToolsURL = URL(string: "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip")!
    static let aapt2MetadataURL = URL(string: "https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/maven-metadata.xml")!
    static let licenseURL = URL(string: "https://developer.android.com/studio/terms")!

    static let supportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("Simple ADB tools")
    private var managedAdb: URL { Self.supportDir.appendingPathComponent("platform-tools/adb") }
    private var managedAapt2: URL { Self.supportDir.appendingPathComponent("build-tools/aapt2") }

    private let customAdbKey = "customAdbPath"

    var adbPath: String? { adb.isReady ? adb.path : nil }
    var aapt2Path: String? { aapt2.isReady ? aapt2.path : nil }
    var allReady: Bool { adb.isReady && aapt2.isReady }

    func isManaged(_ tool: Tool) -> Bool {
        let status = tool == .adb ? adb : aapt2
        return status.path?.hasPrefix(Self.supportDir.path) ?? false
    }

    private var sdkRoots: [URL] {
        let env = ProcessInfo.processInfo.environment
        var roots = ["ANDROID_HOME", "ANDROID_SDK_ROOT"].compactMap { env[$0] }.map { URL(fileURLWithPath: $0) }
        roots.append(FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Android/sdk"))
        return roots
    }

    private func adbCandidates() -> [String] {
        var list: [String] = []
        if let custom = UserDefaults.standard.string(forKey: customAdbKey) { list.append(custom) }
        list += sdkRoots.map { $0.appendingPathComponent("platform-tools/adb").path }
        list.append(managedAdb.path)
        list += ["/opt/homebrew/bin/adb", "/usr/local/bin/adb"]
        return list
    }

    private func aapt2Candidates() -> [String] {
        var list: [String] = []
        for root in sdkRoots {
            let dir = root.appendingPathComponent("build-tools")
            let versions = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
            let sorted = versions.sorted { $0.compare($1, options: .numeric) == .orderedDescending }
            list += sorted.map { dir.appendingPathComponent($0).appendingPathComponent("aapt2").path }
        }
        list.append(managedAapt2.path)
        list += ["/opt/homebrew/bin/aapt2", "/usr/local/bin/aapt2"]
        return list
    }

    func check() {
        adb = .checking
        aapt2 = .checking
        let adbList = adbCandidates()
        let aaptList = aapt2Candidates()
        DispatchQueue.global().async {
            let adb = Self.probe(adbList) { out in
                out.split(separator: "\n").first { $0.hasPrefix("Version ") }.map { String($0.dropFirst(8)) } ?? "?"
            }
            let aapt2 = Self.probe(aaptList) { out in
                out.trimmingCharacters(in: .whitespacesAndNewlines).components(separatedBy: " ").last ?? "?"
            }
            DispatchQueue.main.async {
                self.adb = adb
                self.aapt2 = aapt2
                self.checkedOnce = true
            }
        }
    }

    nonisolated private static func probe(_ candidates: [String], version: (String) -> String) -> ToolStatus {
        var broken: ToolStatus?
        for path in candidates where FileManager.default.isExecutableFile(atPath: path) {
            let result = Shell.run(path, ["version"])
            if result.ok { return .found(path: path, version: version(result.output)) }
            if broken == nil {
                let err = result.output.trimmingCharacters(in: .whitespacesAndNewlines)
                broken = .broken(path: path, error: err.isEmpty ? "exit \(result.status)" : err)
            }
        }
        return broken ?? .missing
    }

    func chooseAdbManually() {
        let panel = NSOpenPanel()
        panel.title = "Vyber binárku adb"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.showsHiddenFiles = true
        guard panel.runModal() == .OK, let url = panel.url else { return }
        UserDefaults.standard.set(url.path, forKey: customAdbKey)
        check()
    }

    func install(_ tool: Tool) {
        guard installing == nil else { return }
        installing = tool
        progress = 0
        installError = nil
        Task {
            do {
                switch tool {
                case .adb: try await installPlatformTools()
                case .aapt2: try await installAapt2()
                }
                installing = nil
                check()
            } catch {
                installing = nil
                installError = "\(tool.rawValue): \(error.localizedDescription)"
            }
        }
    }

    private func installPlatformTools() async throws {
        let zip = try await Downloader.fetch(Self.platformToolsURL) { p in
            Task { @MainActor in self.progress = p }
        }
        defer { try? FileManager.default.removeItem(at: zip) }
        let fm = FileManager.default
        try fm.createDirectory(at: Self.supportDir, withIntermediateDirectories: true)
        try? fm.removeItem(at: Self.supportDir.appendingPathComponent("platform-tools"))
        let unzip = await Shell.runAsync("/usr/bin/ditto", ["-x", "-k", zip.path, Self.supportDir.path])
        guard unzip.ok, fm.isExecutableFile(atPath: managedAdb.path) else {
            throw InstallError("Rozbalení platform-tools selhalo. \(unzip.output)")
        }
    }

    private func installAapt2() async throws {
        let (data, _) = try await URLSession.shared.data(from: Self.aapt2MetadataURL)
        let xml = String(decoding: data, as: UTF8.self)
        let regex = try NSRegularExpression(pattern: "<version>(\\d+\\.\\d+\\.\\d+-\\d+)</version>")
        let stable = regex.matches(in: xml, range: NSRange(xml.startIndex..., in: xml))
            .compactMap { Range($0.range(at: 1), in: xml).map { String(xml[$0]) } }
            .sorted { $0.compare($1, options: .numeric) == .orderedAscending }
        guard let version = stable.last else { throw InstallError("Nenašel jsem stabilní verzi aapt2.") }

        let jarURL = URL(string: "https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/\(version)/aapt2-\(version)-osx.jar")!
        let jar = try await Downloader.fetch(jarURL) { p in
            Task { @MainActor in self.progress = p }
        }
        defer { try? FileManager.default.removeItem(at: jar) }

        let fm = FileManager.default
        let tmp = fm.temporaryDirectory.appendingPathComponent("aapt2-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: tmp) }
        let unzip = await Shell.runAsync("/usr/bin/ditto", ["-x", "-k", jar.path, tmp.path])
        let binary = tmp.appendingPathComponent("aapt2")
        guard unzip.ok, fm.fileExists(atPath: binary.path) else {
            throw InstallError("Rozbalení aapt2 selhalo. \(unzip.output)")
        }
        try fm.createDirectory(at: managedAapt2.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? fm.removeItem(at: managedAapt2)
        try fm.moveItem(at: binary, to: managedAapt2)
        try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: managedAapt2.path)
    }
}

struct InstallError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

final class Downloader: NSObject, URLSessionDownloadDelegate {
    private let onProgress: (Double) -> Void
    private var continuation: CheckedContinuation<URL, Error>?

    private init(onProgress: @escaping (Double) -> Void) {
        self.onProgress = onProgress
    }

    static func fetch(_ url: URL, progress: @escaping (Double) -> Void) async throws -> URL {
        try await withCheckedThrowingContinuation { cont in
            let delegate = Downloader(onProgress: progress)
            delegate.continuation = cont
            let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
            session.downloadTask(with: url).resume()
            session.finishTasksAndInvalidate()
        }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData _: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard totalBytesExpectedToWrite > 0 else { return }
        onProgress(Double(totalBytesWritten) / Double(totalBytesExpectedToWrite))
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            finish(.failure(InstallError("Server vrátil HTTP \(status).")))
            return
        }
        // The temp file is deleted as soon as this method returns.
        let dest = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        do {
            try FileManager.default.moveItem(at: location, to: dest)
            finish(.success(dest))
        } catch {
            finish(.failure(error))
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error { finish(.failure(error)) }
    }

    private func finish(_ result: Result<URL, Error>) {
        guard let cont = continuation else { return }
        continuation = nil
        cont.resume(with: result)
    }
}
