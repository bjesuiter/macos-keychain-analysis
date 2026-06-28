# ACL partition list controls prompt-free reads, not `-T` trusted app paths

## Conclusion

For prompt-free macOS Keychain reads, the important access state appears to be the item's ACL partition list, not merely the legacy trusted application path added by `/usr/bin/security ... -T`.

## Evidence

### `-T keychain-probe` added the trusted app path but did not make reads prompt-free

Proofs:

- Proof 06: `security add-generic-password -T keychain-probe`
- Proof 06a: same, read-only follow-up
- Proof 06c: same idea, but with correctly Developer ID signed `keychain-probe`

In Proof 06c, the item was created with:

```sh
/usr/bin/security add-generic-password \
  -a macos-keychain-analysis \
  -s macos-keychain-analysis.proof-06c.security-create-trust-signed-probe-read-only \
  -w disposable-proof-secret \
  -l 'macos-keychain-analysis proof 06c security create trust signed probe read only' \
  -T packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe
```

The helper was signed with stable Developer ID identity:

- `Developer ID Application: Benjamin Jesuiter (BB38WRH6VJ)`
- Team ID: `BB38WRH6VJ`
- Codesign identifier: `dev.bjesuiter.macos-keychain-analysis.keychain-probe`

Observed ACL after reads:

- Trusted application paths included the signed `keychain-probe` path.
- Partition list included only:
  - `apple-tool:`
- No `teamid:BB38WRH6VJ` partition was present.

Observed prompt behavior:

- First signed `keychain-probe` read prompted.
- Second signed `keychain-probe` read prompted again.
- Both reads succeeded only after user authorization.

This shows that having the signed helper in the legacy trusted application path list is not sufficient for prompt-free reads.

### Always Allow added partition-list trust and made reads prompt-free

Proofs:

- Proof 05a: Always Allow persisted access.
- Proof 06b: Always Allow after `security -T keychain-probe` made later reads silent and added a `cdhash:` partition.
- Proof 13: Always Allow for a correctly signed helper survived rebuilds and used Team ID trust.

In the clean Proof 13 rerun, after choosing Always Allow for the signed helper:

- Trusted application paths included the built `keychain-probe` path and `/usr/bin/security`.
- Partition list included:
  - `apple-tool:`
  - `teamid:BB38WRH6VJ`
- No `cdhash:` entry was present in the clean rerun.
- Post-rebuild reads remained prompt-free even though the CDHash changed.

This shows that the durable prompt-free grant for a correctly signed helper can be represented by `teamid:<TEAMID>` in the partition list.

## Interpretation

Legacy trusted application paths and partition lists are related but not equivalent.

`security add-generic-password -T /path/to/app` can add a path-based trusted app entry, but on current macOS that alone does not satisfy all checks needed for silent secret reads by that app.

The prompt-free state appears to require the partition-list grant that macOS writes when the user chooses Always Allow, such as:

- `teamid:BB38WRH6VJ` for a stable Developer ID signed helper, or
- `cdhash:<hash>` for a specific binary identity in other cases.

## Practical implication for Varlock

For Varlock's macOS helper:

- Merely adding the helper path to legacy ACL app lists may not be enough to eliminate prompts.
- Stable signing is still important because it allows macOS to persist Always Allow as a Team ID partition grant that survives helper rebuilds/updates.
- Avoid relying on `/usr/bin/security -T` as proof of prompt-free access.
- The durable no-prompt condition to look for is a relevant ACL partition-list entry, especially `teamid:<Varlock Team ID>` for a signed release helper.

## Open question

We still do not have a safe automation path for adding the partition-list grant directly. `/usr/bin/security set-generic-password-partition-list` is not suitable for this project because it requires the keychain password via CLI/stdin in ways that are insecure or not agent-friendly.
