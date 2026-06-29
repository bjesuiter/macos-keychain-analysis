# Proof 19: manually-set Team ID partition did not prove prompt-free reads

## Conclusion

Proof 19 did **not** prove that a manually-set `teamid:<TEAMID>` partition-list grant alone is sufficient for a prompt-free signed-helper read.

The command-line reads succeeded, but screenshots showed GUI Keychain prompts during the read steps. That means the reads succeeded after user authorization, not because the configured partition-list state was prompt-free.

## Evidence

Proof:

- `proofs/19-security-created-set-teamid-partition-only/proof.ts`

Screenshots from the rerun:

- `SCR-20260629-khbv.png`: custom Apple dialog for the login keychain password used by the proof script.
- `SCR-20260629-khcz.png`: first `keychain-probe` Keychain prompt for the Proof 19 item.
- `SCR-20260629-khdz.png`: second `keychain-probe` Keychain prompt for the Proof 19 item.

Setup:

- Creator: `/usr/bin/security`
- Reader: signed `keychain-probe`
- Signing identity: `Developer ID Application: Benjamin Jesuiter (BB38WRH6VJ)`
- Team ID: `BB38WRH6VJ`
- Codesign identifier: `dev.bjesuiter.macos-keychain-analysis.keychain-probe`
- CDHash in the reruns: `463f1ad7b9f6493046b4ecceb825611d330ff6eb`
- Item was created without `security add-generic-password -T`.

Before setting partition list:

- Trusted application paths included `/usr/bin/security` only.
- No `keychain-probe` trusted app path was present.
- Partition list was:

```text
apple-tool:
```

After setting partition list, before signed-helper secret reads:

- Trusted application paths still included `/usr/bin/security` only.
- No `keychain-probe` trusted app path was present.
- Partition list was:

```text
apple-tool:
teamid:BB38WRH6VJ
```

During reads:

- The script's read commands exited successfully and returned the expected disposable secret.
- The screenshots show that Keychain prompts appeared for `keychain-probe` while reading the item.
- If the user chose **Allow Once** / `Erlauben`, the successful reads are explained by one-time authorization, not by prompt-free access.

After reads in the clean rerun:

- Trusted application paths still included `/usr/bin/security` only.
- No `keychain-probe` trusted app path was present.
- Partition list remained:

```text
apple-tool:
teamid:BB38WRH6VJ
```

## Interpretation

Proof 19 shows that simply setting `apple-tool:,teamid:<TEAMID>` with `security set-generic-password-partition-list` on a normal `/usr/bin/security`-created item is not obviously equivalent to the state produced by macOS **Always Allow**.

Possible explanations:

- The legacy trusted-application path grant and the Team ID partition grant may both be needed for this item shape.
- `security set-generic-password-partition-list` may not recreate every ACL detail that Always Allow creates.
- Another ACL entry or prompt-selector detail may still require user authorization.

The proof does still show that command success is not enough evidence for prompt behavior; GUI screenshots or manual prompt notes are required.

## Practical implication

Do not claim partition-list-only sufficiency from Proof 19. The next proof should create a fully artificial Always Allow-like state by combining:

1. `/usr/bin/security add-generic-password ... -T keychain-probe`
2. `/usr/bin/security set-generic-password-partition-list -S apple-tool:,teamid:<TEAMID>`

Then read with the signed helper and use screenshots/manual notes to verify whether prompts occur.
