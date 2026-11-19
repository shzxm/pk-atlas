import XCTest
@testable import PKAtlas

@MainActor
final class PKIteration218Tests: XCTestCase {
    func testPrecisionIsOverridableInRenderedPayload() throws {
        let p = PKWebsiteChartPoint(t: 1000,c: 2.0,unfed: 1.8,eq: 100,
                                     eqPreview: nil,bloodPreview: nil,noFoodPreview: nil)
        var payload = PKWebsiteChartPayload(drugId: "pregabalin", drugName: "普瑞巴林",
            start: 0, end: 48*3600*1000, scale: 55, points: [p], records: [], planned: [],
            meals: [], referenceBlood: nil, referenceEquivalent: nil, target: nil,
            adoptedVariant: nil, probeTime: 1000, scrollTo: 1000,
            foodEffectPoint: nil, previewFoodEffect: false, foodType: nil,
            mealMessages: [], serverVerified: false)
        payload.scale = 140
        let encoded = try JSONEncoder().encode(payload)
        let data = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        XCTAssertEqual(data["scale"] as? Int, 140)
    }

    func testSessionResponseTypesMatchServerContracts() throws {
        let single = try JSONDecoder().decode(DeviceSessionsNativeView.SingleRevoke.self,
            from: Data("{\"ok\":true,\"revoked\":true}".utf8))
        XCTAssertTrue(single.revoked)
        let bulk = try JSONDecoder().decode(DeviceSessionsNativeView.BulkRevoke.self,
            from: Data("{\"ok\":true,\"revoked\":3}".utf8))
        XCTAssertEqual(bulk.revoked, 3)
    }

    func testAdoptedAndCandidateNavigationShareSameDestination() {
        let store = NativeAppStore.shared
        store.jumpToInverseChart(variant: "A")
        XCTAssertEqual(store.activeTab, .inverse)
        XCTAssertEqual(store.inverseChartRequestVariant, "A")
        store.jumpToInverseChart(variant: "adopted")
        XCTAssertEqual(store.activeTab, .inverse)
        XCTAssertEqual(store.inverseChartRequestVariant, "adopted")
    }
}
