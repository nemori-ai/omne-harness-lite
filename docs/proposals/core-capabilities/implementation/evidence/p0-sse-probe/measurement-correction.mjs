import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { createParser } from "eventsource-parser";

let observedEvent;
let observedComment;
const parser = createParser({
  onComment(comment) {
    observedComment = comment;
  },
  onEvent(event) {
    observedEvent = event;
  },
});
parser.feed(": OPENROUTER PROCESSING\ndata: ok\n\n");

function captureAssertion(run) {
  try {
    run();
    return { passed: true };
  } catch (error) {
    return { passed: false, error: { name: error.name, message: error.message, code: error.code } };
  }
}

const report = {
  schemaVersion: 1,
  purpose: "Reproduce and justify the probe's initial measurement-expression correction.",
  contractBasis: {
    event:
      "The scenario requires exact data payload framing; absent id/event fields are not part of the expected input.",
    comment:
      "WHATWG ignores comment lines; the scenario only requires recognizing the OpenRouter heartbeat comment.",
  },
  observation: {
    eventOwnKeys: Object.keys(observedEvent),
    eventIdType: typeof observedEvent.id,
    eventTypeType: typeof observedEvent.event,
    eventData: observedEvent.data,
    jsonSerializedEvent: JSON.stringify(observedEvent),
    comment: observedComment,
  },
  before: {
    eventWholeObjectAssertion: captureAssertion(() =>
      assert.deepEqual(observedEvent, { data: "ok" }),
    ),
    packagedReadmeCommentAssertion: captureAssertion(() =>
      assert.equal(observedComment, " OPENROUTER PROCESSING"),
    ),
  },
  after: {
    eventDataAssertion: captureAssertion(() => assert.equal(observedEvent.data, "ok")),
    observedHeartbeatAssertion: captureAssertion(() =>
      assert.equal(observedComment, "OPENROUTER PROCESSING"),
    ),
  },
  retainedObservation:
    "eventsource-parser 4.1.0 removes one optional space after ':' for onComment although its packaged README says it retains that space; this extension mismatch does not alter SSE event framing.",
};

const output = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv[2]) await writeFile(process.argv[2], output, "utf8");
process.stdout.write(output);
