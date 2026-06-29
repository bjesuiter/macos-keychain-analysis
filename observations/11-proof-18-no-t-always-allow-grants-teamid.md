# Proof 18: Always Allow without `security -T` grants prompt-free signed-helper access

## Conclusion

For a `/usr/bin/security`-created generic-password item, creation-time `-T keychain-probe` is not required for a durable prompt-free cross-app read state.

In the clean Proof 18 run, the item was created without `-T`. The signed `keychain-probe` performed the first read, the user chose **Always Allow**, and subsequent reads were prompt-free.

## Evidence

Proof:

- `proofs/18-security-created-no-t-always-allow-signed-probe/proof.ts`

Setup:

- Creator: `/usr/bin/security`
- Reader: signed `keychain-probe`
- Signing identity: `Developer ID Application: Benjamin Jesuiter (BB38WRH6VJ)`
- Team ID: `BB38WRH6VJ`
- Codesign identifier: `dev.bjesuiter.macos-keychain-analysis.keychain-probe`
- CDHash in this run: `463f1ad7b9f6493046b4ecceb825611d330ff6eb`
- Item was created without `security add-generic-password -T`.

Before Always Allow:

- Trusted application paths included `/usr/bin/security` only.
- No `keychain-probe` trusted app path was present.
- Partition list was:

```text
apple-tool:
```

The first signed `keychain-probe read` showed one prompt. The user chose **Always Allow**.

After Always Allow:

- Trusted application paths included both:
  - `packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe`
  - `/usr/bin/security`
- Partition list was:

```text
apple-tool:
teamid:BB38WRH6VJ
```

The second and third signed `keychain-probe read` calls both succeeded without further prompts.

## Interpretation

This proves that creation-time `security -T` is not necessary for the durable Always Allow state. macOS can start from a normal `/usr/bin/security` item, then add the signed helper's durable authorization when the user chooses Always Allow during the first cross-app read.

However, this proof does not isolate partition-list trust as the only changed state. Always Allow changed both visible access dimensions:

- it added `teamid:BB38WRH6VJ` to the partition list
- it added `keychain-probe` to the legacy trusted application paths

Combined with Proof 06c, where the trusted app path alone existed but reads still prompted, the likely explanation remains that the `teamid:` partition-list grant is the decisive part for prompt-free reads. Proof 18 shows that the `teamid:` grant can be produced by Always Allow even when no prior `-T` trusted path was configured.

## Practical implication

For Varlock, a signed helper does not need to pre-mutate legacy ACL trusted app paths before asking the user to authorize existing Keychain items. A real read that triggers the normal macOS prompt, followed by the user choosing **Always Allow**, can produce the durable prompt-free state.
