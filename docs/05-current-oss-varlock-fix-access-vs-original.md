# Current `fix-access` vs first `fix-access` flow

Source repo examined: `/Users/bjesuiter/Develop/oss/oss-varlock`

Branch examined: `deno-compatibility`

Working tree note: the repo had uncommitted changes in Keychain-related files when this was examined. This document describes the current working-tree behavior and compares it to the first `fix-access` flow documented in `docs/02-first-fix-access-flow.md`.

## Short answer

Yes, the current `fix-access` flow differs from the original CLI flow.

The core ACL mutation primitive is still conceptually the same: it adds the running Varlock helper executable to explicit legacy Keychain ACL app lists and writes the access object back if anything changed.

The surrounding flow has changed in important ways:

- Current env-file mode uses a daemon batch action instead of one IPC call per ref.
- Current Swift daemon unlocks the target/default keychain before attempting ACL repair.
- Current daemon has a separate `keychain-fix-access-batch` action.
- Current CLI handles per-item batch result objects rather than catching one client call per item.
- Current Keychain errors have more specific codes/messages.
- Current repo separates non-destructive ACL repair (`fix-access`) from destructive ownership rewrite (`take-ownership`).

## CLI shape: mostly unchanged

The command is still registered as:

```sh
varlock keychain fix-access
```

Description is still:

```text
Grant Varlock's helper access to existing keychain() items
```

Supported args are still:

- `--service`, default `varlock`
- `--account`
- `--keychain`
- `--path`

Single-item mode is also unchanged at the command boundary: without `--path`, the command requires `--account` and builds one ref:

```ts
{
  service: ctx.values.service,
  account: ctx.values.account,
  keychain: ctx.values.keychain,
}
```

Env-file mode is still based on explicit `keychain(...)` refs parsed from the target env file. Account-only refs are still refused because the repair flow needs an explicit service/server lookup target.

## Main CLI difference: batch daemon call

### Original flow

The first `fix-access` implementation processed refs serially in TypeScript and made one daemon IPC call per ref:

```ts
client.keychainFixAccess(ref)
```

That meant `--path .env.myenv` produced N IPC requests for N extracted refs.

### Current flow

Current `fixAccessForRefs(refs)` calls one batch daemon method:

```ts
const result = await client.keychainFixAccessBatch(refs);
```

Then it walks `result.results` by index and prints per-ref status:

```text
updated
already allowed
```

Errors are item-level when returned by the batch action. If the whole batch call throws, the CLI marks every ref failed.

The summary text remains the same shape:

```text
Checked N items: X updated, Y already allowed, Z failed.
```

## Daemon actions

### Original daemon action

The original flow only had:

```text
keychain-fix-access
```

It accepted one payload, resolved `appPath`, called `KeychainManager.addToACL(...)`, and returned:

```json
{ "modified": true }
```

or:

```json
{ "modified": false }
```

### Current daemon actions

Current Swift daemon still supports the single-item action:

```text
keychain-fix-access
```

But it also supports:

```text
keychain-fix-access-batch
```

The batch action accepts:

```json
{ "items": [{ "service": "...", "account": "...", "keychain": "..." }] }
```

For each item it returns a result object containing at least:

```json
{ "service": "...", "modified": true }
```

and conditionally:

```json
{ "account": "...", "keychain": "..." }
```

On a per-item failure it appends:

```json
{ "service": "...", "modified": false, "error": "..." }
```

rather than failing the whole batch immediately.

## Keychain unlock step added

A major behavioral difference is that current daemon handlers call:

```swift
try KeychainManager.unlockForAccessFix(keychainName: keychainName)
```

before calling `addToACL(...)`.

This happens in both:

- `keychain-fix-access`
- `keychain-fix-access-batch`

`unlockForAccessFix(...)` resolves either:

- the named keychain, if `--keychain` was passed, or
- the default keychain via `LegacyKeychain.keychainCopyDefault()`

Then it checks keychain status with `LegacyKeychain.keychainGetStatus(...)`. If the keychain is already unlocked, it returns. Otherwise it calls:

```swift
LegacyKeychain.keychainUnlock(keychain)
```

The original first CLI flow did not have this explicit unlock preflight in the daemon action.

## ACL mutation primitive: mostly same semantics

The current `KeychainManager.addToACL(...)` still follows the original repair semantics:

1. Resolve the item reference with `getItemRef(...)`.
2. Copy the item access object with `LegacyKeychain.itemCopyAccess(...)`.
3. Copy ACL entries with `LegacyKeychain.accessCopyACLList(...)`.
4. Create a trusted app entry for the current helper path.
5. Iterate ACL entries.
6. Copy each ACL's app list and prompt selector.
7. Skip ACL entries with no explicit app list.
8. Compare existing trusted app paths to `appPath`.
9. Append the helper trusted app when missing.
10. Call `LegacyKeychain.aclSetContents(...)` for changed ACLs.
11. If anything changed, call `LegacyKeychain.itemSetAccess(...)`.
12. Return whether anything changed.

This is still an in-place, non-destructive ACL update. It does not recreate the item and does not intentionally reset existing per-app ACLs.

## Error handling differences

Current `KeychainError` includes more cases and codes than the original flow documented at baseline, including:

- `keychainNotFound`
- `ambiguousMatch`
- `ownershipTransferFailed`

Current `addToACL(...)` also maps some ACL read failures more explicitly:

- `errSecNoAccessForItem` becomes an `accessDenied` message saying the ACL cannot be read and may be system-managed.
- failure to copy the ACL list becomes `accessDenied("Cannot read ACL list")`.

Batch mode converts each per-item error to a string with `keychainErrorMessage(error)` and puts it in that item's result.

## Relationship to `take-ownership`

The original `fix-access` flow was the only CLI repair path.

Current repo separates two repair strategies:

1. `fix-access`: non-destructive ACL update in place.
2. `take-ownership`: destructive generic-password rewrite that reads the value, creates a temporary Varlock-owned item, deletes the original, renames the temp item back, and verifies/rolls back on failure.

This separation matters because `fix-access` is now documented as the safe first step. `take-ownership` is explicitly presented as the fallback when macOS still prompts after ACL repair.

## What did not change

These original properties still hold:

- The command still requires an explicit service in env-file refs.
- `--service` still defaults to `varlock`.
- Single-item mode still requires `--account`.
- The helper executable path is still resolved in Swift with:

  ```swift
  Bundle.main.executablePath ?? ProcessInfo.processInfo.arguments[0]
  ```

- The underlying ACL API is still the deprecated legacy Keychain ACL API.
- ACL entries with nil app lists are still skipped.
- The helper is still added broadly to explicit app lists where it is not already present.
- The CLI still reports updated/already-allowed/failed totals.

## Practical impact

For a single item, current `fix-access` behaves very similarly to the original flow, except for the added keychain unlock preflight and improved errors.

For `--path` mode, current `fix-access` is materially different: it batches refs into one daemon action, reducing daemon round-trips and allowing per-item results to be returned from one Swift-side loop.

The current branch also makes the intended repair ladder clearer:

1. Use `fix-access` first to preserve the item and mutate only its ACLs.
2. Use `take-ownership` only if `fix-access` does not stop prompts and the user accepts that existing per-app ACLs may be reset.
