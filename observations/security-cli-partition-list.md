# security CLI partition-list observations

## `add-generic-password` cannot set partition lists directly

The macOS `security add-generic-password` command supports trusted application paths via `-T`, but it does not expose an `-S` partition-list option.

Relevant distinction:

```fish
security add-generic-password ... -T /path/to/app
```

sets a trusted application path during item creation.

```fish
security set-generic-password-partition-list \
  -a ACCOUNT \
  -s SERVICE \
  -S 'apple-tool:,cdhash:<cdhash>'
```

sets partition IDs after the item already exists.

## Implication

To recreate the state produced by clicking **Always Allow**, the CLI appears to require two steps:

1. Create the item and set trusted application path with `add-generic-password -T`.
2. Mutate partition IDs with `set-generic-password-partition-list -S`.

This is why proof 09 uses a two-command flow instead of trying to pass the `cdhash:` partition during `add-generic-password`.

## `set-generic-password-partition-list` is not suitable for our automated proof flow

Proof 09 showed that `security set-generic-password-partition-list` prompts for the login keychain password on command-line stdin:

```text
(deprecated) password to unlock default:
```

In a non-interactive proof run, no password is supplied, so the command fails with:

```text
SecKeychainItemSetAccessWithPassword: The user name or passphrase you entered is not correct.
```

The command offers `-k`, but the help marks it deprecated/insecure. Supplying the keychain password via `-k` would expose it in shell history, process arguments, logs, or agent transcripts.

Conclusion: treat `set-generic-password-partition-list` as a diagnostic/admin CLI, not the right automation path for this project. If we need to mutate partition lists programmatically, prefer a small Security.framework helper that can use normal macOS authorization flows.
