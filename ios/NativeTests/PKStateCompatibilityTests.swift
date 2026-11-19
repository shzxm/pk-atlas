import XCTest
@testable import PKAtlas

final class PKStateCompatibilityTests: XCTestCase {
    func testImportedMetadataSurvivesNativeRecordEdit() throws {
        let source = """
        {
          "records":[{"id":"legacy1","drug":"journal:test","mg":50,
          "time":1700000000000,"unit":"mg","source":"ios-journal-17.1",
          "journal":{"substanceName":"Example","reviewStatus":"possibleDuplicate"},
          "futureServerField":{"nested":12}}],
          "courses":[{"id":"course1","extra":"keep"}],
          "intakes":[],"plans":{"amoxicillin":{"strengths":[{"mg":250}]}},
          "settings":{"currentDrug":"pregabalin","unknown":{"v":1}}
        }
        """
        var state = try JSONDecoder().decode(PKCloudState.self, from: Data(source.utf8))
        XCTAssertEqual(state.records.count, 1)
        let initial = state.records[0]["journal"]
        let future = state.records[0]["futureServerField"]
        let dose = try XCTUnwrap(state.doses.first)
        state.saveDose(PKDose(id: dose.id, drug: dose.drug, mg: 75, time: dose.time,
                              unit: "mg", isImported: true))
        XCTAssertEqual(state.records[0]["journal"], initial)
        XCTAssertEqual(state.records[0]["futureServerField"], future)
        XCTAssertEqual(state.records[0]["mg"], .number(75))
        XCTAssertEqual(state.plans["amoxicillin"]?.object?["strengths"], .array([.object(["mg": .number(250)])]))
        XCTAssertEqual(state.settings["unknown"], .object(["v": .number(1)]))
    }

    func testIndependentDeviceEditsMergeWithoutLoss() {
        let r1: [String: PKJSON] = ["id": .string("one"), "mg": .number(50)]
        let r2: [String: PKJSON] = ["id": .string("two"), "mg": .number(100)]
        let local: [String: PKJSON] = ["id": .string("one"), "mg": .number(75)]
        let remote: [String: PKJSON] = ["id": .string("two"), "mg": .number(125)]
        let rows = PKMerge.rows(base: [r1, r2], local: [local, r2], remote: [r1, remote])
        XCTAssertEqual(rows?.count, 2)
        XCTAssertEqual(rows?.first?["mg"], .number(75))
        XCTAssertEqual(rows?.last?["mg"], .number(125))
    }

    func testSimultaneousSameRecordEditIsConflict() {
        let original: [String: PKJSON] = ["id": .string("one"), "mg": .number(50)]
        let local: [String: PKJSON] = ["id": .string("one"), "mg": .number(75)]
        let remote: [String: PKJSON] = ["id": .string("one"), "mg": .number(100)]
        XCTAssertNil(PKMerge.rows(base: [original], local: [local], remote: [remote]))
        XCTAssertNil(PKMerge.rows(base: [original], local: [], remote: [remote]))
    }

    func testFullSnapshotLastUploadRequestHasNoDeviceIdentity() throws {
        var state = PKCloudState()
        state.saveDose(PKDose(drug: "pregabalin", mg: 50,
            time: Date(timeIntervalSince1970: 1_700_000_000)))
        let data = try JSONEncoder().encode(PKLastUploadRequest(
            version: 2, state: state,
            operationId: "123e4567-e89b-12d3-a456-426614174000"))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["syncPolicy"] as? String, "last-upload-wins-v1")
        XCTAssertEqual(json["version"] as? Int, 2)
        XCTAssertEqual(json["operationId"] as? String, "123e4567-e89b-12d3-a456-426614174000")
        let payload = try XCTUnwrap(json["state"] as? [String: Any])
        for key in ["records", "courses", "intakes", "plans", "settings"] {
            XCTAssertNotNil(payload[key])
        }
        XCTAssertNil(json["deviceId"])
        XCTAssertNil(json["clientTimestamp"])
    }

    func testEncryptedDiskRoundTrip() throws {
        let username = "pkatlas_fixture_" + UUID().uuidString.lowercased()
        var state = PKCloudState()
        state.saveDose(PKDose(drug: "pregabalin", mg: 50,
                              time: Date(timeIntervalSince1970: 1_700_000_000)))
        let document = PKDiskDocument(state: state, base: PKCloudState(),
                                      version: 7, selectedDrug: "pregabalin",
                                      savedAt: .now)
        try PKSecureDisk.save(document, username: username)
        let loaded = try PKSecureDisk.load(username: username)
        XCTAssertEqual(loaded.state.records.count, 1)
        XCTAssertEqual(loaded.state.doses.first?.mg, 50)
        XCTAssertEqual(loaded.version, 7)
    }

    func testNativeSiriShortcutsRegistered() {
        XCTAssertEqual(AtlasAppShortcuts.appShortcuts.count, 3)
    }
}
