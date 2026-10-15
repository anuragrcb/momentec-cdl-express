import assert from "node:assert/strict";
import { parseStoredProofJob, proofObjectKeys, readProofCatalog, readProofCustomer } from "./proof-job";

const jobId = "11111111-1111-4111-8111-111111111111";
const keys = proofObjectKeys(jobId);
assert.equal(keys.sheet, `${jobId}/sheet.png`);
assert.equal(keys.pdf, `${jobId}/proof.pdf`);
assert.throws(() => proofObjectKeys("../secrets"), /Bad job id/);

const customer = readProofCustomer({
  category: " SOCCER ",
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "",
});
assert.deepEqual(customer, {
  category: "SOCCER",
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "",
});
assert.equal(readProofCustomer({ category: "SOCCER", name: "Ada", email: "not-an-email", message: "" }), null);

const stored = parseStoredProofJob(
  JSON.stringify({
    jobId,
    gender: "Women",
    size: "M",
    category: "SOCCER",
    name: "Ada Lovelace",
    email: "ada@example.com",
    message: "Bigger logo",
  }),
  jobId,
);
assert.equal(stored.size, "M");
assert.equal(stored.message, "Bigger logo");
assert.throws(() => parseStoredProofJob(JSON.stringify({ jobId, gender: "Nope", size: "M" }), jobId), /customer or the size/);

const catalog = readProofCatalog(
  JSON.stringify({
    style: "228137",
    name: "FreeStyle Sublimated Turbo Crew Neck Baseball Jersey",
    brand: "Holloway",
    logo_locations: [{ code: "m2", name: "Front Center Full", legacy: false }],
    text_locations: [{ code: "t7", name: "Back Center", legacy: false, params: ["6", "8"] }],
    color_zones: [{ code: "SUB_FIRST_BODY_COLOR", name: "Body Color" }],
  }),
);
assert.equal(catalog?.style, "228137");
assert.equal(catalog?.text_locations?.[0]?.params?.[0], "6");

console.log("proof-job check ok");
