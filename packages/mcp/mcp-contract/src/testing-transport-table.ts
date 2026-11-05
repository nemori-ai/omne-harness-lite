// The transport decision table of SPEC T8 as data. The table is a total function on a closed
// input domain: material kind × request class × answer class. Each cell of the domain matches
// exactly one row; each row has one conclusion. The transport suite generates one case per row
// from this data, and a structural test checks the partition and the coverage.
import type { NoAnswerCause } from './outcomes.ts'
import type { TransportMaterial } from './transport.ts'
import {
  ERROR_CLASSES,
  HTTP_STATUS_CLASSES,
  REQUEST_CLASSES,
  RESULT_CLASSES,
  type AnswerClass,
  type BodyClass,
  type ErrorClass,
  type HttpStatusClass,
  type RequestClass,
} from './wire.ts'

export type { AnswerClass, RequestClass } from './wire.ts'

export type TableKind = TransportMaterial['kind']

export type ExpectedFailure =
  | Readonly<{ kind: 'error-answer' }>
  | Readonly<{
      kind: 'answer-malformed'
      what:
        | 'status-unknown'
        | 'input-requests-missing'
        | 'result-missing'
        | 'error-missing'
        | 'error-shape'
        | 'tools-missing'
        | 'cursor-invalid'
        | 'discover-shape'
    }>
  | Readonly<{ kind: 'not-sent'; cause: 'connection-unavailable' | 'session-ended' }>
  | Readonly<{ kind: 'not-sent'; cause: 'authorization-required' }>
  | Readonly<{ kind: 'no-answer'; cause: NoAnswerCause }>

/**
 * The conclusion of a row. `read`: the request reads the answer to its shape (T2, T6). `failure`:
 * the operation answers this failure; `error-answer` carries the code, message and data as
 * written. `answer`: `call` is sent and `answer` settles so. `expired`: `getTask` answers
 * `expired`. `fallback`: `discover` goes the legacy path; when that fails too it reports the
 * legacy failure (`legacy`) or this one. `retry`: `discover` is sent once more with the highest
 * version in common. `resend`: the request is sent once more with a new id, and a second such
 * answer is `no-answer` (`stream-broken`). `ignored`: no outcome; the operation that sent the
 * notification goes on. `unusable`: the transport answers later requests `not-sent`
 * (`connection-unavailable`). `rejection`: the credential handle that authorized the request
 * hears `reportRejection()` once.
 */
export type TableConclusion = (
  | Readonly<{ kind: 'read' }>
  | Readonly<{ kind: 'failure'; failure: ExpectedFailure }>
  | Readonly<{ kind: 'answer'; answer: 'result' | 'error' | NoAnswerCause }>
  | Readonly<{ kind: 'expired' }>
  | Readonly<{ kind: 'fallback'; report: 'legacy' | ExpectedFailure }>
  | Readonly<{ kind: 'retry' }>
  | Readonly<{ kind: 'resend' }>
  | Readonly<{ kind: 'ignored' }>
) &
  Readonly<{ unusable?: true; rejection?: true }>

export type TableRow = Readonly<{
  id: string
  kinds: readonly TableKind[]
  requests: readonly RequestClass[]
  answers: readonly AnswerClass[]
  conclusion: TableConclusion
}>

export type TableCell = Readonly<{ kind: TableKind; request: RequestClass; answer: AnswerClass }>

const BOTH: readonly TableKind[] = ['stdio', 'streamable-http']
const STDIO: readonly TableKind[] = ['stdio']
const HTTP: readonly TableKind[] = ['streamable-http']
const STATUS_4XX: readonly HttpStatusClass[] = ['400', '404', '405', '406', '415', '429', '4xx']
const STATUS_5XX: readonly HttpStatusClass[] = ['5xx']
const CODES: readonly ErrorClass[] = ERROR_CLASSES.filter(code => code !== 'unreadable')
const MINUS_32022: readonly ErrorClass[] = ['-32022+common', '-32022+modern', '-32022+legacy']

const errors = (codes: readonly ErrorClass[]): readonly AnswerClass[] =>
  codes.map(code => `error:${code}` as const)

const bodies = (
  statuses: readonly HttpStatusClass[],
  classes: readonly BodyClass[],
): readonly AnswerClass[] =>
  statuses.flatMap(status => classes.map(body => `http:${status}+${body}` as const))

/** A JSON-RPC error of these codes, direct or as the body of a 4xx or 5xx answer. */
const anywhere = (codes: readonly ErrorClass[]): readonly AnswerClass[] => [
  ...errors(codes),
  ...bodies([...STATUS_4XX, ...STATUS_5XX], codes),
]

/** A JSON-RPC error of these codes, direct or as the body of a 4xx answer. */
const below500 = (codes: readonly ErrorClass[]): readonly AnswerClass[] => [
  ...errors(codes),
  ...bodies(STATUS_4XX, codes),
]

const fail = (failure: ExpectedFailure): TableConclusion => ({ kind: 'failure', failure })
const malformed = (what: Extract<ExpectedFailure, { kind: 'answer-malformed' }>['what']) =>
  fail({ kind: 'answer-malformed', what })
const ERROR_ANSWER: TableConclusion = fail({ kind: 'error-answer' })
const NOT_SENT = fail({ kind: 'not-sent', cause: 'connection-unavailable' })
const AUTHORIZATION: TableConclusion = {
  kind: 'failure',
  failure: { kind: 'not-sent', cause: 'authorization-required' },
  rejection: true,
}
const SESSION_ENDED: TableConclusion = {
  kind: 'failure',
  failure: { kind: 'not-sent', cause: 'session-ended' },
  unusable: true,
}
const BROKEN = fail({ kind: 'no-answer', cause: 'stream-broken' })
const ABANDONED = fail({ kind: 'no-answer', cause: 'abandoned' })
const PROBES: readonly RequestClass[] = ['discover', 'discover-retry']
const READS: readonly RequestClass[] = ['tools/list', 'tasks/get']
const WRITES: readonly RequestClass[] = ['tasks/update', 'tasks/cancel']
const OPERATIONS: readonly RequestClass[] = [...READS, ...WRITES]
const AFTER_SESSION: readonly RequestClass[] = [...OPERATIONS, 'tools/call', 'notification']

/** SPEC T8, row by row. */
export const TRANSPORT_TABLE: readonly TableRow[] = [
  // server/discover (T3)
  { id: 'D01', kinds: BOTH, requests: PROBES, answers: ['result'], conclusion: { kind: 'read' } },
  {
    id: 'D02',
    kinds: BOTH,
    requests: PROBES,
    answers: ['result:no-common'],
    conclusion: { kind: 'fallback', report: 'legacy' },
  },
  {
    id: 'D03',
    kinds: BOTH,
    requests: PROBES,
    answers: ['result:unreadable'],
    conclusion: { kind: 'fallback', report: { kind: 'answer-malformed', what: 'discover-shape' } },
  },
  {
    id: 'D04',
    kinds: BOTH,
    requests: ['discover'],
    answers: below500(['-32022+common']),
    conclusion: { kind: 'retry' },
  },
  {
    id: 'D05',
    kinds: BOTH,
    requests: ['discover'],
    answers: below500(['-32022+modern']),
    conclusion: malformed('discover-shape'),
  },
  {
    id: 'D06',
    kinds: BOTH,
    requests: ['discover'],
    answers: below500(['-32022+legacy']),
    conclusion: { kind: 'fallback', report: 'legacy' },
  },
  {
    id: 'D07',
    kinds: BOTH,
    requests: ['discover-retry'],
    answers: below500(MINUS_32022),
    conclusion: ERROR_ANSWER,
  },
  {
    id: 'D08',
    kinds: BOTH,
    requests: PROBES,
    answers: below500(['-32020', '-32021']),
    conclusion: ERROR_ANSWER,
  },
  {
    id: 'D09',
    kinds: BOTH,
    requests: PROBES,
    answers: ['error:-32601'],
    conclusion: { kind: 'fallback', report: 'legacy' },
  },
  {
    id: 'D10',
    kinds: BOTH,
    requests: PROBES,
    answers: errors(['-32602', 'other']),
    conclusion: { kind: 'fallback', report: { kind: 'error-answer' } },
  },
  {
    id: 'D11',
    kinds: BOTH,
    requests: PROBES,
    answers: ['error:unreadable'],
    conclusion: { kind: 'fallback', report: { kind: 'answer-malformed', what: 'error-shape' } },
  },
  {
    id: 'D12',
    kinds: HTTP,
    requests: PROBES,
    answers: bodies(STATUS_4XX, ['-32601', '-32602', 'other', 'unreadable', 'plain']),
    conclusion: { kind: 'fallback', report: 'legacy' },
  },
  {
    id: 'D13',
    kinds: STDIO,
    requests: PROBES,
    answers: ['silent'],
    conclusion: { kind: 'fallback', report: 'legacy' },
  },
  {
    id: 'D14',
    kinds: HTTP,
    requests: PROBES,
    answers: ['silent'],
    conclusion: ABANDONED,
  },
  {
    id: 'D15',
    kinds: HTTP,
    requests: PROBES,
    answers: ['stream-broken', 'http:2xx'],
    conclusion: { kind: 'resend' },
  },
  {
    id: 'D16',
    kinds: HTTP,
    requests: PROBES,
    answers: bodies(STATUS_5XX, [...ERROR_CLASSES, 'plain']),
    conclusion: BROKEN,
  },
  // initialize, the legacy path (T3)
  {
    id: 'I01',
    kinds: BOTH,
    requests: ['initialize'],
    answers: ['result'],
    conclusion: { kind: 'read' },
  },
  {
    id: 'I02',
    kinds: BOTH,
    requests: ['initialize'],
    answers: ['result:unreadable'],
    conclusion: malformed('discover-shape'),
  },
  {
    id: 'I03',
    kinds: BOTH,
    requests: ['initialize'],
    answers: anywhere(CODES),
    conclusion: ERROR_ANSWER,
  },
  {
    id: 'I04',
    kinds: BOTH,
    requests: ['initialize'],
    answers: anywhere(['unreadable']),
    conclusion: malformed('error-shape'),
  },
  {
    id: 'I05',
    kinds: BOTH,
    requests: ['initialize'],
    answers: ['silent'],
    conclusion: ABANDONED,
  },
  {
    id: 'I06',
    kinds: HTTP,
    requests: ['initialize'],
    answers: ['stream-broken', 'http:2xx', ...bodies(STATUS_5XX, ['plain'])],
    conclusion: BROKEN,
  },
  {
    id: 'I07',
    kinds: HTTP,
    requests: ['initialize'],
    answers: bodies(STATUS_4XX, ['plain']),
    conclusion: NOT_SENT,
  },
  // tools/list and the task operations (T2, T6)
  {
    id: 'L01',
    kinds: BOTH,
    requests: ['tools/list'],
    answers: ['result'],
    conclusion: { kind: 'read' },
  },
  {
    id: 'L02',
    kinds: BOTH,
    requests: ['tools/list'],
    answers: ['result:tools-missing'],
    conclusion: malformed('tools-missing'),
  },
  {
    id: 'L03',
    kinds: BOTH,
    requests: ['tools/list'],
    answers: ['result:cursor-invalid'],
    conclusion: malformed('cursor-invalid'),
  },
  {
    id: 'G01',
    kinds: BOTH,
    requests: ['tasks/get'],
    answers: ['result'],
    conclusion: { kind: 'read' },
  },
  {
    id: 'G02',
    kinds: BOTH,
    requests: ['tasks/get'],
    answers: ['result:status-unknown'],
    conclusion: malformed('status-unknown'),
  },
  {
    id: 'G03',
    kinds: BOTH,
    requests: ['tasks/get'],
    answers: ['result:input-requests-missing'],
    conclusion: malformed('input-requests-missing'),
  },
  {
    id: 'G04',
    kinds: BOTH,
    requests: ['tasks/get'],
    answers: ['result:result-missing'],
    conclusion: malformed('result-missing'),
  },
  {
    id: 'G05',
    kinds: BOTH,
    requests: ['tasks/get'],
    answers: ['result:error-missing'],
    conclusion: malformed('error-missing'),
  },
  {
    id: 'G06',
    kinds: BOTH,
    requests: ['tasks/get'],
    answers: anywhere(['-32602']),
    conclusion: { kind: 'expired' },
  },
  { id: 'W01', kinds: BOTH, requests: WRITES, answers: ['result'], conclusion: { kind: 'read' } },
  {
    id: 'O01',
    kinds: BOTH,
    requests: ['tools/list', ...WRITES],
    answers: anywhere(CODES),
    conclusion: ERROR_ANSWER,
  },
  {
    id: 'O02',
    kinds: BOTH,
    requests: ['tasks/get'],
    answers: anywhere(CODES.filter(code => code !== '-32602')),
    conclusion: ERROR_ANSWER,
  },
  {
    id: 'O03',
    kinds: BOTH,
    requests: OPERATIONS,
    answers: anywhere(['unreadable']),
    conclusion: malformed('error-shape'),
  },
  { id: 'O04', kinds: BOTH, requests: OPERATIONS, answers: ['silent'], conclusion: ABANDONED },
  {
    id: 'O05',
    kinds: HTTP,
    requests: READS,
    answers: ['stream-broken', 'http:2xx'],
    conclusion: { kind: 'resend' },
  },
  {
    id: 'O06',
    kinds: HTTP,
    requests: WRITES,
    answers: ['stream-broken', 'http:2xx'],
    conclusion: BROKEN,
  },
  {
    id: 'O07',
    kinds: HTTP,
    requests: OPERATIONS,
    answers: bodies(STATUS_5XX, ['plain']),
    conclusion: BROKEN,
  },
  {
    id: 'O08',
    kinds: HTTP,
    requests: OPERATIONS,
    answers: bodies(STATUS_4XX, ['plain']),
    conclusion: NOT_SENT,
  },
  // tools/call (T1, T2)
  {
    id: 'C01',
    kinds: BOTH,
    requests: ['tools/call'],
    answers: ['result'],
    conclusion: { kind: 'answer', answer: 'result' },
  },
  {
    id: 'C02',
    kinds: BOTH,
    requests: ['tools/call'],
    answers: anywhere(ERROR_CLASSES),
    conclusion: { kind: 'answer', answer: 'error' },
  },
  {
    id: 'C03',
    kinds: BOTH,
    requests: ['tools/call'],
    answers: ['silent'],
    conclusion: { kind: 'answer', answer: 'abandoned' },
  },
  {
    id: 'C04',
    kinds: HTTP,
    requests: ['tools/call'],
    answers: ['stream-broken', 'http:2xx', ...bodies(STATUS_5XX, ['plain'])],
    conclusion: { kind: 'answer', answer: 'stream-broken' },
  },
  {
    id: 'C05',
    kinds: HTTP,
    requests: ['tools/call'],
    answers: bodies(STATUS_4XX, ['plain']),
    conclusion: NOT_SENT,
  },
  // what every request class shares
  {
    id: 'S01',
    kinds: STDIO,
    requests: [...PROBES, 'initialize', ...OPERATIONS],
    answers: ['stream-broken'],
    conclusion: { ...BROKEN, unusable: true },
  },
  {
    id: 'S02',
    kinds: STDIO,
    requests: [...PROBES, 'initialize', ...OPERATIONS],
    answers: ['process-exited'],
    conclusion: { ...fail({ kind: 'no-answer', cause: 'process-exited' }), unusable: true },
  },
  {
    id: 'S03',
    kinds: STDIO,
    requests: ['tools/call'],
    answers: ['stream-broken'],
    conclusion: { kind: 'answer', answer: 'stream-broken', unusable: true },
  },
  {
    id: 'S04',
    kinds: STDIO,
    requests: ['tools/call'],
    answers: ['process-exited'],
    conclusion: { kind: 'answer', answer: 'process-exited', unusable: true },
  },
  {
    id: 'S05',
    kinds: HTTP,
    requests: [...PROBES, 'initialize', ...OPERATIONS, 'tools/call'],
    answers: ['http:401', 'http:403+scope'],
    conclusion: AUTHORIZATION,
  },
  {
    id: 'S06',
    kinds: HTTP,
    requests: [...PROBES, 'initialize', ...OPERATIONS, 'tools/call'],
    answers: ['http:403'],
    conclusion: NOT_SENT,
  },
  {
    id: 'S07',
    kinds: HTTP,
    requests: [...OPERATIONS, 'tools/call'],
    answers: ['http:404+session'],
    conclusion: SESSION_ENDED,
  },
  {
    id: 'X01',
    kinds: HTTP,
    requests: [...PROBES, 'initialize', ...OPERATIONS, 'tools/call'],
    answers: ['unsent'],
    conclusion: NOT_SENT,
  },
  {
    id: 'X02',
    kinds: STDIO,
    requests: [...PROBES, 'initialize', ...OPERATIONS, 'tools/call'],
    answers: ['unsent'],
    conclusion: { ...NOT_SENT, unusable: true },
  },
  // notifications of the client
  {
    id: 'N01',
    kinds: BOTH,
    requests: ['notification'],
    answers: [
      'unsent',
      'silent',
      'stream-broken',
      'process-exited',
      'http:2xx',
      'http:401',
      'http:403+scope',
      'http:403',
      'http:404+session',
      ...bodies(HTTP_STATUS_CLASSES, [...ERROR_CLASSES, 'plain']),
    ],
    conclusion: { kind: 'ignored' },
  },
]

/** The answers that a request class can get on a material kind. */
export function answersOf(kind: TableKind, request: RequestClass): readonly AnswerClass[] {
  const http = kind === 'streamable-http'
  const transport: readonly AnswerClass[] = http
    ? ['unsent', 'stream-broken', 'silent']
    : ['unsent', 'stream-broken', 'silent', 'process-exited']
  if (request === 'notification')
    return http
      ? [
          ...transport,
          'http:2xx',
          'http:401',
          'http:403+scope',
          'http:403',
          'http:404+session',
          ...bodies(HTTP_STATUS_CLASSES, [...ERROR_CLASSES, 'plain']),
        ]
      : transport
  const answers: AnswerClass[] = [
    ...RESULT_CLASSES[request],
    ...errors(ERROR_CLASSES),
    ...transport,
  ]
  if (!http) return answers
  answers.push('http:2xx', 'http:401', 'http:403+scope', 'http:403')
  if (AFTER_SESSION.includes(request)) answers.push('http:404+session')
  answers.push(...bodies(HTTP_STATUS_CLASSES, [...ERROR_CLASSES, 'plain']))
  return answers
}

/** Every cell of the domain. */
export function transportCells(): readonly TableCell[] {
  const kinds: readonly TableKind[] = ['stdio', 'streamable-http']
  return kinds.flatMap(kind =>
    REQUEST_CLASSES.flatMap(request =>
      answersOf(kind, request).map(answer => ({ kind, request, answer })),
    ),
  )
}

/** The rows that a cell matches. A sound table gives exactly one. */
export function rowsOf(cell: TableCell): readonly TableRow[] {
  return TRANSPORT_TABLE.filter(
    row =>
      row.kinds.includes(cell.kind) &&
      row.requests.includes(cell.request) &&
      row.answers.includes(cell.answer),
  )
}

/** The cells of a row, in domain order. */
export function cellsOf(row: TableRow): readonly TableCell[] {
  return transportCells().filter(
    cell =>
      row.kinds.includes(cell.kind) &&
      row.requests.includes(cell.request) &&
      row.answers.includes(cell.answer),
  )
}
