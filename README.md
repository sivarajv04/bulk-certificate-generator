# Bulk Certificate Generator API

A backend API that accepts a list of recipients in **one request**, generates a PDF
certificate for each valid recipient in the background, tracks progress, and lets
the client download certificates one by one or all together as a ZIP.

Built with **FastAPI, SQLAlchemy 2.0, ReportLab, structlog, pytest**.

## Setup

Requires Python 3.11+.

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env               # optional; defaults work as-is
```

By default the app uses SQLite (zero setup). To use PostgreSQL, set `DATABASE_URL`
in `.env` (see `.env.example`). Tables are created automatically on startup.

## Run

```bash
uvicorn app.main:app --reload
```

Interactive docs: http://localhost:8000/docs

## Run the tests

```bash
pytest
```

Tests use a throwaway SQLite database and storage folder, so they never touch real data.

## Using the API

### 1. Submit a job

```bash
curl -X POST http://localhost:8000/api/v1/certificate-jobs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Certificate of Participation",
    "event_name": "Python Backend Workshop 2026",
    "issuer": "Aereo Academy",
    "issue_date": "2026-10-08",
    "recipients": [
      {"name": "Asha Rao", "email": "asha@example.com"},
      {"name": "Ravi Kumar"}
    ]
  }'
```

Response (`202 Accepted`, returned immediately):

```json
{"job_id": "15c25ffc-...", "status": "PENDING", "total_count": 2,
 "status_url": "/api/v1/certificate-jobs/15c25ffc-..."}
```

### 2. Check progress

`GET /api/v1/certificate-jobs/{job_id}`

```json
{"status": "PROCESSING", "total_count": 500, "success_count": 283, "failed_count": 3,
 "pending_count": 214, "progress_percent": 56.9, "download_all_url": "/api/v1/certificate-jobs/.../download", "...": "..."}
```

Job status values: `PENDING` → `PROCESSING` → `COMPLETED` (all succeeded),
`COMPLETED_WITH_ERRORS` (some failed) or `FAILED` (none succeeded).

### 3. See every recipient's result (including failures)

`GET /api/v1/certificate-jobs/{job_id}/certificates?status=FAILED&page=1&page_size=50`

Each item has `certificate_number`, `status` (`PENDING`/`SUCCESS`/`FAILED`), `error` and a `download_url`.

### 4. Retrieve certificates

| Endpoint | Returns |
|---|---|
| `GET /api/v1/certificates/{id}/download` | one PDF, named after its certificate number |
| `GET /api/v1/certificate-jobs/{job_id}/download` | ZIP of all successful certificates |

Other: `GET /health`.

## Certificate numbers

Every certificate shows its recipient name and a unique number such as
`CERT-2026-000123` (`PREFIX-YEAR-NNNNNN`, prefix set by `CERTIFICATE_PREFIX`).
The number is derived from the item's unique database id, so it is unique without
needing a database sequence. Recipients rejected by validation never get a number,
so gaps in the sequence are expected.

## Design decisions

**Background processing with `BackgroundTasks`, state in the database.**
A large request would time out if processed inside the HTTP call, so the API stores
the job, answers `202` and generates certificates afterwards. Celery + Redis would
be sturdier but adds infrastructure that this scope does not need. All state
(job and per-item status) lives in the database, and the whole workflow is one
function, `process_job(job_id)`, so moving to a real queue means changing how it
is called, not what it does. Trade-off: a background task dies with the server
process. To cover that, unfinished jobs are re-queued on startup
(`recover_unfinished_jobs`), and `process_job` only touches `PENDING` items, so
resuming never regenerates finished certificates.

**Invalid recipients are stored, not rejected.** A request is only rejected (`422`)
when it is malformed as a whole (empty list, missing fields, too many recipients).
A bad individual recipient becomes a `FAILED` item with a readable reason, so the
rest of the batch is unaffected and the client can see exactly what to fix.

**One failure never stops the job.** Each certificate is generated inside its own
try/except and committed separately. This also makes progress visible live.

**Names are never altered to fit.** Long names shrink the font down to a minimum;
if a name still does not fit, that certificate fails with a clear error instead of
printing a truncated name.

**Font coverage is checked up front.** The bundled DejaVu Sans font covers Latin
(including accents), Greek and Cyrillic. Names in other scripts (e.g. Tamil,
Devanagari) are rejected with a clear reason rather than printing empty boxes.

**Public ids vs. certificate numbers.** URLs use random UUIDs, so certificates
cannot be guessed by incrementing a number. The sequential integer id is used only
to derive the certificate number.

**Storage behind an interface.** PDFs are written atomically (temp file + rename)
under server-generated paths, never user input, which prevents path traversal. The
`StorageBackend` interface allows S3 later.

**ZIP built on disk.** A 500-certificate ZIP is about 22 MB, so it is built in a
temp file and streamed, then deleted.

## Limitations and future scope

- Single certificate template (as specified).
- Background tasks run in the API process; a separate worker (Celery/RQ) would scale better.
- No authentication or rate limiting.
- Schema is created with `create_all`; Alembic migrations would be the next step for production.
- Names in scripts outside the bundled font are rejected.
- Ideas: multiple templates, per-job Excel log, retry endpoint for failed items, email delivery, QR-code verification.

## Project layout

```
app/
  main.py              app creation, startup recovery
  core/                settings, logging
  db/                  engine and session
  models/              Job, JobItem
  schemas/             request/response models
  api/                 routers: jobs, certificates, health
  services/
    job_service.py     create job, queries, certificate numbers
    processor.py       process_job + recovery
    generator.py       the certificate template (ReportLab)
    validation.py      per-recipient validation
    storage.py         file storage
    fonts.py           bundled font + fit/coverage helpers
    importer.py        CSV/XLSX parsing, column detection, row validation
  assets/fonts/        DejaVu Sans (see LICENSE-DejaVu.txt)
frontend/               React/Vite web UI
tests/
```

## CSV / Excel import

The web UI supports bulk recipient lists from `.csv`, `.xlsx`, and `.xlsm` files.
The import is intentionally a preview step: the file is parsed and validated in
memory, then only the valid recipient rows are submitted to the existing bulk job
API after the user reviews the mapping.

### Supported spreadsheet format

The first row must contain headers. The importer automatically looks for common
name/email headers such as `Name`, `Student Name`, `Full Name`, `Participant Name`,
and `Email`. The UI lets the user override the detected columns before generating.

Example CSV:

```csv
Student Name,Email,Department,Roll Number
Rahul Kumar,rahul@gmail.com,CSE,22CS101
Priya Sharma,priya@gmail.com,CSE,22CS102
```

The preview reports valid and invalid rows, validation errors, and duplicate-name
warnings. Invalid rows are skipped when the user starts generation; the normal job
API validates the final recipient payload again.

### Import API

`POST /api/v1/certificate-jobs/import-preview` accepts multipart form data:

- `file`: `.csv`, `.xlsx`, or `.xlsm`
- `name_column`: optional zero-based column index
- `email_column`: optional zero-based column index

It returns the detected columns, preview rows, validation counts, and a `recipients`
array ready for `POST /api/v1/certificate-jobs`.

The import is limited to the configured `MAX_RECIPIENTS` and `MAX_IMPORT_FILE_BYTES`
(default 1000 rows and 5 MB).

## Web UI

The React/Vite application is under `frontend/`.

```bash
cd frontend
npm install
copy .env.example .env       # Windows PowerShell
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`.
The backend must be running separately with `uvicorn app.main:app --reload`.

For deployment, set `VITE_API_BASE_URL` to the deployed FastAPI `/api/v1` URL and
set the backend `CORS_ORIGINS` to the deployed frontend origin.
