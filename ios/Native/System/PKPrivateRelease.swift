import Foundation
import CryptoKit

/// A signed release notice, not a remote binary installer. Canonical unsigned
/// IPA stays in iCloud; the private GitHub Releases page may offer a ZIP
/// containing the *identical* IPA due to Github's browser extension rules.
struct PKNativeReleaseEnvelope: Codable {
    let schemaVersion: Int
    let keyId: String
    let payloadBase64: String
    let signatureBase64: String
}

struct PKNativeRelease: Codable, Equatable {
    let schemaVersion: Int
    let version: String
    let build: Int
    let fileName: String
    let ipaSHA256: String
    let releaseNotes: String
    let publishedAt: String
    let distribution: String

    var displayVersion: String { "\(version)（Build \(build)）" }

    /// Construct, never trust an arbitrary URL from a remote manifest. The
    /// release tag is derived solely from validated numeric version parts.
    var privateReleaseURL: URL? {
        guard let numbers = PKReleaseVerifier.versionParts(version) else { return nil }
        let normalized = (numbers.count == 2 ? numbers + [0] : numbers)
            .map(String.init).joined(separator: ".")
        return URL(string: "https://github.com/shzxm/example-private-releases/releases/tag/v" + normalized)
    }
}

enum PKReleaseError: LocalizedError {
    case invalidSignature
    case invalidManifest
    case networkFailure

    var errorDescription: String? {
        switch self {
        case .invalidSignature: return "服务器版本信息签名无效，本次更新检查已取消。"
        case .invalidManifest: return "服务器版本信息不符合已知格式，本次更新检查已取消。"
        case .networkFailure: return "版本服务器暂不可用，保留当前 App；不会上传账号或设备信息。"
        }
    }
}

enum PKReleaseVerifier {
    private static let prefix = Data("PKATLAS-NATIVE-RELEASE-v1\n".utf8)

    static func verify(_ envelope: PKNativeReleaseEnvelope,
                       trustedKey: Data? = PKSignedEngine.publicKeyData) throws -> PKNativeRelease {
        guard envelope.schemaVersion == 1,
              envelope.keyId == "pkatlas-ed25519-2026-11-1",
              envelope.payloadBase64.utf8.count < 9_000,
              let payload = Data(base64Encoded: envelope.payloadBase64),
              !payload.isEmpty, payload.count < 6_000,
              let signature = Data(base64Encoded: envelope.signatureBase64),
              signature.count == 64,
              let trustedKey, trustedKey.count == 32,
              let key = try? Curve25519.Signing.PublicKey(rawRepresentation: trustedKey),
              key.isValidSignature(signature, for: prefix + payload)
        else { throw PKReleaseError.invalidSignature }
        guard let release = try? JSONDecoder().decode(PKNativeRelease.self, from: payload),
              release.schemaVersion == 1,
              release.distribution == "icloud-drive-downloads",
              versionParts(release.version) != nil,
              release.build > 0 && release.build <= 1_000_000,
              release.ipaSHA256.count == 64,
              release.ipaSHA256.allSatisfy({ $0.isASCII && $0.isHexDigit && !$0.isUppercase }),
              release.releaseNotes.count >= 1 && release.releaseNotes.count <= 1_200,
              release.publishedAt.count > 10 && release.publishedAt.count < 100,
              release.fileName.count < 130,
              release.fileName.range(of: #"^PKAtlas-iOS[0-9.]+-v[0-9.]+-build[0-9]+(?:-[0-9]{8}-[0-9]{6})?-unsigned\.ipa$"#,
                                         options: .regularExpression) != nil,
              release.fileName.contains("-v\(release.version)-build\(release.build)")
        else { throw PKReleaseError.invalidManifest }
        return release
    }

    static func versionParts(_ version: String) -> [Int]? {
        let components = version.split(separator: ".", omittingEmptySubsequences: false)
        guard (2...4).contains(components.count) else { return nil }
        let integers = components.compactMap { text -> Int? in
            guard !text.isEmpty && text.count <= 7,
                  text.allSatisfy({ $0 >= "0" && $0 <= "9" }) else { return nil }
            return Int(text)
        }
        return integers.count == components.count ? integers : nil
    }

    static func newer(_ remote: PKNativeRelease, than localVersion: String,
                      localBuild: Int) -> Bool {
        guard let remoteParts = versionParts(remote.version),
              let localParts = versionParts(localVersion) else { return false }
        for index in 0..<max(remoteParts.count, localParts.count) {
            let remoteValue = index < remoteParts.count ? remoteParts[index] : 0
            let localValue = index < localParts.count ? localParts[index] : 0
            if remoteValue != localValue { return remoteValue > localValue }
        }
        return remote.build > localBuild
    }
}

/// Deliberately separate from PKCloudAPI, which attaches the user's account
/// Cookie. This client cannot read credentials, device IDs, APNs tokens, or
/// user data. Nginx+API disable per-request logs for this exact URL.
final class PKPrivateReleaseClient: NSObject, URLSessionTaskDelegate {
    static let shared = PKPrivateReleaseClient()
    private static let endpoint = URL(string: "https://pk.example.com/api/native/version")!
    private let session: URLSession

    override init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpCookieStorage = nil
        configuration.urlCredentialStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 12
        configuration.timeoutIntervalForResource = 16
        self.session = URLSession(configuration: configuration)
        super.init()
    }

    static func unsignedRequest() -> URLRequest {
        var request = URLRequest(url: endpoint, cachePolicy: .reloadIgnoringLocalCacheData,
                                 timeoutInterval: 12)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        // Suppress per-device URLSession User-Agent fingerprints in this
        // anonymous endpoint. No cookies, Authorization or Origin headers.
        request.setValue("PKAtlasReleaseCheck/1", forHTTPHeaderField: "User-Agent")
        return request
    }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        // Never follow a redirect to GitHub, an arbitrary IP or other host.
        completionHandler(nil)
    }

    func fetch() async throws -> PKNativeRelease {
        let (data, response): (Data, URLResponse)
        do { (data, response) = try await session.data(for: Self.unsignedRequest()) }
        catch { throw PKReleaseError.networkFailure }
        guard let http = response as? HTTPURLResponse,
              http.statusCode == 200,
              http.url?.scheme == "https", http.url?.host == "pk.example.com",
              http.url?.path == "/api/native/version", data.count < 10_000,
              let envelope = try? JSONDecoder().decode(PKNativeReleaseEnvelope.self, from: data)
        else { throw PKReleaseError.invalidManifest }
        return try PKReleaseVerifier.verify(envelope)
    }
}
