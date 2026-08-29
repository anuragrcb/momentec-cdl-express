# Vercel demo deployment

This application is ready to run as a Vercel Next.js project. Customer source images, extracted crops, generated SVG packages and submission records automatically use a **private Vercel Blob store** when `BLOB_READ_WRITE_TOKEN` is present. Local development keeps the same API contract and writes those files under `data/`.

## 1. Create the project

Import this repository into Vercel and keep the repository root as the project root. Use Node.js 20 or newer. No custom build command is required; the normal `npm run build` command is sufficient.

## 2. Link private Blob storage

Create a Blob store in the Vercel project and keep it private. Link it to this project so Vercel provides `BLOB_READ_WRITE_TOKEN`. The app never exposes Blob URLs directly; images and SVGs are returned through authenticated application routes.

## 3. Add server-only environment variables

Add these in **Project Settings → Environment Variables** for Preview and Production:

- `GEMINI_API_KEY`
- `MAGNIFIC_MCP_CLIENT_ID`
- `MAGNIFIC_MCP_REFRESH_TOKEN`
- `MAGNIFIC_MCP_CLIENT_SECRET` only when the OAuth client requires it
- `MAGNIFIC_MCP_MODEL` (optional; defaults to `imagen-nano-banana-2`)
- `BLOB_READ_WRITE_TOKEN` (normally injected by the linked Blob store)

Do not expose any of them with a `NEXT_PUBLIC_` prefix.

`RETEXTURE_SERVICE_URL` is needed only for styles using the separate server-baked renderer. The J180A manufacturer-panel proof runs in the browser and does not depend on that service. A local `localhost` value will not work from Vercel.

## 4. Function duration and upload constraints

The Step 5 Magnific route declares a 300-second function duration because it performs four image generations, four vectorizations and ZIP packaging. For a production queue, move that job to a durable background worker and let the UI poll the job record; the synchronous route is intentionally a demo path.

Vercel Functions cap a request body at 4.5 MB. The current demo upload sends all selected views to the server in one request, so optimize the four reference images before upload or keep their combined request below that limit. Production should switch this screen to Vercel Blob client uploads so large artwork bypasses the function body.

## 5. Deployment verification

1. Open the homepage and confirm the Momentec header, hero and process story render without layout shifts.
2. Upload four small reference views and confirm Step 2 shows actual isolated region crops.
3. Select J180A, change the proof size and inspect all four camera views.
4. Prepare the artwork package and confirm Step 5 shows source assets grouped by view.
5. Confirm each SVG opens in the browser and the ZIP downloads.
6. Submit the handoff, refresh, and verify the private Blob request record still exists.

## Production follow-up

The Magnific refresh token may rotate. A serverless function must not try to rewrite `.env`; store the new token in a managed secret service or use a non-rotating service credential when Magnific supports it. Add an asynchronous job record, retries, provider cost controls and retention/deletion policies before opening this workflow to external customers.
