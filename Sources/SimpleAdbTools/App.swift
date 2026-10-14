import AppKit
import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.appearance = NSAppearance(named: .darkAqua)
        MainActor.assumeIsolated {
            InstallerModel.shared.start()
            UpdateChecker.shared.start()
            WirelessManager.shared.start()
        }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        let option = NSEvent.modifierFlags.contains(.option)
        MainActor.assumeIsolated {
            let model = InstallerModel.shared
            model.enqueueInstall(urls, reinstall: option || model.reinstallMode)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        MainActor.assumeIsolated { MirrorController.shared.stopAll() }
    }
}

@main
struct SimpleAdbToolsApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @ObservedObject private var model = InstallerModel.shared

    var body: some Scene {
        Window(Brand.appName, id: "main") {
            RootView()
                .preferredColorScheme(.dark)
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentMinSize)
        .defaultSize(width: 860, height: 900)
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("O aplikaci \(Brand.appName)") {
                    NSApp.orderFrontStandardAboutPanel(options: [
                        .credits: NSAttributedString(
                            string: "\(Brand.company)\nhejzlar-development.cz",
                            attributes: [.foregroundColor: NSColor.secondaryLabelColor, .font: NSFont.systemFont(ofSize: 11)]
                        ),
                    ])
                }
            }
            CommandGroup(replacing: .newItem) {}
            CommandMenu("Zobrazit") {
                ForEach(AppTab.allCases) { tab in
                    Button(tab.title) { model.tab = tab }
                        .keyboardShortcut(KeyEquivalent(Character(String(tab.rawValue + 1))), modifiers: .command)
                }
                Divider()
                Button("Zkontrolovat požadavky") { model.toolchain.check() }
                    .keyboardShortcut("r", modifiers: [.command, .shift])
                Button("Restartovat adb") { model.restartAdb() }
                    .keyboardShortcut("r", modifiers: .command)
            }
        }
    }
}

struct RootView: View {
    @ObservedObject private var model = InstallerModel.shared
    @ObservedObject private var tools = InstallerModel.shared.toolchain
    @ObservedObject private var updates = UpdateChecker.shared

    var body: some View {
        VStack(spacing: 0) {
            header
            Rectangle().fill(Palette.hairline).frame(height: 1)
            Group {
                switch model.tab {
                case .requirements: RequirementsView()
                case .install: InstallView()
                case .toolset: ToolsetView()
                case .support: SupportView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .ignoresSafeArea(.container, edges: .top)
        .background(DotGrid())
        .frame(minWidth: 780, minHeight: 760)
        .onChange(of: tools.checkedOnce) { _, checked in
            if checked, !tools.allReady { model.tab = .requirements }
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            BrandMark(size: 30, center: .arrow)
            VStack(alignment: .leading, spacing: 2) {
                Text(Brand.appName)
                    .font(.system(size: 16, weight: .bold))
                    .tracking(-0.3)
                    .foregroundStyle(Palette.textLight)
                Kicker("by \(Brand.company)", color: Palette.textMuted)
            }
            Spacer(minLength: 20)
            if let release = updates.available {
                Button { NSWorkspace.shared.open(release.url) } label: {
                    Label("Nová verze \(release.tag)", systemImage: "sparkles")
                }
                .buttonStyle(PrimaryButtonStyle(compact: true))
                .help("Otevře stránku s novou verzí na GitHubu")
            }
            HStack(spacing: 4) {
                ForEach(AppTab.allCases) { tab in
                    TabButton(tab: tab, selected: model.tab == tab, alert: tab == .requirements && tools.checkedOnce && !tools.allReady) {
                        model.tab = tab
                    }
                }
            }
            .padding(4)
            .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Palette.hairline, lineWidth: 1))
        }
        .padding(.leading, 88)
        .padding(.trailing, 20)
        .padding(.vertical, 16)
        .background(Palette.surface1.opacity(0.92))
    }
}

private struct TabButton: View {
    let tab: AppTab
    let selected: Bool
    let alert: Bool
    let action: () -> Void
    @State private var hover = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                Text(tab.number)
                    .font(Typo.monoSmall)
                    .foregroundStyle(selected ? Palette.accent : Palette.textMuted)
                Text(tab.shortTitle)
                    .font(.system(size: 12.5, weight: selected ? .semibold : .regular))
                    .foregroundStyle(selected ? Palette.textLight : Palette.textSecondary)
                if alert {
                    Circle().fill(Palette.warn).frame(width: 6, height: 6)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 7)
                    .fill(selected ? Palette.surface3 : (hover ? Palette.hairline : .clear))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 7)
                    .strokeBorder(selected ? Palette.accent.opacity(0.35) : .clear, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }
}
