# Security Specification for O Mentor da História

## 1. Data Invariants
- A narration must belong to a valid authenticated user.
- A user can only read, create, update, or delete their own narrations.
- The `userId` in the document must match the creator's UID.
- `createdAt` must be a server-provided timestamp.

## 2. The "Dirty Dozen" Payloads
1. **Identity Spoofing**: Attempt to create a narration for `user_B` while authenticated as `user_A`.
2. **PII Leak**: Attempt to read `user_B`'s narrations as `user_A`.
3. **Ghost Field**: Attempt to add `admin: true` to a narration document.
4. **Massive Payload**: Attempt to save a 2MB base64 string (exceeding Firestore limit).
5. **Malicious ID**: Attempt to use `../scripts/hack` as a `narrationId`.
6. **Future Date**: Attempt to set `createdAt` to a point in the future.
7. **Type Mismatch**: Attempt to send an integer for the `text` field.
8. **Missing Fields**: Attempt to create a narration without a `text` field.
9. **Unauthorized List**: Attempt to list all narrations in the entire database.
10. **Shadow Update**: Attempt to change the `userId` of an existing narration.
11. **Resource Exhaustion**: Attempt to create 10,000 narrations in a single second (Throttling check).
12. **Unverified Auth**: Attempt to write data without an active Firebase session.

## 3. Test Runner (Mock)
A corresponding `firestore.rules.test.ts` would verify that all the above payloads result in `PERMISSION_DENIED`.
