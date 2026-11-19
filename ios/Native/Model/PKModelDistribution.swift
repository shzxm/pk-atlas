import Foundation
import CryptoKit

/// Delivered through the official HTTPS API. SHA-256 detects damage or
/// inconsistent publication; HTTPS protects the origin/authenticity in transit.
/// No executable code is downloaded or evaluated.
struct PKRemoteModelPackage: Codable {
    let schemaVersion: Int
    let catalogVersion: String
    let engineVersion: String
    let catalogBase64: String
    let maxSupportedClientSchema: Int
}

struct PKVerifiedModel {
    let catalog: PKCatalog
    let version: String
}

enum PKModelUpdateError: LocalizedError {
    case incompatibleEngine
    case incompatibleSchema
    case invalidDigest
    case invalidCatalog(String)

    var errorDescription: String? {
        switch self {
        case .incompatibleEngine:
            return "网站已更新药代计算公式；此版本 App 暂不加载新参数，请安装兼容的新版本。"
        case .incompatibleSchema:
            return "网站模型格式超出当前 App 支持范围，请更新 App。"
        case .invalidDigest:
            return "模型数据完整性校验未通过，已保留本机旧版本。"
        case .invalidCatalog(let reason):
            return "模型数据校验失败（\(reason)），已保留本机旧版本。"
        }
    }
}

enum PKModelDistribution {
    static let maximumCatalogBytes = 512 * 1024

    static var expectedEngineVersion: String? {
        guard let file = Bundle.main.url(forResource: "engine-compat", withExtension: "json"),
              let data = try? Data(contentsOf: file),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              (obj["schemaVersion"] as? Int) == 1,
              let version = obj["engineVersion"] as? String,
              validSHA(version) else { return nil }
        return version
    }

    static var cacheURL: URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first?.appendingPathComponent("PKAtlas/verified-model-v1.json")
    }

    private static func validSHA(_ value: String) -> Bool {
        value.count == 64 && value.utf8.allSatisfy { byte in
            (byte >= 48 && byte <= 57) || (byte >= 97 && byte <= 102)
        }
    }

    static func verify(_ package: PKRemoteModelPackage, expectedEngine: String,
                       bundled: PKCatalog, previous: PKCatalog? = nil) throws -> PKVerifiedModel {
        guard package.schemaVersion == 1, package.maxSupportedClientSchema >= 1 else {
            throw PKModelUpdateError.incompatibleSchema
        }
        guard validSHA(expectedEngine), validSHA(package.engineVersion),
              package.engineVersion == expectedEngine else {
            throw PKModelUpdateError.incompatibleEngine
        }
        guard validSHA(package.catalogVersion),
              package.catalogBase64.utf8.count <= 750_000,
              let raw = Data(base64Encoded: package.catalogBase64),
              !raw.isEmpty, raw.count <= maximumCatalogBytes else {
            throw PKModelUpdateError.invalidDigest
        }
        let hash = SHA256.hash(data: raw).map { String(format: "%02x", $0) }.joined()
        guard hash == package.catalogVersion else { throw PKModelUpdateError.invalidDigest }
        let catalog: PKCatalog
        do { catalog = try JSONDecoder().decode(PKCatalog.self, from: raw) }
        catch { throw PKModelUpdateError.invalidCatalog("无法解析目录") }
        try validate(catalog, bundled: bundled, previous: previous)
        return PKVerifiedModel(catalog: catalog, version: hash)
    }

    static func validate(_ catalog: PKCatalog, bundled: PKCatalog,
                         previous: PKCatalog? = nil) throws {
        let ids = Set(catalog.drugs.map(\.id))
        guard !catalog.drugs.isEmpty, catalog.drugs.count <= 500,
              ids.count == catalog.drugs.count else {
            throw PKModelUpdateError.invalidCatalog("药物数量或唯一性")
        }
        // Historical records must never lose their referenced drug IDs.
        for old in (bundled.drugs + (previous?.drugs ?? [])) where !ids.contains(old.id) {
            throw PKModelUpdateError.invalidCatalog("不允许丢失已有药物 \(old.id)")
        }
        func positive(_ value: Double?, min: Double, max: Double) -> Bool {
            guard let value else { return false }
            return value.isFinite && value >= min && value <= max
        }
        func secureURL(_ value: String?) -> Bool {
            guard let value else { return true }
            guard value.utf8.count <= 2000, let url = URLComponents(string: value),
                  url.scheme == "https", let host = url.host, !host.isEmpty,
                  url.user == nil, url.password == nil else { return false }
            return true
        }
        for drug in catalog.drugs {
            guard drug.id.range(of: "^[a-z][a-z0-9_]{0,47}$", options: .regularExpression) != nil,
                  !drug.name.isEmpty, drug.name.count <= 100,
                  (drug.note?.count ?? 0) <= 2500,
                  (drug.kind?.count ?? 0) <= 160,
                  (drug.source?.count ?? 0) <= 250,
                  secureURL(drug.url) else {
                throw PKModelUpdateError.invalidCatalog("药物标识或文本来源")
            }
            for entry in [drug.refDose, drug.defaultDose] {
                if let entry, !positive(entry, min: 0.00001, max: 1_000_000) {
                    throw PKModelUpdateError.invalidCatalog("剂量数值超出范围")
                }
            }
            if drug.recordOnly != true {
                guard positive(drug.refDose, min: 0.00001, max: 1_000_000),
                      positive(drug.cmax, min: 0.000000001, max: 1_000_000),
                      positive(drug.tmax, min: 0.005, max: 240),
                      positive(drug.halfLife, min: 0.01, max: 100_000) else {
                    throw PKModelUpdateError.invalidCatalog("缺少可靠且有限的药代参数")
                }
            }
        }
        guard catalog.food.count <= 500,
              Set(catalog.food.keys).isSubset(of: ids) else {
            throw PKModelUpdateError.invalidCatalog("存在未知药物的饮食数据")
        }
        func validParts(_ items: [PKFoodPart]) -> Bool {
            guard (1...16).contains(items.count) else { return false }
            let total = items.reduce(0.0) { $0 + $1.weight }
            return total.isFinite && abs(total - 1) < 0.03 && items.allSatisfy {
                $0.tmax.isFinite && $0.tmax > 0.005 && $0.tmax <= 240 &&
                $0.weight.isFinite && $0.weight >= 0 && $0.weight <= 1
            }
        }
        func validRatio(_ ratio: Double?) -> Bool {
            ratio == nil || (ratio!.isFinite && ratio! > 0 && ratio! <= 5)
        }
        for (_, food) in catalog.food {
            guard (food.summary?.count ?? 0) <= 2500,
                  (food.drink?.count ?? 0) <= 1500,
                  secureURL(food.url),
                  (food.mealWindowMinutes == nil ||
                    (food.mealWindowMinutes!.isFinite && food.mealWindowMinutes! >= 0 &&
                     food.mealWindowMinutes! <= 1440)) else {
                throw PKModelUpdateError.invalidCatalog("饮食参数或引用")
            }
            if let fed = food.fed {
                guard validParts(fed.parts), validRatio(fed.aucRatio) else {
                    throw PKModelUpdateError.invalidCatalog("餐后吸收参数")
                }
                if let extra = fed.highFat, !validParts(extra.parts) || !validRatio(extra.aucRatio) {
                    throw PKModelUpdateError.invalidCatalog("高脂饮食吸收参数")
                }
            }
        }
    }

    static func cached(expectedEngine: String, bundled: PKCatalog,
                       at file: URL? = cacheURL) -> PKVerifiedModel? {
        guard let file,
              let data = try? Data(contentsOf: file), data.count <= 900_000,
              let package = try? JSONDecoder().decode(PKRemoteModelPackage.self, from: data)
        else { return nil }
        return try? verify(package, expectedEngine: expectedEngine, bundled: bundled)
    }

    /// Saving precedes activation; an IO failure cannot leave live UI using an
    /// update that disappears on next launch. Atomic replacement retains the
    /// previous complete file until the new version is fully available.
    static func save(_ package: PKRemoteModelPackage, to file: URL? = cacheURL) throws {
        guard let file else { throw PKModelUpdateError.invalidCatalog("本机存储不可用") }
        let folder = file.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(package)
        try data.write(to: file, options: .atomic)
        try? FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: file.path)
    }
}
