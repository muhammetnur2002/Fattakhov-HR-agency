# Chat security — test-only preparation

Status: provider adapters and disabled attachment menu prepared. Uploads remain unavailable by explicit owner choice. No files or URLs have been sent to providers. This is NOT a deployed malware prevention or moderation system. The current chat renders message bodies as plain text, without clickable external links.

## Implemented preparation (November 2026)

- `/admin/security`: restricted readiness dashboard and latest 50 incident records. Access requires an active ADMIN account matching `CHAT_SECURITY_OWNER_EMAIL`. Broad HR permissions do not grant access. Optional `CHAT_SECURITY_DELEGATE_EMAILS` is empty on the test project; only the confirmed owner has access.
- Encrypted incident evidence (account/email snapshot, trusted-proxy IP, thread, SHA-256, rule/version, timestamp), deduplicated storage, and an atomic malware email outbox. No image-moderation email or automatic account suspension. Incident records survive account deletion; no deletion API is provided.
- Manual decisions with mandatory reason and immutable decision records. Malware events permit suspension/restoration of student/employer accounts only. Strict session revocation prevents old sessions returning after restoration. CRM accounts are not modified.
- Outbox uses leases and bounded batches; failures retry with backoff. `/api/cron/notify` invokes it when `CRON_SECRET` is configured, and the owner has a manual retry button. SMTP delivery is at-least-once, not exactly-once. The dashboard reports missing scheduling configuration separately.
- `checkChatAttachment` combines extension/MIME/signature checks and fail-closed antivirus/image checks on the same byte snapshot. `inspectChatAttachment` verifies active session and thread access and records malware decisions. **Neither is an enabled upload route; `deliverable` remains false even for clear results.** Documents remain excluded until embedded-media moderation exists.
- Tests: `tests/security-workflow.ts` and `tests/content-checks.ts` use mock scanners, no provider traffic. They do not establish real detection accuracy or end-to-end private-storage safety.

## Proposed providers / server-only configuration

- `CHAT_CLOUDMERSIVE_KEY`: Cloudmersive advanced file scan. Restrict formats to PDF, DOCX, JPEG, PNG, WebP; reject scripts, macros, encrypted files and executable content. [API](https://api.cloudmersive.com/docs/virus.asp)
- `CHAT_SIGHTENGINE_USER`, `CHAT_SIGHTENGINE_SECRET`: Sightengine `nudity-2.1`. The draft threshold is 0.5 for sexual activity, sexual display, erotica or visibly undressed. Calibrate against agreed examples before release; false positives and false negatives are possible. [API](https://sightengine.com/docs/advanced-nudity-detection-model-2.1)
- `CHAT_WEBRISK_KEY`: Google Web Risk Lookup. HTTPS-only policy, no credentials/IP literals/local hostnames/IDNs. IDNs are conservatively held for review, not accused of fraud. Reputation results do not prove a destination or its future redirects safe. [API](https://docs.cloud.google.com/web-risk/docs/lookup-api)

Set credentials only on the TEST student Vercel project. Never use NEXT_PUBLIC variables or commit keys. Credentials alone do not enable delivery. Before configuration, approve provider accounts, data processing/retention terms and any charges: scanning transmits file bytes to Cloudmersive/Sightengine and URLs to Google. Do not send private files during contract tests.

## Required before enabling attachments or clickable chat links

1. Add private quarantine records bound to sender, thread and immutable SHA-256; enforce membership, active account, thread write access, CSRF, rate and streamed body-size limits. Validate extension/MIME/magic bytes; re-encode images and strip metadata. Never serve pending/rejected objects or reuse public profile uploads as chat attachments. Apply both malware and image checks to images regardless of selected menu option. Inspect embedded media in documents or exclude those documents until that path is covered.
2. Publish only after all applicable checks return `clear`; timeouts, invalid JSON, missing keys, quotas and outages must keep delivery blocked. Download endpoint must re-check thread membership; use attachment disposition and nosniff. Bind the approved scan to the exact stored bytes.
3. Connect the prepared incident/outbox workflow to the future quarantine worker. Verify SMTP and scheduler delivery with an agreed synthetic incident; define evidence retention/deletion policy before processing real files. Never send nudity notifications; do not suspend users for nudity or links.
4. Exercise owner-only incident decisions and session revocation against a disposable database before enabling uploads. Configure the owner explicitly; never grant access automatically to all recruiters. Restoration requires a recorded reason.
5. Click-time URL check must be bound to the actual message and sender. Log flagged links with minimal encrypted evidence, never arbitrary attribution supplied by a caller. No server-side fetch of user URLs. Show normalized destination and warn that redirects and newly malicious sites can evade reputation checks. Without checks, keep links as text.
6. Integration tests: unauthorized downloads/foreign threads, concurrent scans, deleted accounts, changed bytes, scanner outage, harmless AV test fixture, malformed and oversized files, moderation fixtures, spoofed IP, owner/delegate denial, email retries and link policy. Test iOS/Android camera and browser keyboard. No production data.

Current tests: `node --conditions=react-server --import tsx tests/content-checks.ts` mocks providers; it proves adapter behavior only, not detection accuracy or end-to-end protection.

Reference: [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).
