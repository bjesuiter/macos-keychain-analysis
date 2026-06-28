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

func printJson<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
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

func usage() -> Never {
    print("""
    keychain-probe: minimal macOS Keychain probe inspired by Varlock's Swift daemon code

    Commands:
      add --service S --account A --value V [--label L]
      upsert --service S --account A --value V [--label L]
      read --service S --account A
      delete --service S --account A
      metadata --service S --account A
      daemon-stdio
      whoami

    daemon-stdio reads one command per line using the same command syntax without argv[0].
    Example line: read --service test --account me
    """)
    exit(2)
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
            let parts = line.split(separator: " ").map(String.init)
            if parts.first == "exit" { break }
            run(parts)
        }
    default:
        usage()
    }
}

run(Array(CommandLine.arguments.dropFirst()))
