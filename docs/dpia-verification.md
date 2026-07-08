# DPIA debt — identity/business verification (§14, §22)

**Status: OUTSTANDING — legally load-bearing before public launch.**

The Phase 6 verification flow records a live video call in which the member shows
their **face + an ID document** (§14). That is special-category / biometric
personal data under UK GDPR. §22 (Seq 31) lists a signed **Biometric DPIA** as a
hard prerequisite for shipping the recording flow.

Product decision (recorded 8 Jul): **recording is enabled** in the build. This
doc tracks the controls that are in place and the sign-off that is still owed.

## What the build enforces (data minimization by design)

- **No biometric/ID fields are stored.** There is no ID-number, document-image,
  DOB, national-id, selfie, or liveness column anywhere (verified by grep). The
  ID is shown *live on the call*, never persisted as structured data. The only
  artifact is `verifications.recording_url` — an encrypted-storage pointer,
  commented "never public".
- **Explicit consent is hard-gated.** A verification request cannot be submitted
  without `consentGiven`; the API sets `consent_given=true` + `consent_recorded_at`
  and refuses to proceed otherwise. Recording without recorded consent is
  impossible through the app.
- **Access is logged.** Every read of `recording_url` (signed-URL issuance) writes
  a `verification_access_log` row (`accessed_by_user_id`, `access_type`,
  timestamp). That log is admin-read-only and append-only (immutability trigger).
- **Least-privilege access.** Recording/verification rows are readable only by
  `is_verifier()` (admins + explicitly-granted verifiers) — **not** every mod. The
  verifier roster (`verifier_grants`) is admin-managed and admin-read-only.
- **Retention is enforced.** `recording_expires_at` is set to 24 months; the
  `/api/cron/lifecycle` sweep nulls `recording_url` and purges the storage object
  past expiry (audited `verification.recording_purged`).

## What is still OWED before recording goes live in production

1. **Signed Biometric DPIA** (data controller sign-off). Do not enable real
   recorded calls in production until this exists.
2. **Encrypted private storage bucket** for `recording_url` with no anon/authenticated
   RLS reach and short-lived signed URLs. The app assumes this; it must be
   provisioned (Alpha Hardening Debt — provider config).
3. **Retention-purge cron actually scheduled** (`/api/cron/lifecycle` registered in
   `vercel.json`; verify the CRON_SECRET is set in prod).
4. **Verifier onboarding** — grant `verifier` only to trained, trusted reviewers;
   admin spot-checks of verifier decisions (§14) via the immutable `mod_actions` /
   `audit_logs` trail.

Until (1) and (2) are done, treat the recording capability as **build-complete,
not launch-cleared**.
