import XCTest
@testable import PKAtlas

final class PKDataHealthTests: XCTestCase {
    func testFindsDuplicatesFutureRowsUnknownDrugsAndInvalidDataWithoutMutation() throws {
        let now=Date(timeIntervalSince1970:1_790_000_000)
        var s=PKCloudState()
        let a=PKDose(id:"abc",drug:"d",mg:10,time:now)
        s.saveDose(a)
        s.saveDose(PKDose(id:"next",drug:"d",mg:10,time:now.addingTimeInterval(120)))
        s.saveDose(PKDose(id:"future",drug:"d",mg:10,time:now.addingTimeInterval(3600)))
        s.saveDose(PKDose(id:"unknown",drug:"private-drug",mg:30,time:now))
        s.records.append(s.records[0])
        s.records.append(["id":.string("invalid"),"time":.number(30)])
        s.intakes.append(["id":.string("meal-but-invalid"),"kind":.string("unknown")])
        let original=s
        let catalog=PKCatalog(drugs:[PKDrug(id:"d",name:"known",en:nil,kind:nil,
            refDose:nil,cmax:nil,cmaxRange:nil,tmax:nil,tmaxRange:nil,
            halfLife:nil,defaultDose:nil,form:nil,note:nil,source:nil,url:nil,recordOnly:nil)],food:[:])
        let health=PKDataHealth.inspect(s,catalog:catalog,now:now)
        XCTAssertEqual(health.recordCount,6)
        XCTAssertEqual(health.duplicatedIDs,1)
        XCTAssertEqual(health.invalidRecords,1)
        XCTAssertEqual(health.unknownDrugRecords,1)
        XCTAssertEqual(health.futureActualRecords,1)
        XCTAssertTrue(health.similarRecords >= 1)
        XCTAssertEqual(health.invalidMeals,1)
        XCTAssertTrue(health.hasProblems)
        XCTAssertEqual(s,original,"Audit must never mutate or delete records")
    }

    func testPrivacySummaryNeverCopiesMedicationIdentifiersOrRawContent() {
        let now=Date(timeIntervalSince1970:1_790_000_000)
        var s=PKCloudState()
        s.saveDose(PKDose(id:"secret-uuid",drug:"my-private-med",mg:123.456,time:now))
        let health=PKDataHealth.inspect(s,catalog:PKCatalog(drugs:[],food:[:]),now:now)
        let summary=PKDataHealth.supportSummary(report:health,appVersion:"2.13（Build 19）",
                     localSaved:true,pendingSync:true,sessionVerified:false,modelAvailable:true)
        for secret in ["secret-uuid","my-private-med","123.456","https://","192.168.","token", "username"] {
            XCTAssertFalse(summary.localizedCaseInsensitiveContains(secret),"Leaked diagnostic string: \(secret)")
        }
        XCTAssertTrue(summary.contains("等待云端同步：是"))
        XCTAssertTrue(summary.contains("检查项 unknownDrug：1"))
    }

    func testEmptyDocumentReportsNoIssuesAndNoRepair() {
        let report=PKDataHealth.inspect(PKCloudState(),
            catalog:PKCatalog(drugs:[],food:[:]))
        XCTAssertFalse(report.hasProblems)
        XCTAssertTrue(report.issues.isEmpty)
    }
}
