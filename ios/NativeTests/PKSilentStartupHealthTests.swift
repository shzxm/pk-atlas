import XCTest
@testable import PKAtlas

final class PKSilentStartupHealthTests: XCTestCase {
    func testSessionChecksAreThrottledWithoutBlockingLocalUI() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        XCTAssertTrue(PKCloudSessionPolicy.shouldValidate(lastCheck: nil, at: now))
        XCTAssertFalse(PKCloudSessionPolicy.shouldValidate(lastCheck: now, at: now))
        XCTAssertFalse(PKCloudSessionPolicy.shouldValidate(
            lastCheck: now.addingTimeInterval(-15 * 60), at: now))
        XCTAssertTrue(PKCloudSessionPolicy.shouldValidate(
            lastCheck: now.addingTimeInterval(-20 * 60), at: now))
        XCTAssertTrue(PKCloudSessionPolicy.shouldValidate(lastCheck: now,
                                                         at: now, force: true))
    }

    func testHealthAutoreadEveryRealForegroundWithoutRapidDuplication() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        XCTAssertTrue(PKHealthAutomaticPolicy.shouldRead(lastAttempt: nil, at: now))
        XCTAssertFalse(PKHealthAutomaticPolicy.shouldRead(lastAttempt: now, at: now))
        XCTAssertFalse(PKHealthAutomaticPolicy.shouldRead(
            lastAttempt: now.addingTimeInterval(-24), at: now))
        XCTAssertTrue(PKHealthAutomaticPolicy.shouldRead(
            lastAttempt: now.addingTimeInterval(-25), at: now))
    }

    func testPreviouslyGrantedHealthPermissionIsNotRequestedAgainOnEveryLaunch() {
        let domain = "PKHealthAutoTest-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: domain)!
        defer { defaults.removePersistentDomain(forName: domain) }
        XCTAssertTrue(PKHealthAutomaticPolicy.needsFirstAuthorization(defaults))
        defaults.set(true, forKey: PKHealthAutomaticPolicy.authorizationAttemptedKey)
        XCTAssertFalse(PKHealthAutomaticPolicy.needsFirstAuthorization(defaults))
    }
}
