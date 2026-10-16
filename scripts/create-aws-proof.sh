#!/usr/bin/env bash
# Creates the private proof bucket, the Lambda role, and the function.
#
# Run this once with the admin user (momentec-cdl-admin), not the app user.
# The Next.js server uses a separate key that can only upload a job and start
# the function. Region is us-east-1.
#
# Before this script:
#   1. Turn on MFA for the root user, then stop using root.
#   2. Create IAM user momentec-cdl-admin with AdministratorAccess and MFA.
#   3. Create IAM user momentec-cdl-app with no console password.
#   4. aws configure --profile momentec-admin
#      (access key of momentec-cdl-admin, region us-east-1)
#   5. Set a billing alarm around $10.
#
# Then:
#   AWS_PROFILE=momentec-admin bash scripts/create-aws-proof.sh
#
# The script prints the policy to attach to momentec-cdl-app. Put that user's
# access key in .env as AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, plus the
# PROOF_BUCKET and PROOF_FUNCTION_NAME lines this script prints.

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
ZIP="${ROOT}/dist/momentec-cdl-proof.zip"

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
          \"arn:aws:s3:::${BUCKET}/*/sheet.png\",
          \"arn:aws:s3:::${BUCKET}/*/job.json\"
        ]
      },
      {
        \"Effect\": \"Allow\",
        \"Action\": [\"s3:PutObject\"],
        \"Resource\": [
          \"arn:aws:s3:::${BUCKET}/*/proof.pdf\",
          \"arn:aws:s3:::${BUCKET}/*/status.json\"
        ]
      }
    ]
  }"
ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text)"

if [[ ! -d "${ROOT}/lambda/node_modules/pdfkit" || ! -d "${ROOT}/lambda/node_modules/typescript" ]]; then
  echo "In the lambda folder, run: npm install" >&2
  exit 1
fi
(cd "${ROOT}/lambda" && npm run build)
mkdir -p "${ROOT}/dist"
rm -f "$ZIP"
python3 - << PY
import os, zipfile
root = "${ROOT}/lambda"
destination = "${ZIP}"
with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    compiled = os.path.join(root, "dist")
    for dirpath, dirs, files in os.walk(compiled):
        for name in files:
            full = os.path.join(dirpath, name)
            archive.write(full, os.path.relpath(full, compiled))
    modules = os.path.join(root, "node_modules")
    for dirpath, dirs, files in os.walk(modules):
        dirs[:] = [name for name in dirs if name != ".bin"]
        for name in files:
            full = os.path.join(dirpath, name)
            archive.write(full, os.path.relpath(full, root))
PY

create_function() {
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --architectures x86_64 \
    --role "$ROLE_ARN" \
    --handler index.handler \
    --timeout 900 \
    --memory-size 2048 \
    --zip-file "fileb://${ZIP}" >/dev/null
}

if aws lambda get-function --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FUNCTION_NAME" --zip-file "fileb://${ZIP}" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME"
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --timeout 900 \
    --memory-size 2048 \
    --runtime nodejs20.x \
    --handler index.handler \
    --role "$ROLE_ARN" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME"
else
  created=0
  for _ in 1 2 3 4 5 6; do
    if create_function; then
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

mkdir -p dist
ENV_FILE="${ROOT}/dist/lambda-env.json"
rm -f "$ENV_FILE"
if node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const bucket = process.argv[1];
const destination = process.argv[2];
const env = {};
try {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[match[1]] = value;
  }
} catch {}
if (!env.OPENAI_API_KEY || !env.MAGNIFIC_API_KEY) process.exit(2);
const variables = {
  PROOF_BUCKET: bucket,
  OPENAI_API_KEY: env.OPENAI_API_KEY,
  MAGNIFIC_API_KEY: env.MAGNIFIC_API_KEY,
};
if (env.OPENAI_MODEL) variables.OPENAI_MODEL = env.OPENAI_MODEL;
writeFileSync(destination, JSON.stringify({ Variables: variables }));
' "$BUCKET" "$ENV_FILE"; then
  aws lambda update-function-configuration --function-name "$FUNCTION_NAME" --environment "file://${ENV_FILE}" >/dev/null
  rm -f "$ENV_FILE"
  echo "Lambda environment set from .env (values not printed)."
else
  rm -f "$ENV_FILE"
  echo "Set OPENAI_API_KEY, MAGNIFIC_API_KEY, and PROOF_BUCKET=${BUCKET} on the function in the Lambda console."
fi

cat <<EOF

Bucket: ${BUCKET}
Function: ${FUNCTION_NAME}
Region: ${AWS_REGION}

Add these to .env for the Next.js server, using the momentec-cdl-app access key:
  AWS_REGION=${AWS_REGION}
  AWS_ACCESS_KEY_ID=
  AWS_SECRET_ACCESS_KEY=
  PROOF_BUCKET=${BUCKET}
  PROOF_FUNCTION_NAME=${FUNCTION_NAME}

Attach this policy to momentec-cdl-app (IAM, user, Add permissions, Create inline policy, JSON):
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": [
        "arn:aws:s3:::${BUCKET}/*/sheet.png",
        "arn:aws:s3:::${BUCKET}/*/job.json"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["lambda:InvokeFunction"],
      "Resource": ["arn:aws:lambda:${AWS_REGION}:${ACCOUNT}:function:${FUNCTION_NAME}"]
    }
  ]
}

The PDF for a job lands at <jobId>/proof.pdf in that bucket. Status is <jobId>/status.json.
EOF
