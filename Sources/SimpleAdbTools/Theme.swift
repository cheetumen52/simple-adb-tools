import SwiftUI

enum Brand {
    static let company = "Hejzlar Development"
    static let appName = "Simple ADB tools"
    static let web = URL(string: "https://hejzlar-development.cz")!
    static let support = URL(string: "https://paypal.me/cheetumen52")!
    static let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev"
}

// Mirrors the CSS tokens of hejzlar-development.cz (resources/css/app.css).
enum Palette {
    static let surface0 = Color(hex: 0x0A0D12)
    static let surface1 = Color(hex: 0x0D1117)
    static let surface2 = Color(hex: 0x11161D)
    static let surface3 = Color(hex: 0x161B22)
    static let hairline = Color(hex: 0xF0F6FC, opacity: 0.06)
    static let hairlineStrong = Color(hex: 0xF0F6FC, opacity: 0.12)
    static let accent = Color(hex: 0x01B5D5)
    static let accentHover = Color(hex: 0x1EC8E7)
    static let lightCyan = Color(hex: 0x5DFDCB)
    static let textLight = Color(hex: 0xF0F6FC)
    static let textSecondary = Color(hex: 0xC9D1D9)
    static let textMuted = Color(hex: 0x8B949E)
    static let warn = Color(hex: 0xFB923C)
    static let danger = Color(hex: 0xF85149)
    static let markStart = Color(hex: 0x00C2FF)
    static let markEnd = Color(hex: 0x0055FF)
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

enum Typo {
    static let kicker = Font.system(size: 10.5, weight: .medium, design: .monospaced)
    static let mono = Font.system(size: 11.5, design: .monospaced)
    static let monoSmall = Font.system(size: 10.5, design: .monospaced)
    static let title = Font.system(size: 26, weight: .bold)
    static let body = Font.system(size: 13)
    static let caption = Font.system(size: 11.5)
}

struct Kicker: View {
    let text: String
    var color: Color = Palette.accent

    init(_ text: String, color: Color = Palette.accent) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text.uppercased())
            .font(Typo.kicker)
            .tracking(1.9)
            .foregroundStyle(color)
    }
}

struct SectionHeader<Trailing: View>: View {
    let number: String
    let kicker: String
    let title: String
    var lede: String?
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .top, spacing: 18) {
            Text(number)
                .font(.system(size: 44, weight: .medium, design: .monospaced))
                .foregroundStyle(Palette.accent.opacity(0.22))
                .tracking(-1)
            VStack(alignment: .leading, spacing: 6) {
                Kicker(kicker)
                Text(title)
                    .font(Typo.title)
                    .tracking(-0.7)
                    .foregroundStyle(Palette.textLight)
                if let lede {
                    Text(lede)
                        .font(.system(size: 13.5))
                        .foregroundStyle(Palette.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 12)
            trailing
        }
    }
}

extension SectionHeader where Trailing == EmptyView {
    init(number: String, kicker: String, title: String, lede: String? = nil) {
        self.init(number: number, kicker: kicker, title: title, lede: lede) { EmptyView() }
    }
}

/// The bracket-H mark from the site favicon, scaled from its 32×32 grid.
struct BrandMark: View {
    var size: CGFloat = 28
    var center: Center = .dot

    enum Center { case dot, arrow }

    var body: some View {
        Canvas { ctx, canvas in
            let s = canvas.width / 32
            var brackets = Path()
            brackets.move(to: CGPoint(x: 10 * s, y: 6 * s))
            brackets.addLine(to: CGPoint(x: 6 * s, y: 6 * s))
            brackets.addLine(to: CGPoint(x: 6 * s, y: 26 * s))
            brackets.addLine(to: CGPoint(x: 10 * s, y: 26 * s))
            brackets.move(to: CGPoint(x: 22 * s, y: 6 * s))
            brackets.addLine(to: CGPoint(x: 26 * s, y: 6 * s))
            brackets.addLine(to: CGPoint(x: 26 * s, y: 26 * s))
            brackets.addLine(to: CGPoint(x: 22 * s, y: 26 * s))
            let gradient = Gradient(colors: [Palette.markStart, Palette.markEnd])
            let shading = GraphicsContext.Shading.linearGradient(gradient, startPoint: .zero, endPoint: CGPoint(x: canvas.width, y: canvas.height))
            ctx.stroke(brackets, with: shading, style: StrokeStyle(lineWidth: 2.5 * s, lineCap: .round, lineJoin: .round))

            switch center {
            case .dot:
                ctx.fill(Path(ellipseIn: CGRect(x: 13.5 * s, y: 13.5 * s, width: 5 * s, height: 5 * s)), with: .color(Palette.markStart))
            case .arrow:
                var arrow = Path()
                arrow.move(to: CGPoint(x: 16 * s, y: 10.5 * s))
                arrow.addLine(to: CGPoint(x: 16 * s, y: 20.5 * s))
                arrow.move(to: CGPoint(x: 12 * s, y: 16.5 * s))
                arrow.addLine(to: CGPoint(x: 16 * s, y: 20.5 * s))
                arrow.addLine(to: CGPoint(x: 20 * s, y: 16.5 * s))
                ctx.stroke(arrow, with: .color(Palette.markStart), style: StrokeStyle(lineWidth: 2.5 * s, lineCap: .round, lineJoin: .round))
            }
        }
        .frame(width: size, height: size)
    }
}

struct Card<Content: View>: View {
    var padding: CGFloat = 16
    var highlighted = false
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(highlighted ? Palette.accent.opacity(0.35) : Palette.hairline, lineWidth: 1)
            )
    }
}

struct StatusPill: View {
    let text: String
    var color: Color = Palette.lightCyan
    var dot = true

    var body: some View {
        HStack(spacing: 6) {
            if dot {
                Circle().fill(color).frame(width: 6, height: 6)
            }
            Text(text)
                .font(.system(size: 11, weight: .medium))
                .lineLimit(1)
                .fixedSize()
        }
        .foregroundStyle(color)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background {
            RoundedRectangle(cornerRadius: 7)
                .fill(color.opacity(0.08))
                .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(color.opacity(0.28), lineWidth: 1))
        }
        .layoutPriority(1)
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    var compact = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: compact ? 12 : 13, weight: .semibold))
            .padding(.horizontal, compact ? 11 : 16)
            .padding(.vertical, compact ? 5.5 : 8)
            .foregroundStyle(Palette.surface0)
            .background(configuration.isPressed ? Palette.accentHover : Palette.accent, in: RoundedRectangle(cornerRadius: 8))
            .shadow(color: Palette.accent.opacity(isEnabled ? 0.45 : 0), radius: 10, y: 3)
            .opacity(isEnabled ? 1 : 0.4)
            .contentShape(Rectangle())
    }
}

struct GhostButtonStyle: ButtonStyle {
    var compact = false
    @Environment(\.isEnabled) private var isEnabled
    @State private var hover = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: compact ? 12 : 13, weight: .medium))
            .padding(.horizontal, compact ? 10 : 14)
            .padding(.vertical, compact ? 5 : 7.5)
            .foregroundStyle(Palette.textLight)
            .background(configuration.isPressed || hover ? Palette.hairline : .clear, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(hover ? Palette.accent.opacity(0.5) : Palette.hairlineStrong, lineWidth: 1))
            .opacity(isEnabled ? 1 : 0.4)
            .contentShape(Rectangle())
            .onHover { hover = $0 }
    }
}

struct LinkButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(configuration.isPressed ? Palette.accentHover : Palette.accent)
            .contentShape(Rectangle())
    }
}

struct BrandCheckbox: View {
    @Binding var isOn: Bool
    var enabled = true

    var body: some View {
        Button { isOn.toggle() } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 5)
                    .fill(isOn && enabled ? Palette.accent : Color.clear)
                RoundedRectangle(cornerRadius: 5)
                    .strokeBorder(isOn && enabled ? Palette.accent : Palette.hairlineStrong, lineWidth: 1.5)
                if isOn && enabled {
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Palette.surface0)
                }
            }
            .frame(width: 18, height: 18)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
    }
}

struct BrandSwitch: View {
    let title: String
    var help: String?
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            Text(title).font(.system(size: 12.5)).foregroundStyle(Palette.textSecondary)
        }
        .toggleStyle(.switch)
        .controlSize(.mini)
        .tint(Palette.accent)
        .help(help ?? "")
    }
}

struct DotGrid: View {
    var body: some View {
        Canvas { ctx, size in
            let step: CGFloat = 24
            var y: CGFloat = step / 2
            while y < size.height {
                var x: CGFloat = step / 2
                while x < size.width {
                    ctx.fill(Path(ellipseIn: CGRect(x: x, y: y, width: 1.2, height: 1.2)), with: .color(Palette.textLight.opacity(0.05)))
                    x += step
                }
                y += step
            }
        }
        .background(Palette.surface0)
        .ignoresSafeArea()
    }
}
