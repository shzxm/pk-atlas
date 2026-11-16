import SwiftUI

@main
struct PKAtlasApp: App {
    @StateObject private var webSession = AtlasWebSession()
    @StateObject private var reminders = ReminderCoordinator()

    var body: some Scene {
        WindowGroup {
            GlassRootView()
                .environmentObject(webSession)
                .environmentObject(reminders)
                .preferredColorScheme(.dark)
                .onOpenURL { url in
                    guard url.scheme == "pkatlas", url.host == "open" else { return }
                    // Foreground handoff only; no drug mutations or side effects.
                    webSession.startIfNeeded()
                }
                .tint(Color(red: 0.45, green: 0.79, blue: 0.98))
        }
    }
}
