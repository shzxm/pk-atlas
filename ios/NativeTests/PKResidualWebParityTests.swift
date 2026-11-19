import XCTest
import JavaScriptCore
@testable import PKAtlas

final class PKResidualWebParityTests: XCTestCase {
    func testWebAndNativeComputeSameFiveDrugResidualHorizons() throws {
        let catalog = PKCatalog.bundled()
        let url = try XCTUnwrap(Bundle.main.url(forResource: "site-engine", withExtension: "js"))
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(source.contains("function residualWindowHours(drug)"))
        let context = try XCTUnwrap(JSContext())
        var failure: String?
        context.exceptionHandler = { _, value in failure = value?.toString() }
        context.evaluateScript("globalThis.structuredClone = x => JSON.parse(JSON.stringify(x));")
        context.evaluateScript(source)
        XCTAssertNil(failure, "Signed website JS must execute in the native model sandbox")
        for kidney in [Double?.none, 30.0] {
            let renal = kidney.map { "{crcl:\($0),source:'entered'}" } ?? "null"
            context.evaluateScript("renal=\(renal);MODEL_PARAMS.clear();EQUIVALENT_PEAK_CACHE.clear();")
            for id in ["amoxicillin", "ibuprofen", "acetaminophen", "pregabalin", "cetirizine"] {
                let drug = try XCTUnwrap(catalog.drugs.first(where: { $0.id == id }))
                let model = PKModel(catalog: catalog, doses: [], intakes: [], renalCrCl: kidney)
                let native = PKResidualWindow.hours(drug: drug, model: model)
                let js = try XCTUnwrap(context.evaluateScript(
                    "residualWindowHours(DRUGS.find(d=>d.id==='\(id)'))")?.toDouble())
                XCTAssertTrue(native.isFinite && js.isFinite)
                XCTAssertEqual(js, native, accuracy: 0.01,
                    "Residual truncation must not diverge for \(id) renal \(renal)")
            }
        }
        XCTAssertNil(failure)
    }
}
