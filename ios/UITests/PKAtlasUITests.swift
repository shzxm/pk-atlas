import XCTest

final class PKAtlasUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testNativeDashboardHasNoWebWrapper() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["native.add.dose"].waitForExistence(timeout: 30))
        // A cold launch with no login never displays PKAccountGateView.
        // Today, curve, inverse and history are immediately available.
        XCTAssertFalse(app.otherElements["native.account.locked"].exists)
        XCTAssertTrue(app.buttons["曲线"].exists)
        XCTAssertTrue(app.buttons["反算"].exists)
        XCTAssertTrue(app.buttons["历史"].exists)
        XCTAssertTrue(app.buttons["native.global.add.dose"].exists)
        XCTAssertFalse(app.webViews.firstMatch.exists,
                       "The native app must not ship a WKWebView as its primary UI")
        XCTAssertTrue(app.staticTexts["群体药代模型 · 不是个人血药实测，也不是用药建议"].exists)
    }

    func testRecordEditorIsNative() throws {
        let app = XCUIApplication()
        app.launch()
        let add = app.buttons["native.add.dose"]
        XCTAssertTrue(add.waitForExistence(timeout: 30))
        add.tap()
        XCTAssertTrue(app.textFields["native.dose.amount"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["native.dose.save"].exists)
        app.buttons["取消"].tap()
        XCTAssertTrue(add.exists)
    }

    func testInversePrecisionRespondsWithoutExtraRefresh() throws {
        let app = XCUIApplication()
        app.launch()
        let tab = app.buttons["反算"]
        XCTAssertTrue(tab.waitForExistence(timeout: 30))
        tab.tap()
        let precision = app.segmentedControls["native.inverse.chart.precision"]
        XCTAssertTrue(precision.waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["当前显示窗口约 12 小时"].exists)
        precision.buttons["精细 · 6 小时"].tap()
        XCTAssertTrue(app.staticTexts["当前显示窗口约 6 小时"].waitForExistence(timeout: 10))
        precision.buttons["超精细 · 3 小时"].tap()
        XCTAssertTrue(app.staticTexts["当前显示窗口约 3 小时"].waitForExistence(timeout: 10))
        precision.buttons["标准 · 12 小时"].tap()
        XCTAssertTrue(app.staticTexts["当前显示窗口约 12 小时"].waitForExistence(timeout: 10))
    }

    func testDuoMetricsRemainSideBySide() throws {
        let app = XCUIApplication()
        app.launch()
        let left = app.staticTexts["当前模型浓度"]
        let right = app.staticTexts["剂量等效量"]
        XCTAssertTrue(left.waitForExistence(timeout: 20))
        XCTAssertTrue(right.exists)
        XCTAssertLessThan(abs(left.frame.midY - right.frame.midY), 25,
            "Today metrics must share one row, even on compact iPhone screens")
        XCTAssertLessThan(left.frame.midX, right.frame.midX)
    }

    func testInverseConstraintsShareTwoColumns() throws {
        let app = XCUIApplication()
        app.launch()
        let tab = app.buttons["反算"]
        XCTAssertTrue(tab.waitForExistence(timeout: 25))
        tab.tap()
        let left = app.textFields["native.inverse.max-node"]
        let right = app.textFields["native.inverse.total-cap"]
        for _ in 0..<14 where !left.isHittable { app.swipeUp() }
        XCTAssertTrue(left.waitForExistence(timeout: 12))
        XCTAssertTrue(right.exists)
        XCTAssertLessThan(abs(left.frame.midY - right.frame.midY), 25,
            "Inverse max-node and total cap should share a row")
        XCTAssertLessThan(left.frame.midX, right.frame.midX)
    }

    func testMainCurveRendersAndNeverSilentlyStaysEmpty() throws {
        let app = XCUIApplication()
        app.launch()
        let tab = app.buttons["曲线"]
        XCTAssertTrue(tab.waitForExistence(timeout: 30))
        tab.tap()
        XCTAssertTrue(app.segmentedControls["native.chart.mode"].waitForExistence(timeout: 15))
        let plot = app.descendants(matching: .any).matching(identifier: "native.chart.curve").firstMatch
        XCTAssertTrue(plot.waitForExistence(timeout: 20),
            "A supported drug with the offline model must render the Swift Charts plot")
        XCTAssertFalse(app.staticTexts["暂无可绘制数据"].exists)
    }

    func testNativeChartAndHistoryTabs() throws {
        let app = XCUIApplication()
        app.launch()
        let chart = app.buttons["曲线"]
        XCTAssertTrue(chart.waitForExistence(timeout: 30))
        chart.tap()
        // The 9-hour overview is native Swift Charts again, no WKWebView.
        XCTAssertFalse(app.webViews.firstMatch.exists)
        XCTAssertTrue(app.segmentedControls["native.chart.mode"].waitForExistence(timeout: 15)
                   || app.buttons["native.chart.mode"].exists)
        XCTAssertTrue(app.buttons["定位现在"].exists)
        app.buttons["历史"].tap()
        XCTAssertFalse(app.webViews.firstMatch.exists)
        XCTAssertTrue(app.navigationBars["历史 · 时间足迹"].waitForExistence(timeout: 10))
    }

    func testHistoryCalendarTimelineAndPrivacyExportControlOffline() throws {
        let app = XCUIApplication()
        app.launch()
        let history = app.buttons["历史"]
        XCTAssertTrue(history.waitForExistence(timeout: 30))
        history.tap()
        XCTAssertTrue(app.navigationBars["历史 · 时间足迹"].waitForExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts["native.history.summary"].exists)
        XCTAssertTrue(app.segmentedControls["native.history.period"].exists
                   || app.buttons["native.history.period"].exists)
        XCTAssertTrue(app.buttons["native.history.export.csv"].exists)
        XCTAssertFalse(app.webViews.firstMatch.exists,
            "History and the local CSV exporter must remain native/offline")
    }

    func testBundledWebsiteChartCanActuallyScrollHorizontally() throws {
        let app = XCUIApplication()
        app.launch()
        let tab = app.buttons["反算"]
        XCTAssertTrue(tab.waitForExistence(timeout: 30))
        tab.tap()
        XCTAssertTrue(app.buttons["native.inverse.chart.now"].waitForExistence(timeout: 15))
        let graphic = app.webViews.firstMatch
        XCTAssertTrue(graphic.waitForExistence(timeout: 25))
        // Embedded HTML is app-bundled, with real horizontal overflow just
        // as the website has. A touch swipe must change the rendered pixels.
        let start = graphic.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.19))
        let finish = graphic.coordinate(withNormalizedOffset: CGVector(dx: 0.20, dy: 0.19))
        let before = graphic.screenshot().pngRepresentation
        start.press(forDuration: 0.15, thenDragTo: finish)
        let after = graphic.screenshot().pngRepresentation
        XCTAssertNotEqual(before, after,
            "The chart is displaying but not responding to horizontal touches")
    }

    func testGlobalAddOffersDoseAndMealWithoutSavingEither() throws {
        let app = XCUIApplication()
        app.launch()
        let add = app.buttons["native.global.add.dose"]
        XCTAssertTrue(add.waitForExistence(timeout: 30))
        add.tap()
        let meal = app.buttons["native.global.choice.meal"]
        XCTAssertTrue(meal.waitForExistence(timeout: 10))
        meal.firstMatch.tap()
        XCTAssertTrue(app.navigationBars["饮食记录"].waitForExistence(timeout: 10))
        app.buttons["取消"].tap()
        XCTAssertTrue(add.exists)
        add.tap()
        let dose = app.buttons["native.global.choice.dose"]
        XCTAssertTrue(dose.waitForExistence(timeout: 10))
        dose.firstMatch.tap()
        XCTAssertTrue(app.textFields["native.dose.amount"].waitForExistence(timeout: 10))
        app.buttons["取消"].tap()
    }

    func testAppleHealthSecondaryReviewAndDataAuditDetails() throws {
        let app = XCUIApplication()
        app.launch()
        app.buttons["我的"].tap()
        let health = app.buttons["native.health.open-review"]
        for _ in 0..<13 where !health.exists { app.swipeUp() }
        XCTAssertTrue(health.waitForExistence(timeout: 12))
        for _ in 0..<6 where !health.isHittable { app.swipeUp() }
        health.tap()
        XCTAssertTrue(app.navigationBars["Apple 健康 · 匹配与核对"].waitForExistence(timeout: 12))
        let count = app.descendants(matching: .any)
            .matching(identifier: "native.health.calculation-count").firstMatch
        XCTAssertTrue(count.waitForExistence(timeout: 10),
            "HealthKit calculation record count must be visible in its secondary page")
        let unmatched = app.switches["native.health.unmatched-only"]
        for _ in 0..<8 where !unmatched.exists { app.swipeUp() }
        XCTAssertTrue(unmatched.waitForExistence(timeout: 10),
            "Unmatched-only switch should remain reachable below near-time review section")
    }

    func testDataAuditDetailIsNavigableFromSettings() throws {
        let app = XCUIApplication()
        app.launch()
        app.buttons["我的"].tap()
        let audit = app.buttons["native.diagnostics.open-review"]
        for _ in 0..<10 where !audit.exists { app.swipeUp() }
        XCTAssertTrue(audit.waitForExistence(timeout: 12))
        for _ in 0..<5 where !audit.isHittable { app.swipeUp() }
        audit.tap()
        XCTAssertTrue(app.navigationBars["数据体检 · 核对清单"].waitForExistence(timeout: 12))
    }

    func testOfflineDataHealthOffersPrivacySafeTechnicalReport() throws {
        let app = XCUIApplication()
        app.launch()
        let settings = app.buttons["我的"]
        XCTAssertTrue(settings.waitForExistence(timeout: 30))
        settings.tap()
        let copy = app.buttons["native.diagnostics.copy"]
        for _ in 0..<12 where !copy.exists { app.swipeUp() }
        XCTAssertTrue(copy.waitForExistence(timeout: 15))
        for _ in 0..<8 where !copy.isHittable { app.swipeUp() }
        XCTAssertTrue(copy.isHittable)
        copy.tap()
        let copied = NSPredicate(format: "label CONTAINS %@", "已复制脱敏诊断摘要")
        expectation(for: copied, evaluatedWith: copy)
        waitForExpectations(timeout: 10)
    }

    func testAppReleaseCheckHasAnonymousManualControl() throws {
        let app = XCUIApplication()
        app.launch()
        let settings = app.buttons["我的"]
        XCTAssertTrue(settings.waitForExistence(timeout: 30))
        settings.tap()
        let update = app.buttons["native.release.check"]
        for _ in 0..<6 where !update.exists {
            app.swipeUp()
        }
        XCTAssertTrue(update.waitForExistence(timeout: 15),
                      "Version checking must be available without signing in")
        let status = app.staticTexts["native.release.status"]
        XCTAssertTrue(status.exists)
        for _ in 0..<6 where !update.isHittable { app.swipeUp() }
        XCTAssertTrue(update.isHittable)
        update.tap()
        let checked = NSPredicate(format: "label CONTAINS %@", "签名验证通过")
        expectation(for: checked, evaluatedWith: status)
        waitForExpectations(timeout: 25)
        XCTAssertFalse(app.webViews.firstMatch.exists)
    }

    func testSiriAndLocalNotificationsAreNative() throws {
        let app = XCUIApplication()
        app.launch()
        let settings = app.buttons["我的"]
        XCTAssertTrue(settings.waitForExistence(timeout: 30))
        settings.tap()
        XCTAssertTrue(app.buttons["开启系统通知"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["同步未来 7 天本机提醒"].exists)
        XCTAssertTrue(app.buttons["native.auth.browser"].exists)
        // App Intents discovery is separately verified by native XCTest;
        // Form accessibility groups static labels differently across Duo poses.
        XCTAssertFalse(app.webViews.firstMatch.exists)
    }
}
