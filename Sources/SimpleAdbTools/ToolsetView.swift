import SwiftUI

struct ToolsetView: View {
    @ObservedObject private var model = ToolsetModel.shared
    @ObservedObject private var installer = InstallerModel.shared

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                SectionHeader(
                    number: AppTab.toolset.number,
                    kicker: "adb toolset",
                    title: "Všechno, kvůli čemu bys otevíral terminál",
                    lede: "Logcat, správa aplikací, screenshoty, video, deep linky, Wi‑Fi ladění i vývojářské přepínače. Jedním klikem."
                ) {
                    DevicePicker()
                }
                SectionNav()
            }
            .padding(.horizontal, 24)
            .padding(.top, 24)
            .padding(.bottom, 14)

            if model.device == nil {
                ScrollView { NoDeviceCard().padding(.horizontal, 24) }
            } else if model.section == .logcat {
                LogcatSection()
            } else {
                ScrollView {
                    Group {
                        switch model.section {
                        case .overview: OverviewSection()
                        case .apps: AppsSection()
                        case .control: ControlSection()
                        case .wireless: WirelessSection()
                        case .developer: DeveloperSection()
                        case .shell: ShellSection()
                        case .logcat: EmptyView()
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 24)
                }
                if model.section != .shell {
                    LogPanel().frame(height: 160)
                }
            }
        }
        .onAppear { model.reload() }
        .onChange(of: model.device?.serial) { _, _ in model.deviceChanged() }
        .onChange(of: model.section) { _, _ in model.reload() }
    }
}

private struct DevicePicker: View {
    @ObservedObject private var model = ToolsetModel.shared
    @ObservedObject private var installer = InstallerModel.shared

    var body: some View {
        if installer.readyDevices.count > 1 {
            Menu {
                ForEach(installer.readyDevices) { d in
                    Button(d.displayName) { model.serial = d.serial }
                }
            } label: {
                Label(model.device?.displayName ?? "Zařízení", systemImage: "smartphone")
                    .font(.system(size: 12.5, weight: .medium))
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
            .tint(Palette.accent)
        } else if let d = model.device {
            StatusPill(text: d.displayName)
        }
    }
}

private struct SectionNav: View {
    @ObservedObject private var model = ToolsetModel.shared

    var body: some View {
        HStack(spacing: 4) {
            ForEach(ToolsetSection.allCases) { section in
                let selected = model.section == section
                Button { model.section = section } label: {
                    HStack(spacing: 5) {
                        Image(systemName: section.icon).font(.system(size: 11))
                        Text(section.rawValue).font(.system(size: 12, weight: selected ? .semibold : .regular))
                        if section == .logcat, model.logcatRunning {
                            Circle().fill(Palette.danger).frame(width: 5, height: 5)
                        }
                    }
                    .foregroundStyle(selected ? Palette.textLight : Palette.textSecondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: 7).fill(selected ? Palette.surface3 : .clear))
                    .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(selected ? Palette.accent.opacity(0.35) : .clear, lineWidth: 1))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Palette.hairline, lineWidth: 1))
    }
}

private struct NoDeviceCard: View {
    @ObservedObject private var installer = InstallerModel.shared

    var body: some View {
        Card {
            HStack(spacing: 12) {
                Image(systemName: "cable.connector").font(.system(size: 18)).foregroundStyle(Palette.textMuted)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Žádný připojený telefon").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.textLight)
                    Text("Nástroje se odemknou, jakmile připojíš telefon s laděním USB.").font(Typo.caption).foregroundStyle(Palette.textMuted)
                }
                Spacer()
                Button("Návod →") { installer.tab = .requirements }
                    .buttonStyle(GhostButtonStyle(compact: true))
            }
        }
    }
}

private struct ToolCardTitle: View {
    let kicker: String
    let title: String
    var subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Kicker(kicker, color: Palette.textMuted)
            Text(title).font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.textLight)
            if let subtitle {
                Text(subtitle).font(Typo.caption).foregroundStyle(Palette.textMuted).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

private struct BrandTextField: View {
    let placeholder: String
    @Binding var text: String
    var mono = true
    var onSubmit: () -> Void = {}

    var body: some View {
        TextField(placeholder, text: $text)
            .textFieldStyle(.plain)
            .font(mono ? Typo.mono : Typo.body)
            .foregroundStyle(Palette.textLight)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(Palette.surface1, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.hairlineStrong, lineWidth: 1))
            .onSubmit(onSubmit)
    }
}

// MARK: - Overview

private struct OverviewSection: View {
    @ObservedObject private var model = ToolsetModel.shared
    @State private var confirmReboot: String??
    @State private var dropTargeted = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Card {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        ToolCardTitle(kicker: "zařízení", title: model.device?.displayName ?? "")
                        Spacer()
                        if model.loadingInfo { ProgressView().controlSize(.small) }
                        Button("Obnovit", systemImage: "arrow.clockwise") { model.loadInfo() }
                            .buttonStyle(GhostButtonStyle(compact: true))
                    }
                    LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)], alignment: .leading, spacing: 10) {
                        ForEach(model.info) { row in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.label.uppercased()).font(Typo.kicker).tracking(1.2).foregroundStyle(Palette.textMuted)
                                Text(row.value).font(Typo.mono).foregroundStyle(Palette.textLight).textSelection(.enabled)
                                    .lineLimit(2)
                            }
                        }
                    }
                }
            }

            HStack(alignment: .top, spacing: 14) {
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        ToolCardTitle(kicker: "soubory", title: "Poslat do telefonu", subtitle: "Pusť sem soubory, skončí v telefonu ve složce Download.")
                        ZStack {
                            RoundedRectangle(cornerRadius: 10)
                                .fill(dropTargeted ? Palette.accent.opacity(0.08) : Palette.surface1)
                            RoundedRectangle(cornerRadius: 10)
                                .strokeBorder(style: StrokeStyle(lineWidth: 1.2, dash: [6, 5]))
                                .foregroundStyle(dropTargeted ? Palette.accent : Palette.hairlineStrong)
                            Label("Přetáhni soubory", systemImage: "arrow.up.doc").font(Typo.caption).foregroundStyle(Palette.textSecondary)
                        }
                        .frame(height: 64)
                        .dropDestination(for: URL.self) { urls, _ in
                            model.push(urls)
                            return true
                        } isTargeted: { dropTargeted = $0 }
                    }
                }
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        ToolCardTitle(kicker: "napájení", title: "Restart", subtitle: "Běžný restart nebo režim pro flashování.")
                        HStack(spacing: 8) {
                            Button("Restartovat") { confirmReboot = .some(nil) }
                                .buttonStyle(GhostButtonStyle(compact: true))
                            Button("Recovery") { confirmReboot = .some("recovery") }
                                .buttonStyle(GhostButtonStyle(compact: true))
                            Button("Bootloader") { confirmReboot = .some("bootloader") }
                                .buttonStyle(GhostButtonStyle(compact: true))
                        }
                    }
                }
            }
        }
        .confirmationDialog(
            "Restartovat \(model.device?.displayName ?? "telefon")\(rebootSuffix)?",
            isPresented: Binding(get: { confirmReboot != nil }, set: { if !$0 { confirmReboot = nil } })
        ) {
            Button("Restartovat", role: .destructive) {
                if let mode = confirmReboot { model.reboot(mode) }
                confirmReboot = nil
            }
        } message: {
            Text("Telefon se na chvíli odpojí.")
        }
    }

    private var rebootSuffix: String {
        switch confirmReboot {
        case .some(.some(let mode)): " do režimu \(mode)"
        default: ""
        }
    }
}

// MARK: - Apps

private struct AppsSection: View {
    @ObservedObject private var model = ToolsetModel.shared
    @State private var confirm: (title: String, action: () -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Card(padding: 12) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        BrandTextField(placeholder: "Hledat balíček…", text: $model.packageQuery)
                        Button { model.loadPackages() } label: { Image(systemName: "arrow.clockwise") }
                            .buttonStyle(GhostButtonStyle(compact: true))
                    }
                    BrandSwitch(title: "Včetně systémových", isOn: Binding(get: { model.includeSystem }, set: { model.includeSystem = $0; model.loadPackages() }))
                    if model.loadingPackages {
                        ProgressView().controlSize(.small).frame(maxWidth: .infinity)
                    }
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 1) {
                            ForEach(model.filteredPackages, id: \.self) { pkg in
                                let selected = model.selectedPackage == pkg
                                Button { model.select(pkg) } label: {
                                    Text(pkg)
                                        .font(Typo.mono)
                                        .foregroundStyle(selected ? Palette.textLight : Palette.textSecondary)
                                        .lineLimit(1).truncationMode(.middle)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 5)
                                        .background(RoundedRectangle(cornerRadius: 6).fill(selected ? Palette.accent.opacity(0.15) : .clear))
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .frame(height: 300)
                    Text("\(model.filteredPackages.count) aplikací").font(Typo.monoSmall).foregroundStyle(Palette.textMuted)
                }
            }
            .frame(width: 300)

            Card {
                if let pkg = model.selectedPackage {
                    VStack(alignment: .leading, spacing: 14) {
                        ToolCardTitle(kicker: "aplikace", title: pkg)
                        LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)], alignment: .leading, spacing: 10) {
                            ForEach(model.packageDetails) { row in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(row.label.uppercased()).font(Typo.kicker).tracking(1.2).foregroundStyle(Palette.textMuted)
                                    Text(row.value).font(Typo.mono).foregroundStyle(Palette.textLight).textSelection(.enabled)
                                }
                            }
                        }
                        FlowButtons {
                            Button("Spustit", systemImage: "play.fill") { model.launch(pkg) }.buttonStyle(PrimaryButtonStyle(compact: true))
                            Button("Zastavit", systemImage: "stop.fill") { model.forceStop(pkg) }.buttonStyle(GhostButtonStyle(compact: true))
                            Button("Nastavení", systemImage: "gearshape") { model.openSettings(pkg) }.buttonStyle(GhostButtonStyle(compact: true))
                            Button("Stáhnout APK", systemImage: "arrow.down.doc") { model.pullApk(pkg) }.buttonStyle(GhostButtonStyle(compact: true))
                        }
                        FlowButtons {
                            Button("Vymazat data", systemImage: "eraser") {
                                confirm = ("Vymazat všechna data aplikace \(pkg)? Přijdeš o přihlášení i nastavení.", { model.clearData(pkg) })
                            }
                            .buttonStyle(GhostButtonStyle(compact: true))
                            Button("Odinstalovat", systemImage: "trash") {
                                confirm = ("Odinstalovat \(pkg) z telefonu?", { model.uninstall(pkg) })
                            }
                            .buttonStyle(GhostButtonStyle(compact: true))
                        }
                    }
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        ToolCardTitle(kicker: "aplikace", title: "Vyber aplikaci vlevo", subtitle: "Spuštění, zastavení, vymazání dat, odinstalace nebo stažení APK z telefonu do Macu.")
                        Button("Co je teď na displeji?", systemImage: "eye") { model.showCurrentActivity() }
                            .buttonStyle(GhostButtonStyle(compact: true))
                    }
                }
            }
        }
        .confirmationDialog(confirm?.title ?? "", isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } })) {
            Button("Pokračovat", role: .destructive) {
                confirm?.action()
                confirm = nil
            }
        }
    }
}

private struct FlowButtons<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        HStack(spacing: 8) { content }
    }
}

// MARK: - Logcat

private struct LogcatSection: View {
    @ObservedObject private var model = ToolsetModel.shared

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                if model.logcatRunning {
                    Button("Zastavit", systemImage: "stop.fill") { model.stopLogcat() }
                        .buttonStyle(PrimaryButtonStyle(compact: true))
                } else {
                    Button("Spustit", systemImage: "play.fill") { model.startLogcat() }
                        .buttonStyle(PrimaryButtonStyle(compact: true))
                }
                Picker("", selection: $model.logcatLevel) {
                    ForEach(LogLevel.allCases) { Text($0.title).tag($0) }
                }
                .labelsHidden()
                .frame(width: 110)
                .disabled(model.logcatRunning)
                BrandTextField(placeholder: "balíček (volitelné)", text: $model.logcatPackage)
                    .frame(width: 210)
                    .disabled(model.logcatRunning)
                BrandTextField(placeholder: "Filtrovat text…", text: $model.logcatFilter)
                Button { model.logcatPaused.toggle() } label: { Image(systemName: model.logcatPaused ? "play" : "pause") }
                    .buttonStyle(GhostButtonStyle(compact: true))
                    .help(model.logcatPaused ? "Pokračovat" : "Pozastavit výpis")
                Button { model.clearLogcat() } label: { Image(systemName: "trash") }
                    .buttonStyle(GhostButtonStyle(compact: true))
                    .help("Vymazat buffer")
                Button { model.saveLogcat() } label: { Image(systemName: "square.and.arrow.down") }
                    .buttonStyle(GhostButtonStyle(compact: true))
                    .help("Uložit do souboru")
                    .disabled(model.logcat.isEmpty)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 10)

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 1) {
                        if model.logcat.isEmpty {
                            Text(model.logcatRunning ? "$ čekám na logy…" : "$ logcat zatím neběží. Klikni na Spustit.")
                                .font(Typo.mono).foregroundStyle(Palette.textMuted)
                        }
                        ForEach(model.visibleLogcat) { line in
                            Text(line.text)
                                .font(Typo.monoSmall)
                                .foregroundStyle(color(line.level))
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .id(line.id)
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                }
                .background(Palette.surface1)
                .onChange(of: model.logcat.count) { _, _ in
                    if !model.logcatPaused, let last = model.visibleLogcat.last { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
    }

    private func color(_ level: Character) -> Color {
        switch level {
        case "E", "F": Palette.danger
        case "W": Palette.warn
        case "I": Palette.textSecondary
        case "D": Palette.accent.opacity(0.85)
        default: Palette.textMuted
        }
    }
}

// MARK: - Control

private struct ControlSection: View {
    @ObservedObject private var model = ToolsetModel.shared

    private let keys: [(Int, String, String)] = [
        (3, "Domů", "house"), (4, "Zpět", "chevron.backward"), (187, "Aplikace", "square.stack"),
        (26, "Power", "power"), (224, "Probudit", "sun.max"), (82, "Odemknout", "lock.open"),
        (24, "Hlasitost +", "speaker.plus"), (25, "Hlasitost −", "speaker.minus"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        ToolCardTitle(kicker: "obrazovka", title: "Screenshot a video", subtitle: "Ukládá se na plochu a rovnou se otevře.")
                        HStack(spacing: 8) {
                            Button("Screenshot", systemImage: "camera") { model.screenshot() }
                                .buttonStyle(GhostButtonStyle(compact: true))
                            if let since = model.recordingSince {
                                Button { model.toggleRecording() } label: {
                                    HStack(spacing: 6) {
                                        Circle().fill(Palette.surface0).frame(width: 7, height: 7)
                                        TimelineView(.periodic(from: since, by: 1)) { ctx in
                                            Text("Zastavit · \(Duration.seconds(ctx.date.timeIntervalSince(since)).formatted(.time(pattern: .minuteSecond)))")
                                        }
                                    }
                                }
                                .buttonStyle(PrimaryButtonStyle(compact: true))
                            } else {
                                Button("Nahrát video", systemImage: "record.circle") { model.toggleRecording() }
                                    .buttonStyle(GhostButtonStyle(compact: true))
                            }
                        }
                    }
                }
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        ToolCardTitle(kicker: "text", title: "Napsat do telefonu", subtitle: "Do aktivního pole. Jen ASCII, diakritiku adb neumí.")
                        HStack(spacing: 8) {
                            BrandTextField(placeholder: "test@example.com", text: $model.typeText) { model.sendText() }
                            Button("Odeslat") { model.sendText() }
                                .buttonStyle(PrimaryButtonStyle(compact: true))
                                .disabled(model.typeText.isEmpty)
                        }
                    }
                }
            }

            Card {
                VStack(alignment: .leading, spacing: 10) {
                    ToolCardTitle(kicker: "tlačítka", title: "Dálkové ovládání")
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                        ForEach(keys, id: \.0) { code, label, icon in
                            Button { model.key(code, label) } label: {
                                Label(label, systemImage: icon).frame(maxWidth: .infinity)
                            }
                            .buttonStyle(GhostButtonStyle(compact: true))
                        }
                    }
                    Button("Otevřít Možnosti pro vývojáře", systemImage: "hammer") { model.openDeveloperOptions() }
                        .buttonStyle(LinkButtonStyle())
                        .padding(.top, 2)
                }
            }

            Card {
                VStack(alignment: .leading, spacing: 10) {
                    ToolCardTitle(kicker: "deep link", title: "Otevřít URL v telefonu", subtitle: "Webový odkaz i vlastní schéma aplikace, třeba myapp://detail/42.")
                    HStack(spacing: 8) {
                        BrandTextField(placeholder: "https://… nebo myapp://…", text: $model.deepLink) { model.openDeepLink() }
                        Button("Otevřít") { model.openDeepLink() }
                            .buttonStyle(PrimaryButtonStyle(compact: true))
                            .disabled(model.deepLink.isEmpty)
                    }
                    if !model.deepLinkHistory.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(model.deepLinkHistory, id: \.self) { link in
                                Button { model.deepLink = link; model.openDeepLink(link) } label: {
                                    HStack(spacing: 6) {
                                        Image(systemName: "clock.arrow.circlepath").font(.system(size: 10))
                                        Text(link).font(Typo.monoSmall).lineLimit(1).truncationMode(.middle)
                                    }
                                    .foregroundStyle(Palette.textSecondary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Wireless

private struct WirelessSection: View {
    @ObservedObject private var model = ToolsetModel.shared
    @ObservedObject private var installer = InstallerModel.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Card(highlighted: true) {
                HStack(spacing: 14) {
                    ToolCardTitle(
                        kicker: "nejrychlejší cesta",
                        title: "Přepnout připojený telefon na Wi‑Fi",
                        subtitle: "Telefon musí být na kabelu a ve stejné síti jako Mac. Pak kabel odpojíš a ladíš bezdrátově."
                    )
                    Spacer()
                    Button("Přepnout na Wi‑Fi", systemImage: "wifi") { model.switchToWifi() }
                        .buttonStyle(PrimaryButtonStyle(compact: true))
                        .disabled(model.device?.isWireless ?? true)
                }
            }
            HStack(alignment: .top, spacing: 14) {
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        ToolCardTitle(kicker: "connect", title: "Připojit podle adresy", subtitle: "IP adresa telefonu, port 5555 doplním sám.")
                        HStack(spacing: 8) {
                            BrandTextField(placeholder: "192.168.1.42:5555", text: $model.connectHost) { model.connect() }
                            Button("Připojit") { model.connect() }
                                .buttonStyle(GhostButtonStyle(compact: true))
                                .disabled(model.connectHost.isEmpty)
                        }
                    }
                }
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        ToolCardTitle(kicker: "android 11+", title: "Spárovat bez kabelu", subtitle: "Bezdrátové ladění → Spárovat pomocí kódu.")
                        HStack(spacing: 8) {
                            BrandTextField(placeholder: "192.168.1.42:37123", text: $model.pairHost)
                            BrandTextField(placeholder: "kód", text: $model.pairCode) { model.pair() }
                                .frame(width: 90)
                            Button("Spárovat") { model.pair() }
                                .buttonStyle(GhostButtonStyle(compact: true))
                                .disabled(model.pairHost.isEmpty || model.pairCode.isEmpty)
                        }
                    }
                }
            }
            let wireless = installer.devices.filter(\.isWireless)
            Card {
                HStack(spacing: 14) {
                    ToolCardTitle(
                        kicker: "bezdrátová zařízení",
                        title: wireless.isEmpty ? "Žádné zařízení přes Wi‑Fi" : wireless.map(\.displayName).joined(separator: ", ")
                    )
                    Spacer()
                    Button("Odpojit všechna", systemImage: "wifi.slash") { model.disconnectAll() }
                        .buttonStyle(GhostButtonStyle(compact: true))
                        .disabled(wireless.isEmpty)
                }
            }
        }
    }
}

// MARK: - Developer

private struct DeveloperSection: View {
    @ObservedObject private var model = ToolsetModel.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)], spacing: 14) {
                ForEach(DevToggle.allCases) { toggle in
                    Card(padding: 14, highlighted: model.toggles[toggle] == true) {
                        HStack(alignment: .top, spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(toggle.title).font(.system(size: 13.5, weight: .semibold)).foregroundStyle(Palette.textLight)
                                Text(toggle.help).font(Typo.caption).foregroundStyle(Palette.textMuted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer()
                            if let on = model.toggles[toggle] {
                                Toggle("", isOn: Binding(get: { on }, set: { model.set(toggle, $0) }))
                                    .labelsHidden()
                                    .toggleStyle(.switch)
                                    .controlSize(.small)
                                    .tint(Palette.accent)
                            } else {
                                ProgressView().controlSize(.small)
                            }
                        }
                        .frame(minHeight: 54, alignment: .top)
                    }
                }
            }
            HStack {
                Text("Přepínače mění systémová nastavení telefonu. Před odevzdáním zařízení je vrať zpět.")
                    .font(Typo.caption).foregroundStyle(Palette.textMuted)
                Spacer()
                Button("Načíst stav", systemImage: "arrow.clockwise") { model.loadToggles() }
                    .buttonStyle(GhostButtonStyle(compact: true))
            }
        }
    }
}

// MARK: - Shell

private struct ShellSection: View {
    @ObservedObject private var model = ToolsetModel.shared

    private let snippets: [(String, String)] = [
        ("Aktuální aktivita", "dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity'"),
        ("Baterie", "dumpsys battery"),
        ("Úložiště", "df -h /data"),
        ("Paměť", "cat /proc/meminfo | head -5"),
        ("Fingerprint", "getprop ro.build.fingerprint"),
        ("Displej", "wm size; wm density"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("$").font(Typo.mono).foregroundStyle(Palette.accent)
                BrandTextField(placeholder: "adb shell příkaz, třeba: pm list packages -3", text: $model.shellCommand) { model.runShell() }
                Button("Spustit") { model.runShell() }
                    .buttonStyle(PrimaryButtonStyle(compact: true))
                    .disabled(model.shellCommand.isEmpty || model.shellRunning)
                Button("Vymazat") { model.clearShell() }
                    .buttonStyle(GhostButtonStyle(compact: true))
                    .disabled(model.shellHistory.isEmpty)
            }
            HStack(spacing: 6) {
                ForEach(snippets, id: \.0) { title, cmd in
                    Button(title) { model.runShell(cmd) }
                        .buttonStyle(GhostButtonStyle(compact: true))
                        .help(cmd)
                }
            }
            VStack(alignment: .leading, spacing: 12) {
                if model.shellHistory.isEmpty {
                    Text("Výstup se objeví tady. Příkazy běží přímo v telefonu přes adb shell.")
                        .font(Typo.mono).foregroundStyle(Palette.textMuted)
                }
                ForEach(model.shellHistory.reversed()) { entry in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("$ \(entry.command)").font(Typo.mono).foregroundStyle(entry.ok ? Palette.accent : Palette.danger)
                            .textSelection(.enabled)
                        if !entry.output.isEmpty {
                            Text(entry.output).font(Typo.monoSmall).foregroundStyle(Palette.textSecondary)
                                .textSelection(.enabled)
                        }
                    }
                }
                if model.shellRunning { ProgressView().controlSize(.small) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Palette.surface1, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Palette.hairline, lineWidth: 1))
        }
    }
}
