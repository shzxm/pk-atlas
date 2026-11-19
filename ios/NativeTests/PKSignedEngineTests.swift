import XCTest
import Foundation
import CryptoKit
@testable import PKAtlas

final class PKSignedEngineTests: XCTestCase {
    private func fixture() throws -> PKSignedEngineEnvelope {
        let resource = try XCTUnwrap(Bundle(for: type(of: self)).url(
            forResource: "PKSignedEngineFixture", withExtension: "json"))
        return try JSONDecoder().decode(PKSignedEngineEnvelope.self,
                                         from: Data(contentsOf: resource))
    }

    func testProductionSignedEngineAndCurveParity() throws {
        let verified = try PKSignedEngine.verify(fixture(), bundled: PKCatalog.bundled())
        XCTAssertEqual(verified.engineVersion.count, 64)
        XCTAssertEqual(verified.catalog.drugs.count, 6)
        try PKSignedEngine.smokeTest(verified)
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        let actual = PKDose(drug: "pregabalin", mg: 150, time: start)
        let model = PKModel(catalog: verified.catalog, doses: [actual], intakes: [],
                            renalCrCl: nil, engineSource: verified.script)
        let drug = try XCTUnwrap(model.drug("pregabalin"))
        let points = model.curve(drug: drug, from: start, hours: 6, stepMinutes: 15)
        XCTAssertEqual(points.count, 25)
        let point = try XCTUnwrap(points.first(where: {
            abs($0.time.timeIntervalSince(start) - 3600) < 1
        }))
        XCTAssertGreaterThan(point.concentration, 0)
        XCTAssertGreaterThan(point.equivalent, 0)
        let native = PKModel(catalog: verified.catalog, doses: [actual],
                             intakes: [], renalCrCl: nil)
        // The current published package is expected to be numerically close
        // to the bundled Swift translation. Future signed formula changes can
        // intentionally differ and should not be tested against these values.
        XCTAssertEqual(point.concentration,
            native.concentration(drug, at: point.time),
            accuracy: max(1e-6, point.concentration * 0.0001))
        XCTAssertEqual(model.concentration(drug, at: point.time),
                       point.concentration, accuracy: 1e-7)
        XCTAssertEqual(model.equivalent(drug, at: point.time),
                       point.equivalent, accuracy: 1e-7)
    }

    func testTamperedProductionSignatureIsRejected() throws {
        let envelope = try fixture()
        let wrong = PKSignedEngineEnvelope(schemaVersion: 1, keyId: envelope.keyId,
            payloadBase64: envelope.payloadBase64 + "A",
            signatureBase64: envelope.signatureBase64)
        XCTAssertThrowsError(try PKSignedEngine.verify(wrong,
            bundled: PKCatalog.bundled()))
    }

    func testUnknownOptimizationCapabilityRequiresNewApp() throws {
        let original = try fixture()
        let bytes = try XCTUnwrap(Data(base64Encoded: original.payloadBase64))
        var raw = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
        var caps = try XCTUnwrap(raw["requiredCapabilities"] as? [String])
        caps.append("inverse.futureoptimizer.v2")
        raw["requiredCapabilities"] = caps
        let payload = try JSONSerialization.data(withJSONObject: raw, options: [.sortedKeys])
        let signer = Curve25519.Signing.PrivateKey()
        let signature = try signer.signature(for:
            Data("PKATLAS-NATIVE-ENGINE-v1\n".utf8) + payload)
        let envelope = PKSignedEngineEnvelope(schemaVersion: 1,
            keyId: original.keyId,
            payloadBase64: payload.base64EncodedString(),
            signatureBase64: signature.base64EncodedString())
        XCTAssertThrowsError(try PKSignedEngine.verify(envelope,
            bundled: PKCatalog.bundled(), trustedKey: signer.publicKey.rawRepresentation)) { error in
            guard case PKSignedEngineFailure.updateApp(let capability) = error else {
                return XCTFail("Expected version upgrade error, got \(error)")
            }
            XCTAssertEqual(capability, "inverse.futureoptimizer.v2")
        }
    }

    func testOfflineLastGoodCacheAndCorruptCandidate() throws {
        let envelope = try fixture()
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(
            "pkatlas-signed-\(UUID().uuidString).json")
        let backup = url.deletingLastPathComponent().appendingPathComponent(
            "pkatlas-signed-backup-\(UUID().uuidString).json")
        defer {
            try? FileManager.default.removeItem(at: url)
            try? FileManager.default.removeItem(at: backup)
        }
        try PKSignedEngine.save(envelope, to: url, backup: backup)
        let restored = try XCTUnwrap(PKSignedEngine.stored(url,
            bundled: PKCatalog.bundled()))
        XCTAssertEqual(restored.scriptSHA256.count, 64)
        // Simulate a damaged newest archive while a previously verified
        // package remains available for offline restoration.
        try Data("broken".utf8).write(to: url, options: .atomic)
        XCTAssertNil(PKSignedEngine.stored(url, bundled: PKCatalog.bundled()))
        try JSONEncoder().encode(envelope).write(to: backup, options: .atomic)
        XCTAssertNotNil(PKSignedEngine.stored(backup,
            bundled: PKCatalog.bundled()))
    }
}
