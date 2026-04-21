# BFF Admin Routes

> 56 nodes · cohesion 0.05

## Key Concepts

- **app.ts** (23 connections) — `apps\bff\src\app.ts`
- **subscriptions.ts** (8 connections) — `apps\bff\src\routes\subscriptions.ts`
- **require-auth.ts** (6 connections) — `apps\bff\src\middleware\require-auth.ts`
- **events.ts** (6 connections) — `apps\bff\src\routes\events.ts`
- **require-uploader.ts** (5 connections) — `apps\bff\src\middleware\require-uploader.ts`
- **admin-events.ts** (5 connections) — `apps\bff\src\routes\admin-events.ts`
- **uploads.ts** (5 connections) — `apps\bff\src\routes\uploads.ts`
- **listEvents()** (5 connections) — `apps\bff\src\routes\events.ts`
- **admin-audit.ts** (4 connections) — `apps\bff\src\routes\admin-audit.ts`
- **createSubscription()** (4 connections) — `apps\bff\src\routes\subscriptions.ts`
- **listAdminAuditLogs()** (3 connections) — `apps\bff\src\routes\admin-audit.ts`
- **listAdminEvents()** (3 connections) — `apps\bff\src\routes\admin-events.ts`
- **require-admin.ts** (3 connections) — `apps\bff\src\middleware\require-admin.ts`
- **chat.ts** (3 connections) — `apps\bff\src\routes\chat.ts`
- **event-articles.ts** (3 connections) — `apps\bff\src\routes\event-articles.ts`
- **lookups.ts** (3 connections) — `apps\bff\src\routes\lookups.ts`
- **parseBigIntCsv()** (3 connections) — `apps\bff\src\routes\events.ts`
- **parseCsv()** (3 connections) — `apps\bff\src\routes\events.ts`
- **parseSid()** (3 connections) — `apps\bff\src\middleware\require-auth.ts`
- **loadApprovedUploader()** (3 connections) — `apps\bff\src\middleware\require-uploader.ts`
- **shape()** (3 connections) — `apps\bff\src\routes\subscriptions.ts`
- **parseBigIntQuery()** (2 connections) — `apps\bff\src\routes\admin-audit.ts`
- **parseIntClamp()** (2 connections) — `apps\bff\src\routes\admin-audit.ts`
- **parseBigIntCsv()** (2 connections) — `apps\bff\src\routes\admin-events.ts`
- **parseIntClamp()** (2 connections) — `apps\bff\src\routes\admin-events.ts`
- *... and 31 more nodes in this community*

## Relationships

- [[Event Reviews API]] (1 shared connections)
- [[Auth Flow]] (1 shared connections)
- [[Bookmarks API]] (1 shared connections)
- [[Admin Uploader Review]] (1 shared connections)
- [[Uploader Routes]] (1 shared connections)
- [[Notifications API]] (1 shared connections)
- [[Ingest Jobs]] (1 shared connections)

## Source Files

- `apps\bff\src\app.ts`
- `apps\bff\src\middleware\require-admin.ts`
- `apps\bff\src\middleware\require-auth.ts`
- `apps\bff\src\middleware\require-uploader.ts`
- `apps\bff\src\routes\admin-audit.ts`
- `apps\bff\src\routes\admin-documents.ts`
- `apps\bff\src\routes\admin-events.ts`
- `apps\bff\src\routes\chat.ts`
- `apps\bff\src\routes\event-articles.ts`
- `apps\bff\src\routes\event-detail.ts`
- `apps\bff\src\routes\events-stats.ts`
- `apps\bff\src\routes\events.ts`
- `apps\bff\src\routes\lookups.ts`
- `apps\bff\src\routes\subscriptions.ts`
- `apps\bff\src\routes\uploads.ts`

## Audit Trail

- EXTRACTED: 159 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*