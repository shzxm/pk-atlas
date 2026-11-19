import SwiftUI

/// Consistent numerical input treatment for chart reference values and
/// inverse mathematical constraints. Native iOS background adapts with theme.
struct PKCompactField: View {
    let title: String
    let hint: String
    @Binding var value: String
    let unit: String
    var tint: Color = .cyan
    var identifier: String = ""
    var emphasis: Bool = false
    var compact: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 5) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(tint).frame(width: 3, height: 13)
                Text(title)
                    .font(emphasis && !compact ? .subheadline.weight(.semibold) : .caption.weight(.semibold))
                    .foregroundStyle(emphasis ? .primary : .secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                TextField(hint, text: $value)
                    .keyboardType(.decimalPad)
                    .font(.system(.body, design: .rounded).weight(.medium))
                    .monospacedDigit()
                    .accessibilityIdentifier(identifier)
                Text(unit).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                    .fixedSize()
            }
            .padding(.horizontal, compact ? 8 : 12)
            .frame(minHeight: 46)
            .background(Color(uiColor: .secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12)
                .strokeBorder(emphasis ? tint.opacity(0.65) :
                    Color.primary.opacity(0.18), lineWidth: emphasis ? 1.5 : 1))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }
}
