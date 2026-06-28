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
