import Foundation
import Combine
import SwiftUI
import WebKit
import UIKit

struct AtlasSharedFile: Identifiable {
    let id = UUID()
    let url: URL
}

private final class WeakAtlasScriptHandler: NSObject, WKScriptMessageHandler {
    weak var owner: AtlasWebSession?
    init(_ owner: AtlasWebSession) { self.owner = owner }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        owner?.receiveBridgeMessage(message)
    }
}

final class AtlasWebSession: NSObject, ObservableObject {
    static let home = URL(string: "https://pk.example.com/")!
    private static let allowedHost = "pk.example.com"

    @Published private(set) var selectedSection: AtlasSection = .today
    @Published private(set) var syncState = "pending"
    @Published private(set) var isLoading = false
    @Published private(set) var isPageReady = false
    @Published private(set) var recordRevision = 0
    @Published private(set) var logoutRevision = 0
    @Published var downloadedFile: AtlasSharedFile?
    @Published var errorMessage = ""
    @Published var showError = false

    private var hasStarted = false
    private var downloadDestinations: [ObjectIdentifier: URL] = [:]

    // No native storage of username, password, access tokens, medication
    // records or cookies. The first-party WebKit store owns the web session.
    lazy var webView: WKWebView = {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.allowsInlineMediaPlayback = true
        configuration.userContentController.add(WeakAtlasScriptHandler(self),
                                                name: "atlasNative")

        // The native bridge exposes ONLY the sync state and selected tab.
        // It runs in the main frame; Swift also verifies HTTPS exact origin.
        let source = """
        (() => {
          if (window.__pkAtlasNativeBridge) return;
          window.__pkAtlasNativeBridge = true;
          // The site enforces CSP against injected <style> blocks. Setting
          // individual DOM style properties from the trusted native user
          // script keeps the page's CSP intact and corrects the mobile form.
          const fitToNative = () => {
            const set = (node, key, value) => {
              if (node) node.style.setProperty(key, value, 'important');
            };
            for (const id of ['appTabBar','edgeDock','edgeDockMenu']) {
              set(document.getElementById(id), 'display', 'none');
            }
            set(document.querySelector('.topbar'), 'display', 'none');
            set(document.querySelector('.intro'), 'display', 'none');
            set(document.querySelector('.stage-auth .layout'), 'padding-top', '18px');
            const remember = document.querySelector('.session-remember');
            set(remember, 'grid-column', '1 / -1');
            set(remember, 'display', 'flex');
            set(remember, 'width', '100%');
            set(remember, 'min-width', '0');
            set(remember, 'align-items', 'flex-start');
            set(remember, 'gap', '12px');
            const checkbox = remember?.querySelector('input[type="checkbox"]');
            set(checkbox, 'flex', '0 0 24px');
            set(checkbox, 'width', '24px');
            set(checkbox, 'height', '24px');
            set(checkbox, 'min-height', '24px');
            set(checkbox, 'margin', '0');
            const label = remember?.querySelector('span');
            set(label, 'display', 'block');
            set(label, 'flex', '1 1 auto');
            set(label, 'width', 'auto');
            set(label, 'min-width', '0');
            set(label, 'white-space', 'normal');
            const help = remember?.querySelector('small');
            set(help, 'display', 'block');
          };
          const valid = () => {
            try {
              return new URL(location.href).origin === 'https://pk.example.com';
            } catch { return false; }
          };
          const post = (kind, value) => {
            if (!valid()) return;
            try {
              window.webkit.messageHandlers.atlasNative.postMessage({kind, value});
            } catch {}
          };
          let lastCloudState = '';
          let wasLoggedIn = false;
          const update = () => {
            if (!valid()) return;
            fitToNative();
            // The native Liquid Glass toolbar replaces the website's own
            // bottom tabs and Duo floating dock. Keep the underlying
            // recording, modeling and account screens untouched.
            for (const id of ['appTabBar', 'edgeDock', 'edgeDockMenu']) {
              const element = document.getElementById(id);
              if (element) element.style.setProperty('display', 'none', 'important');
            }
            const topbar = document.querySelector('.topbar');
            if (topbar) topbar.style.setProperty('display', 'none', 'important');
            const status = document.getElementById('syncStatus');
            const cloudState = status?.dataset.sync || 'pending';
            post('sync', cloudState);
            // The existing website dispatches no reliable custom event when
            // a record is saved. Synchronization state transitions are the
            // only privacy-safe signal required to reschedule local alerts.
            if (cloudState === 'synced' && lastCloudState !== 'synced') {
              post('recordsChanged', true);
            }
            lastCloudState = cloudState;
            const isStandalone = !['/', '/index.html'].includes(location.pathname);
            const pageReady = isStandalone || ['stage-auth','stage-choose','stage-calc']
              .some(name => document.body?.classList.contains(name));
            if (pageReady) post('ready', true);
            const loggedIn = document.body?.classList.contains('stage-calc') === true;
            if (wasLoggedIn && document.body?.classList.contains('stage-auth')) {
              post('logout', true);
            }
            wasLoggedIn = loggedIn;
            post('section', document.body?.dataset.appView || 'today');
          };
          if (document.body) {
            const tabs = new MutationObserver(update);
            tabs.observe(document.body, {attributes:true,attributeFilter:['data-app-view', 'class']});
          }
          const syncElement = document.getElementById('syncStatus');
          if (syncElement) {
            const status = new MutationObserver(update);
            status.observe(syncElement, {
              attributes:true, attributeFilter:['data-sync'], childList:true, subtree:true
            });
          }
          window.addEventListener('pk-atlas-login', () => {
            post('login', true);
            update();
          });
          window.addEventListener('pk-atlas-logout', () => {
            post('logout', true);
            update();
          });
          window.addEventListener('pk-atlas-records-changed', () => {
            post('recordsChanged', true);
          });
          document.addEventListener('DOMContentLoaded', update, {once:true});
          update();
        })();
        """
        configuration.userContentController.addUserScript(
            WKUserScript(source: source, injectionTime: .atDocumentEnd,
                         forMainFrameOnly: true)
        )

        let browser = WKWebView(frame: .zero, configuration: configuration)
        browser.navigationDelegate = self
        browser.uiDelegate = self
        browser.allowsBackForwardNavigationGestures = true
        browser.scrollView.contentInsetAdjustmentBehavior = .automatic
        browser.isOpaque = false
        browser.backgroundColor = UIColor(red: 0.035, green: 0.07, blue: 0.11, alpha: 1)
        browser.scrollView.backgroundColor = browser.backgroundColor
        return browser
    }()

    var syncTitle: String {
        switch syncState {
        case "synced": return "已同步"
        case "saving": return "同步中"
        case "offline": return "本机离线"
        case "conflict": return "存在冲突"
        case "error": return "同步失败"
        default: return "正在检查"
        }
    }

    var syncSymbol: String {
        switch syncState {
        case "synced": return "checkmark.icloud"
        case "offline": return "wifi.slash"
        case "conflict", "error": return "exclamationmark.icloud"
        default: return "arrow.triangle.2.circlepath.icloud"
        }
    }

    func startIfNeeded() {
        guard !hasStarted else { return }
        hasStarted = true
        webView.load(URLRequest(url: Self.home, cachePolicy: .useProtocolCachePolicy))
    }

    func reload() {
        guard hasStarted else { startIfNeeded(); return }
        webView.reload()
    }

    func onForeground() {
        // Opening the app revalidates the server session through the site's
        // own foreground recovery, and enables local reminder revalidation.
        guard hasStarted else { startIfNeeded(); return }
        let script = """
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
        """
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    func select(_ section: AtlasSection) {
        selectedSection = section
        startIfNeeded()
        // Support pages are separate HTML documents. Return to the main
        // journal before selecting a tab; didFinish applies the requested
        // section after scripts and session restoration are initialized.
        if let path = webView.url?.path, path != "/" && path != "/index.html" {
            webView.load(URLRequest(url: Self.home))
            return
        }
        // All possible names come from a closed Swift enum, not user input.
        let js = "if (typeof appSetView === 'function') appSetView('\(section.rawValue)');"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func goBack() {
        if webView.canGoBack {
            webView.goBack()
        } else {
            select(.today)
        }
    }

    func openInternal(_ path: String) {
        // Do not accept arbitrary paths from JavaScript or external content.
        let whitelist: Set<String> = [
            "/notifications.html", "/quick.html", "/install.html"
        ]
        guard whitelist.contains(path), let url = URL(string: path, relativeTo: Self.home) else {
            return
        }
        webView.load(URLRequest(url: url))
    }

    private func trusted(_ url: URL) -> Bool {
        // URL components give a strict (scheme, host, port) check. Prefixes
        // like pk.example.com.attacker.example are never trusted.
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return false
        }
        return components.scheme?.lowercased() == "https"
            && components.host?.lowercased() == Self.allowedHost
            && (components.port == nil || components.port == 443)
            && components.user == nil && components.password == nil
    }

    private func showWebFailure(_ description: String) {
        isPageReady = true
        errorMessage = description
        showError = true
    }

    fileprivate func receiveBridgeMessage(_ message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame else { return }
        let origin = message.frameInfo.securityOrigin
        guard origin.protocol.lowercased() == "https",
              origin.host.lowercased() == Self.allowedHost,
              origin.port == 443 || origin.port == 0 else { return }
        guard let content = message.body as? [String: Any],
              let kind = content["kind"] as? String else { return }
        switch kind {
        case "sync":
            if let value = content["value"] as? String,
               Set(["pending", "saving", "synced", "offline", "conflict", "error"])
                .contains(value) {
                syncState = value
            }
        case "section":
            if let raw = content["value"] as? String,
               let section = AtlasSection(rawValue: raw) {
                selectedSection = section
            }
        case "ready":
            isPageReady = true
        case "recordsChanged", "login":
            recordRevision &+= 1
        case "logout":
            logoutRevision &+= 1
        default:
            break
        }
    }

    private func presentAlert(_ title: String, message: String,
                              prompt: Bool = false,
                              completion: @escaping (String?) -> Void) {
        guard let root = webView.window?.rootViewController else {
            completion(nil)
            return
        }
        var current = root
        while let presented = current.presentedViewController {
            current = presented
        }
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        if prompt { alert.addTextField() }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completion(nil) })
        alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in
            completion(prompt ? alert.textFields?.first?.text ?? "" : "yes")
        })
        current.present(alert, animated: true)
    }
}

// MARK: - Controlled first-party navigation and web dialogs

extension AtlasWebSession: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        isLoading = true
        isPageReady = false
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoading = false
        // Reinstate native navigation state after ordinary page navigation.
        if webView.url?.path == "/" { select(selectedSection) }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        isLoading = false
        if (error as NSError).code != NSURLErrorCancelled { showWebFailure(error.localizedDescription) }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        isLoading = false
        if (error as NSError).code != NSURLErrorCancelled { showWebFailure(error.localizedDescription) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let mainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        if !mainFrame {
            // Subresource decisions are subject to the website's own CSP/ATS.
            decisionHandler(.allow)
            return
        }
        if trusted(url) || url.scheme == "about" {
            decisionHandler(navigationAction.shouldPerformDownload ? .download : .allow)
            return
        }
        if url.scheme == "blob" {
            // A blob URL carries its creator origin in the nested URL.
            // Parse it rather than trusting a string prefix.
            let nested = String(url.absoluteString.dropFirst("blob:".count))
            if let creator = URL(string: nested), trusted(creator) {
                decisionHandler(.download)
                return
            }
        }
        if ["https", "mailto", "tel", "itms-apps", "shortcuts"].contains(url.scheme?.lowercased() ?? "") {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if navigationResponse.isForMainFrame,
           let response = navigationResponse.response as? HTTPURLResponse,
           response.value(forHTTPHeaderField: "Content-Disposition")?
            .lowercased().contains("attachment") == true {
            decisionHandler(.download)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction,
                 didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse,
                 didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        presentAlert("药时", message: message) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        presentAlert("确认操作", message: message) { answer in
            completionHandler(answer == "yes")
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        presentAlert("药时", message: prompt, prompt: true, completion: completionHandler)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        // target=_blank must not escape the trusted navigation check.
        guard let url = navigationAction.request.url else { return nil }
        if trusted(url) {
            webView.load(URLRequest(url: url))
        } else if ["https", "mailto", "tel", "shortcuts"].contains(url.scheme?.lowercased() ?? "") {
            UIApplication.shared.open(url)
        }
        return nil
    }
}

// MARK: - Export local files only after explicit browser download

extension AtlasWebSession: WKDownloadDelegate {
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let filename = URL(fileURLWithPath: suggestedFilename).lastPathComponent
        let safeName = filename.isEmpty ? "药时导出.json" : filename
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("PKAtlasExports", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let destination = directory.appendingPathComponent(safeName, isDirectory: false)
            downloadDestinations[ObjectIdentifier(download)] = destination
            completionHandler(destination)
        } catch {
            completionHandler(nil)
            showWebFailure("无法创建导出目录：" + error.localizedDescription)
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let destination = downloadDestinations.removeValue(forKey: ObjectIdentifier(download))
        else { return }
        downloadedFile = AtlasSharedFile(url: destination)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloadDestinations.removeValue(forKey: ObjectIdentifier(download))
        showWebFailure("导出文件失败：" + error.localizedDescription)
    }
}

struct ActivityPresenter: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
