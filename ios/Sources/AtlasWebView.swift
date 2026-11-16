import SwiftUI
import WebKit

/// Reuses exactly one WKWebView across navigation and display-size changes.
/// Creating a new instance per tab would race the site's cloud autosave.
struct AtlasWebView: UIViewRepresentable {
    @ObservedObject var session: AtlasWebSession

    func makeUIView(context: Context) -> WKWebView {
        session.webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        // Deliberately no reload on SwiftUI state or Duo fold transitions.
    }
}
