import Foundation

@MainActor
final class UpdateChecker: ObservableObject {
    static let shared = UpdateChecker()
    static let repo = "cheetumen52/simple-adb-tools"

    struct Release: Equatable {
        let tag: String
        let url: URL
    }

    enum State: Equatable {
        case idle, checking, upToDate
        case available(Release)
        case failed(String)
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var lastChecked: Date?
    private var timer: Timer?

    var available: Release? {
        if case let .available(release) = state { release } else { nil }
    }

    func start() {
        Task { await check() }
        timer = Timer.scheduledTimer(withTimeInterval: 6 * 3600, repeats: true) { [weak self] _ in
            Task { await self?.check() }
        }
    }

    func check() async {
        guard state != .checking else { return }
        state = .checking
        var request = URLRequest(url: URL(string: "https://api.github.com/repos/\(Self.repo)/tags?per_page=100")!)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("SimpleAdbTools/\(Brand.version)", forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 15

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            switch status {
            case 200: break
            case 404: state = .failed("Repozitář zatím není veřejný. Kontrola začne fungovat po jeho zveřejnění."); return
            case 403, 429: state = .failed("GitHub dočasně omezil počet dotazů, zkusím to později."); return
            default: state = .failed("GitHub vrátil HTTP \(status)."); return
            }
            struct Tag: Decodable { let name: String }
            let tags = try JSONDecoder().decode([Tag].self, from: data).map(\.name)
            lastChecked = Date()
            guard let newest = tags.filter({ Self.components($0) != nil }).max(by: { Self.isOlder($0, than: $1) }) else {
                state = .upToDate
                return
            }
            if Self.isOlder(Brand.version, than: newest) {
                let url = URL(string: "https://github.com/\(Self.repo)/releases/tag/\(newest)")!
                state = .available(Release(tag: newest, url: url))
            } else {
                state = .upToDate
            }
        } catch {
            state = .failed("Nepodařilo se spojit s GitHubem: \(error.localizedDescription)")
        }
    }

    /// "v1.2.3" → [1, 2, 3]; pre-release tags like "v1.2.0-beta" are ignored.
    nonisolated static func components(_ tag: String) -> [Int]? {
        let trimmed = tag.hasPrefix("v") || tag.hasPrefix("V") ? String(tag.dropFirst()) : tag
        let parts = trimmed.split(separator: ".").map { Int($0) }
        guard !parts.isEmpty, parts.allSatisfy({ $0 != nil }) else { return nil }
        return parts.compactMap { $0 }
    }

    nonisolated static func isOlder(_ a: String, than b: String) -> Bool {
        let x = components(a) ?? [0], y = components(b) ?? [0]
        for i in 0..<max(x.count, y.count) {
            let l = i < x.count ? x[i] : 0, r = i < y.count ? y[i] : 0
            if l != r { return l < r }
        }
        return false
    }
}
