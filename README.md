# macOS Keychain Analysis

Minimal, reproducible Bun scripts for observing macOS Keychain prompt behavior.

## Setup

```fish
bun install
```

## Swift probe package

Build the tiny Swift executable:

```fish
bun run keychain-probe:build
```

`keychain-probe` uses Security.framework directly, mirroring the relevant shape of Varlock's daemon-side Keychain access without Varlock's encryption, IPC, status bar, or session code.

```fish
bun run keychain-probe:run -- add --service dev.varlock.probe --account alice --value secret
bun run keychain-probe:run -- read --service dev.varlock.probe --account alice
bun run keychain-probe:run -- metadata --service dev.varlock.probe --account alice
bun run keychain-probe:run -- acl-list --service dev.varlock.probe --account alice
bun run keychain-probe:run -- acl-contains --service dev.varlock.probe --account alice --path /path/to/binary
bun run keychain-probe:run -- add-to-acl --service dev.varlock.probe --account alice --path /path/to/binary
bun run keychain-probe:run -- fix-access --service dev.varlock.probe --account alice
bun run keychain-probe:run -- verify-access-and-fix-acl --service dev.varlock.probe --account alice
bun run keychain-probe:run -- upsert --service dev.varlock.probe --account alice --value changed
bun run keychain-probe:run -- delete --service dev.varlock.probe --account alice
```

For long-running-process tests, `daemon-stdio` accepts one JSON request per line:

```fish
bun run keychain-probe:run -- daemon-stdio
# then type lines like:
# {"command":"add","service":"dev.varlock.probe","account":"alice","value":"secret"}
# {"command":"read","service":"dev.varlock.probe","account":"alice"}
# {"command":"acl-list","service":"dev.varlock.probe","account":"alice"}
# {"command":"acl-contains","service":"dev.varlock.probe","account":"alice","path":"/path/to/binary"}
# {"command":"fix-access","service":"dev.varlock.probe","account":"alice"}
# {"command":"verify-access-and-fix-acl","service":"dev.varlock.probe","account":"alice"}
# {"action":"exit"}
```

## Proofs

Run a proof:

```fish
bun run proof:01
bun run proof:02
bun run proof:03
bun run proof:04
bun run proof:04a
bun run proof:04b
bun run proof:06c
bun run proof:14
bun run proof:15
bun run proof:16
bun run proof:17
bun run proof:18
bun run proof:19
```

Clean up disposable Keychain items:

```fish
bun run proof:01:cleanup
bun run proof:02:cleanup
bun run proof:03:cleanup
bun run proof:04:cleanup
bun run proof:04a:cleanup
bun run proof:04b:cleanup
bun run proof:06c:cleanup
bun run proof:14:cleanup
bun run proof:15:cleanup
bun run proof:16:cleanup
bun run proof:17:cleanup
bun run proof:18:cleanup
bun run proof:19:cleanup
```

The scripts use disposable test values only. They print each command, expected prompt behavior, observed command result, and cleanup instructions.

## Current observations

Observations are stored in `./observations`.

Important findings so far:

- Proof 01: `/usr/bin/security` can create and read its own generic password without a GUI prompt.
- Proof 02: `keychain-probe` can create and read its own generic password without a GUI prompt when the item ACL trusts that binary.
- Proof 03: cross-binary secret reads prompt when `keychain-probe` creates the item and `/usr/bin/security` reads the password.
- Proof 04 and 04a: cross-binary secret reads prompt when `/usr/bin/security` creates the item and `keychain-probe` reads the password.
- Proof 04b: reading an item's ACLs with `keychain-probe acl-list` is allowed without a GUI prompt for a default `/usr/bin/security`-created item that trusts `/usr/bin/security`.
- Proof 04a: `keychain-probe read` alone produced two prompt wordings for one password read: one about using confidential information, and one about accessing the key. This is not caused by a later ACL read.
- Proof 05: one-time authorization does not persist for the next cross-binary read and does not add the reader binary to the persistent ACL; the second read prompts again.
- Proof 05a: Always Allow persists by mutating the item ACL list; `keychain-probe` is added as a trusted application, and the second read is silent.
- Proof 06 and 06a: `/usr/bin/security add-generic-password -T keychain-probe` adds `keychain-probe` to the ACL, but does not make `keychain-probe` fully prompt-free. Read-only proof 06a still prompted with key-access wording, while the reads succeeded.
- Proof 06b: choosing Always Allow after `security -T keychain-probe` made later reads and ACL reads silent; trusted app paths looked unchanged, but partition/hex ACL data gained a `cdhash:...` entry.
- Proof 09: `security set-generic-password-partition-list` is not a good automation tool for this project because it prompts for the keychain password on command-line stdin; omitting `-k` fails in non-interactive proof runs, while using `-k` would expose the password insecurely.
- Proof 18: tests the focused no-`-T` case: `/usr/bin/security` creates an item without pre-trusting the helper, the signed helper reads it, the user chooses Always Allow, then repeated reads check whether that post-prompt state is prompt-free and whether ACL output shows `teamid:` partition trust and/or a legacy trusted-app path.
- Proof 19: tests a partition-clean variant: `/usr/bin/security` creates an item without `-T`, a native Apple dialog collects the login keychain password for `security set-generic-password-partition-list`, the script sets `apple-tool:,teamid:<TEAMID>` without adding the helper path, then signed-helper reads check whether partition-list trust alone is prompt-free.
