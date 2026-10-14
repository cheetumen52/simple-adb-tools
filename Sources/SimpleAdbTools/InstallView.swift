import SwiftUI

struct InstallView: View {
    @ObservedObject private var model = InstallerModel.shared

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    SectionHeader(
                        number: AppTab.install.number,
                        kicker: "instalace aplikací",
                        title: "Pusť APK, zbytek je na mně",
                        lede: "Přetáhni soubor, klikni na Instalovat, nebo zapni automatiku a nech appku hlídat Stažené. Žádný terminál."
                    )
                    DevicesSection()
                    DropZone()
                    OptionsRow()
                    if let hint = model.failureHint {
                        FailureBanner(hint: hint)
                    }
                    ApkSection()
                }
                .padding(24)
            }
            LogPanel()
                .frame(height: 210)
        }
    }
}

// MARK: - Devices

private struct DevicesSection: View {
    @ObservedObject private var model = InstallerModel.shared
    @ObservedObject private var wireless = WirelessManager.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Kicker("zařízení", color: Palette.textMuted)
                Spacer()
                Button("Restartovat adb", systemImage: "arrow.triangle.2.circlepath") { model.restartAdb() }
                    .buttonStyle(GhostButtonStyle(compact: true))
                    .disabled(model.running || model.toolchain.adbPath == nil)
            }
            if model.toolchain.adbPath == nil {
                Card {
                    HStack(spacing: 12) {
                        Image(systemName: "wrench.and.screwdriver").foregroundStyle(Palette.warn)
                        Text("Chybí adb. Bez něj se k telefonu nedostanu.").font(Typo.body).foregroundStyle(Palette.textSecondary)
                        Spacer()
                        Button("Systémové požadavky →") { model.tab = .requirements }
                            .buttonStyle(PrimaryButtonStyle(compact: true))
                    }
                }
            } else if model.devices.isEmpty && wireless.reconnecting.isEmpty {
                Card {
                    HStack(spacing: 12) {
                        Image(systemName: "cable.connector").font(.system(size: 18)).foregroundStyle(Palette.textMuted)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Žádný telefon").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.textLight)
                            Text("Připoj ho kabelem se zapnutým laděním USB. Návod je v Systémových požadavcích.")
                                .font(Typo.caption).foregroundStyle(Palette.textMuted)
                        }
                    }
                }
            }
            ForEach(model.devices) { device in
                DeviceRow(device: device)
            }
            ForEach(wireless.reconnecting) { known in
                Card(padding: 12) {
                    HStack(spacing: 12) {
                        ProgressView().controlSize(.small).frame(width: 18)
                        Image(systemName: "wifi.exclamationmark").font(.system(size: 18)).foregroundStyle(Palette.warn).frame(width: 24)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(known.name).font(.system(size: 13.5, weight: .semibold)).foregroundStyle(Palette.textLight)
                            Text("Wi‑Fi spojení spadlo, obnovuji ho…").font(Typo.caption).foregroundStyle(Palette.textSecondary)
                        }
                        Spacer()
                        StatusPill(text: "Obnovuji", color: Palette.warn)
                    }
                }
            }
        }
    }
}

private struct DeviceRow: View {
    @ObservedObject private var model = InstallerModel.shared
    @ObservedObject private var mirror = MirrorController.shared
    let device: Device

    var body: some View {
        let isSelected = Binding(
            get: { model.selected.contains(device.serial) },
            set: { on in if on { model.selected.insert(device.serial) } else { model.selected.remove(device.serial) } }
        )
        Card(padding: 12, highlighted: device.ready && isSelected.wrappedValue) {
            HStack(alignment: .center, spacing: 12) {
                BrandCheckbox(isOn: isSelected, enabled: device.ready)
                Image(systemName: device.isWireless ? "wifi" : "smartphone")
                    .font(.system(size: 20))
                    .foregroundStyle(device.ready ? Palette.accent : Palette.textMuted)
                    .frame(width: 24)
                VStack(alignment: .leading, spacing: 2) {
                    Text(device.displayName).font(.system(size: 13.5, weight: .semibold)).foregroundStyle(Palette.textLight)
                    HStack(spacing: 6) {
                        if let d = model.details[device.serial] {
                            Text("Android \(d.android)\(d.manufacturer.isEmpty ? "" : " · \(d.manufacturer)")")
                                .font(Typo.caption).foregroundStyle(Palette.textSecondary)
                            Text("·").foregroundStyle(Palette.textMuted)
                        }
                        Text(device.serial).font(Typo.monoSmall).foregroundStyle(Palette.textMuted).textSelection(.enabled)
                    }
                }
                Spacer()
                if device.ready {
                    if mirror.isAvailable {
                        Button { mirror.toggle(device) } label: {
                            Image(systemName: mirror.isMirroring(device) ? "rectangle.on.rectangle.slash" : "rectangle.on.rectangle")
                        }
                        .buttonStyle(GhostButtonStyle(compact: true))
                        .help(mirror.isMirroring(device) ? "Ukončit zrcadlení" : "Zrcadlit obrazovku na Mac")
                    }
                    Button { model.screenshot(device) } label: { Image(systemName: "camera") }
                        .buttonStyle(GhostButtonStyle(compact: true))
                        .help("Screenshot z telefonu na plochu")
                }
                badge
            }
        }
        .onTapGesture { if device.ready { isSelected.wrappedValue.toggle() } }
    }

    @ViewBuilder private var badge: some View {
        switch device.state {
        case "device": StatusPill(text: "Připojeno")
        case "unauthorized": StatusPill(text: "Potvrď ladění USB na telefonu", color: Palette.warn)
        case "offline": StatusPill(text: "Offline", color: Palette.danger)
        default: StatusPill(text: device.state, color: Palette.textMuted)
        }
    }
}

// MARK: - Drop zone & options

private struct DropZone: View {
    @ObservedObject private var model = InstallerModel.shared
    @State private var targeted = false

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 14)
                .fill(targeted ? Palette.accent.opacity(0.08) : Palette.surface1.opacity(0.6))
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [7, 6]))
                .foregroundStyle(targeted ? Palette.accent : Palette.hairlineStrong)
            if model.running {
                VStack(spacing: 8) {
                    ProgressView().controlSize(.small).tint(Palette.accent)
                    Text("Instaluji \(model.currentTitle)")
                        .font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.textLight)
                        .lineLimit(1).truncationMode(.middle)
                    HStack(spacing: 10) {
                        if let started = model.startedAt {
                            TimelineView(.periodic(from: started, by: 1)) { ctx in
                                Text(Duration.seconds(ctx.date.timeIntervalSince(started)).formatted(.time(pattern: .minuteSecond)))
                                    .font(Typo.mono).foregroundStyle(Palette.accent)
                            }
                        }
                        if model.queuedCount > 0 {
                            Text("ve frontě: \(model.queuedCount)").font(Typo.mono).foregroundStyle(Palette.textMuted)
                        }
                    }
                }
                .padding(.horizontal, 20)
            } else {
                VStack(spacing: 6) {
                    BrandMark(size: 34, center: .arrow)
                        .opacity(targeted ? 1 : 0.85)
                    Text("Přetáhni APK sem").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.textLight)
                    Text("nebo na ikonu v Docku  ·  ⌥ při puštění = reinstall")
                        .font(Typo.caption).foregroundStyle(Palette.textMuted)
                }
            }
        }
        .frame(height: 128)
        .dropDestination(for: URL.self) { urls, _ in
            let option = NSEvent.modifierFlags.contains(.option)
            model.enqueueInstall(urls, reinstall: option || model.reinstallMode)
            return true
        } isTargeted: { targeted = $0 }
    }
}

private struct OptionsRow: View {
    @ObservedObject private var model = InstallerModel.shared

    var body: some View {
        HStack(spacing: 20) {
            BrandSwitch(title: "Reinstall (smaže data)", help: "Před instalací aplikaci odinstaluje. Řeší konflikt podpisu i downgrade.", isOn: $model.reinstallMode)
            BrandSwitch(title: "Po instalaci spustit", help: "Po úspěšné instalaci aplikaci rovnou otevře v telefonu.", isOn: $model.launchAfterInstall)
            BrandSwitch(title: "Automaticky instalovat nová APK", help: "Jakmile se ve sledované složce objeví nové APK, rovnou ho nainstaluje.", isOn: $model.autoInstall)
            Spacer()
        }
    }
}

private struct FailureBanner: View {
    @ObservedObject private var model = InstallerModel.shared
    let hint: FailureHint

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.octagon.fill").font(.system(size: 18)).foregroundStyle(Palette.danger)
            VStack(alignment: .leading, spacing: 4) {
                Kicker("proč to selhalo", color: Palette.danger)
                Text(hint.message).font(Typo.body).foregroundStyle(Palette.textLight)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            if hint.suggestReinstall, let file = hint.file {
                Button("Zkusit reinstall") { model.enqueueInstall([file], reinstall: true) }
                    .buttonStyle(PrimaryButtonStyle(compact: true))
            } else if hint.retryable, let file = hint.file {
                Button("Zkusit znovu") { model.enqueueInstall([file], reinstall: false) }
                    .buttonStyle(GhostButtonStyle(compact: true))
            }
            Button { model.failureHint = nil } label: { Image(systemName: "xmark") }
                .buttonStyle(.plain)
                .foregroundStyle(Palette.textMuted)
        }
        .padding(14)
        .background(Palette.danger.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.danger.opacity(0.35), lineWidth: 1))
    }
}

// MARK: - APK list

private struct ApkSection: View {
    @ObservedObject private var model = InstallerModel.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Kicker("poslední apk", color: Palette.textMuted)
                Spacer()
                Menu {
                    Section("Sledované složky") {
                        ForEach(model.watchedFolders, id: \.self) { folder in
                            Menu(abbreviate(folder)) {
                                Button("Otevřít ve Finderu") { NSWorkspace.shared.open(URL(fileURLWithPath: folder)) }
                                Button("Přestat sledovat", role: .destructive) { model.removeFolder(folder) }
                            }
                        }
                    }
                    Divider()
                    Button("Přidat složku…") { model.addFolder() }
                } label: {
                    Label("Složky (\(model.watchedFolders.count))", systemImage: "folder")
                        .font(.system(size: 12, weight: .medium))
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
                .tint(Palette.accent)
            }
            if model.apks.isEmpty {
                Card {
                    Text("Ve sledovaných složkách zatím žádné APK není. Stáhni build, objeví se tu sám.")
                        .font(Typo.caption).foregroundStyle(Palette.textMuted)
                }
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(model.apks.enumerated()), id: \.element.id) { index, apk in
                        ApkRow(apk: apk, newest: index == 0)
                        if index < model.apks.count - 1 {
                            Rectangle().fill(Palette.hairline).frame(height: 1)
                        }
                    }
                }
                .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.hairline, lineWidth: 1))
            }
        }
    }

    private func abbreviate(_ path: String) -> String {
        (path as NSString).abbreviatingWithTildeInPath
    }
}

private struct ApkRow: View {
    @ObservedObject private var model = InstallerModel.shared
    let apk: ApkFile
    let newest: Bool
    @State private var hover = false

    private static let relative: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "cs_CZ")
        f.unitsStyle = .short
        return f
    }()

    var body: some View {
        let info = model.info(for: apk)
        HStack(spacing: 12) {
            Image(systemName: "shippingbox.fill")
                .font(.system(size: 16))
                .foregroundStyle(newest ? Palette.accent : Palette.textMuted)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(apk.url.lastPathComponent)
                        .font(.system(size: 13, weight: newest ? .semibold : .medium))
                        .foregroundStyle(Palette.textLight)
                        .lineLimit(1).truncationMode(.middle)
                    if newest { StatusPill(text: "nejnovější", color: Palette.accent, dot: false) }
                    comparisonBadge(info)
                }
                Text(subtitle(info))
                    .font(Typo.monoSmall).foregroundStyle(Palette.textMuted)
                    .lineLimit(1).truncationMode(.tail)
            }
            Spacer(minLength: 8)
            Button("Reinstall") { model.enqueueInstall([apk.url], reinstall: true) }
                .buttonStyle(GhostButtonStyle(compact: true))
                .disabled(!model.canInstall)
            Group {
                if newest {
                    Button("Instalovat") { model.enqueueInstall([apk.url], reinstall: model.reinstallMode) }
                        .buttonStyle(PrimaryButtonStyle(compact: true))
                } else {
                    Button("Instalovat") { model.enqueueInstall([apk.url], reinstall: model.reinstallMode) }
                        .buttonStyle(GhostButtonStyle(compact: true))
                }
            }
            .disabled(!model.canInstall)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(hover ? Palette.hairline : .clear)
        .onHover { hover = $0 }
        .contextMenu {
            Button("Ukázat ve Finderu") { NSWorkspace.shared.activateFileViewerSelecting([apk.url]) }
            if let info {
                Button("Kopírovat název balíčku") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(info.package, forType: .string)
                }
                Divider()
                Button("Odinstalovat \(info.package) z vybraných zařízení", role: .destructive) {
                    model.enqueueUninstall(info.package)
                }
                .disabled(!model.canInstall)
            }
        }
    }

    private func subtitle(_ info: ApkInfo?) -> String {
        var parts: [String] = []
        if let info {
            if let label = info.label { parts.append(label) }
            parts.append(info.version)
            parts.append(info.package)
        } else if model.toolchain.aapt2Path == nil {
            parts.append("bez aapt2 neznám verzi")
        }
        parts.append(ByteCountFormatter.string(fromByteCount: apk.size, countStyle: .file))
        parts.append(Self.relative.localizedString(for: apk.modified, relativeTo: Date()))
        if !apk.url.deletingLastPathComponent().path.hasSuffix("/Downloads") {
            parts.append((apk.url.deletingLastPathComponent().path as NSString).abbreviatingWithTildeInPath)
        }
        return parts.joined(separator: "  ·  ")
    }

    @ViewBuilder private func comparisonBadge(_ info: ApkInfo?) -> some View {
        if info != nil, let device = model.primaryTarget, let (comparison, installed) = model.comparison(for: apk, on: device) {
            let suffix = installed.map { " (v telefonu \($0.versionName))" } ?? ""
            switch comparison {
            case .notInstalled: StatusPill(text: "v telefonu není", color: Palette.textMuted, dot: false)
            case .upgrade: StatusPill(text: "novější\(suffix)", color: Palette.lightCyan, dot: false)
            case .same: StatusPill(text: "už nainstalováno", color: Palette.textMuted, dot: false)
            case .downgrade: StatusPill(text: "starší\(suffix)", color: Palette.warn, dot: false)
            case .unknown: EmptyView()
            }
        }
    }
}

// MARK: - Log

struct LogPanel: View {
    @ObservedObject private var model = InstallerModel.shared
    private let timeFormat = Date.FormatStyle(date: .omitted, time: .standard)

    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Palette.hairline).frame(height: 1)
            HStack(spacing: 8) {
                Kicker("log", color: Palette.textMuted)
                if let ok = model.lastResult {
                    Image(systemName: ok ? "checkmark.circle.fill" : "xmark.octagon.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(ok ? Palette.lightCyan : Palette.danger)
                }
                Spacer()
                Button("Kopírovat") { model.copyLog() }.buttonStyle(LinkButtonStyle()).disabled(model.log.isEmpty)
                Button("Vymazat") { model.clearLog() }.buttonStyle(LinkButtonStyle()).disabled(model.log.isEmpty)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 8)
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        if model.log.isEmpty {
                            Text("$ čekám na první APK_").font(Typo.mono).foregroundStyle(Palette.textMuted)
                        }
                        ForEach(model.log) { line in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Text(line.time.formatted(timeFormat)).foregroundStyle(Palette.textMuted.opacity(0.7))
                                Text(prefix(line.kind) + line.text).foregroundStyle(color(line.kind))
                                    .textSelection(.enabled)
                            }
                            .font(Typo.mono)
                            .id(line.id)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 12)
                }
                .onChange(of: model.log.count) { _, _ in
                    if let last = model.log.last { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
        .background(Palette.surface1)
    }

    private func prefix(_ kind: LogLine.Kind) -> String {
        switch kind {
        case .command: "$ "
        case .output: "  "
        default: ""
        }
    }

    private func color(_ kind: LogLine.Kind) -> Color {
        switch kind {
        case .info: Palette.textSecondary
        case .command: Palette.accent
        case .output: Palette.textMuted
        case .success: Palette.lightCyan
        case .error: Palette.danger
        }
    }
}
