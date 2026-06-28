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
# {"action":"exit"}
```

## Proofs

Run the first proof, which uses the macOS `security` CLI:

```fish
bun run proof:01
```

Clean up its disposable Keychain items:

```fish
bun run proof:01:cleanup
```

The scripts use disposable test values only. They print each command, expected prompt behavior, observed command result, and cleanup instructions.
