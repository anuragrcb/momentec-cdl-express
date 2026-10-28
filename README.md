UPLOAD AI DESIGN
Status of the work so far

This note is written in plain text so it can be shared as a .txt file.


WHAT THE APP DOES

A customer drops one or more garment images, picks a size (L when left blank), enters name, email, and an optional message, and submits. No AI runs in the browser or on the website: there is no preview, no category or gender question, and no 3D view.

The proof service is a public API (a Lambda Function URL, protected by an x-api-key header) that the client can call directly; docs/proof-api.md is the document to share with them. The website uses the same API: its Next.js routes forward the form to POST /jobs and add the key on the server.

Upload design returns immediately with a tracking id (the job id), shown on the page with a Copy button. The customer can leave. A worker Lambda then does all the AI work and writes the proof PDF to a private S3 bucket.

Track a job on the website at /status/<job id> (a page with a progress bar, the step checklist, the garment, and a Download button; it refreshes itself), or with GET /jobs/<job id> on the API (GET /api/upload-ai-design/status/<job id> on the website relays it). The reply has state (queued, running, done, needs_review, failed), a plain-English message, progress 0 to 100, the step checklist, the garment, and, once finished, a 15-minute PDF download link.


WHAT IS DONE

1. The home page is the upload dialog. The old design studio, catalog match, orders page, and other API routes were removed.

2. POST /jobs (lambda/src/api.ts) stores the images (<job id>/reference-N), size, name, email, and message (<job id>/job.json), writes status queued, then starts the job in the background by invoking the same Lambda asynchronously (runJob in lambda/src/index.ts). The job does this, in order, writing its stage and progress to <job id>/status.json as it goes:
   - OpenAI picks the category and gender from the first image (Men when unsure).
   - OpenAI describes the garment, the catalog vector search returns candidates, and OpenAI picks the closest style from their front and back renders and plans where every color, logo, and number goes. Logos and text may sit anywhere; the catalog locations are only reference spots.
   - Magnific projects the customer's design onto that style's front and back template in one side-by-side sheet (<job id>/sheet.png). The prompt tells it to ignore any background, person, hanger, or prop in the customer's photos.
   - OpenAI reads the sheet and lists team marks and roster marks, plus garment fill colors. Magnific redraws each mark on a white background.
   - Those images are built into the proof PDF and written to S3.
   If matching or any AI step fails, the PDF instead shows the customer's own images and an "Artist review needed" box with the reason, and status.json says needs_review.

3. Async retries are off on the Lambda, so a failed job never re-runs the paid OpenAI and Magnific calls. There is no reserved concurrency, because on one function it would also throttle the status calls.

4. Magnific image edits for the proof run in two waves. The first half run together, then the second half. This is faster than one pair at a time. Starting every edit at once was failing with a Magnific credit error.

5. The PDF follows the FreeStyle proof layout:
   - Page 1: order summary, front and back, garment info, fill colors.
   - Next page: team and company decorations, then roster decorations. Each row has the placement name, the art, the color dots, and the size line.
   - Last page: roster table and the customer comment.
   Pages end after the last line, so they are not a full blank letter page under the content.

6. Values that are not coming from the upload are filled in by hand and drawn on a light red background, so they are easy to spot. Names, pictures, and colors that come from OpenAI or Magnific are not highlighted.


WHAT IS STILL OPEN

Colors.
OpenAI does not yet return a reliable color list for every mark. Sometimes a listed color is not actually in that mark. Sometimes a color that is in the mark is missing. The prompt was tightened so a color counts only when it is printed inside that one mark, and so the garment cloth is not copied onto the mark unless the mark is printed in that cloth color. That reduced invented colors. It is not solved. The next pass should make the list match the inks in the mark: no extras, and no missing inks. Do not hardcode colors from any sample jersey.

Real order data.
The red fields below are still sample text from one reference proof. They need to come from the real order when that data exists.

Measurements.
Size comes from the form (L when blank). Gender is picked by OpenAI from the first image. OpenAI returns where each mark sits as a fraction of the garment, and inch sizes graded for that gender and size. Those inches are drawn on the decoration row when they come back. If OpenAI leaves them out, the row stays on the red 1.5 inch line and zero offsets.

Customer form.
Name, email, and message are stored with the job in S3. Name and message are written in the PDF's customer comment. Gender and size are written on the garment size line and the roster top size.

AWS.
The live account, region, functions, bucket layout, and who is allowed to call each one are written in docs/aws.md (written before the API change; scripts/create-aws-proof.sh is now the source of truth). The lambda/ folder, in TypeScript, does not import this website. It is one Lambda, momentec-cdl-proof (handler index.handler): Function URL requests go to the API code (lambda/src/api.ts), and the background jobs it starts run the whole AI pipeline (fit, catalog match, sheet generation, decorations, PDF). The catalog search is a separate function built from Momentec_VectorEmbeddings. The website needs only PROOF_API_URL and PROOF_API_KEY in .env, no AWS keys. To deploy, upload dist/momentec-cdl-proof.zip in the console following docs/deploy-console.md, or run scripts/create-aws-proof.sh (it needs PROOF_API_KEY in .env and prints the URL).


HARDCODED VALUES TO REPLACE

These are the same on every proof until we have real data. They are the light red fields.

Order block
- REF#: S6071854
- Total quantity: 1
- Ecom order#: 65486587642357
- Artist: MQ

Garment block
- Style #: 228435
- Qty: 1
- Design: CUSTOM (STRIKEOUT)

Roster table
- Style: 228435
- No: 10
- Name: PLAYER
- Qty: 1

Customer comment
- The long note about recreating a youth jersey on a ladies style because the wrong SKU was used and the strikeout template was not available.
- The Momentec configurator URL stored with that note.

On every decoration row, only when OpenAI does not return a size
- ADJ: U:0  D:0  L:0  R:0
- Number rows: SENTINEL: 1.5 INCH
- Name rows: FULL BLOCK: 1.5 INCH
- Other marks: ART HEIGHT: 1.5 INCH and ART WIDTH: 1.5 INCH

Also fixed, but not printed as a red field
- The FreeStyle header is cropped from assets/pdf1.png.
- A Fuze pad-print note exists in the code and is not drawn on the PDF.


WHAT COMES FROM THE UPLOAD

These are not hardcoded.

- The front and back pictures on page 1.
- Each decoration picture.
- Placement names, such as where the mark sits, then the word SUBLIMATION.
- Size from the form and gender picked from the image, shown as the garment size and the roster top size.
- Style number and garment name from the catalog match.
- Each mark's placement fractions and inch sizes, when OpenAI returns them.
- Garment fill colors: role, name, and hex.
- Each mark's color names and hex values.
