import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fitSentence, placeLine, readDecorationMeasures, readGarmentFit, readMarkFit, readMarkPlace } from "./mark-measure.ts";

const place = { fromTop: 0.18, fromCenter: -0.12, width: 0.22, height: 0.08 };
const fit = { widthIn: 3, heightIn: 1.5, upIn: 0, downIn: 0.25, leftIn: 1, rightIn: 0 };

describe("mark measure", () => {
  it("keeps an in-range place and fit", () => {
    assert.deepEqual(readMarkPlace(place), place);
    assert.deepEqual(readMarkFit(fit), fit);
    assert.deepEqual(readDecorationMeasures({ place, fit }), { place, fit });
  });

  it("drops an out-of-range object and keeps the other", () => {
    assert.equal(readMarkPlace({ ...place, fromTop: 1.2 }), null);
    assert.equal(readMarkFit({ ...fit, widthIn: 30 }), null);
    assert.deepEqual(readDecorationMeasures({ place, fit: { ...fit, widthIn: 30 } }), { place });
    assert.deepEqual(readDecorationMeasures({ place: { ...place, width: -0.1 }, fit }), { fit });
  });

  it("accepts only the form gender and size", () => {
    assert.deepEqual(readGarmentFit("Men", "L"), { gender: "Men", size: "L" });
    assert.equal(readGarmentFit("Men", "MOCKUP"), null);
    assert.equal(readGarmentFit("boys", "L"), null);
    assert.equal(fitSentence({ gender: "Men", size: "L" }), "This garment is a Men's L.");
    assert.equal(fitSentence({ gender: "Women", size: "M" }), "This garment is a Women's M.");
    assert.equal(fitSentence({ gender: "Youth", size: "XS" }), "This garment is a Youth XS.");
    assert.equal(placeLine(place), "FROM TOP 18% · FROM CENTER 12% R · 22% × 8%");
    assert.equal(placeLine({ ...place, fromCenter: 0.01 }), "FROM TOP 18% · FROM CENTER CENTER · 22% × 8%");
  });
});
