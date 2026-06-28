# Original `addToACL` vs proof 06

The original `addToACL` flow is closer to proof 06 than to proof 09.

## Same core idea

Both original `addToACL` and proof 06 operate on the legacy trusted-application ACL idea.

Proof 06 uses the `security` CLI at item creation time:

```sh
security add-generic-password ... -T keychain-probe
```

That means: create the item with `keychain-probe` in the trusted applications list.

Original `addToACL` uses Security.framework after the item already exists:

```swift
SecTrustedApplicationCreateFromPath(appPath)
SecACLSetContents(...)
SecKeychainItemSetAccess(...)
```

That means: append the Varlock helper executable path to the existing item’s trusted applications list.

Both are trying to express the same broad permission:

> This executable path is a trusted app for this Keychain item.

## Main difference

Proof 06 does it at item creation time.

Original `addToACL` does it after the item already exists, by mutating the item ACL in place.

That matters because existing items may have a different ACL shape than items created with `security -T`. A post-hoc ACL mutation may interact differently with existing ACL entries, authorizations, and partition-list descriptions than the `security` CLI’s creation-time `-T` path.

## Important wrinkle from proof 06 / 06a

Proof 06 showed that `security add-generic-password -T keychain-probe` could make secret reads silent after an ACL-list step.

Proof 06a then showed that read-only access still prompted when ACL-list was omitted.

This suggests `-T` / trusted-app-list may authorize one ACL dimension but not fully recreate the final “Always Allow” state by itself. It may grant access for some secret-data use while still leaving another key/item access authorization path that prompts.

## Relationship to proof 09

Proof 09 is a different research strand.

Proof 09 tried to mutate the partition list directly:

```sh
security set-generic-password-partition-list \
  -S apple-tool:,cdhash:<keychain-probe-cdhash>
```

That is code-signature/CDHash partition allowlisting, not trusted-application ACL append.

So:

- Original `addToACL` is basically the post-hoc version of proof 06’s `-T keychain-probe` trusted-app grant.
- Original `addToACL` is not the same as proof 09’s partition-list/CDHash experiment.

## Follow-up proof strands

This split requires two follow-up proof strands.

### Unnumbered next proof: update an existing ACL entry like `addToACL`

Question:

> Can we update an existing ACL entry exactly the way original `addToACL` does?

This is basically the continuation of proof 06.

Suggested shape:

1. Create an item with `/usr/bin/security` without trusting `keychain-probe`.
2. Use a Swift proof command that mirrors original `addToACL`:
   - load the existing item
   - copy `SecAccess`
   - copy ACL entries
   - append `SecTrustedApplication` for `keychain-probe`
   - write access back with `SecKeychainItemSetAccess`
3. Read with `keychain-probe`.
4. Compare prompt behavior and ACL shape against proof 06 and proof 06a.

Why this matters:

- It isolates whether post-hoc `SecACLSetContents` behaves like creation-time `security -T`.
- It tests the original Varlock picker/fix-access mechanism directly, not merely the closest `security` CLI analogue.

### Proof 10: does Always Allow fail after `keychain-probe` rebuild?

Question:

> Does the Always Allow entry in the partition list fail if `keychain-probe` is rebuilt and its CDHash changes?

Basic test flow:

1. Create item with `/usr/bin/security`.
2. Read with `keychain-probe` and let the GUI prompt appear.
3. Select `Always Allow`.
4. Read again to confirm Always Allow worked and access is now silent.
5. Recompile `keychain-probe`.
6. Verify the CDHash changed.
7. Try to read the same item again.

Expected result:

- Another prompt appears because the binary CDHash changed.

Why this matters:

- If Always Allow is tied to `cdhash:<binary>`, helper updates can invalidate the previous permission.
- That would be annoying for users because they would be prompted again for reads after each helper Swift binary update.
