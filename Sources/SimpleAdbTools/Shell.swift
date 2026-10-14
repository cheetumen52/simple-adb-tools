import Foundation

enum Shell {
    struct Result {
        let status: Int32
        let output: String
        var ok: Bool { status == 0 }
    }

    static func run(_ path: String, _ args: [String]) -> Result {
        let (status, data) = runData(path, args)
        return Result(status: status, output: String(decoding: data, as: UTF8.self))
    }

    static func runData(_ path: String, _ args: [String]) -> (Int32, Data) {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: path)
        p.arguments = args
        let out = Pipe()
        p.standardOutput = out
        p.standardError = out
        do { try p.run() } catch { return (-1, Data(error.localizedDescription.utf8)) }
        let data = out.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        return (p.terminationStatus, data)
    }

    static func runAsync(_ path: String, _ args: [String]) async -> Result {
        await withCheckedContinuation { cont in
            DispatchQueue.global().async { cont.resume(returning: run(path, args)) }
        }
    }

    /// Streams stdout+stderr line by line; returns exit status and the full output.
    static func stream(_ path: String, _ args: [String], onLine: @escaping (String) -> Void) async -> Result {
        await withCheckedContinuation { cont in
            let p = Process()
            p.executableURL = URL(fileURLWithPath: path)
            p.arguments = args
            let pipe = Pipe()
            p.standardOutput = pipe
            p.standardError = pipe

            let lines = LineCollector(onLine: onLine)
            pipe.fileHandleForReading.readabilityHandler = { handle in
                let data = handle.availableData
                if !data.isEmpty { lines.append(data, final: false) }
            }
            p.terminationHandler = { proc in
                pipe.fileHandleForReading.readabilityHandler = nil
                lines.append(pipe.fileHandleForReading.readDataToEndOfFile(), final: true)
                cont.resume(returning: Result(status: proc.terminationStatus, output: lines.output))
            }
            do {
                try p.run()
            } catch {
                pipe.fileHandleForReading.readabilityHandler = nil
                cont.resume(returning: Result(status: -1, output: error.localizedDescription))
            }
        }
    }
}

/// Splits a byte stream into trimmed lines; called from pipe and termination threads, hence the lock.
final class LineCollector: @unchecked Sendable {
    private let lock = NSLock()
    private let onLine: (String) -> Void
    private var buffer = Data()
    private var all = ""

    init(onLine: @escaping (String) -> Void) {
        self.onLine = onLine
    }

    var output: String {
        lock.lock()
        defer { lock.unlock() }
        return all
    }

    func append(_ data: Data, final: Bool) {
        lock.lock()
        defer { lock.unlock() }
        buffer.append(data)
        while let nl = buffer.firstIndex(of: 0x0A) {
            emit(buffer[buffer.startIndex..<nl])
            buffer.removeSubrange(buffer.startIndex...nl)
        }
        if final, !buffer.isEmpty {
            emit(buffer)
            buffer.removeAll()
        }
    }

    private func emit(_ chunk: Data) {
        let line = String(decoding: chunk, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !line.isEmpty else { return }
        all += line + "\n"
        onLine(line)
    }
}
