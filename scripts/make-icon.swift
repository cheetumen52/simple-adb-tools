import AppKit

// Usage: swift scripts/make-icon.swift <out.iconset>
// Brand bracket mark (hejzlar-development.cz favicon) with a download arrow, on the site's dark surface.
let out = URL(fileURLWithPath: CommandLine.arguments[1])
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

func color(_ hex: UInt32, _ alpha: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
}

func render(_ px: Int) -> Data {
    let s = CGFloat(px)
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    let ctx = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.current = ctx
    let cg = ctx.cgContext

    let inset = s * 0.098
    let tile = CGRect(x: inset, y: inset, width: s - 2 * inset, height: s - 2 * inset)
    let radius = tile.width * 0.225
    let tilePath = NSBezierPath(roundedRect: tile, xRadius: radius, yRadius: radius)

    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowColor = color(0x000000, 0.45)
    shadow.shadowBlurRadius = s * 0.025
    shadow.shadowOffset = NSSize(width: 0, height: -s * 0.01)
    shadow.set()
    color(0x0D1117).setFill()
    tilePath.fill()
    NSGraphicsContext.restoreGraphicsState()

    NSGradient(starting: color(0x161B22), ending: color(0x0A0D12))!.draw(in: tilePath, angle: -90)
    NSGradient(colors: [color(0x01B5D5, 0.28), color(0x01B5D5, 0)])!
        .draw(in: tilePath, relativeCenterPosition: NSPoint(x: 0, y: -0.15))

    color(0xF0F6FC, 0.10).setStroke()
    tilePath.lineWidth = max(1, s * 0.004)
    tilePath.stroke()

    // 32-unit favicon grid mapped into the tile, y flipped for AppKit.
    let unit = tile.width / 32 * 0.78
    let origin = CGPoint(x: tile.midX - 16 * unit, y: tile.midY - 16 * unit)
    func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: origin.x + x * unit, y: origin.y + (32 - y) * unit) }

    let brackets = CGMutablePath()
    brackets.move(to: p(10, 6)); brackets.addLine(to: p(6, 6)); brackets.addLine(to: p(6, 26)); brackets.addLine(to: p(10, 26))
    brackets.move(to: p(22, 6)); brackets.addLine(to: p(26, 6)); brackets.addLine(to: p(26, 26)); brackets.addLine(to: p(22, 26))
    cg.saveGState()
    cg.setLineWidth(2.5 * unit)
    cg.setLineCap(.round)
    cg.setLineJoin(.round)
    cg.addPath(brackets)
    cg.replacePathWithStrokedPath()
    cg.clip()
    let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [color(0x00C2FF).cgColor, color(0x0055FF).cgColor] as CFArray, locations: [0, 1])!
    cg.drawLinearGradient(gradient, start: p(6, 6), end: p(26, 26), options: [])
    cg.restoreGState()

    let arrow = CGMutablePath()
    arrow.move(to: p(16, 10)); arrow.addLine(to: p(16, 21))
    arrow.move(to: p(11.5, 16.5)); arrow.addLine(to: p(16, 21)); arrow.addLine(to: p(20.5, 16.5))
    cg.saveGState()
    cg.setShadow(offset: .zero, blur: s * 0.04, color: color(0x01B5D5, 0.7).cgColor)
    cg.setStrokeColor(color(0x5DFDCB).cgColor)
    cg.setLineWidth(2.6 * unit)
    cg.setLineCap(.round)
    cg.setLineJoin(.round)
    cg.addPath(arrow)
    cg.strokePath()
    cg.restoreGState()

    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

for base in [16, 32, 128, 256, 512] {
    try! render(base).write(to: out.appendingPathComponent("icon_\(base)x\(base).png"))
    try! render(base * 2).write(to: out.appendingPathComponent("icon_\(base)x\(base)@2x.png"))
}
