# Current take-ownership does not work for security-created items

## Conclusion

The current Varlock-style `take-ownership` flow did not work for a generic-password item created by `/usr/bin/security` in this test setup.

It was able to prompt for and read the original secret value, but failed when trying to delete the original item before renaming the temporary Varlock-owned item back into place.

## Evidence

Proof:

- Proof 17: `proofs/17-take-ownership-flow/proof.ts`

The proof modeled current Varlock `take-ownership`:

1. `/usr/bin/security` creates an existing generic-password item.
2. `keychain-probe` reads the original value.
3. `keychain-probe` creates a temporary generic-password item with the same value through its normal write path.
4. `keychain-probe` verifies the temporary value.
5. `keychain-probe` deletes the original item.
6. `keychain-probe` renames the temporary item back to the original service/account.
7. `keychain-probe` verifies final value.

The flow failed at step 5.

Observed failure:

```json
{"error":"SecItemDelete failed: Invalid attempt to change the owner of this item.","ok":false}
```

## Prompt behavior

The take-ownership attempt produced the usual two prompts for the initial cross-process value read:

- confidential-information prompt
- key-access prompt

Prompt screenshots:

- `observations/screenshots/proof-17-take-ownership-read-prompt-1.png`
- `observations/screenshots/proof-17-take-ownership-read-prompt-2.png`

A later/repeated take-ownership attempt produced another two prompts:

- `observations/screenshots/proof-17-second-attempt-read-prompt-1.png`
- `observations/screenshots/proof-17-second-attempt-read-prompt-2.png`

This confirms that one-time authorization from the first attempt did not persist.

## ACL state before failure

Before take-ownership:

- trusted application paths included `/usr/bin/security`
- partition list included only:
  - `apple-tool:`

No `teamid:` or `cdhash:` partition grant was present.

## Interpretation

For this `/usr/bin/security`-created item shape, `keychain-probe` could read the value after user authorization but could not delete the original item. macOS reported this as an invalid attempt to change the owner of the item.

So this take-ownership flow is not a reliable repair path for security-created items in the current proof environment.

## Practical implication for Varlock

`take-ownership` should not be assumed to solve prompt issues for existing `/usr/bin/security`-created generic-password items.

In this test, it:

- still prompted to read the original value
- failed before ownership transfer completed
- did not create a prompt-free final state

The only durable no-prompt path observed so far remains user-approved Always Allow for a stably signed helper, which writes an ACL partition-list grant such as `teamid:<TEAMID>`.
