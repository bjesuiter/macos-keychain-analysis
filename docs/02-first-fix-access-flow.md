# First `varlock keychain fix-access` flow

Source repo examined: `/Users/bjesuiter/Develop/oss/oss-varlock`

Baseline commit:

```text
431902e feat: add keychain CLI commands (#835)
Author: Theo Ephraim <theo@dmno.dev>
Date: 2026-06-24
```

This was the first CLI `fix-access` flow before Benjamin Jesuiter’s later keychain subcommand changes.

## Files involved

- `packages/varlock/src/cli/commands/keychain.command.ts`
- `packages/varlock/src/lib/local-encrypt/daemon-client.ts`
- `packages/encryption-binary-swift/swift/Sources/VarlockEnclave/main.swift`
- `packages/encryption-binary-swift/swift/Sources/VarlockEnclave/KeychainManager.swift`

## CLI shape

The command was registered as:

```sh
varlock keychain fix-access
```

Description:

```text
Grant Varlock's helper access to existing keychain() items
```

Supported args:

- `--service`, default `varlock`
- `--account`
- `--keychain`
- `--path`

Examples from the command help:

```sh
varlock keychain fix-access --account "my-project:jb:API_KEY"
varlock keychain fix-access --path .env.jb
```

## Mode 1: single item

If `--path` was not provided, the command required `--account`.

It built one Keychain ref:

```ts
{
  service: ctx.values.service,
  account: ctx.values.account,
  keychain: ctx.values.keychain,
}
```

Then it passed that ref to `fixAccessForRefs(...)`.

## Mode 2: env-file scan

If `--path` was provided, the command:

1. Read the env file.
2. Parsed it with `parseEnvSpecDotEnvFile(...)`.
3. Walked config items.
4. Extracted explicit `keychain(...)` calls.
5. Called `fixAccessForRefs(...)` for every extracted ref.

Supported ref shapes included:

```env
API_KEY=keychain("some-service")
API_KEY=keychain(service="varlock", account="project:profile:API_KEY")
API_KEY=keychain(service="varlock", account="project:profile:API_KEY", keychain="Login")
```

The extractor refused account-only refs:

```env
API_KEY=keychain(account="project:profile:API_KEY")
```

Reason: it could not fix access without an explicit service/server lookup target.

The thrown CLI error said account-only refs were not supported and suggested adding an explicit service, for example:

```env
keychain(service="varlock", account="...")
```

If no refs were found, it printed:

```text
No explicit keychain() refs found.
```

## Per-ref CLI loop

`fixAccessForRefs(refs)` processed refs serially.

For each ref it called:

```ts
client.keychainFixAccess(ref)
```

It counted:

- updated
- unchanged
- failed

For each successful ref it printed either:

```text
updated
```

or:

```text
already allowed
```

For failures, it printed the error and continued processing remaining refs.

At the end it printed a summary:

```text
Checked N items: X updated, Y already allowed, Z failed.
```

If any failed, it set `process.exitCode = 1`.

## Daemon action

The TypeScript client sent the request to the Swift daemon as the action:

```text
keychain-fix-access
```

In `VarlockEnclave/main.swift`, the daemon handler:

1. Required a payload.
2. Required `service`.
3. Accepted optional `account`.
4. Accepted optional `keychain`.
5. Resolved the running helper executable path:

   ```swift
   Bundle.main.executablePath ?? ProcessInfo.processInfo.arguments[0]
   ```

6. Called:

   ```swift
   KeychainManager.addToACL(
       service: service,
       account: account,
       keychainName: keychainName,
       appPath: appPath
   )
   ```

7. Returned:

   ```json
   { "modified": true }
   ```

   or:

   ```json
   { "modified": false }
   ```

Errors were converted through `keychainErrorResponse(error)`.

## Underlying ACL repair

The CLI used the same `KeychainManager.addToACL(...)` primitive as the native picker repair flow.

That primitive:

1. Located the Keychain item.
2. Copied the item’s legacy access object.
3. Copied all ACL entries.
4. Created a trusted app entry for the Varlock helper executable.
5. Appended that trusted app to ACL entries that had explicit app lists and did not already contain the helper.
6. Wrote the access object back if modified.
7. Returned whether anything changed.

## Important limitations of the first CLI flow

- No batch daemon action existed yet.
- Env-file mode still made one daemon IPC call per ref.
- The CLI loop continued after failures and summarized at the end.
- The ACL repair updated legacy ACLs in place.
- The helper was added broadly to ACL entries with explicit app lists.
- There was no staged ownership-transfer flow.
- There was no rollback/restore behavior on ownership failure.
- There were no later safeguards from Benjamin Jesuiter’s follow-up commits such as preserving targets, non-destructive fix behavior, or batched prompt reduction.

In short: first `fix-access` was a CLI wrapper around the existing picker repair primitive. It found one or more `keychain(...)` refs, asked the Swift daemon to add Varlock’s helper executable to each item’s legacy ACL, then reported whether each item changed or was already allowed.
