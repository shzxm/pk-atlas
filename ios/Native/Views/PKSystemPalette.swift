import SwiftUI
import UIKit

/// Preserves the pre-existing dark appearance verbatim. In light mode use an
/// intentionally restrained blue-white canvas, with system material controls.
enum PKSystemPalette {
    static let background = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
        ? UIColor(red: 0.035, green: 0.055, blue: 0.095, alpha: 1)
        : UIColor(red: 0.962, green: 0.974, blue: 0.986, alpha: 1)
    })
    static let accent = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
        ? UIColor(red: 0.39, green: 0.80, blue: 0.99, alpha: 1)
        : UIColor(red: 0.10, green: 0.39, blue: 0.72, alpha: 1)
    })
    static let plotBackground = UIColor { traits in
        traits.userInterfaceStyle == .dark
        ? UIColor(red: 0.07, green: 0.10, blue: 0.13, alpha: 1)
        : UIColor(red: 0.972, green: 0.978, blue: 0.99, alpha: 1)
    }
}
