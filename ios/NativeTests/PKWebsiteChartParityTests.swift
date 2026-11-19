import XCTest
@testable import PKAtlas

final class PKWebsiteChartParityTests: XCTestCase {
    func testWebsite48HourThreePrecisionLevelsAndPointCounts() {
        XCTAssertEqual(PKWebsiteChartSpecification.duration, 48 * 3600)
        XCTAssertEqual(PKWebsiteChartSpecification.scales, [55, 90, 140])
        XCTAssertEqual(PKWebsiteChartSpecification.count(scale: 55, viewport: 390), 548)
        XCTAssertEqual(PKWebsiteChartSpecification.count(scale: 90, viewport: 390), 600)
        XCTAssertEqual(PKWebsiteChartSpecification.count(scale: 140, viewport: 390), 600)
        XCTAssertEqual(PKWebsiteChartSpecification.minimumPoints, 288)
        XCTAssertEqual(PKWebsiteChartSpecification.maximumPoints, 600)
    }

    func testBundledRendererContainsTheSameWebsiteRGBAndStrokeGrammar() throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "website-chart", withExtension: "html"))
        let html = try String(contentsOf: url, encoding: .utf8)
        let websiteColors = ["#ffca83", "#58e5c4", "#b9c4d2", "#ff5da8",
            "#d7fc72", "#55aaff", "#cb9cff", "#ff9257"]
        for color in websiteColors { XCTAssertTrue(html.contains(color), "Missing website color \(color)") }
        for dash in ["6 5", "5 5", "2 5", "3 6", "3 5"] {
            XCTAssertTrue(html.contains("'" + dash + "'"), "Missing exact website dash: \(dash)")
        }
        XCTAssertTrue(html.contains("curveFill"))
        XCTAssertTrue(html.contains("LIGHT_CHART_COLORS"))
        XCTAssertTrue(html.contains("#chartWrap"))
        XCTAssertTrue(html.contains("timeScrubber"))
        XCTAssertTrue(html.contains("referenceEquivalent"))
        XCTAssertTrue(html.contains("chartCaption"))
        XCTAssertTrue(html.contains("mealStatus"))
        XCTAssertTrue(html.contains("crossingResult"))
        XCTAssertTrue(html.contains("48*3600000") == false, "Duration is supplied by native 48-hour timeline")
        XCTAssertFalse(html.replacingOccurrences(of: "http://www.w3.org/2000/svg", with: "").contains("http://"))
        XCTAssertFalse(html.contains("https://"))
        XCTAssertFalse(html.contains("fetch("))
        XCTAssertFalse(html.contains("XMLHttpRequest"))
    }

    func testAllChartDatasetsUseTheSameTypedPointSchema() throws {
        let element = PKWebsiteChartPoint(t: 1700000000000, c: 2.5,
            unfed: 2.2, eq: 100,
            eqPreview: 120, bloodPreview: 3, noFoodPreview: 2.8)
        let data = try JSONEncoder().encode(element)
        let j = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Double])
        XCTAssertEqual(j["t"], 1700000000000)
        XCTAssertEqual(j["bloodPreview"], 3)
        XCTAssertEqual(j["eqPreview"], 120)
        XCTAssertEqual(j["noFoodPreview"], 2.8)
    }
}
