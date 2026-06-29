# Proof 21: post-hoc trusted path plus Team ID partition is prompt-free

## Conclusion

A normal `/usr/bin/security`-created item can be repaired after creation into a prompt-free signed-helper state by combining:

1. post-hoc legacy trusted application path mutation via signed `keychain-probe add-to-acl`
2. Team ID partition-list mutation via `security set-generic-password-partition-list -S apple-tool:,teamid:<TEAMID>`

After both repair steps, signed `keychain-probe` read the secret twice without additional Keychain prompts.

## Evidence

Proof:

- `proofs/21-security-created-posthoc-acl-plus-teamid-partition/proof.ts`

Screenshots from the run:

- `SCR-20260629-ktee.png`: `keychain-probe` prompt to change the item's access rights.
- `SCR-20260629-kthg.png`: `keychain-probe` prompt to change the item's owner / ACL owner.
- `SCR-20260629-ktir.png`: custom Proof 21 Apple dialog for the login keychain password used by `security set-generic-password-partition-list`.

Manual observation:

- No additional prompts appeared during the final two `keychain-probe read` steps.

Setup:

- Creator: `/usr/bin/security`
- Reader/repair helper: signed `keychain-probe`
- Signing identity: `Developer ID Application: Benjamin Jesuiter (BB38WRH6VJ)`
- Team ID: `BB38WRH6VJ`
- Codesign identifier: `dev.bjesuiter.macos-keychain-analysis.keychain-probe`
- CDHash in this run: `463f1ad7b9f6493046b4ecceb825611d330ff6eb`
- Item was created without `security add-generic-password -T`.

Initial state after create:

- Trusted application paths included `/usr/bin/security` only.
- Partition list was:

```text
apple-tool:
```

After `keychain-probe add-to-acl`:

- Trusted application paths included:
  - `/usr/bin/security`
  - signed `keychain-probe`
- Partition list was still:

```text
apple-tool:
```

During `add-to-acl`, macOS showed two prompts:

- change access rights
- change owner / ACL owner

The user chose Allow Once / `Erlauben`, not Always Allow.

After `security set-generic-password-partition-list`:

- Trusted application paths included:
  - `/usr/bin/security`
  - signed `keychain-probe`
- Partition list was:

```text
apple-tool:
teamid:BB38WRH6VJ
```

Reads:

- First signed `keychain-probe read`: succeeded without Keychain prompt.
- Second signed `keychain-probe read`: succeeded without Keychain prompt.

Final ACL state remained:

- trusted app path includes signed `keychain-probe`
- partition list includes `teamid:BB38WRH6VJ`

## Interpretation

Proof 21 shows that creation-time `security -T` is not special. The prompt-free artificial Always Allow-like state can also be built after item creation if both visible authorization dimensions are repaired:

- legacy trusted application path
- Team ID partition list

This matches the pattern from earlier proofs:

- trusted path alone was insufficient
- Team ID partition alone was insufficient
- trusted path plus Team ID partition was sufficient

## Practical implication

A diagnostic/admin repair can be made to work after item creation, but the prompt/credential cost is significant:

- two macOS Keychain prompts for the post-hoc ACL path mutation
- one login keychain password dialog for the partition-list mutation

This remains a proof/admin path, not normal product UX. For normal users, the safer UX remains a signed-helper read followed by the user choosing Always Allow.
