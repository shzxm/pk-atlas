import XCTest
@testable import PKAtlas

final class PKParityTests: XCTestCase {
    struct Fixture: Decodable {
        let drug: String
        let dose: Double
        let timeHours: [Double]
        let meal: String?
        let renal: Double?
        let values: [Value]
        struct Value: Decodable {
            let hours: Double
            let blood: Double
            let equivalent: Double
            let unfed: Double
        }
    }

    func testWebModelParity() throws {
        let catalog = PKCatalog.bundled()
        XCTAssertEqual(catalog.drugs.count, 6)
        guard let url = Bundle(for: type(of: self)).url(forResource: "PKReferenceFixtures", withExtension: "json")
            else { XCTFail("Missing model reference fixtures"); return }
        let fixtures = try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: url))
        XCTAssertEqual(fixtures.count, 8)
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        for scenario in fixtures {
            let meal = scenario.meal.map {
                PKIntake(id: "fixture-meal", time: start.addingTimeInterval(-1800),
                         kind: "meal", mealType: $0, drink: "none", note: "")
            }
            let dose = PKDose(id: "fixture-dose", drug: scenario.drug,
                              mg: scenario.dose, time: start)
            let model = PKModel(catalog: catalog, doses: [dose],
                                intakes: meal.map { [$0] } ?? [], renalCrCl: scenario.renal)
            let drug = try XCTUnwrap(model.drug(scenario.drug))
            for value in scenario.values {
                let time = start.addingTimeInterval(value.hours * 3600)
                let blood = model.concentration(drug, at: time)
                let unfed = model.concentration(drug, at: time, includeFood: false)
                let eq = model.equivalent(drug, at: time)
                XCTAssertEqual(blood, value.blood, accuracy: max(1e-8, abs(value.blood) * 1e-6),
                               "Blood \(scenario.drug), food=\(scenario.meal ?? "none"), h=\(value.hours)")
                XCTAssertEqual(unfed, value.unfed, accuracy: max(1e-8, abs(value.unfed) * 1e-6),
                               "Unfed \(scenario.drug), h=\(value.hours)")
                XCTAssertEqual(eq, value.equivalent, accuracy: max(1e-8, abs(value.equivalent) * 1e-6),
                               "Equivalent \(scenario.drug), h=\(value.hours)")
            }
        }
    }
}
