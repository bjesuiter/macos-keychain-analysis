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

## Implemented proofs

### 1. security-cli: create and read own generic password

Prove whether the macOS `security` CLI that creates a generic password can read it back without prompting.

Questions:
- Does `security add-generic-password` followed by `security find-generic-password -w` prompt?
- Does prompt behavior change if the item is created with explicit access controls?

### 2. keychain-probe: create and read own generic password

Prove whether the Swift `keychain-probe` binary that creates a generic password via Security.framework can read it back without prompting.

Questions:
- Does `keychain-probe add` followed by `keychain-probe read` prompt?
- Which binary identity is reported by `keychain-probe whoami`?
- What ACL list does Security.framework report for the created item?

### 3. keychain-probe create, security-cli read

Prove whether `/usr/bin/security` can read a generic password created by the Swift `keychain-probe` binary.

Questions:
- If `keychain-probe` creates the item, can `/usr/bin/security find-generic-password -w` read it silently?
- Does the read show a Keychain prompt for `/usr/bin/security`?
- Does the ACL list change after the `security` CLI read attempt?

### 4. security-cli create, keychain-probe read

Prove whether the Swift `keychain-probe` binary can read a generic password created by `/usr/bin/security`, and whether ACL inspection prompts separately.

Questions:
- If `/usr/bin/security` creates the item, can `keychain-probe read` read it after one-time authorization?
- Does `keychain-probe read` show one GUI prompt?
- Does `keychain-probe acl-list` show a separate GUI prompt?

### 4a. security-cli create, keychain-probe read, no ACL read

Repeat proof 4 without calling `keychain-probe acl-list` at the end, to isolate the password-value read prompt.

Questions:
- If `/usr/bin/security` creates the item, does `keychain-probe read` produce exactly one GUI prompt?
- Does omitting `keychain-probe acl-list` avoid the second ACL-related prompt?

### 4b. security-cli create, keychain-probe ACL only

Repeat proof 4 but only call `keychain-probe acl-list`, without reading the password value first.

Questions:
- If `/usr/bin/security` creates the item, does `keychain-probe acl-list` produce a GUI prompt by itself?
- Can Security.framework inspect ACLs for an item created by `/usr/bin/security` without reading the secret data?

### 5. cross-binary read twice with one-time authorization

Create an item with `/usr/bin/security`, read it twice with `keychain-probe`, and inspect ACLs before and after each read.

Questions:
- If the user uses one-time authorization for the first `keychain-probe read`, does the second read prompt again?
- Does one-time authorization add `keychain-probe` to the item's persistent ACL?
- Do ACL reads remain prompt-free before and after one-time authorizations?

### 5a. cross-binary read twice with Always Allow

Create an item with `/usr/bin/security`, read it twice with `keychain-probe`, choose Always Allow on the first read, and inspect ACLs before and after each read.

Questions:
- Does Always Allow make the second `keychain-probe read` silent?
- Does Always Allow add `keychain-probe` to the item's ACL list?
- Or is the persistent allowance stored out-of-band somewhere else on the system?

### 6. security-cli create with explicit trusted keychain-probe

Create an item with `/usr/bin/security add-generic-password -T keychain-probe`, then read it with `keychain-probe`.

Questions:
- Does `-T keychain-probe` add `keychain-probe` to the item ACL at creation time?
- Does pre-authorizing `keychain-probe` avoid the first-read GUI prompt?
- Do repeated `keychain-probe read` calls stay silent?

### 6a. security-cli create with explicit trusted keychain-probe, read only

Repeat proof 6 without any ACL reads, to isolate whether `-T keychain-probe` pre-authorizes password-value reads.

Questions:
- Do `keychain-probe read` calls stay silent when the item was created with `security -T keychain-probe`?
- Were proof 6 prompts caused by ACL reads rather than secret reads?

### 6b. security-cli create with explicit trusted keychain-probe, then Always Allow

Create an item with `security -T keychain-probe`, choose Always Allow on the first remaining key-access prompt, then inspect ACLs and read again.

Questions:
- Does Always Allow make future reads silent after `security -T keychain-probe`?
- Does the ACL shape change further after Always Allow?
- Is the remaining key-access prompt persisted in the ACL or elsewhere?

### 7. ACL authorization decoder

Enhance `keychain-probe acl-list` to include `SecACLCopyAuthorizations` output, then compare ACL authorization tags across item creation shapes.

Questions:
- Which authorization tags exist on default `/usr/bin/security` items, `security -T keychain-probe` items, and `keychain-probe` items?
- Do authorization tags explain the different prompt behavior?
- Which ACL entries are associated with trusted application paths, partitions, and key/item access prompts?

### 8. partition-list decoder

Enhance `keychain-probe acl-list` to decode hex-encoded partition-list plist ACL descriptions into explicit `partitionList` arrays.

Questions:
- Which partition entries exist for default `/usr/bin/security` items, `security -T keychain-probe` items, `keychain-probe` items, and Always-Allow-mutated items?
- Does Always Allow add `cdhash:...` to the partition list?
- Does the partition list explain silent vs prompted reads better than trusted application paths?

### 9. security-cli create with trusted app and set cdhash partition

Create an item with `/usr/bin/security add-generic-password -T keychain-probe`, derive `keychain-probe`'s `CDHash` from `codesign`, set the generic-password partition list to `apple-tool:,cdhash:<probe>`, then read with `keychain-probe`.

Questions:
- Can `security -T keychain-probe` plus `security set-generic-password-partition-list` recreate the final ACL state that Always Allow creates?
- Does adding the `cdhash:` partition make `keychain-probe read` silent?
- Does setting the partition list require its own terminal password or GUI authorization prompt?

### 10. Always Allow after keychain-probe rebuild

Create an item with `/usr/bin/security`, read with `keychain-probe`, choose Always Allow, verify a second read is silent, rebuild `keychain-probe` with a changed CDHash, then read again.

Questions:
- Does Always Allow remain valid after the helper binary is rebuilt?
- Does changing `keychain-probe`'s CDHash cause a new Keychain prompt?
- Would users be prompted again after each Swift helper binary update?

### 11. keychain-probe-created item after keychain-probe rebuild

Create an item with `keychain-probe`, verify reads are silent, rebuild `keychain-probe` with a changed CDHash, then read the same item again.

Questions:
- Can an item created by `keychain-probe` still be read without prompting after `keychain-probe` is rebuilt?
- Is creator ownership tied to path, designated requirement, CDHash, or another identity?
- Does this behave differently from Proof 10's `/usr/bin/security`-created item with Always Allow?

### 12. signed keychain-probe-created item after rebuild

Build `keychain-probe`, sign it with a stable identity and identifier, create a Keychain item, rebuild and re-sign with the same identity/identifier, then read the same item again.

Questions:
- Does a stable signing identity/designated requirement preserve Keychain access across rebuilds?
- Can the CDHash change while the designated requirement remains stable and reads stay silent?
- Is this the right model for Varlock helper updates?

### 13. security-created item, Always Allow, signed keychain-probe after rebuild

Create an item with `/usr/bin/security`, read it with stably signed `keychain-probe`, choose Always Allow, verify access, rebuild and re-sign `keychain-probe` with the same identity/identifier, then read again.

Questions:
- Does Always Allow for a signed binary persist across rebuilds?
- Does the partition list use `teamid:` or `cdhash:` for the signed probe?
- Can stable signing make even cross-app Always Allow grants survive helper updates?

## Proof ideas

### 18. security-created item without `-T`, Always Allow for signed keychain-probe

Create an item with `/usr/bin/security` without `-T`, read it with a stably signed `keychain-probe`, choose Always Allow, then read it repeatedly and inspect ACLs.

Questions:
- Without creation-time trusted app path pre-authorization, does Always Allow create a prompt-free cross-app read state?
- Does the resulting ACL state contain `teamid:<TEAMID>` in the partition list?
- Does Always Allow also add the helper to the legacy trusted application path list, or is the partition-list grant the only visible durable authorization?

### 19. security-created item with Team ID partition only, no `-T`

Create an item with `/usr/bin/security` without `-T`, then use `security set-generic-password-partition-list` to set `apple-tool:,teamid:<TEAMID>` while deliberately not adding the helper to legacy trusted application paths. A native Apple dialog collects the login keychain password for this proof and forwards it to the `security` CLI over stdin.

Questions:
- Is a `teamid:<TEAMID>` partition-list grant alone enough for signed `keychain-probe` to read prompt-free?
- Does the ACL output after setting the partition list contain `teamid:<TEAMID>` but no `keychain-probe` trusted application path?
- Do repeated signed-helper reads remain silent without user-facing Always Allow?

### 20. security-created item with `-T` plus Team ID partition

Create an item with `/usr/bin/security -T signed-keychain-probe`, then use `security set-generic-password-partition-list` to set `apple-tool:,teamid:<TEAMID>`. This builds a fully artificial Always Allow-like state without clicking Always Allow on the read prompt.

Questions:
- Does the combination of legacy trusted-app path and `teamid:<TEAMID>` partition-list grant make signed `keychain-probe` reads prompt-free?
- Does this artificial state match the important visible ACL pieces from macOS Always Allow?
- If a read still prompts, what ACL detail is still missing?

### Update an existing ACL entry like original `addToACL`

Prove whether a Swift helper can update an existing item's ACL the same way Varlock's original `addToACL` picker flow did: copy `SecAccess`, append a `SecTrustedApplication` for `keychain-probe`, and write the access object back with `SecKeychainItemSetAccess`.

Questions:
- Does post-hoc `SecACLSetContents` behave like creation-time `security add-generic-password -T keychain-probe`?
- Does appending `keychain-probe` to an existing ACL make future `keychain-probe read` calls silent?
- Does the resulting ACL shape match proof 06, proof 06a, or Always Allow?
- Which operation prompts: copying access, setting ACL contents, writing access back, or later reading the secret?

Suggested flow:
1. Create an item with `/usr/bin/security` without trusting `keychain-probe`.
2. Run a Swift proof command that mirrors original `addToACL`.
3. Read with `keychain-probe` twice.
4. Inspect ACL entries and partition lists before and after.

### Update existing item

Prove whether updating an existing Keychain item prompts differently from creating or reading it.

Questions:
- Does `security add-generic-password -U` prompt when replacing an item?
- Does updating preserve, reset, or alter access control entries?
- Can an allowed binary update without another prompt?

### Delete existing item

Prove whether deleting a Keychain item requires user confirmation.

Questions:
- Does `security delete-generic-password` prompt?
- Does deletion behavior depend on who created the item?
- Does deletion behavior differ for locked vs unlocked keychains?

### Access after first approval

Prove whether approving a Keychain access prompt persists for future reads.

Questions:
- After clicking “Always Allow”, do future reads stay silent?
- After clicking “Allow”, does the next read prompt again?
- Is approval tied to binary path, code signature, or both?

### Binary path changes

Prove whether moving or copying an approved binary invalidates Keychain trust.

Questions:
- If the same binary moves path, does it prompt again?
- If the binary is copied, does it prompt again?
- If a symlink invokes the same binary, which path identity is used?

### Binary rebuild changes

Prove whether rebuilding a binary invalidates previous Keychain approval.

Questions:
- Does a recompiled unsigned binary prompt again?
- Does a recompiled ad-hoc signed binary prompt again?
- Does preserving bundle identifier or signing identity affect behavior?

### Shell script vs compiled binary

Prove whether Keychain sees shell scripts as the script, shell interpreter, or calling process.

Questions:
- Does a shell script using `/usr/bin/security` get access based on the script or `security`?
- Does running the same script from fish, bash, zsh, and Bun change prompt behavior?
- Does `osascript`, `swift`, or `bun` change the identity shown in prompts?

### Node/Bun/Swift native Keychain APIs

Prove prompt behavior for native API access rather than the `security` CLI.

Questions:
- Does a Bun script using native bindings prompt differently from `/usr/bin/security`?
- Does a Swift CLI using Security.framework prompt differently?
- What app name is displayed in the prompt?

### Access groups and trusted applications

Prove how explicit trusted application lists affect prompts.

Questions:
- Can we create an item that only one binary can read silently?
- Can we create an item that multiple binaries can read silently?
- What happens when the trusted app list is empty?

### Keychain lock state

Prove behavior when the login keychain is locked or unlocked.

Questions:
- Does reading from a locked keychain prompt for unlock, access, or both?
- Does creating an item require unlock?
- Does CI/headless execution fail differently when locked?

### Headless and non-GUI sessions

Prove behavior over SSH, launchd, cron-like jobs, and background agents.

Questions:
- Can a non-GUI process trigger a Keychain prompt?
- Does it hang, fail, or return an error?
- Which error codes appear in each environment?

### iCloud Keychain vs local login keychain

Prove whether sync-backed items behave differently from local-only items.

Questions:
- Can CLI-created generic passwords sync through iCloud Keychain?
- Does synced state affect access prompts on another Mac?
- Are access control approvals synced or local-only?

### Item attributes matrix

Prove which item attributes affect lookup and access.

Questions:
- Which fields define uniqueness: service, account, label, access group?
- Can two similar items cause ambiguous reads?
- Does label/comment/description affect prompt text?

### Error code catalogue

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
    01-security-cli-create-read-own/
    02-keychain-probe-create-read-own/
    03-read-probe-item-with-security-cli/
    04-security-cli-create-probe-read/
    04a-security-cli-create-probe-read-no-acl/
    04b-security-cli-create-probe-acl-only/
    05-cross-binary-read-twice/
    05a-cross-binary-read-twice-always-allow/
    06-security-cli-create-trust-probe/
    06a-security-cli-create-trust-probe-read-only/
    06b-security-cli-create-trust-probe-always-allow/
    07-acl-authorization-decoder/
    08-partition-list-decoder/
    09-security-cli-set-cdhash-partition/
    ...
  scripts/
    cleanup-all.ts
    record-environment.ts
  observations/
    macos-<version>.md
```
