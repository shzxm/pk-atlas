import XCTest

final class PKAtlasUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testNativeNavigationExistsWithoutAccount() throws {
        let application = XCUIApplication()
        application.launch()
        XCTAssertTrue(application.buttons["atlas.nav.more"].waitForExistence(timeout: 30),
                      "Native Glass toolbar should be available even while website is loading")
        XCTAssertTrue(application.buttons["atlas.tab.today"].exists)
        XCTAssertTrue(application.buttons["atlas.tab.chart"].exists)
        XCTAssertTrue(application.buttons["atlas.tab.history"].exists)
        XCTAssertTrue(application.buttons["atlas.tab.my"].exists)
        XCTAssertTrue(application.buttons["atlas.nav.back"].exists)
    }

    func testSwitchingNativeTabsDoesNotCloseApp() throws {
        let application = XCUIApplication()
        application.launch()
        let history = application.buttons["atlas.tab.history"]
        XCTAssertTrue(history.waitForExistence(timeout: 30))
        history.tap()
        XCTAssertTrue(application.buttons["atlas.nav.more"].exists)
        let chart = application.buttons["atlas.tab.chart"]
        chart.tap()
        XCTAssertTrue(application.buttons["atlas.tab.today"].exists)
        application.buttons["atlas.tab.today"].tap()
        XCTAssertTrue(application.buttons["atlas.tab.my"].exists)
    }

    func testLiveWebsiteLoginScreenLoads() throws {
        // Verify actual WKWebView content, not just the SwiftUI shell.
        // This test never submits credentials or modifies medical data.
        let application = XCUIApplication()
        application.launch()
        let web = application.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 90), "The embedded WebKit view must exist")
        let loginHeading = application.staticTexts["登录药时"]
        XCTAssertTrue(loginHeading.waitForExistence(timeout: 100),
                      "The actual HTTPS login content must load")
        XCTAssertTrue(application.secureTextFields.firstMatch.exists,
                      "The login form must include a password field")
    }

    func testNativeMoreMenuCanOpen() throws {
        let application = XCUIApplication()
        application.launch()
        let more = application.buttons["atlas.nav.more"]
        XCTAssertTrue(more.waitForExistence(timeout: 30))
        more.tap()
        XCTAssertTrue(application.buttons["通知设置"].waitForExistence(timeout: 10))
    }
}
