import type { NoAnswerCause } from './outcomes.ts'
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
  | Readonly<{ kind: 'not-sent'; cause: 'credential-rejected' }>
  | Readonly<{ kind: 'no-answer'; cause: NoAnswerCause }>

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
  requests: readonly RequestClass[]
  answers: readonly AnswerClass[]
  conclusion: TableConclusion
}>

export type TableCell = Readonly<{ request: RequestClass; answer: AnswerClass }>

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

const anywhere = (codes: readonly ErrorClass[]): readonly AnswerClass[] => [
  ...errors(codes),
  ...bodies([...STATUS_4XX, ...STATUS_5XX], codes),
]

const below500 = (codes: readonly ErrorClass[]): readonly AnswerClass[] => [
  ...errors(codes),
  ...bodies(STATUS_4XX, codes),
]

const fail = (failure: ExpectedFailure): TableConclusion => ({ kind: 'failure', failure })
const malformed = (what: Extract<ExpectedFailure, { kind: 'answer-malformed' }>['what']) =>
  fail({ kind: 'answer-malformed', what })
const ERROR_ANSWER: TableConclusion = fail({ kind: 'error-answer' })
const NOT_SENT = fail({ kind: 'not-sent', cause: 'connection-unavailable' })
// Every cell runs with a static credential presented, so a 401 or a scoped 403 rejects it.
const CREDENTIAL_REJECTED: TableConclusion = {
  kind: 'failure',
  failure: { kind: 'not-sent', cause: 'credential-rejected' },
  unusable: true,
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

export const TRANSPORT_TABLE: readonly TableRow[] = [
  { id: 'D01', requests: PROBES, answers: ['result'], conclusion: { kind: 'read' } },
  {
    id: 'D02',
    requests: PROBES,
    answers: ['result:no-common'],
    conclusion: { kind: 'fallback', report: 'legacy' },
  },
  {
    id: 'D03',
    requests: PROBES,
    answers: ['result:unreadable'],
    conclusion: { kind: 'fallback', report: { kind: 'answer-malformed', what: 'discover-shape' } },
  },
  {
    id: 'D04',
    requests: ['discover'],
    answers: below500(['-32022+common']),
    conclusion: { kind: 'retry' },
  },
  {
    id: 'D05',
    requests: ['discover'],
    answers: below500(['-32022+modern']),
    conclusion: malformed('discover-shape'),
  },
  {
    id: 'D06',
    requests: ['discover'],
    answers: below500(['-32022+legacy']),
    conclusion: { kind: 'fallback', report: 'legacy' },
  },
  {
    id: 'D07',
    requests: ['discover-retry'],
    answers: below500(MINUS_32022),
    conclusion: ERROR_ANSWER,
  },
  {
    id: 'D08',
    requests: PROBES,
    answers: below500(['-32020', '-32021']),
    conclusion: ERROR_ANSWER,
  },
  {
    id: 'D09',
    requests: PROBES,
    answers: ['error:-32601'],
    conclusion: { kind: 'fallback', report: 'legacy' },
  },
  {
    id: 'D10',
    requests: PROBES,
    answers: errors(['-32602', 'other']),
    conclusion: { kind: 'fallback', report: { kind: 'error-answer' } },
  },
  {
    id: 'D11',
    requests: PROBES,
    answers: ['error:unreadable'],
    conclusion: { kind: 'fallback', report: { kind: 'answer-malformed', what: 'error-shape' } },
  },
  {
    id: 'D12',
    requests: PROBES,
    answers: bodies(STATUS_4XX, ['-32601', '-32602', 'other', 'unreadable', 'plain']),
    conclusion: { kind: 'fallback', report: 'legacy' },
  },
  {
    id: 'D14',
    requests: PROBES,
    answers: ['silent'],
    conclusion: ABANDONED,
  },
  {
    id: 'D15',
    requests: PROBES,
    answers: ['stream-broken', 'http:2xx'],
    conclusion: { kind: 'resend' },
  },
  {
    id: 'D16',
    requests: PROBES,
    answers: bodies(STATUS_5XX, [...ERROR_CLASSES, 'plain']),
    conclusion: BROKEN,
  },
  {
    id: 'I01',
    requests: ['initialize'],
    answers: ['result'],
    conclusion: { kind: 'read' },
  },
  {
    id: 'I02',
    requests: ['initialize'],
    answers: ['result:unreadable'],
    conclusion: malformed('discover-shape'),
  },
  {
    id: 'I03',
    requests: ['initialize'],
    answers: anywhere(CODES),
    conclusion: ERROR_ANSWER,
  },
  {
    id: 'I04',
    requests: ['initialize'],
    answers: anywhere(['unreadable']),
    conclusion: malformed('error-shape'),
  },
  {
    id: 'I05',
    requests: ['initialize'],
    answers: ['silent'],
    conclusion: ABANDONED,
  },
  {
    id: 'I06',
    requests: ['initialize'],
    answers: ['stream-broken', 'http:2xx', ...bodies(STATUS_5XX, ['plain'])],
    conclusion: BROKEN,
  },
  {
    id: 'I07',
    requests: ['initialize'],
    answers: bodies(STATUS_4XX, ['plain']),
    conclusion: NOT_SENT,
  },
  {
    id: 'L01',
    requests: ['tools/list'],
    answers: ['result'],
    conclusion: { kind: 'read' },
  },
  {
    id: 'L02',
    requests: ['tools/list'],
    answers: ['result:tools-missing'],
    conclusion: malformed('tools-missing'),
  },
  {
    id: 'L03',
    requests: ['tools/list'],
    answers: ['result:cursor-invalid'],
    conclusion: malformed('cursor-invalid'),
  },
  {
    id: 'G01',
    requests: ['tasks/get'],
    answers: ['result'],
    conclusion: { kind: 'read' },
  },
  {
    id: 'G02',
    requests: ['tasks/get'],
    answers: ['result:status-unknown'],
    conclusion: malformed('status-unknown'),
  },
  {
    id: 'G03',
    requests: ['tasks/get'],
    answers: ['result:input-requests-missing'],
    conclusion: malformed('input-requests-missing'),
  },
  {
    id: 'G04',
    requests: ['tasks/get'],
    answers: ['result:result-missing'],
    conclusion: malformed('result-missing'),
  },
  {
    id: 'G05',
    requests: ['tasks/get'],
    answers: ['result:error-missing'],
    conclusion: malformed('error-missing'),
  },
  {
    id: 'G06',
    requests: ['tasks/get'],
    answers: anywhere(['-32602']),
    conclusion: { kind: 'expired' },
  },
  { id: 'W01', requests: WRITES, answers: ['result'], conclusion: { kind: 'read' } },
  {
    id: 'O01',
    requests: ['tools/list', ...WRITES],
    answers: anywhere(CODES),
    conclusion: ERROR_ANSWER,
  },
  {
    id: 'O02',
    requests: ['tasks/get'],
    answers: anywhere(CODES.filter(code => code !== '-32602')),
    conclusion: ERROR_ANSWER,
  },
  {
    id: 'O03',
    requests: OPERATIONS,
    answers: anywhere(['unreadable']),
    conclusion: malformed('error-shape'),
  },
  { id: 'O04', requests: OPERATIONS, answers: ['silent'], conclusion: ABANDONED },
  {
    id: 'O05',
    requests: READS,
    answers: ['stream-broken', 'http:2xx'],
    conclusion: { kind: 'resend' },
  },
  {
    id: 'O06',
    requests: WRITES,
    answers: ['stream-broken', 'http:2xx'],
    conclusion: BROKEN,
  },
  {
    id: 'O07',
    requests: OPERATIONS,
    answers: bodies(STATUS_5XX, ['plain']),
    conclusion: BROKEN,
  },
  {
    id: 'O08',
    requests: OPERATIONS,
    answers: bodies(STATUS_4XX, ['plain']),
    conclusion: NOT_SENT,
  },
  {
    id: 'C01',
    requests: ['tools/call'],
    answers: ['result'],
    conclusion: { kind: 'answer', answer: 'result' },
  },
  {
    id: 'C02',
    requests: ['tools/call'],
    answers: anywhere(ERROR_CLASSES),
    conclusion: { kind: 'answer', answer: 'error' },
  },
  {
    id: 'C03',
    requests: ['tools/call'],
    answers: ['silent'],
    conclusion: { kind: 'answer', answer: 'abandoned' },
  },
  {
    id: 'C04',
    requests: ['tools/call'],
    answers: ['stream-broken', 'http:2xx', ...bodies(STATUS_5XX, ['plain'])],
    conclusion: { kind: 'answer', answer: 'stream-broken' },
  },
  {
    id: 'C05',
    requests: ['tools/call'],
    answers: bodies(STATUS_4XX, ['plain']),
    conclusion: NOT_SENT,
  },
  {
    id: 'S05',
    requests: [...PROBES, 'initialize', ...OPERATIONS, 'tools/call'],
    answers: ['http:401', 'http:403+scope'],
    conclusion: CREDENTIAL_REJECTED,
  },
  {
    id: 'S06',
    requests: [...PROBES, 'initialize', ...OPERATIONS, 'tools/call'],
    answers: ['http:403'],
    conclusion: NOT_SENT,
  },
  {
    id: 'S07',
    requests: [...OPERATIONS, 'tools/call'],
    answers: ['http:404+session'],
    conclusion: SESSION_ENDED,
  },
  {
    id: 'X01',
    requests: [...PROBES, 'initialize', ...OPERATIONS, 'tools/call'],
    answers: ['unsent'],
    conclusion: NOT_SENT,
  },
  {
    id: 'N01',
    requests: ['notification'],
    answers: [
      'unsent',
      'silent',
      'stream-broken',
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

export function answersOf(request: RequestClass): readonly AnswerClass[] {
  const transport: readonly AnswerClass[] = ['unsent', 'stream-broken', 'silent']
  if (request === 'notification')
    return [
      ...transport,
      'http:2xx',
      'http:401',
      'http:403+scope',
      'http:403',
      'http:404+session',
      ...bodies(HTTP_STATUS_CLASSES, [...ERROR_CLASSES, 'plain']),
    ]
  const answers: AnswerClass[] = [
    ...RESULT_CLASSES[request],
    ...errors(ERROR_CLASSES),
    ...transport,
  ]
  answers.push('http:2xx', 'http:401', 'http:403+scope', 'http:403')
  if (AFTER_SESSION.includes(request)) answers.push('http:404+session')
  answers.push(...bodies(HTTP_STATUS_CLASSES, [...ERROR_CLASSES, 'plain']))
  return answers
}

export function transportCells(): readonly TableCell[] {
  return REQUEST_CLASSES.flatMap(request => answersOf(request).map(answer => ({ request, answer })))
}

export function rowsOf(cell: TableCell): readonly TableRow[] {
  return TRANSPORT_TABLE.filter(
    row => row.requests.includes(cell.request) && row.answers.includes(cell.answer),
  )
}

export function cellsOf(row: TableRow): readonly TableCell[] {
  return transportCells().filter(
    cell => row.requests.includes(cell.request) && row.answers.includes(cell.answer),
  )
}
