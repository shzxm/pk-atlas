import Foundation
import UIKit

struct PKServerResponse: Decodable {
    var version: Int
    var state: PKCloudState
}
struct PKRemoteCalculationWindow: Decodable {
    let version: Int
    let drug: String
    let records: [[String: PKJSON]]
    let nextOffset: Int?
    let complete: Bool
}
struct PKRemoteCalculationHistory {
    let version: Int
    let doses: [PKDose]
}

struct PKLastUploadRequest: Encodable {
    let version: Int
    let state: PKCloudState
    let syncPolicy = "last-upload-wins-v1"
    let operationId: String
}

struct PKAuthResponse: Decodable {
    var username: String
    var account: PKServerResponse?
}
struct PKMeResponse: Decodable { var username: String }
struct PKPushResponse: Decodable {
    struct Event: Decodable {
        var id: String
        var time: Double
    }
    var events: [Event]
}

struct PKHTTPError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}

final class PKCloudAPI {
    static let shared = PKCloudAPI()
    private let base = URL(string: "https://pk.example.com")!
    // URLSession manages its own HttpOnly/Secure cookies. Never persist the
    // plaintext password, cookie token or API key in our SwiftUI state or disk.
    private let session: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.urlCache = nil
        config.httpShouldSetCookies = false
        config.httpCookieStorage = .shared
        config.timeoutIntervalForRequest = 18
        config.timeoutIntervalForResource = 25
        session = URLSession(configuration: config)
    }

    func request<T: Decodable>(_ endpoint: String, method: String = "GET",
                               body: Data? = nil) async throws -> T {
        guard endpoint.hasPrefix("/api/"),
              !endpoint.contains(".."),
              let url = URL(string: endpoint, relativeTo: base),
              url.scheme == "https", url.host == base.host else {
            throw PKHTTPError(status: 0, message: "请求地址无效")
        }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        req.httpMethod = method
        if endpoint != "/api/native/exchange", let token = PKSessionVault.load() {
            req.setValue("pk_atlas_session=\(token)", forHTTPHeaderField: "Cookie")
        }
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("https://pk.example.com", forHTTPHeaderField: "Origin")
        if method != "GET" {
            req.setValue("https://pk.example.com/", forHTTPHeaderField: "Referer")
        }
        if let body {
            req.httpBody = body
            req.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse,
              http.url?.scheme == "https",
              http.url?.host == base.host else {
            throw PKHTTPError(status: 0, message: "服务器响应来源无法核实")
        }
        if endpoint == "/api/native/engine" && data.count > 1_600_000 {
            throw PKSignedEngineFailure.invalidPackage
        }
        if endpoint == "/api/native/model" && data.count > 900_000 {
            throw PKModelUpdateError.invalidDigest
        }
        guard (200...299).contains(http.statusCode) else {
            let error = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw PKHTTPError(status: http.statusCode,
                              message: error ?? "服务器请求失败（HTTP \(http.statusCode)）")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Fetch only the indexed drug/time slice while a calculation is active.
    /// The endpoint excludes notes and non-mathematical history fields. The
    /// original complete history remains on the server and in the encrypted
    /// local cache for offline history editing.
    func calculationHistory(drug: String, from start: Date, through end: Date,
                            expectedVersion: Int) async throws -> PKRemoteCalculationHistory {
        guard drug.range(of: "^[a-z0-9_]{2,48}$", options: .regularExpression) != nil,
              start < end else {
            throw PKHTTPError(status: 0, message: "计算窗口参数无效")
        }
        let fromMs = Int64((start.timeIntervalSince1970 * 1000).rounded())
        let toMs = Int64((end.timeIntervalSince1970 * 1000).rounded())
        guard fromMs >= 1_000_000_000_000, toMs < 10_000_000_000_000,
              toMs - fromMs <= 366 * 86_400_000 else {
            throw PKHTTPError(status: 0, message: "计算窗口超出允许范围")
        }
        var offset = 0
        var selected = [PKDose]()
        var seen = Set<String>()
        for _ in 0..<100 {
            let endpoint = "/api/native/records/window?drug=\(drug)&start=\(fromMs)&end=\(toMs)&limit=1000&offset=\(offset)"
            let page: PKRemoteCalculationWindow = try await request(endpoint)
            guard page.version == expectedVersion, page.drug == drug else {
                throw PKHTTPError(status: 409, message: "云端记录版本已变化，请先同步")
            }
            for raw in page.records {
                guard let id = raw["id"]?.string, !id.isEmpty,
                      let mg = raw["mg"]?.number, mg.isFinite, mg > 0,
                      let time = raw["time"]?.number, time.isFinite,
                      raw["drug"]?.string == drug,
                      time >= Double(fromMs), time <= Double(toMs) else {
                    throw PKHTTPError(status: 0, message: "服务器窗口数据校验失败")
                }
                if seen.insert(id).inserted {
                    selected.append(PKDose(id: id, drug: drug, mg: mg,
                        time: Date(timeIntervalSince1970: time/1000),
                        unit: raw["unit"]?.string ?? "mg"))
                }
            }
            if page.complete { return PKRemoteCalculationHistory(version: page.version, doses: selected) }
            guard let next = page.nextOffset, next > offset, next <= 250_000 else {
                throw PKHTTPError(status: 0, message: "云端分页未完成")
            }
            offset = next
        }
        throw PKHTTPError(status: 0, message: "计算窗口记录超过客户端分页保护限制")
    }

    struct NativeTokenExchange: Decodable {
        let username: String
        let sessionToken: String
        let sessionExpiresAt: Double
    }

    func exchangeNative(code: String, verifier: String, state: String) async throws -> NativeTokenExchange {
        // Stable random app-installation identifier; not an IMEI, IDFA, IP,
        // Keychain secret or hardware fingerprint. Only the hash is stored server-side.
        let defaults = UserDefaults.standard
        var installationID = defaults.string(forKey: "PKAtlasDeviceInstallationID") ?? ""
        if installationID.count < 16 {
            installationID = UUID().uuidString
            defaults.set(installationID, forKey: "PKAtlasDeviceInstallationID")
        }
        let system = UIDevice.current
        let body = try JSONSerialization.data(withJSONObject: [
            "code": code, "verifier": verifier, "state": state,
            "deviceId": installationID,
            "deviceName": String(system.name.prefix(50)),
            "devicePlatform": String(system.model.prefix(30)),
            "deviceOS": String("\(system.systemName) \(system.systemVersion)".prefix(44))
        ])
        return try await request("/api/native/exchange", method: "POST", body: body)
    }

    /// An explicit opt-in *vocabulary contribution*, not a HealthKit export.
    /// Never upload medication events, dose, time, Apple identifiers or device IDs.
    func submitHealthAlias(name: String, drugID: String?) async throws {
        struct Result: Decodable { let ok: Bool }
        guard name.count >= 2, name.count <= 120,
              !PKHealthMedications.isUnlinkedName(name) else {
            throw PKHTTPError(status: 0, message: "没有可安全共享的药物名称")
        }
        let language = String(Locale.preferredLanguages.first?.prefix(16) ?? "zh")
        let json: [String: Any] = [
            "name": name, "drugId": drugID ?? "", "language": language,
            "explicitConsent": true
        ]
        let data = try JSONSerialization.data(withJSONObject: json)
        let _: Result = try await request("/api/native/health-alias", method: "POST", body: data)
    }

    struct APNsRegistration: Decodable { let ok: Bool; let providerConfigured: Bool }

    func registerAPNs(token: String) async throws -> APNsRegistration {
        #if DEBUG
        let environment = "sandbox"
        #else
        let environment = "production"
        #endif
        let data = try JSONSerialization.data(withJSONObject: [
            "deviceToken":token, "environment":environment
        ])
        return try await request("/api/native/apns/register", method: "POST", body: data)
    }

    func unregisterAPNs(token: String) async throws {
        struct Result: Decodable { let ok: Bool }
        let data = try JSONSerialization.data(withJSONObject: ["deviceToken":token])
        let _: Result = try await request("/api/native/apns/unregister",
                                          method: "POST", body: data)
    }

    func signedEnginePackage() async throws -> PKSignedEngineEnvelope {
        try await request("/api/native/engine")
    }

    func modelPackage() async throws -> PKRemoteModelPackage {
        try await request("/api/native/model")
    }

    func state() async throws -> PKServerResponse { try await request("/api/state") }

    func putSections(version: Int, sections: [String: PKJSON]) async throws {
        struct Result: Decodable { let version: Int }
        struct Body: Encodable { let version: Int; let sections: [String: PKJSON] }
        let body = try JSONEncoder().encode(Body(version: version, sections: sections))
        let _: Result = try await request("/api/state/sections", method: "PUT", body: body)
    }

    /// Complete-state last-successful-upload request. Stable UUID ensures
    /// a lost response cannot replay a previous upload over another device.
    func putLastUploadSnapshot(version: Int, state: PKCloudState,
                               operationId: String) async throws -> Int {
        struct Ack: Decodable {
            let version: Int
            let syncPolicy: String?
        }
        let payload = try JSONEncoder().encode(PKLastUploadRequest(
            version: version, state: state, operationId: operationId))
        let reply: Ack = try await request("/api/state", method: "PUT", body: payload)
        guard reply.syncPolicy == "last-upload-wins-v1" else {
            throw PKHTTPError(status: 426, message: "服务器不支持最后上传优先协议，请先升级服务器")
        }
        return reply.version
    }

    func me() async throws -> PKMeResponse { try await request("/api/me") }

    func logout() async throws {
        struct Result: Decodable { var ok: Bool }
        let _: Result = try await request("/api/logout", method: "POST", body: Data("{}".utf8))
    }

    func reminderEvents() async throws -> [PKPushResponse.Event] {
        let payload: PKPushResponse = try await request("/api/push/pending")
        return payload.events
    }
}
