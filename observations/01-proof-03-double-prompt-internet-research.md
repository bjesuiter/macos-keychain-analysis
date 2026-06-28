# Proof 03 double-prompt internet research

Date: 2026-06-28

## Context

In `observations/macos-26.5.1.md`, Proof 03 observes that a generic password created by `keychain-probe` and read by `/usr/bin/security find-generic-password -w` produced two macOS Keychain GUI prompts for one logical password read.

Observed local prompt texts:

1. `security möchte deine vertraulichen Informationen verwenden, die in „macos-keychain-analysis proof 03 probe create security read“ in deinem Schlüsselbund gesichert sind.`
2. `security möchte auf den Schlüssel „macos-keychain-analysis proof 03 probe create security read“ in deinem Schlüsselbund zugreifen.`

## Matching external report

A closely matching public report exists in the Python `keyring` project:

- GitHub issue: <https://github.com/jaraco/keyring/issues/644>
- Title: `two keyring password dialogs are triggered`
- Reported environment: macOS 13.4.1 Ventura, Python 3.11.4, `keyring` 24.2.0

The issue reports two dialogs during one password retrieval. The English prompt texts match the two local Proof 03 prompt variants:

1. `python3.11 wants to use your confidential information stored in "myorg" in your keychain.`
2. `python3.11 wants to access key "myorg" in your keychain.`

This maps directly to the two German Proof 03 prompts:

1. `... vertraulichen Informationen verwenden ...`
2. `... auf den Schlüssel ... zugreifen ...`

## Other relevant references

Apple Keychain Access documentation confirms that one-time access is intentionally non-persistent:

- <https://support.apple.com/guide/keychain-access/if-youre-asked-for-access-to-your-keychain-kyca1243/mac>
- Relevant point: `Allow Once` grants access only this time; the user is asked again next time the app/server needs the password.

Apple also documents that previously trusted apps can require reauthorization if changed, updated, or modified:

- <https://support.apple.com/guide/keychain-access/if-a-trusted-app-asks-for-keychain-access-kyca1331/mac>

A StackOverflow answer points to Apple code-signing identity as relevant to Keychain ACL continuity:

- <https://stackoverflow.com/questions/58290058/how-does-macos-keychain-acl-determine-which-apps-have-access>
- Key point quoted from Apple docs: Keychain Services does not distinguish older and newer versions of a program as long as both are signed and the unique identifier/designated requirement remains constant.

## Interpretation

The Python `keyring` issue is strong evidence that Proof 03's two prompt wordings are a real macOS Keychain behavior seen outside this repository, not an artifact of the proof script or `/usr/bin/security` alone.

The exact root cause remains unproven for Proof 03. Plausible explanations include:

- one logical password read internally triggering two Security.framework authorization checks;
- separate ACL authorizations for using/decrypting confidential data versus accessing the key/item;
- a macOS Keychain implementation bug or edge case.

The external Python issue suspected duplicate item-name behavior where one item name is a substring of another. Proof 03 should not assume that same cause without a targeted reproduction, but the matching prompt texts are useful supporting evidence for the general double-prompt phenomenon.

## Suggested follow-up proof ideas

- Create only the Proof 03 item in a clean keychain namespace and verify whether double prompts still occur.
- Create similarly named items where one service/label is a substring of another and test whether this increases double prompts.
- Compare prompts for `/usr/bin/security find-generic-password -w` versus an equivalent direct Security.framework reader.
- Instrument the custom `keychain-probe` reader to separate item lookup, attribute read, secret-data read, and ACL read into distinct commands, then observe which operations prompt.
