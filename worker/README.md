# Worker API

All API responses are UTF-8 JSON except the authenticated photo body endpoint. The Worker does not emit CORS headers. Every `POST`, `PUT`, `PATCH`, and `DELETE` request must include:

```text
X-Requested-With: home-parking-hub
```

Authentication uses the `ACCESS_CODE` and `SESSION_SECRET` Worker secrets. `ACCESS_CODE` must be at least 20 characters and `SESSION_SECRET` must be at least 32 characters. Five failed logins from the same HMAC-hashed Cloudflare client IP within ten minutes return `429`; a successful login clears the failure record. `SESSION_MAX_AGE_DAYS` defaults to 90 and can be configured from 1 to 3650 days. Production HTTPS uses a signed `__Host-` cookie with `HttpOnly`, `Secure`, `SameSite=Strict`, and `Path=/`. Local HTTP development uses a separately named `HttpOnly`, `SameSite=Strict` cookie so iOS Simulator Safari can sign in without weakening the production cookie.

## Endpoints

- `GET /api/auth/session` -> `{ authenticated }`
- `POST /api/auth/login` with `{ code }` -> `{ authenticated: true }`
- `POST /api/auth/logout` -> `{ authenticated: false }`
- `GET /api/parking?includeInactive=true` -> `{ parkingLots }`
- `GET /api/parking/:id` -> `{ parkingLot }`
- `POST /api/parking` with `ParkingLotInput` -> `{ parkingLot }`
- `PUT /api/parking/:id` with `ParkingLotInput + { expectedUpdatedAt }` -> `{ parkingLot }`; stale edits return `409`, and a changed pricing payload creates a pricing-history version
- `POST /api/parking/:id/availability` -> `{ parkingLot }`
- `DELETE /api/parking/:id/availability/:logId` -> `{ parkingLot }`
- `POST /api/parking/:id/memos` with `{ body }` -> `{ parkingLot }`
- `PUT /api/parking/:id/memos/:memoId` with `{ body }` -> `{ parkingLot }`
- `DELETE /api/parking/:id/memos/:memoId` -> `{ parkingLot }`
- `POST /api/parking/:id/photos` as multipart fields `file`, `kind`, and optional `note` -> `{ photo }`
- `DELETE /api/parking/:id/photos/:photoId` -> `{ parkingLot }`
- `GET /api/photos/:photoId` -> authenticated R2 image body
- `GET /api/backup` -> `BackupEnvelope` JSON download
- `POST /api/backup/restore` with a `BackupEnvelope`, JSON text, or `{ backup: jsonText }` -> `{ parkingLots }`

Photo uploads accept JPEG, PNG, WebP, HEIC, and HEIF variants up to 10 MiB. Backup JSON includes photo metadata but not R2 binary objects. Restoring into the same R2 bucket reconnects metadata to objects that still exist; a new/empty bucket cannot recreate photo binaries from the JSON.
