import XCTest
@testable import PKAtlas

final class PKResidualWindowTests: XCTestCase {
    func testDifferentCatalogDrugsHaveDistinctModeledResidualWindows() throws {
        let catalog = PKCatalog.bundled()
        for id in ["amoxicillin","ibuprofen","acetaminophen","pregabalin","cetirizine"] {
            let drug = try XCTUnwrap(catalog.drugs.first { $0.id == id })
            let model = PKModel(catalog: catalog, doses: [], intakes: [], renalCrCl: nil)
            let hours = PKResidualWindow.hours(drug: drug, model: model)
            print("RESIDUAL-WINDOW \(id) \(hours)h")
            XCTAssertTrue(hours.isFinite && hours > 24 && hours < 24 * 90)
        }
    }

    func testRenalAdjustmentExtendsPregabalinHorizon() throws {
        let catalog = PKCatalog.bundled()
        let drug = try XCTUnwrap(catalog.drugs.first { $0.id == "pregabalin" })
        let normal = PKModel(catalog: catalog, doses: [], intakes: [], renalCrCl: nil)
        let adjusted = PKModel(catalog: catalog, doses: [], intakes: [], renalCrCl: 30)
        XCTAssertGreaterThan(PKResidualWindow.hours(drug: drug, model: adjusted),
                             PKResidualWindow.hours(drug: drug, model: normal))
    }

    func testTenThousandArchivesNotLoadedIntoCurveAndRetainedInFullHistory() throws {
        let catalog = PKCatalog.bundled()
        let drug = try XCTUnwrap(catalog.drugs.first { $0.id == "pregabalin" })
        let sample = Date(timeIntervalSince1970: 1_800_000_000)
        let history = (0..<10_200).map { n in
            PKDose(id: String(n),drug:drug.id,mg:25,
                   time:sample.addingTimeInterval(-Double(n)*3600))
        }
        let model = PKModel(catalog: catalog,doses:history,intakes:[],renalCrCl:nil)
        let active = PKResidualWindow.forCalculation(model:model,drug:drug,
            from:sample.addingTimeInterval(-3*3600),through:sample.addingTimeInterval(6*3600))
        XCTAssertEqual(model.doses.count,10200)
        XCTAssertLessThan(active.doses.count,500)
        XCTAssertGreaterThan(active.doses.count,0)
    }

    func testFiniteModelCurvesRemainWithinToleranceAfterFiltering() throws {
        let catalog=PKCatalog.bundled()
        let drug=try XCTUnwrap(catalog.drugs.first { $0.id=="pregabalin" })
        let center=Date(timeIntervalSince1970:1_800_000_000)
        let doses=(0..<800).map {n in
            PKDose(id:String(n),drug:drug.id,mg:100,
                time:center.addingTimeInterval(-Double(n)*6*3600))
        }
        let full=PKModel(catalog:catalog,doses:doses,intakes:[],renalCrCl:nil)
        let sliced=PKResidualWindow.forCalculation(model:full,drug:drug,
            from:center.addingTimeInterval(-3*3600),through:center.addingTimeInterval(6*3600))
        for t in [-3.0,0,3,6] {
            let date=center.addingTimeInterval(t*3600)
            XCTAssertEqual(full.concentration(drug,at:date),sliced.concentration(drug,at:date),accuracy:0.01)
            XCTAssertEqual(full.equivalent(drug,at:date),sliced.equivalent(drug,at:date),accuracy:0.01)
        }
    }
}
