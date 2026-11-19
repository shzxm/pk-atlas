import Foundation
import Combine
import CryptoKit
import Security

// Arbitrary JSON fields are preserved, including legacy Journal sources,
// per-dose metadata, imported user labels, and future server schema fields.
indirect enum PKJSON: Codable, Equatable {
    case string(String), number(Double), bool(Bool), array([PKJSON]), object([String: PKJSON]), null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let bool = try? container.decode(Bool.self) { self = .bool(bool) }
        else if let number = try? container.decode(Double.self) { self = .number(number) }
        else if let text = try? container.decode(String.self) { self = .string(text) }
        else if let list = try? container.decode([PKJSON].self) { self = .array(list) }
        else { self = .object(try container.decode([String: PKJSON].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        switch self {
        case .string(let v): try value.encode(v)
        case .number(let v): try value.encode(v)
        case .bool(let v): try value.encode(v)
        case .array(let v): try value.encode(v)
        case .object(let v): try value.encode(v)
        case .null: try value.encodeNil()
        }
    }
    var string: String? { if case .string(let v) = self { return v }; return nil }
    var number: Double? { if case .number(let v) = self { return v }; return nil }
    var object: [String: PKJSON]? { if case .object(let v) = self { return v }; return nil }
    var array: [PKJSON]? { if case .array(let values) = self { return values }; return nil }
    var arrayStringValues: [String]? {
        if case .array(let values) = self { return values.compactMap(\.string) }
        if case .string(let value) = self { return [value] }
        return nil
    }

}

struct PKCloudState: Codable, Equatable {
    var records: [[String: PKJSON]] = []
    var courses: [[String: PKJSON]] = []
    var intakes: [[String: PKJSON]] = []
    var plans: [String: PKJSON] = [:]
    var settings: [String: PKJSON] = [:]

    enum CodingKeys: String, CodingKey { case records, courses, intakes, plans, settings }
    init() {}
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        records = try c.decodeIfPresent([[String: PKJSON]].self, forKey: .records) ?? []
        courses = try c.decodeIfPresent([[String: PKJSON]].self, forKey: .courses) ?? []
        intakes = try c.decodeIfPresent([[String: PKJSON]].self, forKey: .intakes) ?? []
        plans = try c.decodeIfPresent([String: PKJSON].self, forKey: .plans) ?? [:]
        settings = try c.decodeIfPresent([String: PKJSON].self, forKey: .settings) ?? [:]
    }

    var doses: [PKDose] {
        records.compactMap { raw in
            guard let id = raw["id"]?.string,
                  let drug = raw["drug"]?.string,
                  let mg = raw["mg"]?.number, mg > 0, mg.isFinite,
                  let ms = raw["time"]?.number, ms.isFinite else { return nil }
            return PKDose(id: id, drug: drug, mg: mg,
                          time: Date(timeIntervalSince1970: ms / 1000),
                          courseId: raw["courseId"]?.string,
                          unit: raw["unit"]?.string ?? "mg",
                          isImported: (["ios-journal-17.1", "healthkit-read"].contains(raw["source"]?.string ?? "")))
        }
    }

    /// Future plans are separate from actual records and retain their plan
    /// status even after their intended time has passed. They never enter
    /// the baseline pharmacokinetic model until explicitly marked taken.
    var scheduledDoses: [PKDose] {
        guard case .array(let items)? = settings["scheduledDoses"] else { return [] }
        return items.compactMap { item in
            guard let row = item.object,
                  let id = row["id"]?.string, !id.isEmpty,
                  let drug = row["drug"]?.string,
                  let mg = row["mg"]?.number, mg.isFinite, mg > 0, mg < 100_000,
                  let when = row["time"]?.number, when.isFinite else { return nil }
            return PKDose(id: id, drug: drug, mg: mg,
                time: Date(timeIntervalSince1970: when / 1000),
                unit: row["unit"]?.string ?? "mg")
        }
    }
    mutating func saveScheduledDose(_ dose: PKDose) {
        var items = settings["scheduledDoses"]?.array ?? []
        let original = items.first(where: { $0.object?["id"]?.string == dose.id })?.object ?? [:]
        var item = original
        item["id"] = .string(dose.id)
        item["drug"] = .string(dose.drug)
        item["mg"] = .number(dose.mg)
        item["time"] = .number(dose.time.timeIntervalSince1970 * 1000)
        item["unit"] = .string(dose.unit)
        item["kind"] = .string("planned")
        if let index = items.firstIndex(where: { $0.object?["id"]?.string == dose.id }) {
            items[index] = .object(item)
        } else { items.append(.object(item)) }
        settings["scheduledDoses"] = .array(items)
    }
    mutating func deleteScheduledDose(_ id: String) {
        var items = settings["scheduledDoses"]?.array ?? []
        items.removeAll { $0.object?["id"]?.string == id }
        settings["scheduledDoses"] = .array(items)
    }
    /// Explicit confirmation is the sole transition from a mathematical
    /// plan to a taken dose. The same stable ID is used to prevent duplicates.
    mutating func confirmScheduledDose(_ id: String, at now: Date = .now) -> Bool {
        guard let dose = scheduledDoses.first(where: { $0.id == id }),
              dose.time <= now,
              !records.contains(where: { $0["id"]?.string == id }) else { return false }
        saveDose(dose)
        deleteScheduledDose(id)
        return true
    }

    var meals: [PKIntake] {
        intakes.compactMap { raw in
            guard let id = raw["id"]?.string,
                  let ms = raw["time"]?.number, ms.isFinite,
                  let kind = raw["kind"]?.string else { return nil }
            return PKIntake(id: id, time: Date(timeIntervalSince1970: ms / 1000),
                            kind: kind, mealType: raw["mealType"]?.string ?? "regular",
                            drink: raw["drink"]?.string ?? "none", note: raw["note"]?.string ?? "")
        }
    }

    var renalCrCl: Double? {
        guard let v = settings["renal"]?.object?["crcl"]?.number, v >= 15, v <= 150 else { return nil }
        return v
    }

    mutating func saveDose(_ dose: PKDose) {
        let existing = records.first { $0["id"]?.string == dose.id } ?? [:]
        var raw = existing
        raw["id"] = .string(dose.id)
        raw["drug"] = .string(dose.drug)
        raw["mg"] = .number(dose.mg)
        raw["time"] = .number(dose.time.timeIntervalSince1970 * 1000)
        raw["unit"] = .string(dose.unit)
        if let group = dose.courseId { raw["courseId"] = .string(group) }
        if let idx = records.firstIndex(where: { $0["id"]?.string == dose.id }) {
            records[idx] = raw
        } else {
            records.append(raw)
        }
    }
    mutating func deleteDose(_ id: String) { records.removeAll { $0["id"]?.string == id } }

    mutating func saveIntake(_ intake: PKIntake) {
        var raw = intakes.first { $0["id"]?.string == intake.id } ?? [:]
        raw["id"] = .string(intake.id)
        raw["time"] = .number(intake.time.timeIntervalSince1970 * 1000)
        raw["kind"] = .string(intake.kind)
        raw["mealType"] = .string(intake.mealType)
        raw["drink"] = .string(intake.drink)
        raw["note"] = .string(String(intake.note.prefix(100)))
        if let idx = intakes.firstIndex(where: { $0["id"]?.string == intake.id }) {
            intakes[idx] = raw
        } else { intakes.append(raw) }
    }
    mutating func deleteIntake(_ id: String) { intakes.removeAll { $0["id"]?.string == id } }
}

struct PKDiskDocument: Codable {
    var state: PKCloudState
    var base: PKCloudState
    var version: Int
    var selectedDrug: String
    var savedAt: Date
}

enum PKDataError: LocalizedError {
    case encryption(OSStatus), corrupt, missing
    var errorDescription: String? {
        switch self {
        case .encryption(let status): return "安全存储密钥不可用（系统状态：\(status)）"
        case .corrupt: return "本机数据校验失败，已保留原文件，未执行覆盖"
        case .missing: return "未找到本机备份"
        }
    }
}

struct PKSecureDisk {
    private static let service = "com.example.PKAtlas.encryption.v1"

    private static func key() throws -> SymmetricKey {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "localAES256",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data, data.count == 32 {
            return SymmetricKey(data: data)
        }
        if status != errSecItemNotFound { throw PKDataError.encryption(status) }
        let data = Data((0..<32).map { _ in UInt8.random(in: 0...255) })
        let insert: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "localAES256",
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        let added = SecItemAdd(insert as CFDictionary, nil)
        guard added == errSecSuccess else {
            throw PKDataError.encryption(added)
        }
        return SymmetricKey(data: data)
    }

    private static func file(_ username: String) throws -> URL {
        let hash = SHA256.hash(data: Data(username.utf8))
            .map { String(format: "%02x", $0) }.joined()
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PKAtlasPrivate", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("\(hash).sealed", isDirectory: false)
    }

    static func load(username: String) throws -> PKDiskDocument {
        let url = try file(username)
        guard FileManager.default.fileExists(atPath: url.path) else { throw PKDataError.missing }
        let bytes = try Data(contentsOf: url)
        guard let box = try? AES.GCM.SealedBox(combined: bytes),
              let plaintext = try? AES.GCM.open(box, using: try key()),
              let result = try? JSONDecoder().decode(PKDiskDocument.self, from: plaintext)
        else { throw PKDataError.corrupt }
        return result
    }

    static func save(_ document: PKDiskDocument, username: String) throws {
        let encoded = try JSONEncoder().encode(document)
        let box = try AES.GCM.seal(encoded, using: key())
        guard let ciphertext = box.combined else { throw PKDataError.encryption(errSecInternalComponent) }
        let url = try file(username)
        try ciphertext.write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                                              ofItemAtPath: url.path)
    }
}

struct PKMerge {
    /// Merge nested JSON objects by changed key. Different drugs' reference
    /// settings can be changed on separate devices without overwriting each
    /// other. Conflicting edits to the same leaf remain explicit conflicts.
    static func fields(base: [String: PKJSON], local: [String: PKJSON],
                       remote: [String: PKJSON]) -> [String: PKJSON]? {
        var result = remote
        for key in Set(base.keys).union(local.keys) {
            let prior = base[key], mine = local[key], theirs = remote[key]
            if mine == prior { continue }
            if theirs == prior || theirs == mine {
                result[key] = mine
            } else if case .object(let b)? = prior,
                      case .object(let l)? = mine,
                      case .object(let r)? = theirs,
                      let nested = fields(base: b, local: l, remote: r) {
                result[key] = .object(nested)
            } else if prior == nil, case .object(let l)? = mine,
                      case .object(let r)? = theirs,
                      let nested = fields(base: [:], local: l, remote: r) {
                result[key] = .object(nested)
            } else {
                return nil
            }
        }
        return result
    }

    /// Three-way merge by record ID. Unknown JSON fields remain untouched.
    /// A simultaneous modification/deletion to the SAME record is a conflict.
    static func rows(base: [[String: PKJSON]], local: [[String: PKJSON]],
                     remote: [[String: PKJSON]]) -> [[String: PKJSON]]? {
        func byID(_ rows: [[String: PKJSON]]) -> [String: [String: PKJSON]] {
            Dictionary(rows.compactMap { row in
                row["id"]?.string.map { ($0, row) }
            }, uniquingKeysWith: { _, newer in newer })
        }
        let b = byID(base), l = byID(local), r = byID(remote)
        let keys = Set(b.keys).union(l.keys).union(r.keys)
        var result = r
        for id in keys where l[id] != b[id] {
            // A change on another device to this same object must never be
            // silently resolved by local overwrite or deletion.
            guard r[id] == b[id] || r[id] == l[id] else { return nil }
            result[id] = l[id]
        }
        let remoteOrder = remote.compactMap { $0["id"]?.string }
        let localOrder = local.compactMap { $0["id"]?.string }
        let combinedOrder = remoteOrder + localOrder.filter { !remoteOrder.contains($0) }
        return combinedOrder.compactMap { result[$0] }
    }
}
