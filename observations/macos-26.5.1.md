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
