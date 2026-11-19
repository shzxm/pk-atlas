import XCTest
@testable import PKAtlas

final class PKServerMathTests: XCTestCase {
    func testServerResponseSchemaIncludesEngineAndCurveValues() throws {
        let encoded = """
        {
            "source":"181-server-math",
            "catalogVersion":"abcdef",
            "engineVersion":"123456",
            "serverKernelSha256":"987654",
            "points":[
                {"time":1794892000000,"bloodMgL":1.234,
                 "equivalentMg":73.5,"unfedMgL":1.02,
                 "plannedBloodMgL":2.2,"plannedEquivalentMg":140.0}
            ]
        }
        """.data(using: .utf8)!
        let response = try JSONDecoder().decode(PKServerMath.Response.self, from: encoded)
        XCTAssertEqual(response.source, "181-server-math")
        XCTAssertEqual(response.points.count, 1)
        XCTAssertEqual(response.points[0].bloodMgL, 1.234, accuracy: 0.000001)
        XCTAssertEqual(response.points[0].plannedEquivalentMg!, 140.0, accuracy: 0.000001)
    }

    func testLongHistoryIsSplitWithinServerResourceLimits() {
        let now: Int64 = 1_800_000_000_000
        let times = (0...600).map { now + Int64($0) * 240_000 }
        let records = (0..<355).map { i in
            PKServerMath.Entry(drug: "pregabalin", time: now - Int64(i+1)*3_600_000, mg: 1)
        }
        let planned = [PKServerMath.Entry(drug: "pregabalin", time: now+240_000, mg: 1)]
        let chunks = PKServerMath.boundedRequests(drugId: "pregabalin", times: times,
            records: records, planned: planned, meals: [], renalCrCl: nil)
        XCTAssertEqual(chunks.count, 5)
        XCTAssertEqual(chunks.flatMap(\.records).count, 355)
        XCTAssertEqual(chunks.flatMap(\.planned).count, 1)
        XCTAssertTrue(chunks.allSatisfy { request in
            request.times == times && request.records.count <= 300 &&
            request.records.count + request.planned.count <= 300 &&
            request.times.count * (request.records.count + request.planned.count) <= 60_000
        })
    }

    func testRequestDoesNotIncludeCredentialsOrWriteInstructions() throws {
        let request = PKServerMath.Request(
            drugId: "pregabalin", times: [1794892000000],
            records: [PKServerMath.Entry(drug: "pregabalin", time: 1794891000000, mg: 75)],
            planned: [], meals: [], renalCrCl: nil)
        let encoded = try JSONEncoder().encode(request)
        let text = String(decoding: encoded, as: UTF8.self)
        XCTAssertTrue(text.contains("\"drugId\":\"pregabalin\""))
        XCTAssertFalse(text.contains("password"))
        XCTAssertFalse(text.contains("authorization"))
        XCTAssertFalse(text.contains("execute"))
    }
}
