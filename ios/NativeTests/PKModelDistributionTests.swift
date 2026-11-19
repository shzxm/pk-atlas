import XCTest
import Foundation
import CryptoKit
import JavaScriptCore
@testable import PKAtlas

final class PKModelDistributionTests: XCTestCase {
    private func package(for catalog: PKCatalog, engine: String) throws -> PKRemoteModelPackage {
        let data = try JSONEncoder().encode(catalog)
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        return PKRemoteModelPackage(schemaVersion: 1, catalogVersion: hash,
            engineVersion: engine, catalogBase64: data.base64EncodedString(),
            maxSupportedClientSchema: 1)
    }

    func testValidCatalogAndCachedRoundTrip() throws {
        let builtin = PKCatalog.bundled()
        let engine = try XCTUnwrap(PKModelDistribution.expectedEngineVersion)
        var updated = builtin
        let i = try XCTUnwrap(updated.drugs.firstIndex(where: { $0.id == "pregabalin" }))
        updated.drugs[i].cmax = 2.47
        let remote = try package(for: updated, engine: engine)
        let verified = try PKModelDistribution.verify(remote, expectedEngine: engine, bundled: builtin)
        XCTAssertEqual(verified.catalog.drugs[i].cmax, 2.47)
        let cache = FileManager.default.temporaryDirectory
            .appendingPathComponent("pkatlas-test-" + UUID().uuidString)
            .appendingPathComponent("model.json")
        defer { try? FileManager.default.removeItem(at: cache.deletingLastPathComponent()) }
        try PKModelDistribution.save(remote, to: cache)
        let restored = try XCTUnwrap(PKModelDistribution.cached(
            expectedEngine: engine, bundled: builtin, at: cache))
        XCTAssertEqual(restored.version, remote.catalogVersion)
        XCTAssertEqual(restored.catalog.drugs[i].cmax, 2.47)
    }

    func testCorruptionAndAlgorithmMismatchDoNotReplaceLastGoodCache() throws {
        let builtin = PKCatalog.bundled()
        let engine = try XCTUnwrap(PKModelDistribution.expectedEngineVersion)
        let good = try package(for: builtin, engine: engine)
        let cache = FileManager.default.temporaryDirectory
            .appendingPathComponent("pkatlas-good-" + UUID().uuidString + ".json")
        defer { try? FileManager.default.removeItem(at: cache) }
        try PKModelDistribution.save(good, to: cache)
        let tampered = PKRemoteModelPackage(schemaVersion: 1,
            catalogVersion: String(repeating: "0", count: 64),
            engineVersion: engine, catalogBase64: good.catalogBase64,
            maxSupportedClientSchema: 1)
        XCTAssertThrowsError(try PKModelDistribution.verify(
            tampered, expectedEngine: engine, bundled: builtin))
        let incompatible = PKRemoteModelPackage(schemaVersion: 1,
            catalogVersion: good.catalogVersion,
            engineVersion: String(repeating: "f", count: 64),
            catalogBase64: good.catalogBase64, maxSupportedClientSchema: 1)
        XCTAssertThrowsError(try PKModelDistribution.verify(
            incompatible, expectedEngine: engine, bundled: builtin))
        let stillGood = try XCTUnwrap(PKModelDistribution.cached(
            expectedEngine: engine, bundled: builtin, at: cache))
        XCTAssertEqual(stillGood.version, good.catalogVersion)
    }

    func testRejectsMissingDrugsAndImpossibleValues() throws {
        let builtin = PKCatalog.bundled()
        let engine = try XCTUnwrap(PKModelDistribution.expectedEngineVersion)
        var deleted = builtin
        deleted.drugs.removeFirst()
        let removed = try package(for: deleted, engine: engine)
        XCTAssertThrowsError(try PKModelDistribution.verify(
            removed, expectedEngine: engine, bundled: builtin))
        var wrong = builtin
        wrong.drugs[0].halfLife = -12
        let invalid = try package(for: wrong, engine: engine)
        XCTAssertThrowsError(try PKModelDistribution.verify(
            invalid, expectedEngine: engine, bundled: builtin))
    }

    func testInverseEngineUsesUpdatedDataAndNeverDownloadsScript() throws {
        let builtin = PKCatalog.bundled()
        let script = try String(contentsOf: XCTUnwrap(
            Bundle.main.url(forResource: "site-engine", withExtension: "js")), encoding: .utf8)
        var changed = builtin
        let index = try XCTUnwrap(changed.drugs.firstIndex(where: { $0.id == "amoxicillin" }))
        changed.drugs[index].cmax = try XCTUnwrap(changed.drugs[index].cmax) * 1.3
        let original = try PKNativeInverseSolver.injectingCatalog(script, catalog: builtin)
        let modified = try PKNativeInverseSolver.injectingCatalog(script, catalog: changed)
        XCTAssertNotEqual(original, modified)
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        func sample(_ js: String) throws -> Double {
            let context = try XCTUnwrap(JSContext())
            context.evaluateScript(js)
            let value = context.evaluateScript("concentration(DRUGS.find(d=>d.id==='amoxicillin'),1700000000000+5400000,[{id:'one',drug:'amoxicillin',mg:250,time:1700000000000}])")
            return try XCTUnwrap(value?.toDouble())
        }
        let before = try sample(original), after = try sample(modified)
        XCTAssertGreaterThan(before, 0)
        XCTAssertEqual(after / before, 1.3, accuracy: 1e-7)
        let dose = PKDose(drug: "amoxicillin", mg: 250, time: start)
        let model = PKModel(catalog: changed, doses: [dose], intakes: [], renalCrCl: nil)
        let drug = try XCTUnwrap(model.drug("amoxicillin"))
        let native = model.concentration(drug, at: start.addingTimeInterval(5400))
        XCTAssertEqual(native, after, accuracy: max(1e-6, abs(after)*1e-6))
    }
}
