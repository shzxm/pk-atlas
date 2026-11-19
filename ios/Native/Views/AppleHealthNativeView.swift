import SwiftUI

/// Dedicated human-reviewed HealthKit read ledger. No medication records are
/// created until the user selects entries and confirms the import.
struct AppleHealthNativeView: View {
    @EnvironmentObject private var store: NativeAppStore
    @StateObject private var health = PKHealthMedications.shared
    @State private var doseDrafts: [String: String] = [:]
    @State private var dateDrafts: [String: Date] = [:]
    @State private var importResult = ""
    @State private var showOnlyPending = false
    @State private var shareEvent: PKHealthDoseMatch?
    @State private var sharingStatus = ""
    @State private var confirmSeparate: PKHealthDoseMatch?

    private var rows: [PKHealthDoseMatch] {
        health.matches.filter { event in
            !showOnlyPending || store.healthMappedDrug(event) == nil ||
            store.resolvedHealthEvent(event).mg == nil ||
            store.nearbyHealthRecord(event) != nil
        }
    }
    private var chosen: [PKHealthDoseMatch] {
        health.matches.filter { store.healthEventSelected($0) }
            .map { store.resolvedHealthEvent($0) }
            .filter { $0.drugID != nil && $0.mg != nil }
    }
    private func doseText(_ event: PKHealthDoseMatch) -> Binding<String> {
        Binding(get: {
            doseDrafts[event.id] ?? store.resolvedHealthEvent(event).mg.map {
                $0.formatted(.number.precision(.fractionLength(0...4)))
            } ?? ""
        }, set: { doseDrafts[event.id] = $0 })
    }
    private func adjustedTime(_ event: PKHealthDoseMatch) -> Binding<Date> {
        Binding(get: { dateDrafts[event.id] ?? store.resolvedHealthEvent(event).time },
                set: { dateDrafts[event.id] = $0 })
    }
    private func parsedDose(_ event: PKHealthDoseMatch) -> Double? {
        guard let raw = Double(doseText(event).wrappedValue.replacingOccurrences(of: ",", with: ".")),
              raw.isFinite, raw > 0, raw < 100_000 else { return nil }
        return raw
    }
    private func saveReview(_ event: PKHealthDoseMatch, selected: Bool) {
        store.reviewHealthEvent(event, selected: selected,
            doseMG: parsedDose(event), correctedTime: adjustedTime(event).wrappedValue)
    }

    var body: some View {
        List {
            Section("已授权来源") {
                Label("Apple 健康为只读来源", systemImage: "heart.text.square")
                    .font(.headline)
                Text("自动读取：\(health.status)")
                    .font(.footnote).foregroundStyle(.secondary)
                Label("药名匹配：\(health.aliasSyncStatus)", systemImage: "text.book.closed")
                    .font(.caption).foregroundStyle(.secondary)
                if let at = health.lastReadAt {
                    Text("上次读取：\(at.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption2).foregroundStyle(.secondary)
                }
                HStack {
                    Text("近一年已服事件：\(health.matches.count) 条")
                    Spacer()
                    Text("云端对应表：\(store.healthMappingCount) 个")
                }
                .font(.caption)
                Label("Apple 健康进入计算记录：\(store.confirmedHealthRecordCount) 条", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .font(.caption)
                    .accessibilityIdentifier("native.health.calculation-count")
                Button {
                    Task { await health.requestAndRead() }
                } label: {
                    Label("刷新并检查系统授权", systemImage: "arrow.clockwise")
                }
                if health.reviewing { ProgressView("正在从 Apple 健康读取…") }
                if health.orphanDoseCount > 0 {
                    Label("\(health.orphanDoseCount) 条事件未能关联已授权药物名称，已保留，需逐条人工确认", systemImage: "exclamationmark.triangle")
                        .font(.caption).foregroundStyle(.orange)
                }
                if !health.approvedMedications.isEmpty {
                    DisclosureGroup("查看已读取的 \(health.approvedMedications.count) 种 Apple 健康药物名称") {
                        ForEach(Array(health.approvedMedications.enumerated()), id: \.offset) { _, name in
                            Text(name).font(.caption).textSelection(.enabled)
                        }
                    }
                }
                Text("首次授权由系统弹窗处理，后续打开 App 自动后台读取。手动匹配及调整会保存在药时账号的云端数据中，用于以后改进匹配；不会写回 Apple 健康。")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            Section("时间相近的服用记录 · 需要你确认") {
                let pending = health.matches.filter { store.nearbyHealthRecord($0) != nil }
                if pending.isEmpty {
                    Text("目前没有需要核对的相近时间记录。")
                        .font(.caption).foregroundStyle(.secondary)
                }
                ForEach(pending) { event in
                    if let existing = store.nearbyHealthRecord(event) {
                        VStack(alignment: .leading, spacing: 9) {
                            Text(event.medicationName).font(.subheadline.weight(.semibold))
                            Text("Apple 健康：\(event.time.formatted(date: .abbreviated, time: .shortened)) · \(event.quantityText)")
                                .font(.caption)
                            Text("药时已有：\(existing.time.formatted(date: .abbreviated, time: .shortened)) · \(existing.mg.formatted()) mg")
                                .font(.caption).foregroundStyle(.secondary)
                            Label("两条记录距离不足 15 分钟。可能是重复登记，也可能是两次独立服用。系统不会自行决定。",
                                  systemImage: "exclamationmark.triangle")
                                .font(.caption2).foregroundStyle(.orange)
                            HStack(spacing: 10) {
                                Button("是同一次 · 关联已有记录") {
                                    store.resolveNearbyHealthEvent(event, decision: .linkExisting)
                                }
                                .buttonStyle(.bordered)
                                .accessibilityIdentifier("native.health.nearby.link.\(event.id)")
                                Button("是另一笔 · 分开计入") { confirmSeparate = event }
                                    .buttonStyle(.borderedProminent)
                                    .accessibilityIdentifier("native.health.nearby.separate.\(event.id)")
                            }
                            Button("忽略此健康事件") {
                                store.resolveNearbyHealthEvent(event, decision: .ignore)
                            }
                            .font(.caption)
                        }
                        .padding(.vertical, 5)
                    }
                }
            }
            Section("已服记录自动匹配与人工调整") {
                Text("能够确认药名与实际 mg 剂量、且附近没有重复记录时，自动记入模型，只发送同步提示；时间接近时必须在上方选择关联或独立计入。")
                    .font(.caption).foregroundStyle(.secondary)

                Toggle("只看尚不能匹配的事件", isOn: $showOnlyPending)
                    .accessibilityIdentifier("native.health.unmatched-only")
                if rows.isEmpty {
                    ContentUnavailableView("没有符合筛选条件的健康事件",
                        systemImage: "heart.circle",
                        description: Text("检查健康授权，或关闭仅看未匹配筛选。"))
                }
                ForEach(rows) { event in
                    let resolved = store.resolvedHealthEvent(event)
                    DisclosureGroup {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("原始名称：\(event.medicationName)")
                                .font(.caption).textSelection(.enabled)
                            Text("健康原始剂量：\(event.quantityText)")
                                .font(.caption).foregroundStyle(.secondary)
                            Picker("手动匹配药物", selection: Binding(
                                get: { store.healthMappedDrug(event) ?? "" },
                                set: {
                                    if PKHealthMedications.isUnlinkedName(event.medicationName) {
                                        store.setHealthEventDrug(event, drugID: $0.isEmpty ? nil : $0)
                                    } else {
                                        store.setHealthMapping(medicationName: event.medicationName,
                                                               drugID: $0.isEmpty ? nil : $0)
                                    }
                                    store.reconcileAutomaticHealthEvents(health.matches)
                                }
                            )) {
                                Text("未匹配 · 人工确认").tag("")
                                ForEach(store.catalog.drugs) { drug in
                                    Text(drug.name).tag(drug.id)
                                }
                            }
                            .pickerStyle(.menu)
                            .accessibilityIdentifier("native.health.mapping.\(event.id)")
                            PKCompactField(title: "药时确认的实际剂量", hint: "请人工核对",
                                value: doseText(event), unit: "mg", tint: .pink)
                            DatePicker("药时采用的实际服用时间", selection: adjustedTime(event),
                                       displayedComponents: [.date, .hourAndMinute])
                            Text("若健康原始单位是片、粒或 mL，请核对标签后手动填写 mg；不能按数量自动换算。调整只影响药时导入/云端映射，不修改健康来源记录。")
                                .font(.caption2).foregroundStyle(.secondary)
                            Button {
                                saveReview(event, selected: store.healthEventSelected(event))
                            } label: {
                                Label("保存这条人工调整到药时云端", systemImage: "checkmark.icloud")
                            }
                            .disabled(parsedDose(event) == nil || store.healthMappedDrug(event) == nil ||
                                adjustedTime(event).wrappedValue > Date.now.addingTimeInterval(120))
                            .accessibilityIdentifier("native.health.save-review.\(event.id)")
                            Button {
                                shareEvent = event
                            } label: {
                                Label("贡献这条药名供云端词库人工维护", systemImage: "text.book.closed")
                            }
                            .disabled(PKHealthMedications.isUnlinkedName(event.medicationName))
                            .font(.caption)
                            Text("此操作需单独确认。仅提交药名、语言和您确认的药物对应关系；不会提交服药时间、剂量、健康事件 UUID 或账号标识到公共词库。")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 8)
                    } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Toggle("记录已确认", isOn: Binding(
                                get: { store.healthEventSelected(event) },
                                set: { saveReview(event, selected: $0) }
                            ))
                            .labelsHidden()
                            .disabled(store.healthMappedDrug(event) == nil || parsedDose(event) == nil)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(event.medicationName).font(.subheadline.bold())
                                Text(event.time, format: .dateTime.month().day().hour().minute())
                                    .font(.caption).foregroundStyle(.secondary)
                                Text(resolved.drugID.flatMap { id in
                                    store.catalog.drugs.first(where: { $0.id == id })?.name
                                } ?? "尚未匹配药时药物")
                                    .font(.caption2)
                                    .foregroundStyle(resolved.drugID == nil ? .orange : .mint)
                            }
                            Spacer(minLength: 2)
                            Text(resolved.mg.map { "\($0.formatted()) mg" } ?? "待核对剂量")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            Section("确认事件和云端计算记录") {
                Text("已识别并核对 \(chosen.count) 条。无需逐条手动导入；自动匹配会更新模型和云端，相近时间记录仍需上述人工确认。")
                    .font(.subheadline)
                Button {
                    let summary = store.reconcileConfirmedHealthReviews()
                    importResult = "新增 \(summary.inserted) 条 · 关联 \(summary.linked) 条 · 更新 \(summary.updated) 条 · 待人工核对 \(summary.skipped) 条。"
                } label: {
                    Label("重新核对已确认事件与模型记录", systemImage: "arrow.triangle.2.circlepath")
                }
                .accessibilityIdentifier("native.health.import-selected")
                if !importResult.isEmpty { Text(importResult).font(.caption).foregroundStyle(.mint) }
                if !sharingStatus.isEmpty { Text(sharingStatus).font(.caption).foregroundStyle(.secondary) }
                Text(store.syncStatus).font(.caption2).foregroundStyle(.secondary)
                Text("账号未登录时先保存在本机加密快照；之后按现有最后成功上传规则同步。药时不会把数学假设节点或健康的待服事件登记成实际服用。")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
        .alert("确认这确实是另一笔服用吗？", isPresented: Binding(
            get: { confirmSeparate != nil },
            set: { if !$0 { confirmSeparate = nil } }
        )) {
            Button("确认作为另一笔独立服用", role: .destructive) {
                if let event = confirmSeparate {
                    store.resolveNearbyHealthEvent(event, decision: .separateIntake)
                }
                confirmSeparate = nil
            }
            Button("取消", role: .cancel) { confirmSeparate = nil }
        } message: {
            Text("将产生一条新的实际服用记录，并影响模型剂量累计。仅在确实发生了两次服用时才确认。")
        }
        .navigationTitle("Apple 健康 · 匹配与核对")
        .onAppear { store.reconcileConfirmedHealthReviews() }
        .navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
        .confirmationDialog("向药时服务器贡献药物名称？", isPresented: Binding(
            get: { shareEvent != nil }, set: { if !$0 { shareEvent = nil } }
        )) {
            Button("确认仅分享药名与匹配结果") {
                guard let event = shareEvent else { return }
                let drug = store.healthMappedDrug(event)
                Task {
                    do {
                        try await PKCloudAPI.shared.submitHealthAlias(name: event.medicationName, drugID: drug)
                        sharingStatus = "词条已提交审核，不会未经确认自动加入其他用户的匹配词库。"
                    } catch { sharingStatus = "提交失败：" + error.localizedDescription }
                }
                shareEvent = nil
            }
            Button("取消", role: .cancel) { shareEvent = nil }
        } message: {
            Text("这是独立的自愿贡献，不会发送实际服药事件、剂量、时间或 Apple 健康标识。名称可能涉及医疗隐私，请自行确认是否共享。")
        }
    }
}
