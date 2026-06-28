# Varlock migration model for `.env`, existing Keychain items, and ownership

## Conclusion

The proposed model is mostly right, with one important correction: a durable `varlock keychain fix-access` command should not try to repair old-style ACL trusted-app paths. It should deliberately perform real reads through the signed Varlock helper/daemon so macOS can show the normal Keychain authorization prompts and let the user choose **Always Allow**.

On current macOS, the durable prompt-free state observed in the proofs comes from the Keychain item partition list, especially `teamid:<VARLOCK_TEAM_ID>` for a stably signed helper. It does not come merely from adding the helper executable path to the legacy trusted-app ACL list.

## 1. Migrating from a plain `.env` file

Yes: the clean migration path is an explicit Varlock Keychain import command.

A good command shape would be something like:

```sh
varlock keychain import .env
```

or, for schema-driven import:

```sh
varlock keychain import --env-file .env --schema .env.schema
```

Expected behavior:

1. Parse the existing plaintext `.env` file.
2. Match entries against `.env.schema` secret definitions.
3. Create new Keychain generic-password items using Varlock's normal write path.
4. Store them under Varlock-owned service/account names.
5. Update or validate the schema references so future reads go through those Varlock-owned names.
6. Tell the user to remove or archive the plaintext `.env` after verifying the import.

Because Varlock creates these items itself, this should avoid the hard problem of taking ownership of items created by another tool. Varlock-owned items can be created with the intended access metadata from the start.

## 2. Allowing Varlock to read existing Keychain items

The practical flow should be:

1. Configure the existing Keychain item references in `.env.schema` using the correct service/account names.
2. Run a command such as:

   ```sh
   varlock keychain fix-access
   ```

3. Have `varlock keychain fix-access` ask the signed Varlock daemon/helper to read every configured secret.
4. macOS prompts for each item that is not already authorized.
5. The user chooses **Always Allow** for Varlock on each prompt.
6. macOS records durable access for the signed Varlock identity.

In the proofs, choosing Always Allow for a Developer-ID-signed helper produced a partition-list entry like:

```text
teamid:BB38WRH6VJ
```

That survived a rebuild where the binary CDHash changed, as long as the helper kept the same signing identity / compatible designated requirement.

So the important durability property is not “this exact binary path may read the item.” It is closer to “code signed by this Team ID / requirement may read the item.” That is what makes updates of the Varlock daemon viable without re-prompting every time.

Caveat: the observed prompt UX may be more than one dialog per item. Some proofs showed a confidential-information prompt followed by a key-access prompt. The durable action is the user choosing **Always Allow** on the relevant access prompt.

## 3. Making Varlock own existing secrets

For existing non-Varlock-owned Keychain items, the safer ownership-transfer model is clone-and-repoint, not in-place mutation.

A possible command shape:

```sh
varlock keychain clone-secret --from existing-service/existing-account --to varlock-service/varlock-account
```

or schema-driven:

```sh
varlock import-keychain --from-schema .env.schema --rewrite-schema
```

Expected behavior:

1. Read the old existing Keychain item through the signed Varlock helper.
2. macOS prompts once for the old item if Varlock is not already authorized.
3. The user approves the read.
4. Varlock creates a new Varlock-owned Keychain item with the same secret value under a Varlock-controlled name.
5. Varlock updates `.env.schema` to point at the new item.
6. Varlock verifies that reading through the new schema works.
7. Varlock tells the user that the original item still exists and must be deleted separately if desired.

This avoids relying on Varlock being able to delete or rename an item it did not create.

## Why not delete the original item from Varlock?

Proof 17 showed that a Varlock-style take-ownership flow failed for a `/usr/bin/security`-created item when attempting to delete the original item:

```text
SecItemDelete failed: Invalid attempt to change the owner of this item.
```

So Varlock should not assume it can delete old items after reading them. It may not own them, even after the user authorizes a read.

The macOS `security` CLI may be able to delete the original item, depending on how the item was created and what authorization the user provides, but that should be treated as a separate cleanup step rather than part of Varlock's guaranteed ownership-transfer flow.

## Recommended command semantics

### `varlock keychain import`

Use for plaintext `.env` to Keychain migration.

- Input: plaintext `.env` plus schema or inferred names.
- Output: Varlock-owned Keychain items and updated/validated `.env.schema`.
- Security posture: best path for new adoption from plaintext files.

### `varlock keychain fix-access`

Use for existing Keychain items that should remain under their current names.

- Input: `.env.schema` references to existing items.
- Action: perform real reads via the signed Varlock helper to trigger macOS Always Allow prompts.
- Output: durable user-approved Keychain access, ideally represented by `teamid:<VARLOCK_TEAM_ID>` partition-list entries.
- Important: do not implement this as only legacy ACL trusted-app path mutation; the proofs show that is insufficient for prompt-free reads.

### `varlock keychain clone-secret`

Use when Varlock should own a copy of existing secrets.

- Input: existing Keychain item references.
- Action: read old item with user approval, create new Varlock-owned item, rewrite schema.
- Output: Varlock-owned item; original remains untouched.
- Cleanup: optional user-driven deletion via Keychain Access or `security`, not guaranteed by Varlock.

## Final assessment

The adoption story should probably have three distinct flows:

1. Plain `.env` → `varlock keychain import` → new Varlock-owned Keychain items.
2. Existing Keychain items, keep names → schema references + read-based `varlock keychain fix-access` → user clicks Always Allow.
3. Existing Keychain items, Varlock-owned future → clone to new Varlock-owned names + schema rewrite; leave original cleanup to the user or `security` CLI.
