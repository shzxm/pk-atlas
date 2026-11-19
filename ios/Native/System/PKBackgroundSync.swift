import Foundation
import BackgroundTasks

/// Opportunistic background reconciliation, not a replacement for APNs and
/// never a promise of delivery at a specific time. iOS owns the schedule.
enum PKBackgroundSync {
    static let identifier = "com.example.PKAtlas.refresh"

    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
            guard let refresh = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            let work = Task { @MainActor in
                await NativeAppStore.shared.start()
                await NativeAppStore.shared.refreshModel()
                await NativeAppStore.shared.refresh()
                await NativeReminderScheduler.shared.refresh()
                PKBackgroundSync.schedule()
                refresh.setTaskCompleted(success: !Task.isCancelled)
            }
            refresh.expirationHandler = { work.cancel() }
        }
    }

    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date.now.addingTimeInterval(45 * 60)
        // Ignore denied submissions. A foreground reconciliation is always
        // performed and local notification requests remain scheduled.
        try? BGTaskScheduler.shared.submit(request)
    }
}
