// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "SimpleAdbTools",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "SimpleAdbTools",
            path: "Sources/SimpleAdbTools"
        ),
    ]
)
