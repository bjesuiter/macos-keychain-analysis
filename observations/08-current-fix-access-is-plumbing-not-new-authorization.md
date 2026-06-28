# Current `fix-access` is improved plumbing, not a new authorization mechanism

## Conclusion

The current Varlock `fix-access` workflow is not materially different from the first `fix-access` implementation in terms of the Keychain authorization state it creates.

It improves command plumbing and batching, but the underlying repair mechanism is still the same legacy ACL trusted-application path mutation.

## What changed from the first version

Current `fix-access` adds or improves:

- batch daemon action for env-file mode
- one daemon request for many refs instead of one request per ref
- per-item batch result handling
- keychain unlock preflight before ACL repair
- clearer error handling
- separation from the newer `take-ownership` command

These are useful implementation and UX changes.

## What did not change functionally

The core repair still does this:

1. locate the Keychain item
2. copy its legacy access object
3. copy ACL entries
4. create a trusted application record for the Varlock helper executable path
5. append that helper to explicit ACL app lists where missing
6. write the updated access object back

It still does not:

- add `teamid:<TEAMID>` partition-list grants
- add `cdhash:<HASH>` partition-list grants
- recreate the item
- take ownership of the item
- produce the same durable state as the user choosing Always Allow

## Supporting observations

- Proof 15 showed that the unlock preflight does not reduce the prompt count for cross-process reads.
- Proof 16 showed that the legacy ACL path mutation succeeds but still leaves later reads prompting.
- Proof 06c showed that even a correctly signed helper path added through `security -T` is not enough for prompt-free reads.
- Proof 13 showed that prompt-free, rebuild-stable access came from a partition-list grant (`teamid:BB38WRH6VJ`) after Always Allow.

## Practical implication

For the question “does current `fix-access` make existing Keychain items prompt-free?”, the answer appears to be no.

Compared with the first `fix-access`, current `fix-access` is better plumbing around the same authorization primitive. It batches work and unlocks the keychain, but it does not create the partition-list authorization that current macOS appears to require for silent reads.
