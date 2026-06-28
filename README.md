# macOS Keychain Analysis

Minimal, reproducible Bun scripts for observing macOS Keychain prompt behavior.

## Setup

```fish
bun install
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
