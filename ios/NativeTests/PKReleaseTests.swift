import XCTest
import Foundation
import CryptoKit
@testable import PKAtlas

final class PKReleaseTests: XCTestCase {
    private func fixture() throws -> PKNativeReleaseEnvelope {
        let url = try XCTUnwrap(Bundle(for: type(of: self)).url(
            forResource: "PKReleaseFixture", withExtension: "json"))
        return try JSONDecoder().decode(PKNativeReleaseEnvelope.self,
            from: Data(contentsOf: url))
    }

    func testProductionReleaseSignatureVerifiedAgainstEmbeddedPublicKey() throws {
        let value = try PKReleaseVerifier.verify(fixture())
        XCTAssertEqual(value.version, "2.5")
        XCTAssertEqual(value.build, 9)
        XCTAssertEqual(value.distribution, "icloud-drive-downloads")
        XCTAssertEqual(value.fileName, "PKAtlas-iOS27.2-v2.5-build9-unsigned.ipa")
        XCTAssertEqual(value.ipaSHA256.count, 64)
    }

    func testCorrectNumericVersionAndBuildComparison() throws {
        let release = try PKReleaseVerifier.verify(fixture())
        XCTAssertFalse(PKReleaseVerifier.newer(release, than: "2.5", localBuild: 9))
        XCTAssertTrue(PKReleaseVerifier.newer(release, than: "2.5", localBuild: 8))
        XCTAssertTrue(PKReleaseVerifier.newer(release, than: "2.4", localBuild: 200))
        XCTAssertFalse(PKReleaseVerifier.newer(release, than: "2.6", localBuild: 1))
        let vTen = PKNativeRelease(schemaVersion: 1, version: "2.10", build: 1,
            fileName: "PKAtlas-iOS27.2-v2.10-build1-unsigned.ipa", ipaSHA256: String(repeating: "a", count: 64),
            releaseNotes: "unit test", publishedAt: "2026-11-17T00:00:00Z",
            distribution: "icloud-drive-downloads")
        XCTAssertTrue(PKReleaseVerifier.newer(vTen, than: "2.9", localBuild: 500))
        XCTAssertFalse(PKReleaseVerifier.newer(vTen, than: "2.11", localBuild: 1))
    }

    func testAnonymousRequestNoCookieOrDeviceIdentity() {
        let request = PKPrivateReleaseClient.unsignedRequest()
        XCTAssertEqual(request.url?.absoluteString,
                       "https://pk.example.com/api/native/version")
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertNil(request.httpBody)
        let names = Set((request.allHTTPHeaderFields ?? [:]).keys.map { $0.lowercased() })
        for forbidden in ["cookie", "authorization", "x-device-id", "x-real-ip",
                          "cf-connecting-ip", "x-forwarded-for", "referer", "origin"] {
            XCTAssertFalse(names.contains(forbidden))
        }
        XCTAssertEqual(request.value(forHTTPHeaderField: "User-Agent"),
                       "PKAtlasReleaseCheck/1")
    }

    func testTamperingAndUnknownDistributionRejected() throws {
        let envelope = try fixture()
        let tampered = PKNativeReleaseEnvelope(schemaVersion: 1, keyId: envelope.keyId,
            payloadBase64: envelope.payloadBase64 + "A",
            signatureBase64: envelope.signatureBase64)
        XCTAssertThrowsError(try PKReleaseVerifier.verify(tampered))
        let signer = Curve25519.Signing.PrivateKey()
        let valid = try PKReleaseVerifier.verify(envelope)
        let fake = PKNativeRelease(schemaVersion: 1, version: valid.version,
            build: valid.build, fileName: valid.fileName, ipaSHA256: valid.ipaSHA256,
            releaseNotes: "some notes", publishedAt: "2026-11-17T00:00:00Z",
            distribution: "external-download")
        let raw = try JSONEncoder().encode(fake)
        let sig = try signer.signature(for: Data("PKATLAS-NATIVE-RELEASE-v1\n".utf8) + raw)
        let newEnvelope = PKNativeReleaseEnvelope(schemaVersion: 1,
            keyId: "pkatlas-ed25519-2026-11-1",
            payloadBase64: raw.base64EncodedString(), signatureBase64: sig.base64EncodedString())
        XCTAssertThrowsError(try PKReleaseVerifier.verify(newEnvelope,
            trustedKey: signer.publicKey.rawRepresentation))
    }
    func testPrivateReleaseURLNeverUsesRemoteUntrustedHostOrPath() {
        let candidate = PKNativeRelease(schemaVersion: 1, version: "2.13", build: 19,
            fileName: "PKAtlas-iOS27.2-v2.13-build19-unsigned.ipa",
            ipaSHA256: String(repeating: "a", count: 64), releaseNotes: "notes",
            publishedAt: "2026-11-18T00:00:00Z", distribution: "icloud-drive-downloads")
        XCTAssertEqual(candidate.privateReleaseURL?.absoluteString,
            "https://github.com/shzxm/example-private-releases/releases/tag/v2.13.0")
        let injected = PKNativeRelease(schemaVersion: 1, version: "2.13@evil.com/path",
            build: 19, fileName: candidate.fileName, ipaSHA256: candidate.ipaSHA256,
            releaseNotes: "notes", publishedAt: candidate.publishedAt,
            distribution: candidate.distribution)
        XCTAssertNil(injected.privateReleaseURL)
    }

}
