# macOS 26.5.1 observations

Environment baseline:
- ProductName: macOS
- ProductVersion: 26.5.1
- BuildVersion: 25F80
- Shell: /Users/bjesuiter/.homebrew/bin/fish
- Bun: 1.3.14

## Proof 01: security-cli create and read own generic password

Tool under test: `/usr/bin/security`

Command aliases used below:

```fish
set SEC /usr/bin/security
set ACCOUNT macos-keychain-analysis
set SECRET disposable-proof-secret
set DEFAULT_SERVICE macos-keychain-analysis.proof-01.default-access
set TRUSTED_SERVICE macos-keychain-analysis.proof-01.trusted-security-cli
```

### default-access

Command sequence:

```fish
$SEC delete-generic-password -a $ACCOUNT -s $DEFAULT_SERVICE
$SEC add-generic-password -a $ACCOUNT -s $DEFAULT_SERVICE -w $SECRET
$SEC find-generic-password -a $ACCOUNT -s $DEFAULT_SERVICE -w
```

Expected prompt behavior:
- Creation should normally be silent.
- Read may prompt depending on the default ACL macOS creates for `/usr/bin/security`.

Observed prompt behavior:
- Prompt shown during cleanup: no
- Prompt shown during create: no
- Prompt shown during read: no
- App name shown in prompt: n/a
- User action: n/a

Observed command result:
- Cleanup exit code: 0 when stale item existed; 44 when missing
- Create exit code: 0
- Read exit code: 0
- Read matched expected disposable secret: yes

Notes:
- This method provides no prompt barrier for the same user session.
- Anyone with access to the `security` command line can access this generic password, which effectively means any process running with current user permissions can read it.

### trusted-security-cli

Command sequence:

```fish
$SEC delete-generic-password -a $ACCOUNT -s $TRUSTED_SERVICE
$SEC add-generic-password -a $ACCOUNT -s $TRUSTED_SERVICE -w $SECRET -T $SEC
$SEC find-generic-password -a $ACCOUNT -s $TRUSTED_SERVICE -w
```

Expected prompt behavior:
- Creation should normally be silent.
- Read is expected to be silent because `/usr/bin/security` is explicitly trusted.

Observed prompt behavior:
- Prompt shown during cleanup: no
- Prompt shown during create: no
- Prompt shown during read: no
- App name shown in prompt: n/a
- User action: n/a

Observed command result:
- Cleanup exit code: 0 when stale item existed; 44 when missing
- Create exit code: 0
- Read exit code: 0
- Read matched expected disposable secret: yes

Notes:
- Explicitly trusting `/usr/bin/security` also requires no prompt.
- This does not protect the secret from other processes that can invoke `/usr/bin/security` as the current user.

## Proof 02: keychain-probe create and read own generic password

Tool under test: `packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe`

Command aliases used below:

```fish
set PROBE packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe
set ACCOUNT macos-keychain-analysis
set SECRET disposable-proof-secret
set SERVICE macos-keychain-analysis.proof-02.keychain-probe-own
set LABEL 'macos-keychain-analysis proof 02 keychain-probe own'
```

Command sequence:

```fish
/usr/bin/swift build --package-path packages/keychain-probe
$PROBE delete --service $SERVICE --account $ACCOUNT
$PROBE whoami
$PROBE add --service $SERVICE --account $ACCOUNT --value $SECRET --label $LABEL
$PROBE read --service $SERVICE --account $ACCOUNT
$PROBE metadata --service $SERVICE --account $ACCOUNT
$PROBE acl-list --service $SERVICE --account $ACCOUNT
```

Expected prompt behavior:
- Creation should normally be silent.
- Read may prompt or stay silent depending on the ACL macOS creates for this `keychain-probe` binary.

Observed prompt behavior:
- Prompt shown during cleanup: no
- Prompt shown during create: no
- Prompt shown during read: no
- Prompt shown during metadata read: no
- Prompt shown during ACL list read: no
- App name shown in prompt: n/a
- User action: n/a

Observed command result:
- Build exit code: 0
- Cleanup exit code: 0
- Create exit code: 0
- Read exit code: 0
- Read matched expected disposable secret: yes
- Metadata exit code: 0
- ACL list exit code: 0

Observed ACL details:
- ACL list included the built `keychain-probe` executable path as a trusted application:
  `/Users/bjesuiter/Develop/bjesuiter/macos-keychain-analysis/packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe`

Notes:
- A Swift Security.framework CLI can create a generic password and read it back silently from the same binary identity.
- The item ACL records the creating `keychain-probe` binary path as trusted.

## Proof 03: keychain-probe create, security-cli read

Creator: `packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe`
Reader: `/usr/bin/security`

Command aliases used below:

```fish
set PROBE packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe
set SEC /usr/bin/security
set ACCOUNT macos-keychain-analysis
set SECRET disposable-proof-secret
set SERVICE macos-keychain-analysis.proof-03.probe-create-security-read
set LABEL 'macos-keychain-analysis proof 03 probe create security read'
```

Command sequence:

```fish
/usr/bin/swift build --package-path packages/keychain-probe
$PROBE delete --service $SERVICE --account $ACCOUNT
$PROBE whoami
$PROBE add --service $SERVICE --account $ACCOUNT --value $SECRET --label $LABEL
$PROBE acl-list --service $SERVICE --account $ACCOUNT
$SEC find-generic-password -a $ACCOUNT -s $SERVICE -w
$SEC find-generic-password -a $ACCOUNT -s $SERVICE
$PROBE acl-list --service $SERVICE --account $ACCOUNT
```

Expected prompt behavior:
- `keychain-probe` creation should normally be silent.
- `/usr/bin/security` read may prompt because `/usr/bin/security` is not the creating trusted application.

Observed prompt behavior:
- Prompt shown during cleanup: no
- Prompt shown during create: no
- Prompt shown during ACL list before security read: no
- Prompt shown during `/usr/bin/security find-generic-password -w`: yes, two GUI prompts
- User action: entered the login keychain password and pressed Enter on the keyboard
- App name shown in prompt: `security`
- Keychain named in prompt: `Anmeldung`
- Item named in prompt: `macos-keychain-analysis proof 03 probe create security read`

Prompt screenshots:
- `observations/screenshots/proof-03-security-cli-prompt-1.png`
- `observations/screenshots/proof-03-security-cli-prompt-2.png`

Prompt text observed:
- Prompt 1: `security möchte deine vertraulichen Informationen verwenden, die in „macos-keychain-analysis proof 03 probe create security read“ in deinem Schlüsselbund gesichert sind.`
- Prompt 2: `security möchte auf den Schlüssel „macos-keychain-analysis proof 03 probe create security read“ in deinem Schlüsselbund zugreifen.`

Observed command result:
- Build exit code: 0
- Cleanup exit code: 0
- Create exit code: 0
- Security CLI read exit code: 0
- Security CLI read matched expected disposable secret: yes
- Security CLI attribute read exit code: 0
- ACL list after read exit code: 0

Observed ACL details:
- Before `/usr/bin/security` read, ACL list included the built `keychain-probe` executable path as a trusted application.
- After `/usr/bin/security` read, ACL list still included `keychain-probe`; no obvious `/usr/bin/security` trusted-application path appeared in the captured JSON output.

Notes:
- Unlike proof 2, crossing from the creator binary (`keychain-probe`) to `/usr/bin/security` triggered GUI authorization prompts.
- The prompt still allowed `/usr/bin/security` to read the secret after user authorization.
- User confirmed this was one-time authorization, not persistent trust.

Open questions:
- Why did this flow show two GUI prompts for one `/usr/bin/security find-generic-password -w` read? The screenshots show slightly different wording (`vertraulichen Informationen verwenden` vs `auf den Schlüssel ... zugreifen`), but we have not yet proven whether these correspond to separate Security.framework operations, separate ACL entries, or another macOS Keychain implementation detail.

## Proof 04: security-cli create, keychain-probe read

Creator: `/usr/bin/security`
Reader: `packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe`

Command aliases used below:

```fish
set PROBE packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe
set SEC /usr/bin/security
set ACCOUNT macos-keychain-analysis
set SECRET disposable-proof-secret
set SERVICE macos-keychain-analysis.proof-04.security-create-probe-read
set LABEL 'macos-keychain-analysis proof 04 security create probe read'
```

Command sequence:

```fish
/usr/bin/swift build --package-path packages/keychain-probe
$SEC delete-generic-password -a $ACCOUNT -s $SERVICE
$SEC add-generic-password -a $ACCOUNT -s $SERVICE -w $SECRET -l $LABEL
$SEC find-generic-password -a $ACCOUNT -s $SERVICE
$PROBE whoami
$PROBE read --service $SERVICE --account $ACCOUNT
$PROBE acl-list --service $SERVICE --account $ACCOUNT
```

Expected prompt behavior:
- `/usr/bin/security` creation should normally be silent.
- `keychain-probe read` is expected to show one GUI prompt.
- `keychain-probe acl-list` is expected to show one separate GUI prompt.

Observed prompt behavior:
- Prompt shown during cleanup: no; command exited 44 because the item was missing.
- Prompt shown during `/usr/bin/security` create: no
- Prompt shown during `/usr/bin/security` attribute read: no
- Prompt shown during `keychain-probe read`: yes
- Prompt shown during `keychain-probe acl-list`: yes
- App name shown in prompts: `keychain-probe`
- Keychain named in prompts: `Anmeldung`
- Item named in prompts: `macos-keychain-analysis proof 04 security create probe read`

Prompt screenshots:
- `observations/screenshots/proof-04-keychain-probe-prompt-1.png`
- `observations/screenshots/proof-04-keychain-probe-prompt-2.png`

Prompt text observed:
- Prompt 1: `keychain-probe möchte deine vertraulichen Informationen verwenden, die in „macos-keychain-analysis proof 04 security create probe read“ in deinem Schlüsselbund gesichert sind.`
- Prompt 2: `keychain-probe möchte auf den Schlüssel „macos-keychain-analysis proof 04 security create probe read“ in deinem Schlüsselbund zugreifen.`

Observed command result:
- Build exit code: 0
- Cleanup exit code: 44 when stale item was missing
- Create exit code: 0
- Security CLI attribute read exit code: 0
- keychain-probe read exit code: 0
- keychain-probe read matched expected disposable secret: yes
- keychain-probe ACL list exit code: 0

Observed ACL details:
- ACL list included `/usr/bin/security` as a trusted application.
- ACL list did not obviously include the built `keychain-probe` path in the captured JSON output.

Notes:
- This is the inverse of proof 3: crossing from creator `/usr/bin/security` to reader `keychain-probe` triggered GUI authorization prompts.
- The two prompts are expected in this proof: one prompt came from `keychain-probe read`, and the other came from `keychain-probe acl-list`.
- The two prompt wordings match those separate operations: reading confidential information vs accessing the key/item for ACL inspection.

## Proof 04a: security-cli create, keychain-probe read, no ACL read

Creator: `/usr/bin/security`
Reader: `packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe`

Command sequence:

```fish
/usr/bin/swift build --package-path packages/keychain-probe
/usr/bin/security delete-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-04a.security-create-probe-read-no-acl
/usr/bin/security add-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-04a.security-create-probe-read-no-acl -w disposable-proof-secret -l 'macos-keychain-analysis proof 04a security create probe read no acl'
/usr/bin/security find-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-04a.security-create-probe-read-no-acl
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe whoami
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe read --service macos-keychain-analysis.proof-04a.security-create-probe-read-no-acl --account macos-keychain-analysis
```

Expected prompt behavior:
- `/usr/bin/security` creation should normally be silent.
- `keychain-probe read` was expected to show one GUI prompt.
- No ACL read is performed, so the proof expected no second ACL-related prompt.

Observed prompt behavior:
- Prompt shown during cleanup: no; command exited 44 because the item was missing.
- Prompt shown during `/usr/bin/security` create: no
- Prompt shown during `/usr/bin/security` attribute read: no
- Prompt shown during `keychain-probe read`: yes, two GUI prompts
- App name shown in prompts: `keychain-probe`
- Keychain named in prompts: `Anmeldung`
- Item named in prompts: `macos-keychain-analysis proof 04a security create probe read no acl`

Prompt screenshots:
- `observations/screenshots/proof-04a-keychain-probe-prompt-1.png`
- `observations/screenshots/proof-04a-keychain-probe-prompt-2.png`

Prompt text observed:
- Prompt 1: `keychain-probe möchte deine vertraulichen Informationen verwenden, die in „macos-keychain-analysis proof 04a security create probe read no acl“ in deinem Schlüsselbund gesichert sind.`
- Prompt 2: `keychain-probe möchte auf den Schlüssel „macos-keychain-analysis proof 04a security create probe read no acl“ in deinem Schlüsselbund zugreifen.`

Observed command result:
- Build exit code: 0
- Cleanup exit code: 44 when stale item was missing
- Create exit code: 0
- Security CLI attribute read exit code: 0
- keychain-probe read exit code: 0
- keychain-probe read matched expected disposable secret: yes

Notes:
- This disproves the proof 4 assumption that the second prompt was caused by the explicit `keychain-probe acl-list` command.
- `keychain-probe read` alone can trigger both prompt wordings when reading an item created by `/usr/bin/security`.
- No daemon restart was involved in this run; the proof invokes the `keychain-probe` executable as a fresh process for each command.

Open questions:
- Why does a single `SecItemCopyMatching` data read from `keychain-probe` produce both prompt wordings for this cross-binary access case?

## Proof 04b: security-cli create, keychain-probe ACL only

Creator: `/usr/bin/security`
ACL reader: `packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe`

Command sequence:

```fish
/usr/bin/swift build --package-path packages/keychain-probe
/usr/bin/security delete-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-04b.security-create-probe-acl-only
/usr/bin/security add-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-04b.security-create-probe-acl-only -w disposable-proof-secret -l 'macos-keychain-analysis proof 04b security create probe acl only'
/usr/bin/security find-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-04b.security-create-probe-acl-only
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe whoami
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe acl-list --service macos-keychain-analysis.proof-04b.security-create-probe-acl-only --account macos-keychain-analysis
```

Expected prompt behavior:
- `/usr/bin/security` creation should normally be silent.
- `keychain-probe acl-list` may prompt, but no password-value read is performed.

Observed prompt behavior:
- Prompt shown during cleanup: no; command exited 44 because the item was missing.
- Prompt shown during `/usr/bin/security` create: no
- Prompt shown during `/usr/bin/security` attribute read: no
- Prompt shown during `keychain-probe acl-list`: no

Observed command result:
- Build exit code: 0
- Cleanup exit code: 44 when stale item was missing
- Create exit code: 0
- Security CLI attribute read exit code: 0
- keychain-probe ACL list exit code: 0

Observed ACL details:
- ACL list included `/usr/bin/security` as a trusted application.
- ACL list did not require authorizing `keychain-probe`.

Important finding:
- ACL requests are allowed without a GUI prompt in this scenario. A process can inspect an item's ACL with `SecKeychainItemCopyAccess` / `SecAccessCopyACLList` / `SecACLCopyContents` without being authorized to read the secret value.

## Proof 05: cross-binary read twice with one-time authorization

Creator: `/usr/bin/security`
Reader: `packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe`

Command sequence:

```fish
/usr/bin/swift build --package-path packages/keychain-probe
/usr/bin/security delete-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-05.cross-binary-read-twice
/usr/bin/security add-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-05.cross-binary-read-twice -w disposable-proof-secret -l 'macos-keychain-analysis proof 05 cross binary read twice'
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe whoami
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe acl-list --service macos-keychain-analysis.proof-05.cross-binary-read-twice --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe read --service macos-keychain-analysis.proof-05.cross-binary-read-twice --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe acl-list --service macos-keychain-analysis.proof-05.cross-binary-read-twice --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe read --service macos-keychain-analysis.proof-05.cross-binary-read-twice --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe acl-list --service macos-keychain-analysis.proof-05.cross-binary-read-twice --account macos-keychain-analysis
```

Expected prompt behavior:
- With one-time authorization, the first `keychain-probe read` should prompt.
- The second `keychain-probe read` should prompt again if one-time authorization is not persistent.
- ACL reads should remain prompt-free and should show whether persistent trust changed.

Observed prompt behavior:
- Prompt shown during cleanup: no; command exited 44 because the item was missing.
- Prompt shown during `/usr/bin/security` create: no
- Prompt shown during ACL read before password reads: no
- Prompt shown during first `keychain-probe read`: yes, two GUI prompts
- Prompt shown during ACL read after first password read: no
- Prompt shown during second `keychain-probe read`: yes, two GUI prompts again
- Prompt shown during ACL read after second password read: no
- App name shown in prompts: `keychain-probe`
- Keychain named in prompts: `Anmeldung`
- Item named in prompts: `macos-keychain-analysis proof 05 cross binary read twice`
- User action: entered the login keychain password and clicked/pressed the blue `Erlauben` button for one-time authorization; did not choose `Immer erlauben`.

Prompt screenshots:
- `observations/screenshots/proof-05-read1-prompt-1.png`
- `observations/screenshots/proof-05-read1-prompt-2.png`
- `observations/screenshots/proof-05-read2-prompt-1.png`
- `observations/screenshots/proof-05-read2-prompt-2.png`

Observed command result:
- Build exit code: 0
- Cleanup exit code: 44 when stale item was missing
- Create exit code: 0
- First keychain-probe read exit code: 0; read matched expected disposable secret: yes
- Second keychain-probe read exit code: 0; read matched expected disposable secret: yes
- All ACL list commands exited 0

Observed ACL details:
- ACL before reads included `/usr/bin/security` as a trusted application.
- ACL after first one-time authorized read still included `/usr/bin/security`; no obvious `keychain-probe` trusted-application path appeared.
- ACL after second one-time authorized read still included `/usr/bin/security`; no obvious `keychain-probe` trusted-application path appeared.

Important finding:
- One-time authorization does not persist for the next cross-binary read and does not add the reader binary to the persistent ACL.
- Each cross-binary `keychain-probe read` produced the same two prompt wordings.

## Proof 05a: cross-binary read twice with Always Allow

Creator: `/usr/bin/security`
Reader: `packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe`

Command sequence:

```fish
/usr/bin/swift build --package-path packages/keychain-probe
/usr/bin/security delete-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-05a.cross-binary-read-twice-always-allow
/usr/bin/security add-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-05a.cross-binary-read-twice-always-allow -w disposable-proof-secret -l 'macos-keychain-analysis proof 05a cross binary read twice always allow'
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe whoami
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe acl-list --service macos-keychain-analysis.proof-05a.cross-binary-read-twice-always-allow --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe read --service macos-keychain-analysis.proof-05a.cross-binary-read-twice-always-allow --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe acl-list --service macos-keychain-analysis.proof-05a.cross-binary-read-twice-always-allow --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe read --service macos-keychain-analysis.proof-05a.cross-binary-read-twice-always-allow --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe acl-list --service macos-keychain-analysis.proof-05a.cross-binary-read-twice-always-allow --account macos-keychain-analysis
```

Expected prompt behavior:
- First `keychain-probe read` should prompt.
- User chooses `Immer erlauben` / Always Allow.
- Second `keychain-probe read` should be silent if Always Allow persists.
- ACL lists should reveal whether persistent allowance is stored in the item ACL or out-of-band.

Observed prompt behavior:
- Prompt shown during cleanup: no; command exited 44 because the item was missing.
- Prompt shown during `/usr/bin/security` create: no
- Prompt shown during ACL read before password reads: no
- Prompt shown during first `keychain-probe read`: yes, one GUI prompt
- User action: entered the login keychain password and clicked `Immer erlauben` / Always Allow.
- Prompt shown during ACL read after Always Allow: no
- Prompt shown during second `keychain-probe read`: no
- Prompt shown during ACL read after second read: no
- App name shown in prompt: `keychain-probe`
- Keychain named in prompt: `Anmeldung`
- Item named in prompt: `macos-keychain-analysis proof 05a cross binary read twice always allow`

Prompt screenshot:
- `observations/screenshots/proof-05a-always-allow-prompt.png`

Observed command result:
- Build exit code: 0
- Cleanup exit code: 44 when stale item was missing
- Create exit code: 0
- First keychain-probe read exit code: 0; read matched expected disposable secret: yes
- Second keychain-probe read exit code: 0; read matched expected disposable secret: yes
- All ACL list commands exited 0

Observed ACL details:
- ACL before reads included `/usr/bin/security` as a trusted application.
- ACL after first read with Always Allow included both the built `keychain-probe` executable path and `/usr/bin/security` as trusted applications.
- ACL after second read still included both the built `keychain-probe` executable path and `/usr/bin/security`.

Important finding:
- Always Allow persists by mutating the item ACL list: `keychain-probe` was added as a trusted application.
- This falsifies the hypothesis that Always Allow is only stored out-of-band outside the item ACL.

## Proof 06: security-cli create with explicit trusted keychain-probe

Creator: `/usr/bin/security`
Trusted reader requested at creation time: `packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe`

Command sequence:

```fish
/usr/bin/swift build --package-path packages/keychain-probe
/usr/bin/security delete-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-06.security-create-trust-probe
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe whoami
/usr/bin/security add-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-06.security-create-trust-probe -w disposable-proof-secret -l 'macos-keychain-analysis proof 06 security create trust probe' -T packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe acl-list --service macos-keychain-analysis.proof-06.security-create-trust-probe --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe read --service macos-keychain-analysis.proof-06.security-create-trust-probe --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe read --service macos-keychain-analysis.proof-06.security-create-trust-probe --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe acl-list --service macos-keychain-analysis.proof-06.security-create-trust-probe --account macos-keychain-analysis
```

Expected prompt behavior:
- `/usr/bin/security` creation with `-T keychain-probe` should be silent.
- Because the ACL includes `keychain-probe`, `keychain-probe read` was expected to be silent.
- ACL reads were previously observed as prompt-free, so `acl-list` was expected to be silent.

Observed prompt behavior:
- Prompt shown during cleanup: no; command exited 44 because the item was missing.
- Prompt shown during `/usr/bin/security` create with `-T keychain-probe`: no
- Prompt shown during first `keychain-probe acl-list` before password reads: yes
- User action on first ACL prompt: entered the login keychain password and clicked/pressed one-time `Erlauben`; did not choose `Immer erlauben`.
- Prompt shown during first `keychain-probe read`: no
- Prompt shown during second `keychain-probe read`: no
- Prompt shown during final `keychain-probe acl-list`: yes
- User action on final ACL prompt: entered the login keychain password and clicked/pressed one-time `Erlauben`; did not choose `Immer erlauben`.
- App name shown in prompts: `keychain-probe`
- Keychain named in prompts: `Anmeldung`
- Item named in prompts: `macos-keychain-analysis proof 06 security create trust probe`

Prompt screenshots:
- `observations/screenshots/proof-06-acl-prompt-before-read.png`
- `observations/screenshots/proof-06-acl-prompt-after-read.png`

Observed command result:
- Build exit code: 0
- Cleanup exit code: 44 when stale item was missing
- Create exit code: 0
- First ACL list exit code: 0
- First keychain-probe read exit code: 0; read matched expected disposable secret: yes
- Second keychain-probe read exit code: 0; read matched expected disposable secret: yes
- Final ACL list exit code: 0

Observed ACL details:
- ACL list before reads included the built `keychain-probe` executable path.
- ACL list after reads still included the built `keychain-probe` executable path.
- Unlike security-created items that trust `/usr/bin/security`, this `-T keychain-probe` item did not list `/usr/bin/security` as a trusted app in the captured ACL output.

Important finding:
- `security add-generic-password -T keychain-probe` pre-authorizes `keychain-probe` for secret reads: both `keychain-probe read` calls were silent.
- However, `keychain-probe acl-list` prompted when `keychain-probe` was the trusted app added by `-T`; one-time authorization did not persist to the later ACL read.
- This complicates the earlier proof 04b finding: ACL reads are not universally prompt-free. They were prompt-free for a security-created item whose ACL trusted `/usr/bin/security`, but prompted for an item explicitly trusting `keychain-probe` via `-T`.

Open questions:
- Why does `keychain-probe acl-list` prompt for this `-T keychain-probe` item even though the same binary is listed as trusted and secret reads are silent?
- Is this due to ACL-entry shape differences between default creator trust, Always Allow mutation, and `security -T` creation?

## Proof 06a: security-cli create with explicit trusted keychain-probe, read only

Creator: `/usr/bin/security`
Trusted reader requested at creation time: `packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe`

Command sequence:

```fish
/usr/bin/swift build --package-path packages/keychain-probe
/usr/bin/security delete-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-06a.security-create-trust-probe-read-only
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe whoami
/usr/bin/security add-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-06a.security-create-trust-probe-read-only -w disposable-proof-secret -l 'macos-keychain-analysis proof 06a security create trust probe read only' -T packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe read --service macos-keychain-analysis.proof-06a.security-create-trust-probe-read-only --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe read --service macos-keychain-analysis.proof-06a.security-create-trust-probe-read-only --account macos-keychain-analysis
```

Expected prompt behavior:
- No ACL reads are performed.
- If `security -T keychain-probe` fully pre-authorizes `keychain-probe`, both password reads should be silent.

Observed prompt behavior:
- Prompt shown during cleanup: no; command exited 44 because the item was missing.
- Prompt shown during `/usr/bin/security` create with `-T keychain-probe`: no
- Prompt shown during first `keychain-probe read`: yes, one GUI prompt
- Prompt shown during second `keychain-probe read`: yes, one GUI prompt
- App name shown in prompts: `keychain-probe`
- Keychain named in prompts: `Anmeldung`
- Item named in prompts: `macos-keychain-analysis proof 06a security create trust probe read only`

Prompt screenshots:
- `observations/screenshots/proof-06a-read1-prompt.png`
- `observations/screenshots/proof-06a-read2-prompt.png`

Prompt text observed:
- Both prompts used the key-access wording: `keychain-probe möchte auf den Schlüssel „macos-keychain-analysis proof 06a security create trust probe read only“ in deinem Schlüsselbund zugreifen.`
- Neither screenshot used the `vertraulichen Informationen verwenden` wording.

Observed command result:
- Build exit code: 0
- Cleanup exit code: 44 when stale item was missing
- Create exit code: 0
- First keychain-probe read exit code: 0; read matched expected disposable secret: yes
- Second keychain-probe read exit code: 0; read matched expected disposable secret: yes

Important finding:
- `security add-generic-password -T keychain-probe` did not make read-only access fully prompt-free in this isolated proof.
- The prompts were key-access prompts, not confidential-information prompts.
- This suggests `-T keychain-probe` may authorize secret-data use but not all item/key access needed by `SecItemCopyMatching`, or that the prompt is attached to a different authorization than the secret-read authorization.

## Proof 06b: security-cli create with explicit trusted keychain-probe, then Always Allow

Creator: `/usr/bin/security`
Trusted reader requested at creation time: `packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe`

Command sequence:

```fish
/usr/bin/swift build --package-path packages/keychain-probe
/usr/bin/security delete-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-06b.security-trust-probe-always-allow
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe whoami
/usr/bin/security add-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-06b.security-trust-probe-always-allow -w disposable-proof-secret -l 'macos-keychain-analysis proof 06b security trust probe always allow' -T packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe acl-list --service macos-keychain-analysis.proof-06b.security-trust-probe-always-allow --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe read --service macos-keychain-analysis.proof-06b.security-trust-probe-always-allow --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe acl-list --service macos-keychain-analysis.proof-06b.security-trust-probe-always-allow --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe read --service macos-keychain-analysis.proof-06b.security-trust-probe-always-allow --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe acl-list --service macos-keychain-analysis.proof-06b.security-trust-probe-always-allow --account macos-keychain-analysis
```

Observed prompt behavior:
- Prompt shown during cleanup: no; command exited 44 because the item was missing.
- Prompt shown during `/usr/bin/security` create with `-T keychain-probe`: no
- Prompt shown during ACL read before Always Allow: no
- Prompt shown during first `keychain-probe read`: yes, one GUI prompt
- User action: entered the login keychain password and clicked `Immer erlauben` / Always Allow.
- Prompt shown during ACL read after Always Allow: no
- Prompt shown during second `keychain-probe read`: no
- Prompt shown during final ACL read: no
- App name shown in prompt: `keychain-probe`
- Keychain named in prompt: `Anmeldung`
- Item named in prompt: `macos-keychain-analysis proof 06b security trust probe always allow`

Prompt screenshot:
- `observations/screenshots/proof-06b-always-allow-prompt.png`

Observed command result:
- Build exit code: 0
- Cleanup exit code: 44 when stale item was missing
- Create exit code: 0
- First read exit code: 0; read matched expected disposable secret: yes
- Second read exit code: 0; read matched expected disposable secret: yes
- All ACL list commands exited 0

Observed ACL details:
- ACL before Always Allow included the built `keychain-probe` executable path.
- ACL after Always Allow still included the built `keychain-probe` executable path.
- The decoded trusted application path list looked unchanged, but the hex partition ACL data changed to include `cdhash:46766978ac756e31662040582e8d8b1f27838b17` in addition to `apple-tool:`.

Important finding:
- For an item created with `security -T keychain-probe`, Always Allow on the first remaining key-access prompt made later reads and ACL reads silent.
- The persistent change may not be visible as an additional trusted application path because `keychain-probe` was already present, but it is visible in the partition/hex ACL data.

## Proof 07: ACL authorization decoder

Tooling change:
- `keychain-probe acl-list` now includes `authorizations` and `authorizationsRaw` from `SecACLCopyAuthorizations`.

Cases:
- `security-default`: item created by `/usr/bin/security add-generic-password`
- `security-trust-probe`: item created by `/usr/bin/security add-generic-password -T keychain-probe`
- `probe-default`: item created by `keychain-probe add`

Observed prompt behavior:
- First run: no GUI prompts.
- Verification run: no GUI prompts.
- Cleanup deletes for stale items also did not prompt.

Observed command result:
- All create commands exited 0.
- All `keychain-probe acl-list` commands exited 0.
- `authorizations` was `[]` for every ACL entry in every case.
- `authorizationsRaw` was `[]` for every ACL entry in every case.

Observed ACL details:
- `security-default` trusted application paths included `/usr/bin/security`.
- `security-trust-probe` trusted application paths included the built `keychain-probe` executable path.
- `probe-default` trusted application paths included the built `keychain-probe` executable path.
- Partition plist hex still differs by creation mode and remains the useful decoded signal so far.

Important finding:
- `SecACLCopyAuthorizations` did not expose useful authorization tags for these generated generic-password ACL entries on this macOS version; all entries returned empty authorization arrays.
- Prompt differences are therefore not explained by authorization tags from this API. The partition-list plist and trusted application paths remain more informative.

## Proof 08: partition-list decoder

Tooling change:
- `keychain-probe acl-list` now decodes hex-encoded partition-list plist ACL descriptions into `partitionList` arrays.

Cases:
- `security-default`
- `security-trust-probe`
- `probe-default`
- `security-trust-probe-after-always-allow`

Observed prompt behavior:
- `security-default`: no prompt during ACL list.
- `security-trust-probe`: no prompt during ACL list.
- `probe-default`: no prompt during ACL list.
- `security-trust-probe-after-always-allow`: one prompt during the intentional `keychain-probe read`; user chose `Immer erlauben` / Always Allow.
- ACL list after Always Allow: no prompt.

Prompt screenshot:
- `observations/screenshots/proof-08-always-allow-prompt.png`

Decoded partition-list results:
- `security-default`: `partitionList` was `["apple-tool:"]`.
- `security-trust-probe`: `partitionList` was `["apple-tool:"]` even though trusted application paths included `keychain-probe`.
- `probe-default`: `partitionList` was `["cdhash:5f068048a6257365454de94e07b7f8410d7b6a9e"]`.
- `security-trust-probe-after-always-allow` before Always Allow: `partitionList` was `["apple-tool:"]`.
- `security-trust-probe-after-always-allow` after Always Allow: `partitionList` was `["apple-tool:", "cdhash:5f068048a6257365454de94e07b7f8410d7b6a9e"]`.

Important finding:
- The decoded partition list explains the explicit-trust behavior better than trusted application paths alone.
- `security -T keychain-probe` adds `keychain-probe` to trusted application paths but leaves partition list at `apple-tool:`.
- `keychain-probe`-created items use a `cdhash:` partition entry.
- Always Allow adds the `keychain-probe` `cdhash:` partition entry to a `security -T keychain-probe` item, after which access can become silent.

## Proof 09: security-cli set cdhash partition

Goal:
- Derive the built `keychain-probe` CDHash via `codesign`.
- Create a generic password with `/usr/bin/security`.
- Attempt to set partition list to `apple-tool:,cdhash:<keychain-probe-cdhash>` with `security set-generic-password-partition-list`.
- Read with `keychain-probe`.

Derived CDHash:
- `5f068048a6257365454de94e07b7f8410d7b6a9e`

Attempted partition list:
- `apple-tool:,cdhash:5f068048a6257365454de94e07b7f8410d7b6a9e`

Observed command result:
- After manually unlocking the login keychain, item creation succeeded.
- Before partition update, ACL partition list was `["apple-tool:"]`.
- `security set-generic-password-partition-list ... -S apple-tool:,cdhash:...` failed with exit code 1.
- Error: `SecKeychainItemSetAccessWithPassword: The user name or passphrase you entered is not correct.`
- After failed partition update, ACL partition list remained `["apple-tool:"]`.
- First `keychain-probe read` succeeded after user authorization.
- Second `keychain-probe read` succeeded after user authorization.
- Final ACL partition list still remained `["apple-tool:"]`.

Observed prompt behavior:
- `set-generic-password-partition-list` did not complete successfully in the non-interactive proof process because it asks for a deprecated keychain password on stdin.
- First `keychain-probe read`: two GUI prompts.
- Second `keychain-probe read`: two GUI prompts again.
- User action: entered the login keychain password and clicked/pressed one-time `Erlauben` for all four prompts; did not choose `Immer erlauben`.

Prompt screenshots:
- `observations/screenshots/proof-09-read1-prompt-1.png`
- `observations/screenshots/proof-09-read1-prompt-2.png`
- `observations/screenshots/proof-09-read2-prompt-1.png`
- `observations/screenshots/proof-09-read2-prompt-2.png`

Important finding:
- The proof did not yet prove whether programmatically setting `cdhash:` works, because `security set-generic-password-partition-list` failed before mutating the item.
- The failed mutation left the item equivalent to a normal `/usr/bin/security`-created item with `partitionList: ["apple-tool:"]`.
- As expected for that state, cross-binary `keychain-probe read` prompted on each read when only one-time approval was used.

Open question:
- Can `security set-generic-password-partition-list` succeed if run in a truly interactive terminal or with the correct `-k` keychain password input? If yes, does adding `cdhash:<keychain-probe>` make `keychain-probe read` silent?

## Proof 10: Always Allow after keychain-probe rebuild

Goal:
- Create a generic password with `/usr/bin/security`.
- Read with `keychain-probe` and choose Always Allow.
- Verify a second read is silent before rebuild.
- Rebuild `keychain-probe` with a changed source marker and changed CDHash.
- Read the same item again.

Observed CDHashes:
- Initial `keychain-probe` CDHash: `30817d706d7ab2c9394f7835ff364ebb7ec3d956`
- Rebuilt `keychain-probe` CDHash: `d38cbfcfc6cf8829b2cfa2a1486e2941cee1e087`
- CDHash changed: yes

Observed prompt behavior:
- First `keychain-probe read`: prompted.
- User action on first prompt: selected `Immer erlauben` / Always Allow.
- Second `keychain-probe read` before rebuild: silent.
- Post-rebuild `keychain-probe read`: prompted again.
- User action on post-rebuild prompt: selected `Erlauben` / Allow Once.

Prompt screenshots:
- `observations/screenshots/proof-10-first-read-always-allow-prompt.png`
- `observations/screenshots/proof-10-post-rebuild-read-prompt.png`

Prompt text observed:
- `keychain-probe möchte deine vertraulichen Informationen verwenden, die in „macos-keychain-analysis proof 10 always allow after probe rebuild“ in deinem Schlüsselbund gesichert sind.`

Observed ACL details before rebuild:
- After Always Allow, ACL output included a partition list with the initial CDHash:
  - `apple-tool:`
  - `cdhash:30817d706d7ab2c9394f7835ff364ebb7ec3d956`
- The ACL output also included trusted application paths for:
  - the built `keychain-probe` executable path
  - `/usr/bin/security`

Important finding:
- Always Allow was invalidated by rebuilding `keychain-probe` when the CDHash changed.
- This supports the hypothesis that the persistent Always Allow grant is tied to a code identity / CDHash, not just the filesystem path.
- This is relevant for Varlock helper updates: users may be prompted again after helper binary updates if the persisted grant is CDHash-based.

## Proof 11: keychain-probe-created item after keychain-probe rebuild

Goal:
- Create a generic password with `keychain-probe`.
- Verify reads are silent before rebuild.
- Rebuild `keychain-probe` with a changed source marker and changed CDHash.
- Read the same item again after rebuild.

Observed CDHashes:
- Initial `keychain-probe` CDHash: `4bfb776864b888eea760e5fdc664dc3c1e165fd8`
- Rebuilt `keychain-probe` CDHash: `282c7dffc6e8b24734267b21f65c0bb2c4a2c4f3`
- CDHash changed: yes

Observed prompt behavior:
- User reported four prompts during the proof run.
- Two prompts used the confidential-information wording.
- Two prompts used the key-access wording.
- The command output still showed all reads succeeding and matching the expected disposable secret.

Prompt screenshots:
- `observations/screenshots/proof-11-prompt-1-confidential-info.png`
- `observations/screenshots/proof-11-prompt-2-key-access.png`
- `observations/screenshots/proof-11-prompt-3-confidential-info.png`
- `observations/screenshots/proof-11-prompt-4-key-access.png`

Prompt text variants observed:
- `keychain-probe möchte deine vertraulichen Informationen verwenden, die in „macos-keychain-analysis proof 11 probe created after rebuild“ in deinem Schlüsselbund gesichert sind.`
- `keychain-probe möchte auf den Schlüssel „macos-keychain-analysis proof 11 probe created after rebuild“ in deinem Schlüsselbund zugreifen.`

Observed ACL details:
- Before rebuild, ACL output included the built `keychain-probe` executable path as a trusted application.
- Before rebuild, partition list included the initial CDHash only:
  - `cdhash:4bfb776864b888eea760e5fdc664dc3c1e165fd8`
- After rebuild, reads still succeeded silently even though the partition list still contained only the old initial CDHash.
- After rebuild, ACL output still showed the same trusted application path and the old CDHash partition entry.

Important finding:
- This run did not prove prompt-free access after rebuild. The user observed four prompts.
- An item created by `keychain-probe` remained readable after rebuild in the sense that all reads succeeded, but access was not silent.
- The four prompts came in the same two wording classes seen in earlier double-prompt proofs: confidential-information use and key access.
- The ACL output still showed the old initial CDHash in the partition list after rebuild, which may explain why the rebuilt ad-hoc binary prompted.

## Proof 12: signed keychain-probe-created item after rebuild

Goal:
- Build `keychain-probe`.
- Sign it with stable Developer ID identity `584EFC30BFC2F2BAC6BC900457C8BB19671D0D18` / `Developer ID Application: Benjamin Jesuiter (BB38WRH6VJ)`.
- Use stable codesign identifier `dev.bjesuiter.macos-keychain-analysis.keychain-probe`.
- Create a Keychain item with the signed probe.
- Rebuild and re-sign the probe with the same identity and identifier.
- Read the same item after rebuild.

Observed signing identity:
- `Developer ID Application: Benjamin Jesuiter (BB38WRH6VJ)`
- Team ID: `BB38WRH6VJ`
- Codesign identifier: `dev.bjesuiter.macos-keychain-analysis.keychain-probe`

Observed code identity:
- Initial CDHash: `9d0fbe266c74ef2749b116d1bea353d7b8b7dd0a`
- Rebuilt CDHash: `994c3496916983d648e7bd7a36820e2212e6da8b`
- CDHash changed: yes
- Designated requirement changed: no

Designated requirement both before and after rebuild:

```text
identifier "dev.bjesuiter.macos-keychain-analysis.keychain-probe" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = BB38WRH6VJ
```

Observed prompt behavior:
- No prompts were reported during create, pre-rebuild reads, ACL list, post-rebuild reads, or final ACL list.
- First post-rebuild read succeeded and matched the expected disposable secret.
- Second post-rebuild read succeeded and matched the expected disposable secret.

Observed ACL details:
- ACL output included the built `keychain-probe` executable path as a trusted application.
- Partition list used Team ID instead of raw CDHash:
  - `teamid:BB38WRH6VJ`
- The Team ID partition remained the same after rebuild.

Important finding:
- Stable Developer ID signing preserved access across rebuild even though the CDHash changed.
- This supports the intended model: use stable signing identity/designated requirement rather than ad-hoc rebuilt binaries or CDHash grants.
- For Varlock helper updates, a stable signed helper should avoid re-prompting users merely because the helper binary was updated.

## Proof 13: security-created item, Always Allow, signed keychain-probe after rebuild

Goal:
- Create a generic password with `/usr/bin/security`.
- Build and sign `keychain-probe` with stable Developer ID identity `584EFC30BFC2F2BAC6BC900457C8BB19671D0D18` / `Developer ID Application: Benjamin Jesuiter (BB38WRH6VJ)`.
- Read the security-created item with signed `keychain-probe` and choose Always Allow.
- Rebuild and re-sign `keychain-probe` with the same identity and identifier.
- Read the same item after rebuild.

Observed signing identity:
- `Developer ID Application: Benjamin Jesuiter (BB38WRH6VJ)`
- Team ID: `BB38WRH6VJ`
- Codesign identifier: `dev.bjesuiter.macos-keychain-analysis.keychain-probe`

Observed code identity:
- Initial CDHash: `a2f8b24f83f252a140d975cc9d37856921c61603`
- Rebuilt CDHash: `d135d99545a8e2030370de34da17d8282cde8dcf`
- CDHash changed: yes
- Designated requirement changed: no

Observed prompt behavior:
- First read before rebuild showed two prompts.
- User action: clicked `Immer erlauben` / Always Allow on both prompts.
- Second read before rebuild succeeded.
- Post-rebuild reads succeeded.
- No post-rebuild prompts were reported.

Prompt screenshots:
- `observations/screenshots/proof-13-first-read-always-allow-prompt-1.png`
- `observations/screenshots/proof-13-first-read-always-allow-prompt-2.png`

Prompt text observed:
- `keychain-probe möchte deine vertraulichen Informationen verwenden, die in „macos-keychain-analysis proof 13 security created signed always allow rebuild“ in deinem Schlüsselbund gesichert sind.`

Observed ACL details after Always Allow:
- Trusted application paths included two `keychain-probe` path entries and `/usr/bin/security`.
- Partition list included:
  - `apple-tool:`
  - `teamid:BB38WRH6VJ`
  - `cdhash:abbc62d59991fa1bb881611544c5579393d548a6`

Important finding:
- For a stably signed `keychain-probe`, Always Allow on a `/usr/bin/security`-created item survived rebuild/re-sign even though CDHash changed.
- The ACL partition list included `teamid:BB38WRH6VJ`, which likely explains why the rebuilt signed binary could still read without another prompt.
- This differs from Proof 10's ad-hoc signed helper, where Always Allow was invalidated by CDHash change.

### Proof 13 rerun: clean signed Always Allow behavior

A second Proof 13 run was performed because the previous run may have included stale state.

Observed code identity:
- Initial CDHash: `5eac9da21075852d3d2cdf5a1047d5d96b6a0c02`
- Rebuilt CDHash: `31aee137f46571772b0382c06c96117efa86bf5f`
- CDHash changed: yes
- Designated requirement changed: no

Observed prompt behavior:
- Exactly one prompt appeared on the first read before rebuild.
- User action: clicked `Immer erlauben` / Always Allow.
- No post-rebuild prompts were reported.
- Post-rebuild reads succeeded and matched the expected disposable secret.

Prompt screenshot:
- `observations/screenshots/proof-13-rerun-first-read-always-allow-prompt.png`

Observed ACL details after Always Allow:
- Trusted application paths included the built `keychain-probe` path and `/usr/bin/security`.
- Partition list included:
  - `apple-tool:`
  - `teamid:BB38WRH6VJ`
- No `cdhash:` entry was present in the clean rerun partition list.

Important finding:
- For a stably signed `keychain-probe`, a security-created item can be Always Allowed once and remains readable after rebuild/re-sign.
- The clean rerun supports that the durable grant is based on the stable Team ID/signing identity, not the changing CDHash.

## Proof 14: cross-process read of two secrets

Creator: `/usr/bin/security`
Reader: `packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe`

Command sequence:

```fish
bun run proof:14
```

Expanded read sequence:

```fish
/usr/bin/security add-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-14.cross-process-two-secrets.one -w disposable-proof-secret-one -l 'macos-keychain-analysis proof 14 cross-process two secrets one'
/usr/bin/security add-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-14.cross-process-two-secrets.two -w disposable-proof-secret-two -l 'macos-keychain-analysis proof 14 cross-process two secrets two'
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe read --service macos-keychain-analysis.proof-14.cross-process-two-secrets.one --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe read --service macos-keychain-analysis.proof-14.cross-process-two-secrets.two --account macos-keychain-analysis
```

Expected prompt behavior:
- Based on earlier single-secret reads, each cross-process read was expected to show two prompts.
- Across two secrets, expected total: four prompts.

Observed prompt behavior:
- Prompt shown during cleanup: no; commands exited 44 because items were missing.
- Prompt shown during `/usr/bin/security` create: no.
- Prompt shown during first `keychain-probe read`: yes, two GUI prompts.
- Prompt shown during second `keychain-probe read`: yes, two GUI prompts.
- Total prompts: 4.
- App name shown in prompts: `keychain-probe`.
- Keychain named in prompts: `Anmeldung`.
- User action: allowed the prompts. The first three prompts were screenshot; the fourth prompt was not screenshot but was reported to look identical to the second prompt shape.

Prompt screenshots:
- `observations/screenshots/proof-14-first-read-prompt-1.png`
- `observations/screenshots/proof-14-first-read-prompt-2.png`
- `observations/screenshots/proof-14-second-read-prompt-1.png`
- Fourth prompt: no screenshot captured; reported identical to the second prompt wording/shape.

Prompt text observed:
- First read, prompt 1: `keychain-probe möchte deine vertraulichen Informationen verwenden, die in „macos-keychain-analysis proof 14 cross-process two secrets one“ in deinem Schlüsselbund gesichert sind.`
- First read, prompt 2: `keychain-probe möchte auf den Schlüssel „macos-keychain-analysis proof 14 cross-process two secrets one“ in deinem Schlüsselbund zugreifen.`
- Second read, prompt 1: `keychain-probe möchte deine vertraulichen Informationen verwenden, die in „macos-keychain-analysis proof 14 cross-process two secrets two“ in deinem Schlüsselbund gesichert sind.`
- Second read, prompt 2: not screenshot, but reported to match the first read's second prompt with item `...two`.

Observed command result:
- Build exit code: 0.
- Cleanup exit code: 44 when stale items were missing.
- Create exit codes: 0.
- First `keychain-probe read` exit code: 0.
- First read matched expected disposable secret: yes.
- Second `keychain-probe read` exit code: 0.
- Second read matched expected disposable secret: yes.

Important finding:
- Reading two `/usr/bin/security`-created secrets from the cross-process `keychain-probe` produced four prompts total.
- This confirms the earlier single-secret behavior scales linearly: one secret read can produce two GUI prompts, so two distinct secret reads can produce four GUI prompts.

## Proof 15: cross-process read of two secrets after unlock preflight

Creator: `/usr/bin/security`
Reader: `packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe`

Goal:
- Test whether the explicit `unlockForAccessFix` / keychain unlock preflight used by current Varlock `fix-access` reduces later cross-process read prompts.

Command sequence:

```fish
bun run proof:15
```

Expanded relevant sequence:

```fish
/usr/bin/security add-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-15.cross-process-two-secrets-after-unlock.one -w disposable-proof-secret-one -l 'macos-keychain-analysis proof 15 cross-process two secrets after unlock one'
/usr/bin/security add-generic-password -a macos-keychain-analysis -s macos-keychain-analysis.proof-15.cross-process-two-secrets-after-unlock.two -w disposable-proof-secret-two -l 'macos-keychain-analysis proof 15 cross-process two secrets after unlock two'
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe unlock-for-access-fix
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe read --service macos-keychain-analysis.proof-15.cross-process-two-secrets-after-unlock.one --account macos-keychain-analysis
packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe read --service macos-keychain-analysis.proof-15.cross-process-two-secrets-after-unlock.two --account macos-keychain-analysis
```

Observed unlock preflight result:

```json
{"ok":true,"result":{"changed":false,"unlocked":true}}
```

Observed prompt behavior:
- Prompt shown during cleanup: no; commands exited 44 because items were missing.
- Prompt shown during `/usr/bin/security` create: no.
- Prompt shown during `unlock-for-access-fix`: no.
- Prompt shown during first `keychain-probe read`: yes, two GUI prompts.
- Prompt shown during second `keychain-probe read`: yes, two GUI prompts.
- Total prompts after unlock preflight: 4.
- App name shown in prompts: `keychain-probe`.
- Keychain named in prompts: `Anmeldung`.

Prompt screenshots:
- `observations/screenshots/proof-15-first-read-prompt-1.png`
- `observations/screenshots/proof-15-first-read-prompt-2.png`
- `observations/screenshots/proof-15-second-read-prompt-1.png`
- `observations/screenshots/proof-15-second-read-prompt-2.png`

Prompt text observed:
- First read, prompt 1: `keychain-probe möchte deine vertraulichen Informationen verwenden, die in „macos-keychain-analysis proof 15 cross-process two secrets after unlock one“ in deinem Schlüsselbund gesichert sind.`
- First read, prompt 2: `keychain-probe möchte auf den Schlüssel „macos-keychain-analysis proof 15 cross-process two secrets after unlock one“ in deinem Schlüsselbund zugreifen.`
- Second read, prompt 1: `keychain-probe möchte deine vertraulichen Informationen verwenden, die in „macos-keychain-analysis proof 15 cross-process two secrets after unlock two“ in deinem Schlüsselbund gesichert sind.`
- Second read, prompt 2: `keychain-probe möchte auf den Schlüssel „macos-keychain-analysis proof 15 cross-process two secrets after unlock two“ in deinem Schlüsselbund zugreifen.`

Observed command result:
- Build exit code: 0.
- Cleanup exit code: 44 when stale items were missing.
- Create exit codes: 0.
- `unlock-for-access-fix` exit code: 0.
- First `keychain-probe read` exit code: 0.
- First read matched expected disposable secret: yes.
- Second `keychain-probe read` exit code: 0.
- Second read matched expected disposable secret: yes.

Important finding:
- The preflight unlock does not reduce the cross-process prompt count in this scenario.
- Even with the keychain already unlocked (`changed=false`, `unlocked=true`), reading two `/usr/bin/security`-created secrets from `keychain-probe` still produced four prompts total.
- This suggests the prompt storm is per-item/per-ACL authorization, not merely keychain-lock state.

## Proof 06c: security CLI `-T` with correctly signed keychain-probe

Creator: `/usr/bin/security`
Trusted reader passed via `-T`: Developer ID signed `packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe`

Goal:
- Re-test Proof 06a with the stable Developer ID signed helper identity used in Proofs 12/13.
- Earlier `-T` proofs used whatever debug/ad-hoc identity the helper had at the time; this proof signs `keychain-probe` before passing it to `/usr/bin/security add-generic-password -T`.

Command sequence:

```fish
bun run proof:06c
```

Observed signing identity:
- `Developer ID Application: Benjamin Jesuiter (BB38WRH6VJ)`
- Team ID: `BB38WRH6VJ`
- Codesign identifier: `dev.bjesuiter.macos-keychain-analysis.keychain-probe`
- CDHash: `14e240ab9b89b4518109e602bceaff1996a436a0`

Observed prompt behavior:
- Prompt shown during signing/build: no.
- Prompt shown during `/usr/bin/security add-generic-password ... -T signed-keychain-probe`: no.
- Prompt shown during first signed `keychain-probe read`: yes, one GUI prompt.
- Prompt shown during second signed `keychain-probe read`: yes, one GUI prompt.
- Total read prompts: 2.
- App name shown in prompts: `keychain-probe`.
- Keychain named in prompts: `Anmeldung`.
- Prompt wording for both screenshots was the key-access wording, not the confidential-information wording.

Prompt screenshots:
- `observations/screenshots/proof-06c-first-read-prompt.png`
- `observations/screenshots/proof-06c-second-read-prompt.png`

Prompt text observed:
- `keychain-probe möchte auf den Schlüssel „macos-keychain-analysis proof 06c security create trust signed probe read only“ in deinem Schlüsselbund zugreifen.`

Observed command result:
- Build exit code: 0.
- Codesign exit code: 0.
- Cleanup exit code: 44 when stale item was missing.
- `/usr/bin/security add-generic-password ... -T signed-keychain-probe` exit code: 0.
- First signed `keychain-probe read` exit code: 0; value matched expected disposable secret.
- Second signed `keychain-probe read` exit code: 0; value matched expected disposable secret.
- ACL list after reads exit code: 0.

Observed ACL details:
- Trusted application paths included the signed `keychain-probe` path.
- Partition list included only:
  - `apple-tool:`
- No `teamid:BB38WRH6VJ` partition was present from `security ... -T` alone.

Important finding:
- Even with correctly signed `keychain-probe`, `/usr/bin/security add-generic-password -T signed-keychain-probe` is not enough to make reads prompt-free.
- It reduced/changed the prompt shape compared with some earlier cross-process reads: each read showed one key-access prompt, not two prompts.
- Because no `teamid:` partition was present, `-T` appears to add only path-based trusted application data, not the durable Team ID partition grant observed after Always Allow on the signed helper.
