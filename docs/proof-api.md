# Momentec custom design proof API

Send garment images and customer details. The service picks the closest Momentec catalog style,
renders the design onto its front and back, and builds a production proof PDF. It runs in the
background and usually takes a few minutes. You track it with the job id.

## Base URL and key

```
BASE_URL = https://<id>.lambda-url.us-east-1.on.aws      (sent to you separately)
x-api-key: <your key>                                   (sent to you separately; keep it secret)
```

Every request needs the `x-api-key` header. Call the API from your server, never from a browser,
so the key is not exposed.

A ready-made Postman collection is in `docs/postman/momentec-proof-api.postman_collection.json`:
import it, set `baseUrl` and `apiKey` in its Variables tab, and every request below is set up.

## 1. Create a job

`POST {BASE_URL}/jobs` with `Content-Type: application/json`

```json
{
  "name": "Jane Coach",
  "email": "jane@example.com",
  "message": "Please make the chest logo a little bigger.",
  "size": "M",
  "quality": "high",
  "images": [
    "https://cdn.example.com/designs/front.jpg",
    { "url": "https://cdn.example.com/designs/back.png" },
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...",
    { "data": "iVBORw0KGgoAAAANSUhEUgAA..." }
  ]
}
```

| Field     | Required | Notes |
|-----------|----------|-------|
| `name`    | yes      | Up to 120 characters. |
| `email`   | yes      | A valid email address. |
| `message` | no       | Up to 2000 characters. Shown to the artist on the proof. |
| `size`    | no       | One of `XS`, `S`, `M`, `L`, `XL`, `2XL`, `3XL`. Defaults to `L`. |
| `quality` | no       | Render quality of the front/back views and logos: `high` (default, best detail), `medium`, or `low` (fastest and cheapest, fine for drafts). |
| `images`  | yes      | 1 to 8 images: PNG, JPEG, or WEBP. Each one is either an **https link** (a string, or `{ "url": "<link>" }`) or **base64** (a `data:` URI, plain base64, or `{ "data": "<base64>" }`). You can mix both. The first image should show the front of the garment. Add the back or close-ups of logos if you have them. Photos with backgrounds are fine. |

Limits:
- **Links** must be `https://` on a public host name (no IP addresses, custom ports, or
  `user:password@`), and must be downloadable without login. Each linked image at most **10 MB**;
  it must download within 15 seconds. Up to 3 redirects are followed (each must also be https).
  Pre-signed links (S3, Google Cloud Storage, Azure) work if they are still valid when you send the job.
- **Base64** images together at most **4 MB** before encoding (the whole request must stay under 6 MB).
- All images together at most **40 MB**.

Images around 1600 px on the long edge are plenty. If a link cannot be downloaded, the reply is
`400` and names the image, for example
`images[0] (https://cdn.example.com/front.jpg) returned HTTP 404.` No job is created.

Reply `202 Accepted`:

```json
{ "jobId": "job-2026-10-23T14-05-09Z_6f1c2c0e-8a43-4f0e-9b7a-2f1d9c3e5a10", "state": "queued", "quality": "high", "statusUrl": "/jobs/job-2026-10-23T14-05-09Z_6f1c2c0e-..." }
```

## 2. Track a job

`GET {BASE_URL}/jobs/{jobId}`

```json
{
  "jobId": "job-2026-10-23T15-10-28Z_4f4150bb-7d8c-4321-bd41-cc8a53bf0d33",
  "state": "running",
  "message": "Step 4 of 6: Creating the front and back views. This usually takes a few minutes.",
  "progress": 42,
  "step": { "key": "generating_views", "label": "Creating the front and back views", "number": 4, "total": 6 },
  "steps": [
    { "key": "reading_images", "label": "Reading your images", "status": "done" },
    { "key": "identifying_garment", "label": "Identifying the garment", "status": "done" },
    { "key": "matching_style", "label": "Finding the closest Momentec style", "status": "done" },
    { "key": "generating_views", "label": "Creating the front and back views", "status": "in_progress" },
    { "key": "extracting_marks", "label": "Preparing logos, names, and numbers", "status": "waiting" },
    { "key": "building_pdf", "label": "Building the proof PDF", "status": "waiting" }
  ],
  "garment": {
    "style": "228103",
    "name": "Sublimated V-Neck Hockey Jersey",
    "category": "Hockey",
    "gender": "Men",
    "size": "L"
  },
  "quality": "high",
  "pdf": null,
  "reason": null,
  "error": null,
  "submittedAt": "2026-10-23T15:10:28.000Z",
  "updatedAt": "2026-10-23T15:11:40.000Z"
}
```

- `message` is a plain-English sentence you can show to people as-is.
- `step` is the step running now (`null` when not running); `steps` is the full checklist. Each
  step's `status` is `done`, `in_progress`, `waiting`, `stopped` (where a `needs_review` or `failed`
  job stopped), or `skipped`.
- `garment` fields fill in as they become known; any of them can be `null`.

When `state` is `done` or `needs_review`, `pdf` holds a download link that works for 15 minutes.
Call GET again for a fresh link.

```json
"pdf": { "url": "https://momentec-cdl-proofs-...s3.amazonaws.com/...proof.pdf?X-Amz-...", "expiresAt": "2026-10-23T15:28:14.775Z" }
```

Polling every 10 to 15 seconds is plenty.

### States

| `state`        | Meaning |
|----------------|---------|
| `queued`       | Saved, waiting to start. |
| `running`      | In progress. See `message`, `step`, and `progress` (0 to 99). |
| `done`         | Proof PDF is ready (`progress` 100). |
| `needs_review` | The garment could not be matched or rendered automatically. A PDF is still ready: it shows the customer's own images and the `reason`, for an artist to finish by hand. |
| `failed`       | Something broke before a PDF could be made. See `error`. |

### Steps

| `key`                 | Label                                 | Progress when it starts |
|-----------------------|---------------------------------------|-------------------------|
| `reading_images`      | Reading your images                   | 2% |
| `identifying_garment` | Identifying the garment               | 5% |
| `matching_style`      | Finding the closest Momentec style    | 12% |
| `generating_views`    | Creating the front and back views     | 35% |
| `extracting_marks`    | Preparing logos, names, and numbers   | 60 to 90% |
| `building_pdf`        | Building the proof PDF                | 92% |

## 3. List jobs

```
GET {baseUrl}/jobs?limit=10
x-api-key: <key>
```

All jobs, newest first. `limit` is 1 to 50 (default 10). Each item in `data` has the same fields as
GET /jobs/{jobId}, plus `customerName`. For the next page, send `after=<last_id>` while `has_more`
is true.

```json
{
  "object": "list",
  "data": [ { "jobId": "job-...", "state": "done", "progress": 100, "customerName": "Jane Coach", "pdf": { "url": "...", "expiresAt": "..." } } ],
  "first_id": "job-...",
  "last_id": "job-...",
  "has_more": true
}
```

## Errors

Errors are JSON: `{ "error": "..." }`.

| Status | When |
|--------|------|
| 400 | The body is not valid (the message says which field), or the job id is malformed. |
| 401 | `x-api-key` is missing or wrong. |
| 404 | No job with that id, or an unknown path. |
| 405 | Wrong method for the path. |
| 502 | The job was saved but could not be started; try again. The reply includes `jobId`. |
| 500, 503 | Service problem; try again later. |

## Examples

With image links:

```bash
curl -s -X POST "$BASE_URL/jobs" \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Jane Coach","email":"jane@example.com","size":"M","images":["https://cdn.example.com/designs/front.jpg"]}'
```

With a base64 image:

```bash
IMG=$(base64 -w0 front.jpg)
curl -s -X POST "$BASE_URL/jobs" \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d "{\"name\":\"Jane Coach\",\"email\":\"jane@example.com\",\"size\":\"M\",\"images\":[\"$IMG\"]}"
```

```bash
curl -s "$BASE_URL/jobs/$JOB_ID" -H "x-api-key: $API_KEY"
```
