import Foundation

struct Device: Identifiable, Hashable {
    let serial: String
    let state: String
    let model: String?
    var id: String { serial }
    var ready: Bool { state == "device" }
    var isWireless: Bool { serial.contains(":") || serial.contains("._adb-tls-") }
    var displayName: String { model ?? (ready ? serial : "Neznámé zařízení") }
}

struct DeviceDetails: Hashable {
    let android: String
    let manufacturer: String
    var hardwareSerial: String?
}

struct ApkFile: Identifiable, Hashable {
    let url: URL
    let modified: Date
    let size: Int64
    var id: URL { url }
    var cacheKey: String { "\(url.path)|\(modified.timeIntervalSince1970)" }
}

struct ApkInfo: Hashable {
    let label: String?
    let package: String
    let versionName: String
    let versionCode: Int?

    var version: String { versionCode.map { "\(versionName) (\($0))" } ?? versionName }

    static func parse(aapt2Output out: String) -> ApkInfo? {
        func attr(_ prefix: String) -> String? {
            guard let r = out.range(of: prefix) else { return nil }
            return out[r.upperBound...].split(separator: "'", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init)
        }
        guard let pkg = attr("package: name='") else { return nil }
        return ApkInfo(
            label: attr("application-label:'"),
            package: pkg,
            versionName: attr("versionName='") ?? "?",
            versionCode: attr("versionCode='").flatMap { Int($0) }
        )
    }
}

struct InstalledVersion: Hashable {
    let versionName: String
    let versionCode: Int?

    static func parse(dumpsys out: String, package: String) -> InstalledVersion? {
        guard out.contains("Package [\(package)]") else { return nil }
        func value(_ key: String) -> String? {
            guard let r = out.range(of: key) else { return nil }
            return out[r.upperBound...].split(whereSeparator: { $0 == " " || $0 == "\n" }).first.map(String.init)
        }
        return InstalledVersion(versionName: value("versionName=") ?? "?", versionCode: value("versionCode=").flatMap { Int($0) })
    }
}

enum VersionComparison {
    case notInstalled, upgrade, same, downgrade, unknown

    static func compare(apk: ApkInfo, installed: InstalledVersion?) -> VersionComparison {
        guard let installed else { return .notInstalled }
        guard let a = apk.versionCode, let b = installed.versionCode else { return .unknown }
        if a > b { return .upgrade }
        if a < b { return .downgrade }
        return .same
    }
}

struct LogLine: Identifiable {
    enum Kind { case info, command, output, success, error }
    let id = UUID()
    let time = Date()
    let kind: Kind
    let text: String
}

enum JobKind {
    case install(files: [URL], reinstall: Bool)
    case uninstall(package: String)
}

struct FailureHint: Equatable {
    let message: String
    let suggestReinstall: Bool
    let retryable: Bool
    var file: URL?

    static func parse(_ output: String) -> FailureHint {
        let rules: [(String, String, Bool, Bool)] = [
            ("INSTALL_FAILED_UPDATE_INCOMPATIBLE", "V telefonu je stejná aplikace podepsaná jiným klíčem (typicky debug vs. release). Pomůže reinstall, smaže ale data aplikace.", true, false),
            ("INSTALL_FAILED_VERSION_DOWNGRADE", "Telefon odmítl starší verzi, než má nainstalovanou. Pomůže reinstall, smaže ale data aplikace.", true, false),
            ("INSTALL_PARSE_FAILED", "Soubor není kompletní APK. Nejspíš se ještě stahuje, počkej na dokončení a zkus to znovu.", false, true),
            ("INSTALL_FAILED_INSUFFICIENT_STORAGE", "V telefonu dochází místo. Uvolni pár set MB a zkus to znovu.", false, false),
            ("INSTALL_FAILED_USER_RESTRICTED", "Instalaci zablokoval telefon. Potvrď ji na displeji. Xiaomi a Huawei chtějí v Možnostech pro vývojáře zapnout i „Instalace přes USB“.", false, false),
            ("INSTALL_FAILED_NO_MATCHING_ABIS", "APK není sestavené pro procesor tohoto telefonu.", false, false),
            ("INSTALL_FAILED_OLDER_SDK", "Telefon má na tuhle aplikaci moc starý Android.", false, false),
            ("INSTALL_FAILED_TEST_ONLY", "APK je označené jako test-only. Sestav ho bez android:testOnly.", false, false),
            ("device offline", "Telefon je offline. Zkontroluj kabel a dej „Restartovat adb“.", false, true),
            ("not found", "Telefon se odpojil. Zkontroluj kabel a dej „Restartovat adb“.", false, true),
        ]
        for (needle, message, reinstall, retry) in rules where output.localizedCaseInsensitiveContains(needle) {
            return FailureHint(message: message, suggestReinstall: reinstall, retryable: retry)
        }
        return FailureHint(message: "adb instalaci odmítl bez konkrétního důvodu. Zkus to znovu, případně „Restartovat adb“.", suggestReinstall: false, retryable: true)
    }
}
