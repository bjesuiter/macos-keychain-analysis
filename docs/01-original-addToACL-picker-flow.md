# Original `addToACL` picker flow

Source repo examined: `/Users/bjesuiter/Develop/oss/oss-varlock`

Relevant baseline: before Benjamin Jesuiter’s later keychain subcommand work. The native picker ACL repair existed before the CLI `fix-access` wrapper.

## Files involved

- `packages/encryption-binary-swift/swift/Sources/VarlockEnclave/KeychainPickerDialog.swift`
- `packages/encryption-binary-swift/swift/Sources/VarlockEnclave/KeychainManager.swift`
- `packages/encryption-binary-swift/swift/Sources/KeychainLegacy/KeychainLegacy.swift`

## User-facing picker flow

When a user selected an existing Keychain item in the native picker, Varlock first verified that the helper could read the selected item.

`KeychainPickerDialog.verifyAccessAndFixACL(item:)` did this:

1. Call `KeychainManager.getItem(...)` for the selected service/account.
2. If the read succeeded, return `true` and continue the picker flow.
3. If the read failed with `.accessDenied` or `.unhandledError`, call `offerACLFix(item:)`.
4. Other errors showed a Keychain error dialog and cancelled selection.

`offerACLFix(item:)` showed an `NSAlert` titled `Access Denied` with buttons:

- `Grant Access`
- `Cancel`

The message told the user that Varlock did not have permission to read the item and that macOS would ask for authentication to authorize the change.

If the user chose `Grant Access`, the picker:

1. Computed the current helper executable path:

   ```swift
   Bundle.main.executablePath ?? ProcessInfo.processInfo.arguments[0]
   ```

2. Called:

   ```swift
   KeychainManager.addToACL(
       service: item.service,
       account: item.account.isEmpty ? nil : item.account,
       appPath: appPath
   )
   ```

3. Tried `KeychainManager.getItem(...)` again.
4. Returned `true` only if the post-fix read succeeded.
5. On failure, showed an error telling the user they may need to grant access manually in Keychain Access.app.

## Core `addToACL` behavior

`KeychainManager.addToACL(...)` was the shared repair primitive.

Signature:

```swift
static func addToACL(
    service: String,
    account: String? = nil,
    keychainName: String? = nil,
    appPath: String
) throws -> Bool
```

Its job was to add the Varlock helper executable to the selected item’s legacy Keychain ACL.

Flow:

1. Resolve the `SecKeychainItem` reference with `getItemRef(...)`.
   - Search generic passwords first.
   - Then internet passwords.
   - Generic lookup used `kSecAttrService`.
   - Internet lookup used `kSecAttrServer`.
   - Optional `account` narrowed the match.
   - Optional `keychainName` scoped the search list.

2. Copy the item’s access object:

   ```swift
   LegacyKeychain.itemCopyAccess(itemRef)
   ```

3. Copy the ACL list from that access object:

   ```swift
   LegacyKeychain.accessCopyACLList(currentAccess)
   ```

4. Create a trusted application record for the helper executable path:

   ```swift
   LegacyKeychain.trustedApplicationCreate(path: appPath)
   ```

5. Iterate every ACL entry.

6. For each ACL, copy its contents:

   ```swift
   LegacyKeychain.aclCopyContents(acl)
   ```

7. If `appList == nil`, treat it as “allow all apps” and skip it.

8. Otherwise, compare each existing trusted app’s copied data to `appPath`.

9. If the helper path was not already present:
   - append the new trusted app to the ACL app list
   - call `LegacyKeychain.aclSetContents(...)`
   - mark the item as modified

10. If any ACL was modified, write the updated access object back to the item:

    ```swift
    LegacyKeychain.itemSetAccess(itemRef, currentAccess)
    ```

11. Return:
    - `true` if the ACL was changed
    - `false` if no change was needed

## Important characteristics

- The picker flow repaired access only after a failed read.
- The user explicitly confirmed the repair in a native dialog.
- macOS could prompt for authentication during the ACL write.
- The repair target was the running Varlock helper executable.
- The implementation used deprecated legacy Keychain ACL APIs because modern Keychain APIs do not provide equivalent runtime ACL editing.
- The code updated ACLs in place.
- It added the helper to every ACL entry that had an explicit app list.
- It skipped ACL entries with a nil app list because nil represented unrestricted app access.
