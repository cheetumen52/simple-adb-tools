import SwiftUI

struct RequirementsView: View {
    @ObservedObject private var model = InstallerModel.shared
    @ObservedObject private var tools = InstallerModel.shared.toolchain

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                SectionHeader(
                    number: AppTab.requirements.number,
                    kicker: "systémové požadavky",
                    title: tools.allReady ? "Všechno je připravené" : "Co appka potřebuje",
                    lede: "Bez adb to nepojede. Co chybí, stáhnu sám, přímo od Googlu. Bez Homebrew, bez Android Studia, bez admin hesla."
                ) {
                    Button("Zkontrolovat znovu", systemImage: "arrow.clockwise") { tools.check() }
                        .buttonStyle(GhostButtonStyle(compact: true))
                }

                ToolCard(
                    tool: .adb,
                    title: "Android Debug Bridge (adb)",
                    requirement: "Povinné",
                    description: "Komunikuje s telefonem: instalace, odinstalace, screenshoty.",
                    size: "16 MB",
                    status: tools.adb
                )
                ToolCard(
                    tool: .aapt2,
                    title: "Android Asset Packaging Tool (aapt2)",
                    requirement: "Doporučené",
                    description: "Čte z APK název aplikace, balíček a verzi. Bez něj nepůjde reinstall ani porovnání s verzí v telefonu.",
                    size: "4,5 MB",
                    status: tools.aapt2
                )
                DeviceRequirementCard()

                if let error = tools.installError {
                    Label(error, systemImage: "exclamationmark.octagon.fill")
                        .font(Typo.caption)
                        .foregroundStyle(Palette.danger)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Nástroje stahuji z dl.google.com do ~/Library/Application Support/Simple ADB tools. Stažením souhlasíš s licenčními podmínkami Android SDK.")
                        .font(Typo.caption)
                        .foregroundStyle(Palette.textMuted)
                    Button("Licenční podmínky Android SDK ↗") { NSWorkspace.shared.open(Toolchain.licenseURL) }
                        .buttonStyle(LinkButtonStyle())
                }
                .padding(.top, 4)

                if tools.allReady {
                    HStack {
                        Spacer()
                        Button("Pokračovat na instalaci →") { model.tab = .install }
                            .buttonStyle(PrimaryButtonStyle())
                    }
                }
            }
            .padding(24)
        }
    }
}

private struct ToolCard: View {
    @ObservedObject private var tools = InstallerModel.shared.toolchain
    let tool: Tool
    let title: String
    let requirement: String
    let description: String
    let size: String
    let status: ToolStatus

    var body: some View {
        Card(highlighted: !status.isReady && status != .checking) {
            HStack(alignment: .top, spacing: 14) {
                StatusIcon(status: status, optional: tool == .aapt2)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Text(title).font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.textLight)
                        StatusPill(text: requirement, color: tool == .adb ? Palette.accent : Palette.textMuted, dot: false)
                    }
                    Text(description).font(Typo.caption).foregroundStyle(Palette.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    detail
                    if tools.installing == tool {
                        HStack(spacing: 10) {
                            ProgressView(value: tools.progress)
                                .progressViewStyle(.linear)
                                .tint(Palette.accent)
                            Text("\(Int(tools.progress * 100)) %")
                                .font(Typo.monoSmall)
                                .foregroundStyle(Palette.textMuted)
                                .frame(width: 40, alignment: .trailing)
                        }
                        .padding(.top, 4)
                    } else {
                        actions.padding(.top, 4)
                    }
                }
            }
        }
    }

    @ViewBuilder private var detail: some View {
        switch status {
        case .checking:
            Text("Hledám…").font(Typo.mono).foregroundStyle(Palette.textMuted)
        case .missing:
            Text("Nenašel jsem v SDK, v Homebrew ani ve složce appky.").font(Typo.mono).foregroundStyle(Palette.warn)
        case let .found(path, version):
            VStack(alignment: .leading, spacing: 2) {
                Text("verze \(version)").font(Typo.mono).foregroundStyle(Palette.lightCyan)
                Text(path).font(Typo.monoSmall).foregroundStyle(Palette.textMuted).lineLimit(1).truncationMode(.middle).textSelection(.enabled)
            }
        case let .broken(path, error):
            VStack(alignment: .leading, spacing: 2) {
                Text("Nejde spustit: \(error)").font(Typo.mono).foregroundStyle(Palette.danger).lineLimit(3)
                if error.localizedCaseInsensitiveContains("cpu") {
                    Text("Binárka je pro Intel. Doinstaluj Rosettu: softwareupdate --install-rosetta").font(Typo.monoSmall).foregroundStyle(Palette.warn).textSelection(.enabled)
                }
                Text(path).font(Typo.monoSmall).foregroundStyle(Palette.textMuted).lineLimit(1).truncationMode(.middle)
            }
        }
    }

    @ViewBuilder private var actions: some View {
        HStack(spacing: 8) {
            switch status {
            case .checking:
                EmptyView()
            case .missing, .broken:
                Button("Stáhnout a nainstalovat (\(size))", systemImage: "arrow.down.circle") { tools.install(tool) }
                    .buttonStyle(PrimaryButtonStyle(compact: true))
                    .disabled(tools.installing != nil)
                if tool == .adb {
                    Button("Vybrat ručně…") { tools.chooseAdbManually() }
                        .buttonStyle(GhostButtonStyle(compact: true))
                }
            case let .found(path, _):
                Button("Ukázat ve Finderu", systemImage: "folder") {
                    NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
                }
                .buttonStyle(GhostButtonStyle(compact: true))
                if tools.isManaged(tool) {
                    Button("Aktualizovat", systemImage: "arrow.triangle.2.circlepath") { tools.install(tool) }
                        .buttonStyle(GhostButtonStyle(compact: true))
                        .disabled(tools.installing != nil)
                }
            }
        }
    }
}

private struct StatusIcon: View {
    let status: ToolStatus
    var optional = false

    var body: some View {
        Group {
            switch status {
            case .checking:
                ProgressView().controlSize(.small)
            case .found:
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Palette.lightCyan)
            case .missing:
                Image(systemName: optional ? "exclamationmark.circle.fill" : "xmark.circle.fill")
                    .foregroundStyle(optional ? Palette.warn : Palette.danger)
            case .broken:
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Palette.danger)
            }
        }
        .font(.system(size: 22))
        .frame(width: 26, height: 26)
    }
}

private struct DeviceRequirementCard: View {
    @ObservedObject private var model = InstallerModel.shared

    private let steps = [
        "Nastavení → O telefonu → 7× klepni na „Číslo sestavení“.",
        "V Možnostech pro vývojáře zapni „Ladění USB“. Xiaomi a Huawei chtějí i „Instalace přes USB“.",
        "Připoj telefon kabelem a na displeji potvrď „Povolit ladění USB“.",
    ]

    var body: some View {
        let ready = model.readyDevices.count
        let unauthorized = model.devices.contains { $0.state == "unauthorized" }
        Card {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: ready > 0 ? "checkmark.circle.fill" : (unauthorized ? "hand.raised.circle.fill" : "iphone.slash.circle.fill"))
                    .font(.system(size: 22))
                    .foregroundStyle(ready > 0 ? Palette.lightCyan : Palette.warn)
                    .frame(width: 26, height: 26)
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        Text("Telefon s laděním USB").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.textLight)
                        if ready > 0 {
                            StatusPill(text: "Připojeno: \(ready)")
                        } else if unauthorized {
                            StatusPill(text: "Čeká na potvrzení", color: Palette.warn)
                        } else {
                            StatusPill(text: "Nepřipojeno", color: Palette.textMuted)
                        }
                    }
                    ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(String(format: "%02d", index + 1)).font(Typo.monoSmall).foregroundStyle(Palette.accent)
                            Text(step).font(Typo.caption).foregroundStyle(Palette.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Button("Restartovat adb", systemImage: "arrow.triangle.2.circlepath") { model.restartAdb() }
                        .buttonStyle(GhostButtonStyle(compact: true))
                        .disabled(model.toolchain.adbPath == nil || model.running)
                        .padding(.top, 2)
                }
            }
        }
    }
}
