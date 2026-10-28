# Deploy the proof Lambda from the AWS console (no terminal)

Everything below is in the AWS console, region **us-east-1 (N. Virginia)**, on your existing
Lambda **`momentec-cdl-proof`**. No new function is needed: the same Lambda answers the public
link (Function URL) and runs each job in the background by starting itself.

- Zip to upload: `dist/momentec-cdl-proof.zip`
- Handler: `index.handler` (unchanged)
- Bucket: `momentec-cdl-proofs-946033679274`

Values you will copy from `.env`:

| Put this in the Lambda | Copy the value of this `.env` line |
|------------------------|------------------------------------|
| `PROOF_API_KEY`        | `PROOF_API_KEY` |
| `CATALOG_API_KEY`      | `X-API-Key` |
| `MOMENTEC_CATALOG_SEARCH_URL` | `momentec-catalog-search-url` |
| `GARMENT_IMAGE_URL`    | `garment-image-url` |
| `OPENAI_API_KEY`, `MAGNIFIC_API_KEY`, `OPENAI_MODEL` | same names |

(Lambda variable names cannot contain dashes, which is why three of them are renamed.)

---

## 1. Upload the code

**Lambda → Functions → momentec-cdl-proof → Code → Upload from → .zip file** → choose
`momentec-cdl-proof.zip` → **Save**.

Still on **Code**, **Runtime settings**: Handler `index.handler`, Runtime Node.js 20.x (no change).

## 2. General configuration

**Configuration → General configuration → Edit**: Memory `2048` MB, Timeout `15 min 0 sec`.

## 3. Environment variables

**Configuration → Environment variables → Edit**. Make sure all of these exist:

- `PROOF_BUCKET` = `momentec-cdl-proofs-946033679274`
- `OPENAI_API_KEY`, `MAGNIFIC_API_KEY`, `OPENAI_MODEL` (if you use one)
- **new:** `PROOF_API_KEY`, `CATALOG_API_KEY`, `MOMENTEC_CATALOG_SEARCH_URL`, `GARMENT_IMAGE_URL` (see the table above)

## 4. No automatic retries

**Configuration → Asynchronous invocation → Edit**: Retry attempts **0** → Save.
(A failed job must not re-run the paid AI calls. This does not affect the public link.)

Do **not** set reserved concurrency on this function: it would also block the status calls.

## 5. Permissions

**Configuration → Permissions →** click the role name (opens IAM). Under **Permissions policies**,
open the inline policy (`momentec-cdl-proof-s3`, or create one with **Add permissions → Create
inline policy → JSON**) and replace it with:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": [
        "arn:aws:s3:::momentec-cdl-proofs-946033679274/*/reference-*",
        "arn:aws:s3:::momentec-cdl-proofs-946033679274/*/job.json",
        "arn:aws:s3:::momentec-cdl-proofs-946033679274/*/status.json",
        "arn:aws:s3:::momentec-cdl-proofs-946033679274/*/proof.pdf"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": [
        "arn:aws:s3:::momentec-cdl-proofs-946033679274/*/reference-*",
        "arn:aws:s3:::momentec-cdl-proofs-946033679274/*/job.json",
        "arn:aws:s3:::momentec-cdl-proofs-946033679274/*/status.json",
        "arn:aws:s3:::momentec-cdl-proofs-946033679274/*/sheet.png",
        "arn:aws:s3:::momentec-cdl-proofs-946033679274/*/proof.pdf"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::momentec-cdl-proofs-946033679274"]
    },
    {
      "Effect": "Allow",
      "Action": ["lambda:InvokeFunction"],
      "Resource": ["arn:aws:lambda:us-east-1:946033679274:function:momentec-cdl-proof"]
    }
  ]
}
```

The last statement lets the Lambda start itself for each new job.

## 6. Public link (Function URL)

**Configuration → Function URL → Create function URL** → Auth type **NONE** → leave CORS off →
**Save**. Copy the **Function URL** it shows (like `https://abc123.lambda-url.us-east-1.on.aws/`).
The `x-api-key` check inside the code is what protects it.

If calling the link from outside later returns `403 Forbidden`, open **Configuration → Permissions →
Resource-based policy statements** and make sure there are statements allowing both
`lambda:InvokeFunctionUrl` and `lambda:InvokeFunction` for principal `*` (the console normally adds
them when you create the URL).

## 7. Test it in the console (no terminal)

**Test** tab → create a test event with this JSON (paste your real key):

```json
{
  "rawPath": "/jobs/job-2026-01-01T00-00-00Z_00000000-0000-4000-8000-000000000000",
  "requestContext": { "http": { "method": "GET" } },
  "headers": { "x-api-key": "PASTE_PROOF_API_KEY_HERE" }
}
```

Click **Test**. Expected result: `"statusCode": 404` with `"No job with that id."`.

- `401` → the key in the test event and the `PROOF_API_KEY` variable do not match.
- `503` → `PROOF_BUCKET` or `PROOF_API_KEY` is missing.
- `500` → the policy from step 5 is missing; check CloudWatch logs (Monitor tab).

---

## 8. The website

In `.env` (and in your hosting's environment settings if the site is deployed), set:

```
PROOF_API_URL=<the Function URL, without the trailing slash>
PROOF_API_KEY=<already in .env>
```

Restart the site after changing `.env`. Submit a design: the page shows a Tracking ID, and
`/api/upload-ai-design/status/<tracking id>` shows the progress and, when finished, the PDF link.

The old `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `PROOF_BUCKET`, and `PROOF_FUNCTION_NAME`
lines are no longer used by the website.

## 9. What to send the client

The Function URL, the `PROOF_API_KEY` value (send it privately), and `docs/proof-api.md`.
