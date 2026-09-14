import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import process from "node:process";

import { createParser } from "eventsource-parser";
import { EventSourceParserStream } from "eventsource-parser/stream";

const encoder = new TextEncoder();
const probeRoot = new URL("./", import.meta.url);
const componentPackage = JSON.parse(
  await readFile(new URL("node_modules/eventsource-parser/package.json", probeRoot), "utf8"),
);

const args = parseArgs(process.argv.slice(2));
const scenarioSpecBytes = await readFile(new URL("scenario-spec.json", probeRoot));

const scenarios = [];
let assertionCount = 0;

function parseArgs(values) {
  const parsed = { output: undefined, mutate: undefined };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--output") {
      parsed.output = values[++index];
    } else if (value === "--mutate") {
      parsed.mutate = values[++index];
    } else {
      throw new Error(`Unknown or incomplete argument: ${value}`);
    }
  }
  return parsed;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeError(error) {
  if (!error) return undefined;
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    cause: error.cause
      ? {
          name: error.cause.name,
          message: error.cause.message,
          code: error.cause.code,
        }
      : undefined,
  };
}

function bytesBySizes(bytes, sizes) {
  const chunks = [];
  let offset = 0;
  let sizeIndex = 0;
  while (offset < bytes.length) {
    const size = sizes[sizeIndex % sizes.length];
    chunks.push(bytes.slice(offset, Math.min(offset + size, bytes.length)));
    offset += size;
    sizeIndex += 1;
  }
  return chunks;
}

function inputEvidence(input, chunks) {
  const bytes = encoder.encode(input);
  return {
    utf8: input,
    byteLength: bytes.length,
    sha256: sha256(bytes),
    hex: Buffer.from(bytes).toString("hex"),
    chunkHex: chunks.map((chunk) => Buffer.from(chunk).toString("hex")),
  };
}

async function parseReadableChunks(chunks) {
  const comments = [];
  const parseErrors = [];
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  })
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new EventSourceParserStream({
        onComment(comment) {
          comments.push(comment);
        },
        onError(error) {
          parseErrors.push(normalizeError(error));
        },
      }),
    );

  const events = [];
  for await (const event of stream) events.push(event);
  return { events, comments, parseErrors };
}

function mutateActual(scenarioId, actual) {
  const copy = structuredClone(actual);
  if (args.mutate !== scenarioId) return copy;
  if (copy.events?.[0]) {
    copy.events[0].data = `${copy.events[0].data}__INJECTED_CORRUPTION__`;
  } else {
    copy.events = [{ data: "__INJECTED_SPURIOUS_EVENT__" }];
  }
  return copy;
}

function eventData(actual) {
  return actual.events.map((event) => event.data);
}

function addScenario({ id, description, input, chunks, actual, verify, extra = {} }) {
  const validationActual = mutateActual(id, actual);
  let passed = false;
  let failure;
  try {
    verify(validationActual);
    assertionCount += 1;
    passed = true;
  } catch (error) {
    failure = normalizeError(error);
  }

  scenarios.push({
    id,
    description,
    passed,
    injectedMutation: args.mutate === id,
    input: input === undefined ? undefined : inputEvidence(input, chunks),
    actual,
    validationFailure: failure,
    ...extra,
  });
}

const unicodePayload = JSON.stringify({ text: "汉字🙂café" });
const unicodeInput = `data: ${unicodePayload}\n\n`;
const unicodeBytes = encoder.encode(unicodeInput);

{
  const chunks = bytesBySizes(unicodeBytes, [1]);
  const actual = await parseReadableChunks(chunks);
  addScenario({
    id: "S01-single-byte-utf8",
    description: "Every transport chunk contains exactly one byte, including split UTF-8 code points.",
    input: unicodeInput,
    chunks,
    actual,
    verify(value) {
      assert.deepEqual(eventData(value), [unicodePayload]);
      assert.deepEqual(value.parseErrors, []);
    },
  });
}

{
  const arbitraryChunks = bytesBySizes(unicodeBytes, [2, 5, 1, 4, 3, 7]);
  const actual = await parseReadableChunks(arbitraryChunks);
  const splitFailures = [];
  for (let offset = 1; offset < unicodeBytes.length; offset += 1) {
    const parsed = await parseReadableChunks([
      unicodeBytes.slice(0, offset),
      unicodeBytes.slice(offset),
    ]);
    try {
      assert.deepEqual(eventData(parsed), [unicodePayload]);
      assert.deepEqual(parsed.parseErrors, []);
    } catch (error) {
      splitFailures.push({ offset, error: normalizeError(error), parsed });
    }
  }
  actual.everyTwoChunkBoundary = {
    offsetsTested: Array.from({ length: unicodeBytes.length - 1 }, (_, index) => index + 1),
    failures: splitFailures,
  };
  addScenario({
    id: "S02-arbitrary-byte-utf8",
    description:
      "A nonuniform byte split plus every possible two-chunk byte boundary preserve decoded event data.",
    input: unicodeInput,
    chunks: arbitraryChunks,
    actual,
    verify(value) {
      assert.deepEqual(eventData(value), [unicodePayload]);
      assert.deepEqual(value.parseErrors, []);
      assert.deepEqual(value.everyTwoChunkBoundary.failures, []);
      assert.equal(value.everyTwoChunkBoundary.offsetsTested.length, unicodeBytes.length - 1);
    },
  });
}

{
  const input = ": OPENROUTER PROCESSING\r\ndata: first\r\ndata: second\n\n";
  const bytes = encoder.encode(input);
  const chunks = bytesBySizes(bytes, [9, 1, 2, 11, 3]);
  const actual = await parseReadableChunks(chunks);
  addScenario({
    id: "S03-line-fields-comments",
    description: "Mixed CRLF/LF, a comment, and two data fields.",
    input,
    chunks,
    actual,
    verify(value) {
      assert.deepEqual(eventData(value), ["first\nsecond"]);
      assert.deepEqual(value.comments, ["OPENROUTER PROCESSING"]);
      assert.deepEqual(value.parseErrors, []);
    },
    extra: {
      componentDocumentationObservation:
        "v4.1.0 removes one optional space after ':' before onComment, while its packaged README says leading whitespace is retained. WHATWG ignores comments and OpenRouter's heartbeat remains recognized, so this does not affect the selected framing use.",
    },
  });
}

{
  const input = "data: one\n\ndata: two\n\n";
  const bytes = encoder.encode(input);
  const chunks = [bytes];
  const actual = await parseReadableChunks(chunks);
  addScenario({
    id: "S04-multiple-events-one-chunk",
    description: "Two complete SSE data frames share one transport chunk.",
    input,
    chunks,
    actual,
    verify(value) {
      assert.deepEqual(eventData(value), ["one", "two"]);
    },
  });
}

{
  const input = "data: [DONE]\n\n";
  const bytes = encoder.encode(input);
  const chunks = [bytes];
  const actual = await parseReadableChunks(chunks);
  addScenario({
    id: "S05-done-marker",
    description: "The OpenRouter sentinel remains an uninterpreted SSE data payload.",
    input,
    chunks,
    actual,
    verify(value) {
      assert.deepEqual(eventData(value), ["[DONE]"]);
    },
  });
}

{
  const finish = {
    id: "gen-probe",
    choices: [{ index: 0, delta: { content: "" }, finish_reason: "stop" }],
  };
  const usage = {
    id: "gen-probe",
    choices: [{ index: 0, delta: { content: "" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5, cost: 0.0001 },
  };
  const repeatedFinish = structuredClone(finish);
  const payloads = [finish, usage, repeatedFinish].map(JSON.stringify);
  const input = payloads.map((payload) => `data: ${payload}\n\n`).join("");
  const bytes = encoder.encode(input);
  const chunks = bytesBySizes(bytes, [13, 2, 31, 1, 8]);
  const actual = await parseReadableChunks(chunks);
  actual.decodedPayloads = actual.events.map((event) => JSON.parse(event.data));
  addScenario({
    id: "S06-finish-usage-tail-repeat",
    description:
      "A finish frame, usage tail that repeats finish_reason, and duplicate finish are all surfaced in source order.",
    input,
    chunks,
    actual,
    verify(value) {
      assert.deepEqual(
        eventData(value),
        payloads,
      );
      assert.equal(value.decodedPayloads[0].choices[0].finish_reason, "stop");
      assert.equal(value.decodedPayloads[1].usage.total_tokens, 5);
      assert.equal(value.decodedPayloads[2].choices[0].finish_reason, "stop");
    },
  });
}

{
  const invalidJson = '{"choices": [}';
  const input = `data: ${invalidJson}\n\n`;
  const bytes = encoder.encode(input);
  const chunks = bytesBySizes(bytes, [4, 1, 7]);
  const actual = await parseReadableChunks(chunks);
  try {
    JSON.parse(actual.events[0]?.data);
    actual.jsonParse = { rejected: false };
  } catch (error) {
    actual.jsonParse = { rejected: true, error: normalizeError(error) };
  }
  addScenario({
    id: "S07-invalid-json",
    description: "Legal SSE framing does not make an invalid JSON payload valid.",
    input,
    chunks,
    actual,
    verify(value) {
      assert.deepEqual(eventData(value), [invalidJson]);
      assert.equal(value.jsonParse.rejected, true);
      assert.deepEqual(value.parseErrors, []);
    },
  });
}

{
  const errorPayload = JSON.stringify({
    id: "cmpl-probe",
    error: { code: "server_error", message: "Provider disconnected unexpectedly" },
    choices: [{ index: 0, delta: { content: "" }, finish_reason: "error" }],
  });
  const input = `data: ${errorPayload}\n\n`;
  const bytes = encoder.encode(input);
  const chunks = bytesBySizes(bytes, [3, 19, 2]);
  const actual = await parseReadableChunks(chunks);
  actual.decodedPayload = JSON.parse(actual.events[0].data);
  addScenario({
    id: "S08-error-frame",
    description: "An OpenRouter-style mid-stream error is delivered as ordinary SSE data.",
    input,
    chunks,
    actual,
    verify(value) {
      assert.deepEqual(eventData(value), [errorPayload]);
      assert.equal(value.decodedPayload.error.code, "server_error");
      assert.equal(value.decodedPayload.choices[0].finish_reason, "error");
    },
  });
}

{
  const input = 'data: {"partial":true}\n';
  const bytes = encoder.encode(input);
  const chunks = bytesBySizes(bytes, [5, 2, 1]);
  const actual = await parseReadableChunks(chunks);
  addScenario({
    id: "S09-incomplete-event-eof",
    description: "EOF before the empty event terminator discards pending event data.",
    input,
    chunks,
    actual,
    verify(value) {
      assert.deepEqual(eventData(value), []);
      assert.deepEqual(value.parseErrors, []);
    },
  });
}

{
  const payload = JSON.stringify({ choices: [{ delta: { content: "partial text" } }] });
  const input = `data: ${payload}\n\n`;
  const bytes = encoder.encode(input);
  const chunks = bytesBySizes(bytes, [6, 3, 1, 8]);
  const actual = await parseReadableChunks(chunks);
  actual.protocolFinishEvidence = [];
  addScenario({
    id: "S10-no-finish-eof",
    description: "A framed content chunk followed by clean EOF carries no protocol finish evidence.",
    input,
    chunks,
    actual,
    verify(value) {
      assert.deepEqual(eventData(value), [payload]);
      assert.deepEqual(value.protocolFinishEvidence, []);
    },
  });
}

async function startFaultServer() {
  const evidence = { bindHost: "127.0.0.1", requestLimit: 2, requests: [] };
  const sockets = new Set();
  let requestCount = 0;

  const server = createServer((request, response) => {
    requestCount += 1;
    const record = {
      requestNumber: requestCount,
      method: request.method,
      url: request.url,
      events: [],
      writes: [],
    };
    evidence.requests.push(record);

    const socket = response.socket;
    sockets.add(socket);
    request.on("aborted", () => record.events.push({ type: "request-aborted" }));
    request.on("close", () => record.events.push({ type: "request-close" }));
    response.on("close", () => record.events.push({ type: "response-close" }));
    socket.on("close", (hadError) => {
      record.events.push({ type: "socket-close", hadError });
      sockets.delete(socket);
    });
    socket.on("error", (error) =>
      record.events.push({ type: "socket-error", error: normalizeError(error) }),
    );

    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
    });

    if (request.url === "/disconnect") {
      const first = encoder.encode('data: {"complete":1}\n\n');
      const second = encoder.encode('data: {"partial":');
      response.write(first);
      record.writes.push({ kind: "complete-event", hex: Buffer.from(first).toString("hex") });
      setTimeout(() => {
        response.write(second);
        record.writes.push({ kind: "partial-event", hex: Buffer.from(second).toString("hex") });
        record.events.push({ type: "server-socket-destroy-called" });
        socket.destroy();
      }, 20);
      return;
    }

    if (request.url === "/abort") {
      const first = encoder.encode('data: {"complete":2}\n\n');
      response.write(first);
      record.writes.push({ kind: "complete-event", hex: Buffer.from(first).toString("hex") });
      record.events.push({ type: "server-holding-response-open" });
      return;
    }

    response.statusCode = 404;
    response.end();
  });

  server.maxConnections = 1;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  evidence.port = address.port;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    evidence,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      evidence.observedRequestCount = requestCount;
    },
  };
}

async function parseHttpResponse(response, { abortAfterFirstEvent } = {}) {
  const events = [];
  const comments = [];
  const parseErrors = [];
  const transportChunks = [];
  let controller;
  let abortObservedAtEventCount;

  if (abortAfterFirstEvent) controller = abortAfterFirstEvent;
  const parser = createParser({
    onEvent(event) {
      events.push(event);
      if (controller && events.length === 1) {
        controller.abort(new Error("probe-requested-abort"));
        abortObservedAtEventCount = events.length;
      }
    },
    onComment(comment) {
      comments.push(comment);
    },
    onError(error) {
      parseErrors.push(normalizeError(error));
    },
  });
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let transportError;
  let eofObserved = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        eofObserved = true;
        const tail = decoder.decode();
        if (tail) parser.feed(tail);
        break;
      }
      transportChunks.push(Buffer.from(value).toString("hex"));
      parser.feed(decoder.decode(value, { stream: true }));
    }
  } catch (error) {
    transportError = normalizeError(error);
  }

  return {
    response: {
      status: response.status,
      contentType: response.headers.get("content-type"),
    },
    events,
    comments,
    parseErrors,
    transportChunks,
    eofObserved,
    transportError,
    abortObservedAtEventCount,
    abortSignal: controller
      ? {
          aborted: controller.signal.aborted,
          reason: normalizeError(controller.signal.reason),
        }
      : undefined,
  };
}

async function waitFor(predicate, timeoutMs = 2_000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for fault evidence");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const faultServer = await startFaultServer();
try {
  {
    const response = await fetch(`${faultServer.baseUrl}/disconnect`);
    const actual = await parseHttpResponse(response);
    await waitFor(() =>
      faultServer.evidence.requests[0]?.events.some(
        (event) => event.type === "socket-close",
      ),
    );
    actual.server = structuredClone(faultServer.evidence.requests[0]);
    addScenario({
      id: "S11-http-disconnect",
      description:
        "A real loopback HTTP/1.1 chunked response is destroyed after one complete and one partial event.",
      actual,
      verify(value) {
        assert.deepEqual(eventData(value), ['{"complete":1}']);
        assert.equal(value.eofObserved, false);
        assert.ok(value.transportError, "client body iteration must reject");
        assert.ok(
          value.server.events.some((event) => event.type === "server-socket-destroy-called"),
          "server must record the destructive fault action",
        );
        assert.ok(
          value.server.events.some((event) => event.type === "socket-close"),
          "server must observe the socket closing",
        );
      },
    });
  }

  {
    const controller = new AbortController();
    const response = await fetch(`${faultServer.baseUrl}/abort`, { signal: controller.signal });
    const actual = await parseHttpResponse(response, { abortAfterFirstEvent: controller });
    await waitFor(() =>
      faultServer.evidence.requests[1]?.events.some(
        (event) => event.type === "request-aborted" || event.type === "socket-close",
      ),
    );
    actual.server = structuredClone(faultServer.evidence.requests[1]);
    addScenario({
      id: "S12-abort-signal",
      description:
        "AbortController aborts an open loopback fetch only after the first complete event is parsed.",
      actual,
      verify(value) {
        assert.deepEqual(eventData(value), ['{"complete":2}']);
        assert.equal(value.abortObservedAtEventCount, 1);
        assert.equal(value.abortSignal.aborted, true);
        assert.equal(value.eofObserved, false);
        assert.ok(value.transportError, "body iteration must reject after abort");
        assert.ok(
          value.server.events.some(
            (event) => event.type === "request-aborted" || event.type === "socket-close",
          ),
          "server must observe client-side connection cancellation",
        );
      },
    });
  }
} finally {
  await faultServer.close();
}

assert.equal(
  faultServer.evidence.observedRequestCount,
  faultServer.evidence.requestLimit,
  "probe must make exactly two loopback requests",
);

const tarballBytes = await readFile(new URL("eventsource-parser-4.1.0.tgz", probeRoot));
const lockBytes = await readFile(new URL("package-lock.json", probeRoot));
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    repositoryCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: new URL("../../", probeRoot),
      encoding: "utf8",
    }).trim(),
    branch: execFileSync("git", ["branch", "--show-current"], {
      cwd: new URL("../../", probeRoot),
      encoding: "utf8",
    }).trim(),
    scenarioSpecSha256: sha256(scenarioSpecBytes),
  },
  environment: {
    node: process.version,
    npmUserAgent: process.env.npm_config_user_agent,
    platform: process.platform,
    arch: process.arch,
  },
  component: {
    name: componentPackage.name,
    version: componentPackage.version,
    license: componentPackage.license,
    engines: componentPackage.engines,
    runtimeDependencies: componentPackage.dependencies ?? {},
    npmTarballSha256: sha256(tarballBytes),
    packageLockSha256: sha256(lockBytes),
  },
  faultTransport: faultServer.evidence,
  mutationControl: args.mutate
    ? {
        targetScenario: args.mutate,
        expectedOverallResult: false,
      }
    : undefined,
  assertionCount,
  scenarios,
  overallPassed: scenarios.every((scenario) => scenario.passed),
  evidenceBoundary: {
    supports:
      "eventsource-parser 4.1.0 plus Node TextDecoderStream/createParser framing behavior for the enumerated local inputs and two loopback faults",
    doesNotSupport: [
      "A23 completion or product adapter conformance",
      "A24 deferred-receipt wire encoding or route compatibility",
      "JSON schema/semantic validity",
      "finish, [DONE], usage, or error interpretation",
      "MC-04 terminal-state classification",
      "MC-06 retry, cancellation effect, or accounting decisions",
      "real OpenRouter behavior, provider cancellation, billing, or authenticated requests",
    ],
  },
};

const output = `${JSON.stringify(report, null, 2)}\n`;
if (args.output) await writeFile(args.output, output, "utf8");
process.stdout.write(output);
process.exitCode = report.overallPassed ? 0 : 1;
