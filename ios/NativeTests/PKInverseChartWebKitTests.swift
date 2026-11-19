import XCTest
import WebKit
@testable import PKAtlas

@MainActor
final class PKInverseChartWebKitTests: XCTestCase {
    private final class Loaded: NSObject, WKNavigationDelegate {
        var done: (() -> Void)?
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { done?() }
    }

    func testCalculatedCurveDrawnEvenWithNoVisibleDoseMarkers() async throws {
        let file = try XCTUnwrap(Bundle.main.url(forResource: "website-chart",withExtension:"html"))
        let web = WKWebView(frame: CGRect(x:0,y:0,width:390,height:600))
        let delegate = Loaded()
        let loaded = expectation(description:"bundled SVG chart loaded")
        delegate.done = { loaded.fulfill() }
        web.navigationDelegate = delegate
        web.loadFileURL(file,allowingReadAccessTo:file.deletingLastPathComponent())
        await fulfillment(of:[loaded],timeout:20)
        let now = 1_800_000_000_000.0
        let payload = PKWebsiteChartPayload(
            drugId:"pregabalin",drugName:"普瑞巴林",start:now,end:now+48*3600*1000,
            scale:55,
            points:[PKWebsiteChartPoint(t:now,c:1.1,unfed:1.1,eq:20,eqPreview:nil,bloodPreview:nil,noFoodPreview:nil),
                    PKWebsiteChartPoint(t:now+24*3600*1000,c:0.8,unfed:0.8,eq:18,eqPreview:nil,bloodPreview:nil,noFoodPreview:nil),
                    PKWebsiteChartPoint(t:now+48*3600*1000,c:0.3,unfed:0.3,eq:4,eqPreview:nil,bloodPreview:nil,noFoodPreview:nil)],
            records:[],planned:[],meals:[],referenceBlood:nil,referenceEquivalent:nil,
            target:nil,adoptedVariant:nil,probeTime:now,scrollTo:now,
            foodEffectPoint:nil,previewFoodEffect:false,foodType:nil,mealMessages:[],serverVerified:false)
        let encoded = try JSONEncoder().encode(payload)
        let raw = try XCTUnwrap(String(data:encoded,encoding:.utf8))
        let eval = "window.PKAtlasChart.render(\(raw));window.PKAtlasChart.inspect()"
        let value = try await web.evaluateJavaScript(eval)
        let result = try XCTUnwrap(value as? [String:Any])
        print("INVERSE-SVG-WEBKIT",result)
        XCTAssertEqual(result["sampleCount"] as? Int,3)
        XCTAssertGreaterThanOrEqual(result["paths"] as? Int ?? 0,3,
            "SVG must render computed lines even if the selected day has no dose markers")
        XCTAssertGreaterThan(result["contentWidth"] as? Int ?? 0,
                             result["viewport"] as? Int ?? 0)
    }
}
