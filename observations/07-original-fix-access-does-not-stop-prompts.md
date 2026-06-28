# Original `fix-access` does not stop prompts on current macOS

## Conclusion

The original Varlock `fix-access` approach does not make later Keychain reads prompt-free on current macOS.

It successfully mutates the legacy trusted-application ACL path list, but it does not add the ACL partition-list grant that current macOS appears to require for silent secret reads.

## Evidence

Proof:

- Proof 16: `proofs/16-original-fix-access-flow/proof.ts`

Proof 16 reproduced the original `fix-access` flow as closely as possible:

1. Create an existing generic-password item with `/usr/bin/security`.
2. Run the legacy ACL repair primitive from `keychain-probe`.
3. The repair uses Varlock-like `addToACL` behavior:
   - find generic password first, then internet password
   - copy item access
   - copy ACL list
   - create a trusted application for the running helper path
   - append the helper to explicit ACL app lists
   - write the access object back if modified
4. Read the item twice with `keychain-probe`.

## Observed behavior

The repair command returned success:

```json
{"modified":true}
```

The ACL changed as expected:

- Before repair, trusted application paths included `/usr/bin/security`.
- After repair, trusted application paths included the `keychain-probe` executable path.

But prompts still occurred:

- `add-to-acl` / original fix-access equivalent prompted twice:
  - change access rights prompt
  - change owner prompt
- first read after repair prompted once
- second read after repair prompted once

Total observed prompts in Proof 16: 4.

## Partition-list state

Before repair, the partition list included only:

```text
apple-tool:
```

After repair, the partition list still included only:

```text
apple-tool:
```

After the two reads, the partition list still included only:

```text
apple-tool:
```

No durable helper grant appeared:

- no `teamid:<TEAMID>`
- no `cdhash:<HASH>`

## Interpretation

The original `fix-access` flow updates legacy ACL trusted application paths, but that is not sufficient for prompt-free reads on current macOS.

Current macOS appears to require an ACL partition-list grant for silent reads, such as:

- `teamid:<TEAMID>` for a stable Developer ID signed helper, or
- `cdhash:<HASH>` for a specific binary identity.

Those grants are written by macOS when the user chooses Always Allow, but they were not created by the original `fix-access` ACL mutation.

## Practical implication

For Varlock:

- The original `fix-access` should not be considered a reliable prompt-removal mechanism.
- It may still modify legacy ACLs, but users can continue to see prompts afterward.
- It may introduce additional prompts during the repair itself.
- Stable signing plus user-approved Always Allow currently looks like the durable no-prompt path.
- `take-ownership` may change item ownership/ACL shape, but original `fix-access` alone does not create the partition-list authorization needed for prompt-free operation.
