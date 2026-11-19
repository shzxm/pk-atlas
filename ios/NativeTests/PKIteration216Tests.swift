import XCTest
@testable import PKAtlas

@MainActor
final class PKIteration216Tests: XCTestCase {
    func testMultilingualNamesAndStrengthSuffixes() {
        let catalog = PKCatalog.bundled()
        let matches: [(String, String, String)] = [
            ("amoxicillin 500mg tablets", "amoxicillin", "en_US"),
            ("阿莫西林胶囊 250mg", "amoxicillin", "zh_CN"),
            ("對乙醯氨基酚 500 mg", "acetaminophen", "zh_TW"),
            ("アモキシシリン 500mg", "amoxicillin", "ja_JP"),
            ("อะม็อกซีซิลลิน", "amoxicillin", "th_TH"),
            ("lyrica 75mg", "pregabalin", "en_US"),
            ("プレガバリン", "pregabalin", "ja_JP"),
            ("พรีกาบาลิน", "pregabalin", "th_TH"),
            ("Descovy", "prep_ftc_taf", "en_US"),
            ("FTC/TAF", "prep_ftc_taf", "en_US"),
            ("PrEP FTC/TAF", "prep_ftc_taf", "en_US")
        ]
        for (name, id, language) in matches {
            XCTAssertEqual(PKHealthMedications.matchCatalog(name, catalog: catalog,
                locale: Locale(identifier: language)), id, "Alias: \(name)")
        }
    }

    func testCuratedHealthAliasesBundledAndRecognized() throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "health-medication-aliases", withExtension: "json"))
        let raw = try Data(contentsOf: url)
        let manifest = try JSONDecoder().decode(PKHealthAliasDocument.self, from: raw)
        XCTAssertEqual(manifest.schemaVersion, 1)
        XCTAssertEqual(manifest.version, "2026-11-18-curated-01")
        XCTAssertEqual(manifest.aliases.count, 6)
        XCTAssertEqual(Set(manifest.aliases.keys), Set(PKCatalog.bundled().drugs.map(\.id)))
        XCTAssertEqual(PKHealthMedications.aliases, manifest.aliases)
    }

    func testAmbiguousOrUnknownHealthAliasesAreManualOnly() {
        let catalog = PKCatalog.bundled()
        for label in ["PrEP", "HIV PrEP", "Truvada", "阿莫西林加布洛芬", "未知药物"] {
            XCTAssertNil(PKHealthMedications.matchCatalog(label, catalog: catalog), label)
        }
        XCTAssertTrue(PKHealthMedications.isUnlinkedName("未关联 Apple 健康药物 · 请人工核对"))
    }

    func testAuditFingerprintChangesWhenRecordContentChanges() {
        var state = PKCloudState()
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let dose = PKDose(id: "future-216", drug: "amoxicillin", mg: 100,
                          time: now.addingTimeInterval(86_400))
        state.saveDose(dose)
        let catalog = PKCatalog.bundled()
        let first = PKDataReview.rows(for: "futureDose", snapshot: state,
            catalog: catalog, now: now)
        XCTAssertEqual(first.count, 1)
        XCTAssertEqual(first[0].fingerprint.count, 64)
        XCTAssertEqual(first[0].fingerprint, PKDataReview.rows(for: "futureDose",
            snapshot: state, catalog: catalog, now: now).first?.fingerprint)
        var changed = dose
        changed.mg = 125
        state.saveDose(changed)
        let second = PKDataReview.rows(for: "futureDose", snapshot: state,
            catalog: catalog, now: now)
        XCTAssertNotEqual(first[0].fingerprint, second[0].fingerprint)
    }

    func testBundledChartShowsExpectedVisibleHoursAndExplicitRecenter() throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "website-chart", withExtension: "html"))
        let html = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(html.contains("scale===55?12:scale===90?6:3"))
        XCTAssertTrue(html.contains("previous.scrollTo===data.scrollTo"))
        XCTAssertTrue(html.contains("LIGHT_CHART_COLORS"))
        XCTAssertTrue(html.contains("height(){const last=el('legend')"))
    }
}
