# Current `varlock keychain take-ownership` flow

Source repo examined: `/Users/bjesuiter/Develop/oss/oss-varlock`

Branch examined: `deno-compatibility`

Working tree note: the repo had uncommitted changes in the Keychain implementation files when this was examined. This document describes the current working-tree behavior, not necessarily a committed baseline.

## Files involved

- `packages/varlock/src/cli/commands/keychain.command.ts`
- `packages/varlock/src/lib/local-encrypt/daemon-client.ts`
- `packages/varlock/src/lib/local-encrypt/types.ts`
- `packages/encryption-binary-swift/swift/Sources/VarlockEnclave/main.swift`
- `packages/encryption-binary-swift/swift/Sources/VarlockEnclave/KeychainManager.swift`
- `packages/varlock-website/src/content/docs/plugins/macos-keychain.mdx`

## User-facing CLI

The command is registered as:

```sh
varlock keychain take-ownership
```

Description:

```text
Recreate generic-password keychain() items so Varlock owns them
```

Supported args:

- `--service`, default `varlock`
- `--account`
- `--keychain`
- `--path`

Examples from the parent command help include:

```sh
varlock keychain take-ownership --account "my-project:myenv:API_KEY"
```

The website docs present it as a fallback after `fix-access`:

```sh
varlock keychain take-ownership --account "my-app:myenv:API_KEY"
```

The warning in both docs and CLI is important: this is destructive to item ACL shape. It recreates the item and can reset existing per-app Keychain ACLs.

## Mode 1: single item

If `--path` is not provided, the CLI requires `--account`.

It builds one Keychain ref:

```ts
{
  service: ctx.values.service,
  account: ctx.values.account,
  keychain: ctx.values.keychain,
}
```

Then it passes that ref to `takeOwnershipForRefs(...)`.

## Mode 2: env-file scan

If `--path` is provided, the command:

1. Reads the env file.
2. Parses it with `parseEnvSpecDotEnvFile(...)`.
3. Walks config items.
4. Extracts explicit `keychain(...)` calls with the same extractor used by `fix-access`.
5. Calls `takeOwnershipForRefs(...)` for every extracted ref.

Supported ref shapes are explicit service refs, for example:

```env
API_KEY=keychain("some-service")
API_KEY=keychain(service="varlock", account="project:profile:API_KEY")
API_KEY=keychain(service="varlock", account="project:profile:API_KEY", keychain="Login")
```

Account-only refs are refused because there is no service/server lookup target:

```env
API_KEY=keychain(account="project:profile:API_KEY")
```

If no refs are found, the CLI prints:

```text
No explicit keychain() refs found.
```

## Per-ref CLI loop

`takeOwnershipForRefs(refs)` processes refs serially.

For each ref it calls:

```ts
client.keychainTakeOwnership(ref)
```

It counts:

- updated
- failed

For each successful ref it prints either:

```text
ownership taken
```

or:

```text
already owned
```

In the current Swift implementation `takeOwnership(...)` always returns `true` on success, so `already owned` is not expected in practice right now.

For failures, the CLI prints the error and continues processing remaining refs.

At the end it prints a summary:

```text
Checked N items: X updated, Z failed.
```

If any failed, it sets `process.exitCode = 1`.

## Daemon action

The TypeScript client sends the request to the Swift daemon as the action:

```text
keychain-take-ownership
```

In `VarlockEnclave/main.swift`, the daemon handler:

1. Requires a payload.
2. Requires `service`.
3. Accepts optional `account`.
4. Accepts optional `keychain`.
5. Calls:

   ```swift
   KeychainManager.unlockForAccessFix(keychainName: keychainName)
   ```

6. Calls:

   ```swift
   KeychainManager.takeOwnership(
       service: service,
       account: account,
       keychainName: keychainName
   )
   ```

7. Returns:

   ```json
   { "modified": true }
   ```

Errors are converted through `keychainErrorResponse(error)`, including structured `errorCode` values such as `itemNotFound`, `accessDenied`, `ambiguousMatch`, or `ownershipTransferFailed`.

## Swift ownership-transfer algorithm

`KeychainManager.takeOwnership(...)` only targets generic-password items. Unlike `addToACL(...)`, it does not search internet-password items.

High-level goal: read the existing secret value, create a new Varlock-owned item containing the same value, delete the original, then rename the temporary item back to the original service/account.

Detailed flow:

1. Read the existing generic password with:

   ```swift
   getGenericPasswordForOwnership(service: account: keychainName:)
   ```

   This returns the resolved account and secret value.

2. Generate temporary identifiers:

   ```swift
   let tempService = "\(service).varlock-ownership-transfer.\(UUID().uuidString)"
   let tempAccount = "\(resolvedAccount).varlock-ownership-transfer.\(UUID().uuidString)"
   ```

3. Create a temporary generic-password item through Varlock's normal write path:

   ```swift
   setGenericPassword(service: tempService, account: tempAccount, value: value, update: false, keychainName: keychainName)
   ```

4. Verify the temporary item can be read and that its value equals the original value.

5. Delete the original item:

   ```swift
   deleteGenericPassword(service: service, account: resolvedAccount, keychainName: keychainName)
   ```

6. Rename the temporary item back onto the original identity:

   ```swift
   renameGenericPassword(
       service: tempService,
       account: tempAccount,
       newService: service,
       newAccount: resolvedAccount,
       keychainName: keychainName
   )
   ```

7. Read the final item and verify the value still equals the original.

8. Return `true`.

## Lookup and ambiguity behavior

`getGenericPasswordForOwnership(...)` uses this query shape:

```swift
[
  kSecClass: kSecClassGenericPassword,
  kSecAttrService: service,
  kSecReturnAttributes: true,
  kSecReturnData: true,
  kSecMatchLimit: kSecMatchLimitAll,
]
```

It adds `kSecAttrAccount` when an account is provided.

It adds `kSecMatchSearchList` when a keychain is provided.

Outcomes:

- `errSecSuccess`: expects at least one result, extracts `kSecValueData` as UTF-8, and returns `(account, value)`.
- If `account == nil` and multiple items match the service, it throws `ambiguousMatch` with the matching accounts.
- `errSecItemNotFound`: throws `itemNotFound`.
- `errSecAuthFailed` or `errSecInteractionNotAllowed`: throws `accessDenied`.
- Any other status: throws `unhandledError(status)`.

Unlike regular `getItem(...)`, this ownership path does not use the `/usr/bin/security` fallback. It must read via framework APIs so it can safely preserve the value before rewriting the item.

## Rollback and failure behavior

The implementation has two protected phases.

### Temporary creation phase

If creating or verifying the temporary item fails:

1. It best-effort deletes the temp item.
2. It throws:

   ```swift
   KeychainError.ownershipTransferFailed(recreateError: error, restoreError: nil)
   ```

At this point the original item has not been deleted yet.

### Final rename phase

After deleting the original, if renaming the temp item back or verifying the final value fails:

1. It attempts to recreate the original item with the preserved value via `setGenericPassword(...)`.
2. It best-effort deletes the temp item.
3. If restore fails too, it throws `ownershipTransferFailed(recreateError: error, restoreError: restoreError)`.
4. If restore succeeds, it still throws `ownershipTransferFailed(recreateError: error, restoreError: nil)` to report that ownership transfer did not complete.

The error message explicitly distinguishes between failed recreate and failed restore.

## Important characteristics

- This is not the same as `fix-access`.
- `fix-access` mutates existing ACLs in place using legacy ACL APIs.
- `take-ownership` recreates the item, which can reset per-app ACLs.
- The command is intentionally explicit and separately named.
- The daemon unlocks the relevant keychain first with `unlockForAccessFix(...)`.
- The flow processes multiple refs serially; there is no batch daemon action for take-ownership.
- It supports `--path`, but each ref still produces its own daemon IPC call.
- It is generic-password-only.
- It preserves the secret value by reading it before deleting anything.
- It uses a temporary item plus rename rather than deleting first and immediately re-adding under the original identity.
- It has rollback logic after original deletion, but a double failure can still leave the operation incomplete and reports `ownershipTransferFailed`.
- The current successful path always reports `modified: true`, so CLI output should normally say `ownership taken` rather than `already owned`.
