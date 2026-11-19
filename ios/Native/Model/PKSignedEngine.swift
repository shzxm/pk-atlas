import Foundation
import CryptoKit
import JavaScriptCore

/// Ed25519-signed production model and executable solver. The private signing
/// key remains root-only on 181; the installed App embeds ONLY its public key.
/// Running downloaded JS is intended for self-signed distribution, and is NOT
/// a claim of App Store guideline 2.5.2 compliance.
struct PKSignedEngineEnvelope: Codable {
    let schemaVersion: Int
    let keyId: String
    let payloadBase64: String
    let signatureBase64: String
}

struct PKSignedEnginePayload: Decodable {
    let schemaVersion: Int
    let bridgeVersion: Int
    let requiredCapabilities: [String]
    let engineVersion: String
    let engineSHA256: String
    let catalogVersion: String
    let scriptBase64: String
    let catalogBase64: String
}

struct PKVerifiedSignedEngine {
    let engineVersion: String
    let scriptSHA256: String
    let catalogVersion: String
    let catalog: PKCatalog
    let script: String
}

enum PKSignedEngineFailure: LocalizedError {
    case updateApp(String)
    case invalidSignature
    case invalidPackage
    case executionFailed

    var errorDescription: String? {
        switch self {
        case .updateApp(let required):
            return "云端反算引擎包含当前 App 不支持的新优化能力（\(required)）。请下载并安装新版药时 IPA；此前的本地算法保持可用。"
        case .invalidSignature:
            return "引擎签名验证失败，已拒绝更新并保留旧版。"
        case .invalidPackage:
            return "模型或算法数据损坏，保留本机校验成功的旧版本。"
        case .executionFailed:
            return "新算法无法通过本地兼容性测试，已拒绝更新；可能需要新版 App。"
        }
    }
}

enum PKSignedEngine {
    static let supportedCapabilities: Set<String> = [
        "curve.v1", "inverse.point.v1", "inverse.duration.v1", "inverse.flattest.v1", "inverse.target-window.v1"
    ]
    private static let prefix = Data("PKATLAS-NATIVE-ENGINE-v1\n".utf8)
    private static let maxEnvelopeBytes = 1_600_000

    static var cacheURL: URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first?.appendingPathComponent("PKAtlas/signed-engine-current.json")
    }

    static var previousURL: URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first?.appendingPathComponent("PKAtlas/signed-engine-previous.json")
    }

    static var publicKeyData: Data? {
        guard let file = Bundle.main.url(forResource: "engine-signing-public-key", withExtension: "txt"),
              let str = try? String(contentsOf: file, encoding: .utf8) else { return nil }
        let hex = str.trimmingCharacters(in: .whitespacesAndNewlines)
        guard hex.count == 64 else { return nil }
        var bytes = [UInt8]()
        for index in stride(from: 0, to: hex.count, by: 2) {
            let a = hex.index(hex.startIndex, offsetBy: index)
            let b = hex.index(a, offsetBy: 2)
            guard let value = UInt8(hex[a..<b], radix: 16) else { return nil }
            bytes.append(value)
        }
        return Data(bytes)
    }

    static func verify(_ envelope: PKSignedEngineEnvelope,
                       bundled: PKCatalog, previous: PKCatalog? = nil,
                       trustedKey: Data? = publicKeyData) throws -> PKVerifiedSignedEngine {
        guard envelope.schemaVersion == 1,
              envelope.keyId == "pkatlas-ed25519-2026-11-1",
              envelope.payloadBase64.utf8.count < maxEnvelopeBytes,
              let payloadBytes = Data(base64Encoded: envelope.payloadBase64),
              !payloadBytes.isEmpty, payloadBytes.count < maxEnvelopeBytes,
              let signature = Data(base64Encoded: envelope.signatureBase64),
              signature.count == 64,
              let trustedKey, trustedKey.count == 32,
              let key = try? Curve25519.Signing.PublicKey(rawRepresentation: trustedKey)
        else { throw PKSignedEngineFailure.invalidSignature }
        guard key.isValidSignature(signature, for: prefix + payloadBytes) else {
            throw PKSignedEngineFailure.invalidSignature
        }
        guard let payload = try? JSONDecoder().decode(PKSignedEnginePayload.self, from: payloadBytes)
        else { throw PKSignedEngineFailure.invalidPackage }
        guard payload.schemaVersion == 1, payload.bridgeVersion == 1 else {
            throw PKSignedEngineFailure.updateApp("原生引擎协议 v\(payload.bridgeVersion)")
        }
        let missing = Set(payload.requiredCapabilities).subtracting(supportedCapabilities)
        guard missing.isEmpty else {
            throw PKSignedEngineFailure.updateApp(missing.sorted().joined(separator: "、"))
        }
        guard payload.requiredCapabilities.count == Set(payload.requiredCapabilities).count,
              payload.requiredCapabilities.count > 0,
              payload.engineVersion.count == 64,
              payload.engineSHA256.count == 64,
              payload.catalogVersion.count == 64,
              payload.scriptBase64.utf8.count < 1_000_000,
              payload.catalogBase64.utf8.count < 750_000,
              let scriptData = Data(base64Encoded: payload.scriptBase64),
              let catalogData = Data(base64Encoded: payload.catalogBase64),
              scriptData.count < 700_000,
              catalogData.count < 512_000,
              !scriptData.isEmpty && !catalogData.isEmpty,
              let script = String(data: scriptData, encoding: .utf8),
              script.hasPrefix("\"use strict\";"),
              script.contains("const PK_MODEL_ENGINE_VERSION = \"\(payload.engineVersion)\";"),
              SHA256.hash(data: scriptData).map({ String(format: "%02x", $0) }).joined() == payload.engineSHA256,
              SHA256.hash(data: catalogData).map({ String(format: "%02x", $0) }).joined() == payload.catalogVersion,
              let catalog = try? JSONDecoder().decode(PKCatalog.self, from: catalogData)
        else { throw PKSignedEngineFailure.invalidPackage }
        try PKModelDistribution.validate(catalog, bundled: bundled, previous: previous)
        return PKVerifiedSignedEngine(engineVersion: payload.engineVersion,
            scriptSHA256: payload.engineSHA256, catalogVersion: payload.catalogVersion,
            catalog: catalog, script: script)
    }

    static func stored(_ file: URL? = cacheURL, bundled: PKCatalog) -> PKVerifiedSignedEngine? {
        guard let file, let data = try? Data(contentsOf: file),
              data.count < maxEnvelopeBytes,
              let envelope = try? JSONDecoder().decode(PKSignedEngineEnvelope.self, from: data)
        else { return nil }
        // A correct signature is not enough: a previously signed but malformed
        // executable bundle must not be restored merely because its metadata
        // matches. Restore the previous verified revision if smoke test fails.
        do {
            let verified = try verify(envelope, bundled: bundled)
            try smokeTest(verified)
            return verified
        } catch {
            return nil
        }
    }

    static func restored(bundled: PKCatalog) -> PKVerifiedSignedEngine? {
        stored(bundled: bundled) ?? stored(previousURL, bundled: bundled)
    }

    static func save(_ envelope: PKSignedEngineEnvelope, to file: URL? = cacheURL,
                     backup: URL? = previousURL) throws {
        guard let file else { throw PKSignedEngineFailure.invalidPackage }
        let directory = file.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        if let backup, let old = try? Data(contentsOf: file),
           old.count < maxEnvelopeBytes,
           let oldEnvelope = try? JSONDecoder().decode(PKSignedEngineEnvelope.self, from: old),
           (try? verify(oldEnvelope, bundled: PKCatalog.bundled())) != nil {
            try old.write(to: backup, options: .atomic)
        }
        try JSONEncoder().encode(envelope).write(to: file, options: .atomic)
        try? FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: file.path)
    }

    static func smokeTest(_ verified: PKVerifiedSignedEngine) throws {
        guard let context = JSContext() else { throw PKSignedEngineFailure.executionFailed }
        var exception: String?
        context.exceptionHandler = { _, value in exception = value?.toString() }
        context.evaluateScript("globalThis.structuredClone = x => JSON.parse(JSON.stringify(x));")
        context.evaluateScript(verified.script)
        guard exception == nil else { throw PKSignedEngineFailure.executionFailed }
        let expression = """
        (function(){
          const d=DRUGS.find(d=>!d.recordOnly);
          if(!d||typeof concentration!=='function'||typeof totalEquivalent!=='function'||
             typeof solveInverse!=='function'||typeof solveContinuousPoint!=='function')return false;
          const t=1700000000000,r=[{drug:d.id,mg:d.refDose,time:t-3600000}];
          current=d.id;intakes=[];renal=null;
          const a=concentration(d,t,r),b=totalEquivalent(d,t,r);
          return Number.isFinite(a)&&a>0&&Number.isFinite(b)&&b>0;
        })()
        """
        guard context.evaluateScript(expression)?.toBool() == true, exception == nil else {
            throw PKSignedEngineFailure.executionFailed
        }
    }
}
