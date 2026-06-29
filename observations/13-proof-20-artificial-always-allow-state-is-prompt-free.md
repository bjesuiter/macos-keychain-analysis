# Proof 20: artificial Always Allow-like state is prompt-free

## Conclusion

A fully artificial Always Allow-like state made signed `keychain-probe` reads prompt-free in this test.

The working state combined both visible access dimensions:

1. legacy trusted application path for the signed helper, created by `/usr/bin/security add-generic-password ... -T keychain-probe`
2. Team ID partition-list grant, created by `/usr/bin/security set-generic-password-partition-list -S apple-tool:,teamid:BB38WRH6VJ`

After those were present, the signed helper read the secret twice without showing a Keychain access prompt.

## Evidence

Proof:

- `proofs/20-security-created-t-plus-teamid-partition/proof.ts`

Screenshot evidence:

- `SCR-20260629-kizr.png`: only the proof's custom Apple dialog for entering the login keychain password appeared.

Manual observation:

- No macOS Keychain prompt appeared during the later `keychain-probe read` steps.

Setup:

- Creator: `/usr/bin/security`
- Reader: signed `keychain-probe`
- Signing identity: `Developer ID Application: Benjamin Jesuiter (BB38WRH6VJ)`
- Team ID: `BB38WRH6VJ`
- Codesign identifier: `dev.bjesuiter.macos-keychain-analysis.keychain-probe`
- CDHash in this run: `463f1ad7b9f6493046b4ecceb825611d330ff6eb`

After `security -T` creation, before partition edit:

- Trusted application paths included signed `keychain-probe`.
- Partition list was:

```text
apple-tool:
```

After partition edit, before reads:

- Trusted application paths included signed `keychain-probe`.
- Partition list was:

```text
apple-tool:
teamid:BB38WRH6VJ
```

Reads:

- First signed `keychain-probe read`: succeeded without Keychain prompt.
- Second signed `keychain-probe read`: succeeded without Keychain prompt.

Final ACL state stayed the same:

- signed `keychain-probe` remained in trusted application paths
- partition list remained `apple-tool:`, `teamid:BB38WRH6VJ`

## Interpretation

Proof 19 showed that manually setting only `teamid:<TEAMID>` did not avoid prompts. Proof 20 shows that the combination of legacy trusted app path plus Team ID partition grant does avoid prompts.

This suggests the visible Always Allow state has at least two important pieces for this item shape:

- trusted application path grants the helper through the legacy ACL app-list dimension
- `teamid:<TEAMID>` grants the signed helper through the partition-list/code-signing dimension

`security -T` alone was not sufficient in signed Proof 06c. `teamid:` alone was not sufficient in Proof 19. Together, they were sufficient in Proof 20.

## Practical implication

For a diagnostic/admin repair flow, an artificial Always Allow-like state can be constructed with:

```sh
security add-generic-password ... -T /path/to/signed-helper
security set-generic-password-partition-list -S apple-tool:,teamid:<TEAMID>
```

But this requires the login keychain password for `set-generic-password-partition-list`, so it remains unsuitable as normal product UX. The product-safe flow is still to trigger a normal signed-helper read and have the user choose Always Allow.
