import SwiftUI
import AppIntents

@main
struct PKAtlasApp: App {
    @UIApplicationDelegateAdaptor(PKAtlasAppDelegate.self) private var appDelegate

    init() {
        AtlasAppShortcuts.updateAppShortcutParameters()
    }

    var body: some Scene {
        WindowGroup {
            NativeRootView()
                .onOpenURL { url in
                    guard url.scheme == "pkatlas", url.host == "open" else { return }
                }
        }
    }
}
