# Proof 09 vs original `addToACL` semantics

The semantic difference is that proof 09 tries to change the partition-list identity gate, while the original `addToACL` flow changes the legacy trusted-application ACL gate. They are adjacent in the old Keychain access model, but they are not the same operation.

## Original `addToACL`

Original Varlock picker flow:

1. Start from an existing Keychain item.
2. Read the item’s legacy `SecAccess`.
3. Iterate `SecACL` entries.
4. For each ACL with an explicit trusted-app list, append a `SecTrustedApplication` for the Varlock helper executable path.
5. Write the mutated `SecAccess` back with `SecKeychainItemSetAccess`.

Its intended semantic statement is:

> This concrete Varlock helper application path is now one of the trusted applications for this item’s ACL entries.

So it is path/trusted-app-list oriented.

## Proof 09

Proof 09 does not use `SecTrustedApplicationCreateFromPath` or `SecACLSetContents`.

It tries this instead:

```sh
security add-generic-password ... -T keychain-probe
security set-generic-password-partition-list \
  -S apple-tool:,cdhash:<keychain-probe-cdhash>
```

Its intended semantic statement is:

> This item’s partition list now permits callers matching `apple-tool:` and this binary’s code hash.

So it is code-signature/CDHash partition oriented.

## Why that matters

`addToACL` adds the app to the visible legacy trusted application list.

Proof 09 tries to reproduce the Always Allow final state, which observations suggest is better explained by the partition list containing a `cdhash:` entry, not only by the trusted app path.

In short:

- `addToACL`: allow this app path as a trusted application.
- Proof 09: allow this code identity through the partition list.

## Practical outcome in the recorded proof

Proof 09 did not actually mutate the partition list:

- Before: `["apple-tool:"]`
- Attempted set: `apple-tool:,cdhash:<probe>`
- Command failed.
- After: still `["apple-tool:"]`

So proof 09’s observed behavior stayed equivalent to a normal `/usr/bin/security`-created item:

- `keychain-probe` read prompted.
- Second read prompted again after one-time allow.

## Bottom line

The original `addToACL` flow is a legacy ACL trusted-app append.

Proof 09 is an attempted partition-list/CDHash allowlisting flow.

They differ in what they grant access to:

- `addToACL` grants to an application path/trusted app record.
- Proof 09 grants to a code-hash partition identity, if it succeeds.
