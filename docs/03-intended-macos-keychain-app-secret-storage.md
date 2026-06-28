# Intended macOS Keychain app secret storage

The intended macOS path is that the same signed app that owns or created the Keychain item updates it under a stable code-signing identity.

Do not rely on legacy ACL surgery as the primary design.

## Normal macOS app flow

Use Keychain Services directly:

- `SecItemAdd` to create an item
- `SecItemUpdate` to update an item
- `SecItemCopyMatching` to read an item

Sign the app consistently with:

- stable bundle identifier
- stable Team ID / signing certificate
- stable designated requirement
- optional Keychain Access Group entitlement if multiple apps, extensions, or helpers need shared access

With a stable signing identity, macOS can treat app updates as the same app instead of a new unknown binary. That avoids re-prompting merely because the binary contents changed.

## App groups and helper apps

For sharing secrets between related binaries, use Keychain Access Groups via entitlements.

Conceptually:

```xml
keychain-access-groups = [
  "$(AppIdentifierPrefix)com.example.shared"
]
```

All signed binaries with the same Team ID and the shared entitlement can access the shared Keychain items.

This is the modern Apple-supported model for sharing secrets between an app, helper, extension, login item, or related bundled component.

## Avoid depending on legacy ACL mechanisms

Avoid building the main design around:

- `SecTrustedApplication`
- `SecACLSetContents`
- `SecKeychainItemSetAccess`
- `security -T`
- `security set-*-partition-list`
- `cdhash:` grants

Those mechanisms are legacy or compatibility paths. They are brittle for unsigned or ad-hoc CLI helpers because a rebuild changes the CDHash, which can invalidate previous Always Allow grants.

Proof 10 demonstrated this for the local `keychain-probe`: after Always Allow worked, rebuilding the helper changed its CDHash and caused a new Keychain prompt.

## Implication for Varlock-like CLI/helper tooling

The more robust design is:

1. Ship a properly signed helper app or binary with a stable Developer ID identity and designated requirement.
2. If multiple binaries need access, put them in the same signed app suite with a shared Keychain Access Group entitlement.
3. Have the helper create and own the Keychain items itself.
4. Use `SecItemUpdate` from that same helper for updates.

If the item is created by `/usr/bin/security` or by another unrelated app, macOS sees Varlock as cross-app access. Prompts and ACL edge cases are expected in that case.
