import XCTest
import WebKit
@testable import PKAtlas

@MainActor
final class PKWebsiteLightContrastTests: XCTestCase {
    private final class Loaded: NSObject, WKNavigationDelegate {
        var done: (() -> Void)?
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { done?() }
    }

    func testLightPageComputedTextContrastsAcrossHighTrafficPanels() async throws {
        let url = try XCTUnwrap(Bundle(for:type(of:self)).url(forResource:"website-light",withExtension:"css"))
        let css = try String(contentsOf:url,encoding:.utf8)
        let html = """
        <!doctype html><html><head><meta name="color-scheme" content="light dark"><style>\(css)</style></head>
        <body class="stage-calc">
          <main class="panel">
            <div class="push-panel"><p>推送状态文字</p><label class="push-switch">推送开关</label></div>
            <div class="renal-panel"><label>肾功能输入标签</label><p>说明信息</p></div>
            <div class="metric"><strong>模型浓度数值</strong><small>单位</small></div>
            <div class="scenario-card"><div class="scenario-metrics"><div><strong>候选模型</strong></div></div></div>
            <div class="day-summary"><strong>今日模型</strong></div>
            <div class="history-card"><small>历史摘要</small></div>
            <div class="record"><strong>服用记录</strong></div>
            <div class="field-label">剂量标签</div>
            <div class="session-remember"><span>登录提醒</span></div>
            <div class="wheel-dialog"><span class="wheel-label">时间选择</span></div>
            <button class="primary"><span>主要按钮</span></button>
          </main></body></html>
        """
        let web = WKWebView(frame:CGRect(x:0,y:0,width:390,height:850))
        web.overrideUserInterfaceStyle = .light
        let gate = Loaded();let loaded=expectation(description:"light website stylesheet loaded")
        gate.done = { loaded.fulfill() }
        web.navigationDelegate = gate
        web.loadHTMLString(html,baseURL:nil)
        await fulfillment(of:[loaded],timeout:20)
        let script = #"""
        (()=>{
          function rgb(str){return (str.match(/[0-9.]+/g)||[]).map(Number).slice(0,4)}
          function lum(nums){const f=x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4};return .2126*f(nums[0])+.7152*f(nums[1])+.0722*f(nums[2])}
          function ratio(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
          function bg(element){for(let node=element;node;node=node.parentElement){const c=rgb(getComputedStyle(node).backgroundColor);if(c.length===3||c[3]!==0)return c}return [255,255,255]}
          const selectors=['.push-panel p','.push-switch','.renal-panel label','.renal-panel p','.metric strong','.metric small','.scenario-metrics strong','.day-summary strong','.history-card small','.record strong','.field-label','.session-remember span','.wheel-label','button.primary span'];
          return selectors.map(sel=>{const el=document.querySelector(sel),fg=rgb(getComputedStyle(el).color),back=bg(el);return {selector:sel,ratio:ratio(fg,back),foreground:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}})
        })()
        """#
        let response = try await web.evaluateJavaScript(script)
        let result = try XCTUnwrap(response as? [[String:Any]])
        for item in result {
            let selector = item["selector"] as? String ?? "?"
            let contrast = item["ratio"] as? Double ?? 0
            print("WEBSITE-LIGHT-CONTRAST",selector,contrast,item)
            XCTAssertGreaterThanOrEqual(contrast,4.5,selector)
        }
    }
}
