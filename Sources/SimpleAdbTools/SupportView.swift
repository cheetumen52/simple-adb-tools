import CoreImage.CIFilterBuiltins
import SwiftUI

struct SupportView: View {
    @ObservedObject private var model = InstallerModel.shared
    @State private var copiedLink = false
    @State private var copiedDiagnostics = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                SectionHeader(
                    number: AppTab.support.number,
                    kicker: "support",
                    title: "Ušetřily ti Simple ADB tools čas?",
                    lede: "Simple ADB tools jsou zdarma. Bez reklam, bez sledování, bez předplatného. Jestli ti ušetřily pár minut s adb, můžeš mi poslat na kafe."
                )

                UpdateCard()

                Card(padding: 22, highlighted: true) {
                    HStack(alignment: .center, spacing: 26) {
                        QRCodeView(text: Brand.support.absoluteString)
                            .frame(width: 176, height: 176)
                            .padding(12)
                            .background(Color.white, in: RoundedRectangle(cornerRadius: 14))
                            .shadow(color: Palette.accent.opacity(0.25), radius: 24)
                        VStack(alignment: .leading, spacing: 10) {
                            Kicker("paypal")
                            Text("paypal.me/cheetumen52")
                                .font(.system(size: 20, weight: .semibold, design: .monospaced))
                                .foregroundStyle(Palette.textLight)
                                .textSelection(.enabled)
                            Text("Naskenuj telefonem, nebo klikni. Částku si zvolíš sám.")
                                .font(Typo.caption).foregroundStyle(Palette.textMuted)
                            HStack(spacing: 8) {
                                Button("Otevřít PayPal", systemImage: "cup.and.saucer.fill") { NSWorkspace.shared.open(Brand.support) }
                                    .buttonStyle(PrimaryButtonStyle())
                                Button(copiedLink ? "Zkopírováno ✓" : "Kopírovat odkaz") {
                                    copy(Brand.support.absoluteString)
                                    flash($copiedLink)
                                }
                                .buttonStyle(GhostButtonStyle())
                            }
                            .padding(.top, 4)
                        }
                    }
                }

                Card(padding: 18) {
                    VStack(alignment: .leading, spacing: 8) {
                        Kicker("chyba nebo nápad", color: Palette.textMuted)
                        Text("Něco nefunguje?").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.textLight)
                        Text("Napiš mi přes web. Do zprávy vlož diagnostiku, ušetří nám to pár koleček.")
                            .font(Typo.caption).foregroundStyle(Palette.textMuted)
                            .fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: 8) {
                            Button("hejzlar-development.cz ↗") { NSWorkspace.shared.open(Brand.web) }
                                .buttonStyle(GhostButtonStyle(compact: true))
                            Button(copiedDiagnostics ? "Zkopírováno ✓" : "Kopírovat diagnostiku", systemImage: "stethoscope") {
                                copy(model.diagnostics())
                                flash($copiedDiagnostics)
                            }
                            .buttonStyle(GhostButtonStyle(compact: true))
                        }
                        .padding(.top, 2)
                    }
                }

                HStack(spacing: 10) {
                    BrandMark(size: 18)
                    Text("\(Brand.appName) \(Brand.version)  ·  © 2026 \(Brand.company)")
                        .font(Typo.monoSmall)
                        .foregroundStyle(Palette.textMuted)
                }
                .padding(.top, 6)
            }
            .padding(24)
        }
    }

    private func copy(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    private func flash(_ flag: Binding<Bool>) {
        flag.wrappedValue = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) { flag.wrappedValue = false }
    }
}

private struct UpdateCard: View {
    @ObservedObject private var updates = UpdateChecker.shared

    var body: some View {
        Card(padding: 16, highlighted: updates.available != nil) {
            HStack(spacing: 14) {
                icon
                VStack(alignment: .leading, spacing: 3) {
                    Kicker("aktualizace", color: Palette.textMuted)
                    Text(title).font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.textLight)
                    Text(subtitle).font(Typo.caption).foregroundStyle(Palette.textMuted)
                }
                Spacer()
                if let release = updates.available {
                    Button("Stáhnout \(release.tag)", systemImage: "arrow.down.circle") { NSWorkspace.shared.open(release.url) }
                        .buttonStyle(PrimaryButtonStyle(compact: true))
                }
                Button("Zkontrolovat", systemImage: "arrow.clockwise") { Task { await updates.check() } }
                    .buttonStyle(GhostButtonStyle(compact: true))
                    .disabled(updates.state == .checking)
            }
        }
    }

    @ViewBuilder private var icon: some View {
        switch updates.state {
        case .checking: ProgressView().controlSize(.small).frame(width: 26, height: 26)
        case .available: Image(systemName: "sparkles").font(.system(size: 20)).foregroundStyle(Palette.accent).frame(width: 26)
        case .upToDate: Image(systemName: "checkmark.seal.fill").font(.system(size: 20)).foregroundStyle(Palette.lightCyan).frame(width: 26)
        case .idle, .failed: Image(systemName: "questionmark.circle").font(.system(size: 20)).foregroundStyle(Palette.textMuted).frame(width: 26)
        }
    }

    private var title: String {
        switch updates.state {
        case .idle: "Verze \(Brand.version)"
        case .checking: "Hledám novou verzi…"
        case .upToDate: "Máš nejnovější verzi \(Brand.version)"
        case let .available(release): "K dispozici je verze \(release.tag)"
        case .failed: "Aktualizace se nepodařilo ověřit"
        }
    }

    private var subtitle: String {
        let checked = updates.lastChecked.map { "Naposledy ověřeno \($0.formatted(date: .omitted, time: .shortened))" }
        switch updates.state {
        case let .failed(reason): return reason
        case .available: return "Nainstalováno \(Brand.version). " + (checked ?? "")
        default: return checked ?? "Kontroluji tagy v repozitáři \(UpdateChecker.repo) na GitHubu."
        }
    }
}

struct QRCodeView: View {
    let text: String

    var body: some View {
        if let image = Self.render(text) {
            Image(nsImage: image)
                .interpolation(.none)
                .resizable()
                .scaledToFit()
        }
    }

    private static func render(_ text: String) -> NSImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let colored = output.applyingFilter("CIFalseColor", parameters: [
            "inputColor0": CIColor(red: 0.04, green: 0.05, blue: 0.07),
            "inputColor1": CIColor(red: 1, green: 1, blue: 1),
        ])
        let scaled = colored.transformed(by: CGAffineTransform(scaleX: 12, y: 12))
        guard let cg = CIContext().createCGImage(scaled, from: scaled.extent) else { return nil }
        return NSImage(cgImage: cg, size: NSSize(width: scaled.extent.width, height: scaled.extent.height))
    }
}
