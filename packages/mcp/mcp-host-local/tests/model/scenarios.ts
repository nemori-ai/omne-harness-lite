// The bounds the explorer runs under. The bounds, the states they reach and the time they take are
// recorded in `verification/README.md`; a change here changes that record. Each scenario names
// the T8 class representatives it lets the wire answer with; the lawful answer is always there.
import type { Scenario } from './explore.ts'

/**
 * The smallest scenario: Streamable HTTP with a handle, one `call` whose signal may fire, one
 * `close()`; the line answers or hangs, the handle authorizes or hangs, the line closes or hangs.
 */
export const MINIMAL: Scenario = {
  name: 'minimal',
  material: 'http',
  discovers: 0,
  calls: 1,
  lists: 0,
  close: true,
  signals: true,
  answers: {},
  breaches: 0,
  wireFaults: 0,
}

/**
 * Streamable HTTP with a handle: one `call` with its signal, `close()`; the wire may refuse the
 * request (401, scoped 403, plain 403), fail before or after it left, or hold the answer stream
 * open and break it; the handle may fail, reject or hang; the metadata fetch may answer, miss or
 * reject. One wire fault and one breach per schedule.
 */
export const HTTP_CALL: Scenario = {
  name: 'http-call',
  material: 'http',
  discovers: 0,
  calls: 1,
  lists: 0,
  close: true,
  signals: true,
  answers: {
    'line.send': ['401', '403+scope', '403', '4xx', '5xx', 'unsent', 'aborted', 'stream', 'empty'],
    'stream.next': ['end', 'break'],
    'credential.authorize': ['fail', 'reject'],
    'credential.reportRejection': ['reject'],
    fetchMetadata: ['none', 'reject'],
  },
  breaches: 1,
  wireFaults: 1,
}

/**
 * Streamable HTTP with a handle: one `listActions` and one `updateTask`, `close()`; the answer
 * stream may break or end empty twice over, so a read goes out again and a write does not.
 */
export const HTTP_RESEND: Scenario = {
  name: 'http-resend',
  material: 'http',
  discovers: 0,
  calls: 0,
  lists: 1,
  updates: 1,
  close: true,
  answers: {
    'line.send': ['aborted', 'stream', 'empty', '5xx'],
    'stream.next': ['end', 'break'],
  },
  breaches: 0,
  wireFaults: 2,
}

/**
 * Streamable HTTP without a handle: one `call`, one `listActions`, `close()`; the wire may refuse
 * with 401 or 403: there is no handle to hear of it.
 */
export const HTTP_BARE: Scenario = {
  name: 'http-bare',
  material: 'http-bare',
  discovers: 0,
  calls: 1,
  lists: 1,
  close: true,
  signals: true,
  answers: {
    'line.send': ['401', '403+scope', '403', 'stream'],
    'stream.next': ['end', 'break'],
    fetchMetadata: ['none'],
  },
  breaches: 0,
  wireFaults: 1,
}

/**
 * stdio: one `discover`, `close()`; the probe timer may fire; the peer may `ping`; the shared
 * stream may end, with or without the exit, or break; a write may fail or reject.
 */
export const STDIO_DISCOVER: Scenario = {
  name: 'stdio-discover',
  material: 'stdio',
  discovers: 1,
  calls: 0,
  lists: 0,
  close: true,
  pings: 1,
  lineEnds: ['ended', 'exited', 'broken'],
  answers: {
    'line.send': ['sent', 'unsent', 'reject'],
  },
  breaches: 1,
  wireFaults: 1,
}

/**
 * stdio: one `call` with its signal and one `cancelRequest`, `close()`; the shared stream may
 * end, with or without the exit, or break; a write may fail or reject.
 */
export const STDIO_CALL: Scenario = {
  name: 'stdio-call',
  material: 'stdio',
  discovers: 0,
  calls: 1,
  lists: 0,
  cancels: 1,
  close: true,
  signals: true,
  lineEnds: ['ended', 'exited', 'broken'],
  answers: {
    'line.send': ['sent', 'unsent', 'reject'],
  },
  breaches: 1,
  wireFaults: 1,
}

/**
 * The legacy HTTP+SSE fallback: `discover` on a peer that answers the probe and `initialize`
 * with 4xx+plain, so the session tries the GET; the GET may enter the SSE mode, be refused with
 * 401, or fail; in the SSE mode the stream may break; `close()` at any point.
 */
export const SSE_FALLBACK: Scenario = {
  name: 'sse-fallback',
  material: 'http',
  withGet: true,
  discovers: 1,
  calls: 0,
  lists: 1,
  close: true,
  lineEnds: ['broken'],
  answers: {
    'line.send': ['4xx', 'sent'],
    'line.openGet': ['entered', '401', 'unsent'],
    fetchMetadata: ['none'],
  },
  breaches: 0,
  wireFaults: 3,
}
