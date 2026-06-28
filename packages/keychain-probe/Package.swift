// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "macos-keychain-analysis",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "keychain-probe", targets: ["KeychainProbe"]),
    ],
    targets: [
        .executableTarget(name: "KeychainProbe"),
    ]
)
