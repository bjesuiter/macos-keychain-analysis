import Foundation
import Security

struct JsonError: Encodable {
    let ok = false
    let error: String
    let status: Int32?
    let statusMessage: String?
}

struct JsonOk<T: Encodable>: Encodable {
    let ok = true
    let result: T
}

struct ItemResult: Encodable {
    let service: String
    let account: String
    let value: String?
}

struct StatusResult: Encodable {
    let status: String
    let pid: Int32
    let executable: String
}

struct ACLEntryResult: Encodable {
    let description: String?
    let promptSelector: UInt32
    let trustedApplicationPaths: [String]
    let authorizations: [String]
    let authorizationsRaw: [UInt32]
    let partitionList: [String]?
}

struct ACLListResult: Encodable {
    let service: String
    let account: String
    let executable: String
    let entries: [ACLEntryResult]
}

struct ACLContainsResult: Encodable {
    let service: String
    let account: String
    let path: String
    let contains: Bool
}

struct StdioRequest: Decodable {
    let command: String?
    let action: String?
    let service: String?
    let account: String?
    let value: String?
    let label: String?
    let path: String?
}

func printJson<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let data = try! encoder.encode(value)
    print(String(data: data, encoding: .utf8)!)
}

func statusMessage(_ status: OSStatus) -> String? {
    SecCopyErrorMessageString(status, nil) as String?
}

func fail(_ message: String, status: OSStatus? = nil) -> Never {
    printJson(JsonError(
        error: message,
        status: status,
        statusMessage: status.map(statusMessage) ?? nil
    ))
    exit(1)
}

func arg(_ name: String, in args: [String]) -> String? {
    guard let index = args.firstIndex(of: name), args.indices.contains(index + 1) else {
        return nil
    }
    return args[index + 1]
}

func requireArg(_ name: String, in args: [String]) -> String {
    guard let value = arg(name, in: args) else {
        fail("Missing \(name)")
    }
    return value
}

func baseQuery(service: String, account: String) -> [CFString: Any] {
    [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: service,
        kSecAttrAccount: account,
    ]
}

func add(service: String, account: String, value: String, label: String?, update: Bool) {
    var query = baseQuery(service: service, account: account)
    query[kSecValueData] = Data(value.utf8)
    if let label {
        query[kSecAttrLabel] = label
    }

    let status = SecItemAdd(query as CFDictionary, nil)
    if status == errSecDuplicateItem, update {
        var updateAttrs: [CFString: Any] = [kSecValueData: Data(value.utf8)]
        if let label {
            updateAttrs[kSecAttrLabel] = label
        }
        let updateStatus = SecItemUpdate(baseQuery(service: service, account: account) as CFDictionary, updateAttrs as CFDictionary)
        guard updateStatus == errSecSuccess else {
            fail("SecItemUpdate failed", status: updateStatus)
        }
        printJson(JsonOk(result: ItemResult(service: service, account: account, value: nil)))
        return
    }

    guard status == errSecSuccess else {
        fail("SecItemAdd failed", status: status)
    }
    printJson(JsonOk(result: ItemResult(service: service, account: account, value: nil)))
}

func read(service: String, account: String) {
    var query = baseQuery(service: service, account: account)
    query[kSecReturnData] = true
    query[kSecMatchLimit] = kSecMatchLimitOne

    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess else {
        fail("SecItemCopyMatching failed", status: status)
    }
    guard let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
        fail("Keychain item value was not UTF-8 data")
    }
    printJson(JsonOk(result: ItemResult(service: service, account: account, value: value)))
}

func delete(service: String, account: String) {
    let status = SecItemDelete(baseQuery(service: service, account: account) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
        fail("SecItemDelete failed", status: status)
    }
    printJson(JsonOk(result: ItemResult(service: service, account: account, value: nil)))
}

func metadata(service: String, account: String) {
    var query = baseQuery(service: service, account: account)
    query[kSecReturnAttributes] = true
    query[kSecMatchLimit] = kSecMatchLimitOne

    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess else {
        fail("SecItemCopyMatching metadata failed", status: status)
    }
    let attrs = (result as? [String: Any]) ?? [:]
    var printable: [String: String] = [:]
    for (key, value) in attrs {
        printable[key] = String(describing: value)
    }
    printJson(JsonOk(result: printable))
}

func itemRef(service: String, account: String) -> SecKeychainItem {
    var query = baseQuery(service: service, account: account)
    query[kSecReturnRef] = true
    query[kSecMatchLimit] = kSecMatchLimitOne

    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let result else {
        fail("SecItemCopyMatching item ref failed", status: status)
    }
    return result as! SecKeychainItem
}

func aclEntries(service: String, account: String) -> [ACLEntryResult] {
    let item = itemRef(service: service, account: account)

    var access: SecAccess?
    let accessStatus = SecKeychainItemCopyAccess(item, &access)
    guard accessStatus == errSecSuccess, let access else {
        fail("SecKeychainItemCopyAccess failed", status: accessStatus)
    }

    var aclList: CFArray?
    let aclStatus = SecAccessCopyACLList(access, &aclList)
    guard aclStatus == errSecSuccess, let aclList else {
        fail("SecAccessCopyACLList failed", status: aclStatus)
    }

    return (aclList as! [SecACL]).map { acl in
        var appList: CFArray?
        var description: CFString?
        var promptSelector = SecKeychainPromptSelector()
        let contentsStatus = SecACLCopyContents(acl, &appList, &description, &promptSelector)
        guard contentsStatus == errSecSuccess else {
            fail("SecACLCopyContents failed", status: contentsStatus)
        }

        let paths = ((appList as? [SecTrustedApplication]) ?? []).compactMap { app -> String? in
            var appData: CFData?
            let appStatus = SecTrustedApplicationCopyData(app, &appData)
            guard appStatus == errSecSuccess, let appData else { return nil }
            return String(data: appData as Data, encoding: .utf8)
        }

        let authorizations = SecACLCopyAuthorizations(acl) as? [NSNumber] ?? []
        let authorizationsRaw = authorizations.map { $0.uint32Value }
        let authorizationNames = authorizationsRaw.map(authorizationName)

        let descriptionString = description as String?

        return ACLEntryResult(
            description: descriptionString,
            promptSelector: UInt32(promptSelector.rawValue),
            trustedApplicationPaths: paths,
            authorizations: authorizationNames,
            authorizationsRaw: authorizationsRaw,
            partitionList: partitionList(fromHexPlistDescription: descriptionString)
        )
    }
}

func partitionList(fromHexPlistDescription description: String?) -> [String]? {
    guard let description, description.count.isMultiple(of: 2) else { return nil }
    var bytes: [UInt8] = []
    bytes.reserveCapacity(description.count / 2)

    var index = description.startIndex
    while index < description.endIndex {
        let next = description.index(index, offsetBy: 2)
        guard let byte = UInt8(description[index..<next], radix: 16) else { return nil }
        bytes.append(byte)
        index = next
    }

    let data = Data(bytes)
    guard let text = String(data: data, encoding: .utf8), text.contains("<plist") else { return nil }

    guard
        let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil),
        let dictionary = plist as? [String: Any],
        let partitions = dictionary["Partitions"] as? [String]
    else {
        return nil
    }

    return partitions
}

func authorizationName(_ value: UInt32) -> String {
    // CSSM_ACL_AUTHORIZATION_TAG values exposed by SecACLCopyAuthorizations.
    // Keep raw values too because these constants are not surfaced by modern Swift SDK overlays.
    switch value {
    case 0: return "any"
    case 1: return "login"
    case 2: return "gen-key"
    case 3: return "delete"
    case 4: return "export-wrapped"
    case 5: return "export-clear"
    case 6: return "import-wrapped"
    case 7: return "import-clear"
    case 8: return "sign"
    case 9: return "encrypt"
    case 10: return "decrypt"
    case 11: return "mac"
    case 12: return "derive"
    case 13: return "db-read"
    case 14: return "db-insert"
    case 15: return "db-modify"
    case 16: return "db-delete"
    case 17: return "change-acl"
    case 18: return "change-owner"
    default: return "unknown(\(value))"
    }
}

func aclList(service: String, account: String) {
    printJson(JsonOk(result: ACLListResult(
        service: service,
        account: account,
        executable: Bundle.main.executablePath ?? CommandLine.arguments[0],
        entries: aclEntries(service: service, account: account)
    )))
}

func aclContains(service: String, account: String, path: String) {
    let entries = aclEntries(service: service, account: account)
    let contains = entries.contains { entry in
        entry.trustedApplicationPaths.contains(path)
    }
    printJson(JsonOk(result: ACLContainsResult(
        service: service,
        account: account,
        path: path,
        contains: contains
    )))
}

func usage() -> Never {
    print("""
    keychain-probe: minimal macOS Keychain probe inspired by Varlock's Swift daemon code

    Commands:
      add --service S --account A --value V [--label L]
      upsert --service S --account A --value V [--label L]
      read --service S --account A
      delete --service S --account A
      metadata --service S --account A
      acl-list --service S --account A
      acl-contains --service S --account A --path PATH
      daemon-stdio
      whoami

    daemon-stdio reads one JSON request per line.
    Example lines:
      {"command":"read","service":"test","account":"me"}
      {"action":"exit"}
    """)
    exit(2)
}

func args(from request: StdioRequest) throws -> [String] {
    guard let command = request.command ?? request.action else {
        throw NSError(domain: "KeychainProbe", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing command or action"])
    }

    var args = [command]
    if let service = request.service { args += ["--service", service] }
    if let account = request.account { args += ["--account", account] }
    if let value = request.value { args += ["--value", value] }
    if let label = request.label { args += ["--label", label] }
    if let path = request.path { args += ["--path", path] }
    return args
}

func runJsonLine(_ line: String) -> Bool {
    guard let data = line.data(using: .utf8) else {
        printJson(JsonError(error: "Input line was not UTF-8", status: nil, statusMessage: nil))
        return true
    }

    do {
        let request = try JSONDecoder().decode(StdioRequest.self, from: data)
        let requestArgs = try args(from: request)
        if requestArgs.first == "exit" { return false }
        run(requestArgs)
        return true
    } catch {
        printJson(JsonError(error: error.localizedDescription, status: nil, statusMessage: nil))
        return true
    }
}

func run(_ args: [String]) {
    guard let command = args.first else { usage() }

    switch command {
    case "add", "upsert":
        add(
            service: requireArg("--service", in: args),
            account: requireArg("--account", in: args),
            value: requireArg("--value", in: args),
            label: arg("--label", in: args),
            update: command == "upsert"
        )
    case "read":
        read(service: requireArg("--service", in: args), account: requireArg("--account", in: args))
    case "delete":
        delete(service: requireArg("--service", in: args), account: requireArg("--account", in: args))
    case "metadata":
        metadata(service: requireArg("--service", in: args), account: requireArg("--account", in: args))
    case "acl-list":
        aclList(service: requireArg("--service", in: args), account: requireArg("--account", in: args))
    case "acl-contains":
        aclContains(
            service: requireArg("--service", in: args),
            account: requireArg("--account", in: args),
            path: requireArg("--path", in: args)
        )
    case "whoami":
        printJson(JsonOk(result: StatusResult(
            status: "ready",
            pid: ProcessInfo.processInfo.processIdentifier,
            executable: CommandLine.arguments[0]
        )))
    case "daemon-stdio":
        printJson(JsonOk(result: StatusResult(
            status: "daemon-stdio-ready",
            pid: ProcessInfo.processInfo.processIdentifier,
            executable: CommandLine.arguments[0]
        )))
        while let line = readLine() {
            if !runJsonLine(line) { break }
        }
    default:
        usage()
    }
}

run(Array(CommandLine.arguments.dropFirst()))
