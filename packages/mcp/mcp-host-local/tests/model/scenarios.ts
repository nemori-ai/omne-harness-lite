import type { Scenario } from './explore.ts'

export const MINIMAL: Scenario = {
  name: 'minimal',
  material: 'http',
  discovers: 0,
  calls: 1,
  lists: 0,
  close: true,
  signals: true,
  answers: { 'credential.authorize': ['hang'] },
  breaches: 1,
  wireFaults: 0,
}

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
    'credential.authorize': ['fail', 'reject', 'hang'],
    'credential.reportRejection': ['reject', 'hang'],
    fetchMetadata: ['none', 'reject', 'hang'],
  },
  breaches: 1,
  wireFaults: 1,
}

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

export const HTTP_PEER: Scenario = {
  name: 'http-peer',
  material: 'http',
  discovers: 0,
  calls: 1,
  lists: 0,
  close: true,
  answers: {
    'line.send': ['stream'],
    'stream.next': ['ping', 'end', 'break'],
  },
  breaches: 0,
  wireFaults: 1,
}

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
