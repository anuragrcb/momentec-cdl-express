# AWS setup

Account `946033679274`. Everything lives in **Asia Pacific (Sydney)**, `ap-southeast-2`. Do not create a second copy in another region.

Two functions. They do not call each other.

| | Proof PDF | Catalog search |
|---|---|---|
| Function | `momentec-cdl-proof` | `momentec-catalog-search` |
| What it does | OpenAI, Magnific, then the proof PDF | Search products, colors, and decoration locations |
| How it is started | The website calls `Invoke` | Public function URL |
| Package | Zip upload | Container image in ECR |
| Idle cost | $0 | $0 |

No secret values belong in this file. Keys live in the Lambda console and in the local `.env`, which is gitignored.

## Proof PDF

The customer clicks Upload and leaves. The site writes the job to S3 and starts the function. The browser does not download a PDF.

Bucket: `momentec-cdl-proofs-946033679274`. One folder per job:

```text
<job id>/sheet.png
<job id>/job.json
<job id>/status.json
<job id>/proof.pdf
```

`job.json` holds gender, size, category, name, email, and message. Category, name, email, and message are stored there and are not drawn on the PDF. `status.json` is `running`, then `done` or `failed`.

The website sends `{ "bucket", "jobId" }` with `InvocationType` Event. The image is not in the event. The function reads it from S3.

Function settings that must stay:

- Runtime Node.js 24.x
- Architecture **x86_64**
- Memory **2048 MB**
- Timeout **15 min**
- Handler `index.handler`
- Execution role `momentec-cdl-proof-role-5qlthz1u`

The first real run died at 3 seconds and 128 MB because those defaults were still the saved values. A later edit does not resume that job. AWS retries one request twice, then stops. A new upload creates a new job id.

Environment variables on this function: `PROOF_BUCKET`, `OPENAI_API_KEY`, `MAGNIFIC_API_KEY`, and `OPENAI_MODEL=gpt-6-sol`. Do not put `MAGNIFIC_MCP_CLIENT_ID` or `MAGNIFIC_MCP_REFRESH_TOKEN` here. Those are only for the website's 3D path.

There is no function URL. Do not add one. The website signs the invoke with the `momentec-cdl-app` access key. A header such as `X-API-Key` is not read by this function.

Source is `lambda/`. It is TypeScript and does not import the website. From that folder, `npm install`, then `npm run build`. The zip is `dist/momentec-cdl-proof.zip`: the contents of `lambda/dist` at the zip root, plus `lambda/node_modules`. Upload that zip on the function's code page. `scripts/create-aws-proof.sh` still targets `us-east-1` and was not used to create these resources.

IAM for the app user `momentec-cdl-app`, inline policy `momentec-cdl-app-proof`:

- `s3:PutObject` and `s3:GetObject` on `…/<job id>/sheet.png` and `…/<job id>/job.json`
- `lambda:InvokeFunction` on `momentec-cdl-proof`

IAM for the function role:

- `s3:GetObject` on `…/<job id>/sheet.png` and `…/<job id>/job.json`
- `s3:PutObject` on `…/<job id>/proof.pdf` and `…/<job id>/status.json`
- The basic Lambda logs policy

Do not attach `PowerUserRole` to this function.

Website `.env`: `AWS_REGION=ap-southeast-2`, `PROOF_BUCKET`, `PROOF_FUNCTION_NAME=momentec-cdl-proof`, plus the app user's access key. Restart the Next server after changing `.env`. At a normal upload rate this function stays inside the Lambda free tier. OpenAI and Magnific bill on their own accounts.

## Catalog search

`Momentec_VectorEmbeddings` is a separate FastAPI app. It is gitignored. It was not rewritten for AWS. The embedding model was already `BAAI/bge-small-en-v1.5`.

Function URL:

`https://nic2xwsxrt6ugsl2eaqrg63d5u0unwek.lambda-url.ap-southeast-2.on.aws/`

Call `POST /search` with a JSON body, not query parameters:

```json
{"query":"navy youth softball jersey with name on back","top_k":3}
```

The URL auth type is **NONE**, so the URL alone is not a secret. Protection is the environment variable `API_KEY` on the function. Callers must send header `X-API-Key` with that same value. The header name is not `API_KEY`. `/health` stays open so Lambda can see that the process started. The key value is only in the Lambda console.

Function settings:

- Architecture **x86_64**. An ARM image will not start.
- Memory **2048 MB**
- Timeout **2 min**
- Ephemeral storage **512 MB**
- Execution role `momentec-catalog-search-role`, with only `AWSLambdaBasicExecutionRole`

The image is too big for a zip. Libraries are about 503 MB, the model about 65 MB, and the index about 88 MB. Deleting products does not fix that. ECR storage for the image is about $0.05 to $0.15 a month. The function costs nothing while idle. A cold start, the first call after a quiet stretch, takes about half a minute because the model loads then.

How the image is built, without a local terminal:

1. Source zip `dist/momentec-catalog-search-source.zip` is uploaded to the proof bucket as `momentec-catalog-search-source.zip`. The zip is about 100 KB. It is source only.
2. CodeBuild project `momentec-catalog-search-build` reads that zip. **Privileged** must be on. The service role is `codebuild-momentec-catalog-search-build-service-role` and needs `AmazonEC2ContainerRegistryPowerUser`.
3. The build pushes to ECR repository `momentec-catalog-search`, tag `latest`.
4. The function was created from an image digest. After a new build, open the function, **Deploy new image**, and choose `latest`. A successful build does not update the function by itself.

`Dockerfile` installs the adapter, builds the index, and runs `chmod -R a+rX` on the model and the index. Lambda does not run as root. Without that chmod, startup dies with `Permission denied` on a model file. `start.sh` copies the model and the index to `/tmp` because the image disk is read-only.

This search is for turning a place name into a location code, and a color into a brand color. It does not pick the catalog style that matches an uploaded jersey. That match is a comparison of logo codes, text codes, and color zones, and it is not built yet.

## What not to mix up

- `momentec-cdl-app` can put the proof files and invoke the proof function. It cannot push to ECR or change Lambda.
- The CodeBuild role is not a Lambda execution role.
- `PowerUserRole` is not an execution role for either function.
- The proof zip and the search image are different artifacts. Uploading one does not update the other.
