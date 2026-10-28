#!/usr/bin/env bash
# Creates or updates the private proof bucket and the proof Lambda (momentec-cdl-proof).
# The one function serves both:
#   - its public Function URL: POST /jobs, GET /jobs/{jobId} (needs the x-api-key header)
#   - the background job each POST starts by invoking the function asynchronously
#
# No terminal? docs/deploy-console.md does the same steps in the AWS console.
#
# Run this with the admin user (momentec-cdl-admin). Region is us-east-1.
#
# Before this script:
#   1. Turn on MFA for the root user, then stop using root.
#   2. Create IAM user momentec-cdl-admin with AdministratorAccess and MFA.
#   3. aws configure --profile momentec-admin
#      (access key of momentec-cdl-admin, region us-east-1)
#   4. Set a billing alarm around $10.
#   5. In lambda/, run: npm install
#   6. Put a long random PROOF_API_KEY in .env, for example the output of: openssl rand -hex 32
#
# Then:
#   AWS_PROFILE=momentec-admin bash scripts/create-aws-proof.sh
#
# The script prints the Function URL. Put it in .env as PROOF_API_URL for the website, and share the
# URL and PROOF_API_KEY with the client together with docs/proof-api.md.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v aws >/dev/null 2>&1; then
  echo "The AWS CLI is not installed. Install it, then: aws configure --profile momentec-admin" >&2
  echo "Use the momentec-cdl-admin access key. Region: us-east-1. Output: json." >&2
  exit 1
fi

export AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_DEFAULT_REGION="$AWS_REGION"
if [[ "$AWS_REGION" != "us-east-1" ]]; then
  echo "This setup uses us-east-1. Set AWS_REGION=us-east-1." >&2
  exit 1
fi

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="momentec-cdl-proofs-${ACCOUNT}"
ROLE_NAME="momentec-cdl-proof-role"
FUNCTION_NAME="momentec-cdl-proof"
FUNCTION_ARN="arn:aws:lambda:${AWS_REGION}:${ACCOUNT}:function:${FUNCTION_NAME}"
ZIP="${ROOT}/dist/momentec-cdl-proof.zip"
ENV_FILE="${ROOT}/dist/lambda-env.json"

mkdir -p "${ROOT}/dist"
rm -f "$ENV_FILE"
trap 'rm -f "$ENV_FILE"' EXIT

# Read .env once, before touching AWS, so a missing value stops the script early. Values are never printed.
set +e
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const [bucket, destination] = process.argv.slice(1);
const env = {};
try {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'\''") && value.endsWith("'\''"))) value = value.slice(1, -1);
    env[match[1]] = value;
  }
} catch {}
// Lambda variable names cannot contain dashes, so the dashed .env names are renamed here.
const catalogKey = env.CATALOG_API_KEY || env["X-API-Key"];
const catalogUrl = env.MOMENTEC_CATALOG_SEARCH_URL || env["momentec-catalog-search-url"];
const garmentUrl = env.GARMENT_IMAGE_URL || env["garment-image-url"];
if (!env.OPENAI_API_KEY || !env.MAGNIFIC_API_KEY || !catalogKey || !catalogUrl || !garmentUrl) process.exit(2);
if (!env.PROOF_API_KEY || env.PROOF_API_KEY.length < 24) process.exit(3);
const variables = {
  PROOF_BUCKET: bucket,
  PROOF_API_KEY: env.PROOF_API_KEY,
  OPENAI_API_KEY: env.OPENAI_API_KEY,
  MAGNIFIC_API_KEY: env.MAGNIFIC_API_KEY,
  CATALOG_API_KEY: catalogKey,
  MOMENTEC_CATALOG_SEARCH_URL: catalogUrl,
  GARMENT_IMAGE_URL: garmentUrl,
};
if (env.OPENAI_MODEL) variables.OPENAI_MODEL = env.OPENAI_MODEL;
writeFileSync(destination, JSON.stringify({ Variables: variables }));
' "$BUCKET" "$ENV_FILE"
ENV_STATUS=$?
set -e
if [[ "$ENV_STATUS" == "2" ]]; then
  echo "Set OPENAI_API_KEY, MAGNIFIC_API_KEY, X-API-Key, momentec-catalog-search-url, and garment-image-url in .env first." >&2
  exit 1
elif [[ "$ENV_STATUS" == "3" ]]; then
  echo "Set PROOF_API_KEY in .env first (at least 24 characters). For example: openssl rand -hex 32" >&2
  exit 1
elif [[ "$ENV_STATUS" != "0" ]]; then
  echo "Could not read .env." >&2
  exit 1
fi

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "Bucket already exists: $BUCKET"
else
  aws s3api create-bucket --bucket "$BUCKET" --region "$AWS_REGION"
fi
aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document "$TRUST" >/dev/null
fi
aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
# API side: store jobs, read status, sign PDF links, start itself. Job side: read the job, write results.
aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name momentec-cdl-proof-s3 \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Effect\": \"Allow\",
        \"Action\": [\"s3:GetObject\"],
        \"Resource\": [
          \"arn:aws:s3:::${BUCKET}/*/reference-*\",
          \"arn:aws:s3:::${BUCKET}/*/job.json\",
          \"arn:aws:s3:::${BUCKET}/*/status.json\",
          \"arn:aws:s3:::${BUCKET}/*/proof.pdf\"
        ]
      },
      {
        \"Effect\": \"Allow\",
        \"Action\": [\"s3:PutObject\"],
        \"Resource\": [
          \"arn:aws:s3:::${BUCKET}/*/reference-*\",
          \"arn:aws:s3:::${BUCKET}/*/job.json\",
          \"arn:aws:s3:::${BUCKET}/*/status.json\",
          \"arn:aws:s3:::${BUCKET}/*/sheet.png\",
          \"arn:aws:s3:::${BUCKET}/*/proof.pdf\"
        ]
      },
      {
        \"Effect\": \"Allow\",
        \"Action\": [\"s3:ListBucket\"],
        \"Resource\": [\"arn:aws:s3:::${BUCKET}\"]
      },
      {
        \"Effect\": \"Allow\",
        \"Action\": [\"lambda:InvokeFunction\"],
        \"Resource\": [\"${FUNCTION_ARN}\"]
      }
    ]
  }"
ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text)"

if [[ ! -d "${ROOT}/lambda/node_modules/pdfkit" || ! -d "${ROOT}/lambda/node_modules/@aws-sdk/client-lambda" ]]; then
  echo "In the lambda folder, run: npm install" >&2
  exit 1
fi
(cd "${ROOT}/lambda" && rm -rf dist && npm run build)
rm -f "$ZIP"
python3 - "${ROOT}/lambda" "$ZIP" << 'PY'
import os, sys, zipfile
root, destination = sys.argv[1], sys.argv[2]
# Dev-only packages are left out so the zip stays small enough for a console upload.
skip = {".bin", "typescript", "@types", ".cache"}
with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    compiled = os.path.join(root, "dist")
    for dirpath, dirs, files in os.walk(compiled):
        for name in files:
            full = os.path.join(dirpath, name)
            archive.write(full, os.path.relpath(full, compiled))
    modules = os.path.join(root, "node_modules")
    for dirpath, dirs, files in os.walk(modules):
        dirs[:] = [d for d in dirs if d not in skip]
        for name in files:
            full = os.path.join(dirpath, name)
            archive.write(full, os.path.relpath(full, root))
PY

if aws lambda get-function --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FUNCTION_NAME" --zip-file "fileb://${ZIP}" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME"
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --timeout 900 \
    --memory-size 2048 \
    --runtime nodejs20.x \
    --handler index.handler \
    --role "$ROLE_ARN" \
    --environment "file://${ENV_FILE}" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME"
else
  created=0
  for _ in 1 2 3 4 5 6; do
    if aws lambda create-function \
      --function-name "$FUNCTION_NAME" \
      --runtime nodejs20.x \
      --architectures x86_64 \
      --role "$ROLE_ARN" \
      --handler index.handler \
      --timeout 900 \
      --memory-size 2048 \
      --environment "file://${ENV_FILE}" \
      --zip-file "fileb://${ZIP}" >/dev/null; then
      created=1
      break
    fi
    sleep 10
  done
  if [[ "$created" != "1" ]]; then
    echo "Lambda did not accept the new role yet. Run this script again." >&2
    exit 1
  fi
  aws lambda wait function-active --function-name "$FUNCTION_NAME"
fi
echo "Lambda environment set from .env (values not printed)."

# Each job calls paid OpenAI and Magnific APIs, so a failed job must not be retried automatically.
# (This only affects the background job; Function URL requests are not retried.)
aws lambda put-function-event-invoke-config \
  --function-name "$FUNCTION_NAME" \
  --maximum-retry-attempts 0 >/dev/null

# No reserved concurrency here: on one function it would also throttle the status calls.

# Public Function URL. Since October 2025 a NONE-auth URL needs both permissions below.
if ! aws lambda get-function-url-config --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  aws lambda create-function-url-config --function-name "$FUNCTION_NAME" --auth-type NONE >/dev/null
fi

add_url_permission() {
  local output
  if ! output="$(aws lambda add-permission --function-name "$FUNCTION_NAME" "$@" 2>&1)"; then
    if [[ "$output" != *ResourceConflictException* ]]; then
      echo "Could not add a Function URL permission: ${output}" >&2
      echo "Update the AWS CLI, or add it in the console: Lambda, ${FUNCTION_NAME}, Configuration, Permissions." >&2
    fi
  fi
}
add_url_permission \
  --statement-id FunctionURLAllowPublicAccess \
  --action lambda:InvokeFunctionUrl \
  --principal "*" \
  --function-url-auth-type NONE
add_url_permission \
  --statement-id FunctionURLAllowInvokeAction \
  --action lambda:InvokeFunction \
  --principal "*" \
  --invoked-via-function-url

API_URL="$(aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --query FunctionUrl --output text)"
API_URL="${API_URL%/}"

cat <<EOF

Bucket:    ${BUCKET}
Function:  ${FUNCTION_NAME}
URL:       ${API_URL}
Region:    ${AWS_REGION}

Add this to .env for the website (PROOF_API_KEY is already there):
  PROOF_API_URL=${API_URL}

Try it:
  curl -s "${API_URL}/jobs/job-2026-01-01T00-00-00Z_00000000-0000-4000-8000-000000000000" -H "x-api-key: \$PROOF_API_KEY"
  (expect 404 "No job with that id." — a 401 means the key is wrong, a 403 means the URL permissions are missing)

The website no longer needs AWS keys: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, PROOF_BUCKET, and
PROOF_FUNCTION_NAME can be removed from its .env, and the momentec-cdl-app IAM user can be deleted.

Each job writes <jobId>/reference-N, job.json, status.json, sheet.png, and proof.pdf in the bucket.
EOF
