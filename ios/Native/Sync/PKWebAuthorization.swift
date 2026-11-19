import Foundation
import CryptoKit
import Security

struct PKWebAuthRequest {
    let verifier: String
    let state: String
    let url: URL

    static func create() throws -> PKWebAuthRequest {
        func randomToken() throws -> String {
            var bytes = [UInt8](repeating: 0, count: 32)
            let result = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
            guard result == errSecSuccess else {
                throw PKDataError.encryption(result)
            }
            return Data(bytes).base64EncodedString()
                .replacingOccurrences(of: "+", with: "-")
                .replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: "=", with: "")
        }
        let verifier = try randomToken()
        let state = try randomToken()
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8)))
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        var url = URLComponents(string: "https://pk.example.com/api/native/login")!
        url.queryItems = [
            URLQueryItem(name: "challenge", value: challenge),
            URLQueryItem(name: "state", value: state)
        ]
        guard let loginURL = url.url else { throw PKInverseFailure.invalidOutput }
        return PKWebAuthRequest(verifier: verifier, state: state, url: loginURL)
    }

    func checkCallback(_ callback: URL) throws -> String {
        guard callback.scheme == "pkatlas",
              callback.host == "auth",
              callback.path == "/callback",
              let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems,
              items.first(where: { $0.name == "state" })?.value == state,
              let code = items.first(where: { $0.name == "code" })?.value,
              code.count == 43,
              code.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-") })
        else {
            throw PKHTTPError(status: 400, message: "网站授权回调验证失败，未接受登录")
        }
        return code
    }
}

/// Store only the opaque session token. Passwords stay on the browser-hosted
/// website, and the callback contains a two-minute, PKCE-bound one-time code.
enum PKSessionVault {
    private static let service = "com.example.PKAtlas.nativeSession.v1"

    private static func query() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: "ios-native"]
    }

    static func load() -> String? {
        var q = query()
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ token: String) throws {
        guard token.count == 43, token.allSatisfy({
            $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-")
        }) else {
            throw PKHTTPError(status: 400, message: "服务器返回的会话凭证格式无效")
        }
        let value = Data(token.utf8)
        var q = query()
        q[kSecValueData as String] = value
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let added = SecItemAdd(q as CFDictionary, nil)
        if added == errSecDuplicateItem {
            let result = SecItemUpdate(query() as CFDictionary,
                                       [kSecValueData as String: value] as CFDictionary)
            guard result == errSecSuccess else { throw PKDataError.encryption(result) }
        } else if added != errSecSuccess {
            throw PKDataError.encryption(added)
        }
    }

    static func clear() {
        SecItemDelete(query() as CFDictionary)
    }
}
