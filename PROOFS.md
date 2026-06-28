# macOS Keychain proof plan

This repo collects minimal, reproducible proofs for how macOS Keychain behaves: when it prompts, when it stays silent, and which attributes affect access.

## Ground rules

- Keep each proof tiny and independent.
- Prefer one script per behavior.
- Record exact macOS version, shell, binary identity, and Keychain item attributes.
- Avoid using real secrets; use disposable values only.
- Each proof should state:
  - setup
  - command to run
  - expected prompt behavior
  - observed prompt behavior
  - cleanup command

## Proofs to build

### 1. Create and read own generic password

Prove whether the same process/tool that creates a generic password can read it back without prompting.

Questions:
- Does `security add-generic-password` followed by `security find-generic-password -w` prompt?
- Does prompt behavior change if the item is created with explicit access controls?

### 2. Read an item created by another binary

Prove whether binary identity matters for read access.

Questions:
- If script A creates the item, can script B read it silently?
- If a compiled binary creates the item, can `/usr/bin/security` read it silently?
- Does code signing status change the result?

### 3. Update existing item

Prove whether updating an existing Keychain item prompts differently from creating or reading it.

Questions:
- Does `security add-generic-password -U` prompt when replacing an item?
- Does updating preserve, reset, or alter access control entries?
- Can an allowed binary update without another prompt?

### 4. Delete existing item

Prove whether deleting a Keychain item requires user confirmation.

Questions:
- Does `security delete-generic-password` prompt?
- Does deletion behavior depend on who created the item?
- Does deletion behavior differ for locked vs unlocked keychains?

### 5. Access after first approval

Prove whether approving a Keychain access prompt persists for future reads.

Questions:
- After clicking “Always Allow”, do future reads stay silent?
- After clicking “Allow”, does the next read prompt again?
- Is approval tied to binary path, code signature, or both?

### 6. Binary path changes

Prove whether moving or copying an approved binary invalidates Keychain trust.

Questions:
- If the same binary moves path, does it prompt again?
- If the binary is copied, does it prompt again?
- If a symlink invokes the same binary, which path identity is used?

### 7. Binary rebuild changes

Prove whether rebuilding a binary invalidates previous Keychain approval.

Questions:
- Does a recompiled unsigned binary prompt again?
- Does a recompiled ad-hoc signed binary prompt again?
- Does preserving bundle identifier or signing identity affect behavior?

### 8. Shell script vs compiled binary

Prove whether Keychain sees shell scripts as the script, shell interpreter, or calling process.

Questions:
- Does a shell script using `/usr/bin/security` get access based on the script or `security`?
- Does running the same script from fish, bash, zsh, and Bun change prompt behavior?
- Does `osascript`, `swift`, or `bun` change the identity shown in prompts?

### 9. Node/Bun/Swift native Keychain APIs

Prove prompt behavior for native API access rather than the `security` CLI.

Questions:
- Does a Bun script using native bindings prompt differently from `/usr/bin/security`?
- Does a Swift CLI using Security.framework prompt differently?
- What app name is displayed in the prompt?

### 10. Access groups and trusted applications

Prove how explicit trusted application lists affect prompts.

Questions:
- Can we create an item that only one binary can read silently?
- Can we create an item that multiple binaries can read silently?
- What happens when the trusted app list is empty?

### 11. Keychain lock state

Prove behavior when the login keychain is locked or unlocked.

Questions:
- Does reading from a locked keychain prompt for unlock, access, or both?
- Does creating an item require unlock?
- Does CI/headless execution fail differently when locked?

### 12. Headless and non-GUI sessions

Prove behavior over SSH, launchd, cron-like jobs, and background agents.

Questions:
- Can a non-GUI process trigger a Keychain prompt?
- Does it hang, fail, or return an error?
- Which error codes appear in each environment?

### 13. iCloud Keychain vs local login keychain

Prove whether sync-backed items behave differently from local-only items.

Questions:
- Can CLI-created generic passwords sync through iCloud Keychain?
- Does synced state affect access prompts on another Mac?
- Are access control approvals synced or local-only?

### 14. Item attributes matrix

Prove which item attributes affect lookup and access.

Questions:
- Which fields define uniqueness: service, account, label, access group?
- Can two similar items cause ambiguous reads?
- Does label/comment/description affect prompt text?

### 15. Error code catalogue

Collect exact errors for common failure modes.

Questions:
- Missing item
- Duplicate item
- Locked keychain
- User denied access
- User canceled prompt
- No GUI/session available
- Invalid access control configuration

## Suggested repo shape

```text
macos-keychain-analysis/
  PROOFS.md
  README.md
  proofs/
    01-create-read-own/
    02-read-other-binary/
    03-update-existing/
    ...
  scripts/
    cleanup-all.ts
    record-environment.ts
  observations/
    macos-<version>.md
```
