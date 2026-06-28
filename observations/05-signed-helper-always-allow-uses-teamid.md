# Signed helper Always Allow uses Team ID, not only CDHash

Proof 13 indicates that when `keychain-probe` is signed with a stable Developer ID identity, macOS records the durable Keychain allowance using the signing Team ID.

## Observed behavior

In the clean Proof 13 rerun:

1. `/usr/bin/security` created the Keychain item.
2. Developer-ID-signed `keychain-probe` read the item.
3. macOS showed one prompt.
4. The user clicked `Immer erlauben` / Always Allow.
5. `keychain-probe` was rebuilt and re-signed with the same Developer ID identity and codesign identifier.
6. The rebuilt binary had a different CDHash.
7. The rebuilt binary read the item without another prompt.

## Key identity facts

Initial signed binary:

```text
CDHash=5eac9da21075852d3d2cdf5a1047d5d96b6a0c02
```

Rebuilt signed binary:

```text
CDHash=31aee137f46571772b0382c06c96117efa86bf5f
```

The CDHash changed, but the designated requirement did not change.

The stable signing identity was:

```text
Developer ID Application: Benjamin Jesuiter (BB38WRH6VJ)
```

Team ID:

```text
BB38WRH6VJ
```

## ACL / partition-list result

After Always Allow, the clean rerun partition list included:

```text
apple-tool:
teamid:BB38WRH6VJ
```

No `cdhash:` entry was present in the clean rerun partition list.

## Interpretation

For a Developer-ID-signed helper, macOS can persist the allowance against the stable Team ID / signing identity rather than only against the exact binary CDHash.

That makes the allowance stable across rebuilds and upgrades as long as the helper is re-signed with the same identity and keeps a compatible designated requirement.

## Practical implication

For Varlock-like helper updates, stable signing is the path that avoids re-prompting users after every helper binary update.

The brittle case is an ad-hoc or unsigned helper, where macOS may persist access as a `cdhash:` grant. In that case, rebuilding changes the CDHash and can trigger a new prompt.
