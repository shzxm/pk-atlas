import XCTest
import UIKit
@testable import PKAtlas

final class PKIteration214Tests: XCTestCase {
    func testNativeShortChartExactlyThreeHoursBackAndSixForward() {
        XCTAssertEqual(PKShortChart.before, 3 * 3600)
        XCTAssertEqual(PKShortChart.after, 6 * 3600)
        XCTAssertEqual(PKShortChart.sampleStep, 300)
        XCTAssertEqual(Int((PKShortChart.before + PKShortChart.after) / PKShortChart.sampleStep) + 1, 109)
    }

    func testHealthNameKeysStableAcrossSpacesPunctuationAndCase() {
        let first = PKHealthMedications.canonicalKey(" Amoxicillin  500 mg ")
        let second = PKHealthMedications.canonicalKey("amoxicillin-500mg")
        XCTAssertEqual(first, second)
        XCTAssertEqual(PKHealthMedications.canonicalKey("普 瑞 巴 林"), "普瑞巴林")
        XCTAssertLessThanOrEqual(PKHealthMedications.canonicalKey(String(repeating: "A",count:1000)).count,120)
    }

    @MainActor
    func testChineseHealthMedicationLabelCanAutoMatchSafely() {
        let catalog = PKCatalog.bundled()
        XCTAssertEqual(PKHealthMedications.matchCatalog("普瑞巴林胶囊 75 mg", catalog: catalog),
                       "pregabalin")
        XCTAssertNil(PKHealthMedications.matchCatalog("未知混合药物", catalog: catalog))
    }

    func testAuditReviewShowsSpecificFutureUnmatchedWithoutMutatingSource() {
        var snapshot=PKCloudState()
        let now=Date(timeIntervalSince1970:1_790_000_000)
        let a=PKDose(id:"dose-1",drug:"pregabalin",mg:50,time:now.addingTimeInterval(3600))
        snapshot.saveDose(a)
        let copy=snapshot
        let rows=PKDataReview.rows(for:"futureDose",snapshot:snapshot,
            catalog:PKCatalog.bundled(),now:now)
        XCTAssertEqual(rows.count,1)
        XCTAssertEqual(rows[0].dose?.id,"dose-1")
        XCTAssertTrue(rows[0].canEdit)
        XCTAssertEqual(snapshot,copy)
    }

    func testDetailedAuditNearDuplicateUsesChronologicalOrderEvenWhenRawJSONIsUnsorted() {
        let at=Date(timeIntervalSince1970:1_790_000_000)
        var s=PKCloudState()
        s.saveDose(PKDose(id:"late",drug:"pregabalin",mg:20,time:at.addingTimeInterval(120)))
        s.saveDose(PKDose(id:"first",drug:"pregabalin",mg:20,time:at))
        let rows=PKDataReview.rows(for:"nearDuplicate",snapshot:s,
                    catalog:PKCatalog.bundled(),now:at.addingTimeInterval(600))
        XCTAssertEqual(rows.count,1)
        XCTAssertEqual(rows[0].dose?.id,"late")
    }

    func testBrokenRecordAndDuplicateIDsCannotBeMassEdited() {
        var s=PKCloudState()
        let now=Date(timeIntervalSince1970:1_790_000_000)
        s.saveDose(PKDose(id:"same",drug:"pregabalin",mg:20,time:now))
        s.records.append(s.records[0])
        s.records.append(["id":.string("invalid"),"time":.string("not-a-timestamp")])
        let dupe=PKDataReview.rows(for:"duplicateID",snapshot:s,
                                  catalog:PKCatalog.bundled(),now:now)
        XCTAssertEqual(dupe.count,2)
        XCTAssertTrue(dupe.allSatisfy{ !$0.canEdit })
        let invalid=PKDataReview.rows(for:"invalidDose",snapshot:s,
                                     catalog:PKCatalog.bundled(),now:now)
        XCTAssertEqual(invalid.count,1)
        XCTAssertFalse(invalid[0].canEdit)
    }

    func testNoAppLevelDarkModeLockInInfoPlist() {
        XCTAssertNil(Bundle.main.object(forInfoDictionaryKey: "UIUserInterfaceStyle"),
            "iOS must own auto light/dark selection; forcing Dark in the IPA prevents it")
    }

    func testSystemPaletteDiffersBetweenLightAndDarkWithoutChangingNativeDark() {
        let light = PKSystemPalette.plotBackground.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))
        let dark = PKSystemPalette.plotBackground.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark))
        XCTAssertNotEqual(light.cgColor.components?.first, dark.cgColor.components?.first)
    }
}
