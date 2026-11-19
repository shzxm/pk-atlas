import XCTest
@testable import PKAtlas

final class PKHistoryInsightsTests: XCTestCase {
    func testCalendarGroupingAcrossMidnightAndPeriodBoundary() throws {
        let calendar = Calendar(identifier: .gregorian)
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from:"2026-11-18T12:00:00Z"))
        let today = calendar.startOfDay(for: now)
        let beforeToday = today.addingTimeInterval(-90)
        let old = today.addingTimeInterval(-8*86400)
        let rows = [PKDose(id:"first",drug:"a",mg:10,time:now),
                    PKDose(id:"prev",drug:"a",mg:20,time:beforeToday),
                    PKDose(id:"old",drug:"b",mg:3,time:old)]
        let recent = PKHistoryInsights.groups(doses:rows,meals:[],drugNames:[:],
                           period:.week,now:now,calendar:calendar)
        XCTAssertEqual(recent.count,2)
        XCTAssertEqual(recent[0].doses[0].id,"first")
        XCTAssertEqual(recent[1].doses[0].id,"prev")
        XCTAssertEqual(recent[0].drugTotals[0].mg,10)
        XCTAssertEqual(PKHistoryInsights.groups(doses:rows,meals:[],drugNames:[:],
                           period:.all,now:now,calendar:calendar).count,3)
    }

    func testDoNotCombineDoseAndMealOrMixDifferentDrugMilligrams() {
        let now=Date(timeIntervalSince1970:1_790_000_000)
        let entries=[PKDose(id:"1",drug:"a",mg:100,time:now),
                     PKDose(id:"2",drug:"b",mg:20,time:now),
                     PKDose(id:"3",drug:"a",mg:40,time:now)]
        let meal=PKIntake(id:"m",time:now,kind:"meal",mealType:"regular",drink:"none",note:"")
        let groups=PKHistoryInsights.groups(doses:entries,meals:[meal],drugNames:[:],period:.all,now:now)
        XCTAssertEqual(groups[0].doses.count,3)
        XCTAssertEqual(groups[0].meals.count,1)
        XCTAssertEqual(groups[0].drugTotals.first{$0.drug=="a"}?.mg,140)
        XCTAssertEqual(groups[0].drugTotals.first{$0.drug=="b"}?.mg,20)
        let filtered=PKHistoryInsights.groups(doses:entries,meals:[meal],drugNames:[:],period:.all,
                       selectedDrug:"b",now:now)
        XCTAssertEqual(filtered[0].doses.count,1)
        XCTAssertTrue(filtered[0].meals.isEmpty)
    }

    func testCSVUsesStableUTCAndEscapesFormulasQuotesAndNewlines() {
        let now=Date(timeIntervalSince1970:1_790_000_000)
        let dose=PKDose(id:"dose1",drug:"x",mg:12.5,time:now)
        let meal=PKIntake(id:"meal1",time:now,kind:"meal",mealType:"highFat",drink:"tea",note:"=SUM(A1:A9),\"quoted\"\nline")
        let entries=PKHistoryInsights.groups(doses:[dose],meals:[meal],drugNames:["x":"=UNSAFE"],period:.all,now:now)
        let csv=PKHistoryInsights.csv(groups:entries,names:["x":"=UNSAFE"])
        XCTAssertTrue(csv.hasPrefix("\u{FEFF}"))
        XCTAssertTrue(csv.contains("\"'=UNSAFE\""))
        XCTAssertTrue(csv.contains("\"'=SUM(A1:A9),\"\"quoted\"\"\nline\""))
        XCTAssertTrue(csv.contains("\"已服用\""))
        XCTAssertTrue(csv.contains("\"dose1\""))
        XCTAssertTrue(csv.hasSuffix("\r\n"))
    }
}
