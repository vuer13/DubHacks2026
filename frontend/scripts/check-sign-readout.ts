import assert from "node:assert/strict";
import type { SignReading } from "../lib/schema";
import { buildSignReadout, SignReadoutHistory } from "../lib/signReadout";

const sign: SignReading = {
  kind: "directional",
  lines: ["LAKE TRAIL 2.1 KM", "RIDGE TRAIL 4.5 KM"],
  arrows: [
    { label: "LAKE TRAIL 2.1 KM", direction: "left" },
    { label: "RIDGE TRAIL 4.5 KM", direction: "right" },
  ],
  say: "Sign has multiple trail directions",
};

const result = buildSignReadout(sign);
assert.ok(result);
assert.deepEqual(result.chunks, [
  "left, LAKE TRAIL 2.1 KM",
  "right, RIDGE TRAIL 4.5 KM",
]);

assert.equal(buildSignReadout(null), null);
assert.equal(buildSignReadout({
  kind: "info",
  lines: [],
  arrows: [],
  say: "Sign visible, text unreadable",
}), null);

const longText = Array.from(
  { length: 25 }, (_, index) => `word${index}`,
).join(" ");
const long = buildSignReadout({
  kind: "info",
  lines: [longText],
  arrows: [],
  say: "Long sign",
});
assert.ok(long);
assert.equal(long.chunks.length, 3);
assert.ok(long.chunks.every((chunk) => chunk.split(/\s+/).length <= 12));
assert.equal(long.chunks.join(" "), longText);


const history = new SignReadoutHistory();
assert.equal(history.canRead(result.fingerprint, 1000, 1000), true);
history.markFinished(result.fingerprint, 2000);

// Ignore results captured during the two-second pause.
assert.equal(history.canRead("different-sign", 3999, 3999), false);
assert.equal(history.canRead("different-sign", 3999, 4000), false);
assert.equal(history.canRead("different-sign", 4000, 4000), true);

// A completed sign stays suppressed for this monitoring session.
assert.equal(history.canRead(result.fingerprint, 100000, 100000), false);

const key = (text: string) => JSON.stringify({ lines: [text], arrows: [] });
history.markFinished(key("cedar lake trail"), 5000);
assert.equal(history.canRead(key("ceder lake trail"), 9000, 9000), false);

history.reset();
assert.equal(history.canRead(result.fingerprint, 9000, 9000), true);

console.log("Sign readout checks passed.");
