import assert from "node:assert/strict";
import { filterPlanToAllowedCatalog, replaceSnappedColors, snapToBrandColorLocal } from "./colors";
import { customerLimitNote } from "./manufacture-limits";
import { readGarmentSuggestion } from "./mark-measure";
import { matchNeedsReview } from "./match-decision";
import { parseStoredProofJob, proofObjectKeys, readProofCatalog, readProofCustomer } from "./proof-job";

const jobId = "11111111-1111-4111-8111-111111111111";
const keys = proofObjectKeys(jobId);
assert.equal(keys.sheet, `${jobId}/sheet.png`);
assert.equal(keys.pdf, `${jobId}/proof.pdf`);
const stamped = "job-2026-10-16T15-30-45Z_11111111-1111-4111-8111-111111111111";
assert.equal(proofObjectKeys(stamped).sheet, `${stamped}/sheet.png`);
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

const snappedRed = snapToBrandColorLocal({ name: "#A8182E", hex: "#A8182E" }, "Holloway");
assert.equal(snappedRed.name, "SCARLET");
assert.equal(snappedRed.hex, "#A31F2D");

const hexMap = new Map([
  ["#A8182E", snappedRed],
  ["#4B1D70", snapToBrandColorLocal({ name: "#4B1D70", hex: "#4B1D70" }, "Holloway")],
]);
assert.equal(
  replaceSnappedColors("Body Color (SUB_FIRST_BODY_COLOR): deep purple (#4B1D70) with crimson red #A8182E trim", hexMap),
  "Body Color (SUB_FIRST_BODY_COLOR): PURPLE (#2A0A5F) with SCARLET (#A31F2D) trim",
);

const filteredPlan = filterPlanToAllowedCatalog(
  {
    colorZoneMapping: [
      "Body Color (SUB_FIRST_BODY_COLOR): WHITE (#FFFFFF)",
      "Fake Piping (SUB_FAKE_PIPING): BLACK (#000000)",
    ],
    logoMapping: [
      "Front Center Full (m2): Tiger crest on front",
      "Left Short Sleeve (m10): Sleeve patch on left view",
    ],
    textMapping: [
      "Back Center (t7): 24 in SCARLET (#A31F2D)",
      "Left Sleeve Text (t55): TIGERS on sleeve",
    ],
    viewPlan: { front: "front", back: "back" },
  },
  { color_zones: [{ code: "SUB_FIRST_BODY_COLOR", name: "Body Color" }] },
);
assert.deepEqual(filteredPlan.colorZoneMapping, ["Body Color (SUB_FIRST_BODY_COLOR): WHITE (#FFFFFF)"]);
assert.deepEqual(filteredPlan.logoMapping, [
  "Front Center Full (m2): Tiger crest on front",
  "Left Short Sleeve (m10): Sleeve patch on left view",
]);
assert.deepEqual(filteredPlan.textMapping, [
  "Back Center (t7): 24 in SCARLET (#A31F2D)",
  "Left Sleeve Text (t55): TIGERS on sleeve",
]);

assert.equal(matchNeedsReview("none", 0.9, ["228137"]), true);
assert.equal(matchNeedsReview("999999", 0.95, ["228137"]), true);
assert.equal(matchNeedsReview("228137", 0.59, ["228137"]), true);
assert.equal(matchNeedsReview("228137", 0.6, ["228137"]), false);
assert.deepEqual(readGarmentSuggestion("BASEBALL", "Women"), { category: "BASEBALL", gender: "Women" });
assert.equal(readGarmentSuggestion("CRICKET", "Men"), null);
assert.equal(customerLimitNote([], ["Upper left chest logo"]), "We made this with Upper left chest logo.");
assert.equal(
  customerLimitNote(
    [{ mark: "the small label at the front hem", reason: "Style 228350 has no place for a logo there (m2)" }],
    ["the Hays Sluggers logo on the front (m2)"],
  ),
  "We made this with the Hays Sluggers logo on the front.\nWe couldn't add the small label at the front hem. This style has no place for a logo there.",
);

console.log("proof-job check ok");
