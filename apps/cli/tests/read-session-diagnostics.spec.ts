import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeSessionOwners } from '@omne-harness/cli'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commandMissing, commandUnrecognized, resultUncertain } from './support/expected.ts'
import {
  closedPort,
  issuedProof,
  otherTenantText,
  sessionId,
  startFakeService,
  tenantText,
  type Answer,
  type FakeService,
  type Seen,
} from './support/fake-service.ts'
import { runInProcess, type InProcessOptions } from './support/in-process.ts'

const name = 'read-session-diagnostics'

let root: string
let state: string
const services: FakeService[] = []

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-diag-')))
  state = join(root, 'state')
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

// Fixtures in the wire shape of the public contract's `SessionDiagnosticsPage`. The SDK hands a
// page over only after the contract read it, so every field a rule requires is present.
const adapter = {
  owner: '@omne-harness/model',
  name: 'openai-compatible',
  revision: '1',
  digest: 'd',
}
const unknownTiming = {
  materialize: { kind: 'unknown' },
  sendToFirstContent: { kind: 'unknown' },
  execution: { kind: 'unknown' },
}
const dispatch = (fields: Record<string, unknown>) => ({
  dispatch: 'd-1',
  revision: '1',
  adapter,
  send: 'not-sent',
  firstContent: 'none-proven',
  outcome: { kind: 'pending' },
  timing: unknownTiming,
  ...fields,
})
const modelCall = (fields: Record<string, unknown>) => ({
  reference: 'ref-1',
  purpose: 'main',
  call: { kind: 'found', call: 'call-1', phase: 'settled' },
  dispatches: [dispatch({})],
  coverage: 'complete-through-snapshot',
  usage: { kind: 'unknown', reason: 'not-recorded' },
  ...fields,
})
const run = (fields: Record<string, unknown>) => ({
  run: 'run-1',
  entry: 'interactive',
  execution: 'exec-1',
  started: { position: '2', at: { kind: 'unknown' } },
  attempts: '1',
  controls: [],
  terminal: null,
  calls: { registered: '1', projected: '1' },
  modelCalls: [],
  toolCalls: [],
  messages: [{ kind: 'message.user', count: '1' }],
  ...fields,
})

/** A Run that Model refused to accept: the smoke case the RFC starts from. */
const refused = run({
  terminal: {
    outcome: 'failed',
    cause: {
      record: 'exec-1/step-1/model-refused',
      structured: { kind: 'model-refused', failure: 'capacity' },
    },
  },
  modelCalls: [modelCall({})],
})

/** A Run whose upstream answered 504 in the stream: the other smoke case. */
const noReply = run({
  run: 'run-2',
  execution: 'exec-2',
  started: { position: '7', at: { kind: 'known', instant: '2026-11-05T08:00:00Z' } },
  terminal: {
    outcome: 'failed',
    cause: {
      record: 'exec-2/step-1/model-failed/upstream-unavailable/http-504',
      structured: { kind: 'no-reply', cause: 'upstream-unavailable', upstreamStatus: '504' },
    },
  },
  calls: { registered: '2', projected: '2' },
  modelCalls: [
    modelCall({
      reference: 'ref-2',
      call: { kind: 'found', call: 'call-2', phase: 'settled' },
      dispatches: [
        dispatch({
          dispatch: 'd-2',
          send: 'sent',
          outcome: { kind: 'failed', cause: 'upstream-unavailable', upstreamStatus: '504' },
          timing: {
            materialize: { kind: 'known', milliseconds: '12' },
            sendToFirstContent: { kind: 'unknown' },
            execution: { kind: 'known', milliseconds: '1500' },
          },
        }),
      ],
      usage: {
        kind: 'account',
        usage: [
          { name: 'input_tokens', unit: 'token', state: 'known', lexeme: '120' },
          { name: 'output_tokens', unit: 'token', state: 'unknown', lexeme: null },
        ],
        cost: [{ source: 'provider', unit: 'USD', state: 'provisional', lexeme: '0.002' }],
        duration: { kind: 'known', value: '1500' },
        receipt: 'received',
      },
    }),
  ],
  toolCalls: [
    {
      reference: 'tref-1',
      state: {
        kind: 'found',
        call: 'tcall-1',
        phase: 'settled',
        relation: 'foreground',
        terminal: { kind: 'completed', cause: null },
      },
      account: { kind: 'unknown', reason: 'not-recorded' },
      diagnostics: 'unsupported',
    },
  ],
  messages: [
    { kind: 'message.user', count: '1' },
    { kind: 'message.assistant', count: '2' },
  ],
})

const gaps = [
  { source: 'model', subject: 'ref-1', reason: 'not-recorded' },
  { source: 'tool', subject: 'tcall-1', reason: 'unsupported' },
]

interface PageBody {
  readonly runs: readonly unknown[]
  readonly next: string | null
  readonly exhausted: boolean
  readonly scannedThrough: string
  readonly basis: { readonly upper: string }
  readonly gaps: readonly unknown[]
}
const page = (
  runs: readonly unknown[],
  next: string | null,
  pageGaps: unknown[] = [],
): PageBody => ({
  runs,
  next,
  exhausted: next === null,
  scannedThrough: '0',
  basis: { upper: '9' },
  gaps: pageGaps,
})

/**
 * A service that serves `pages` for `read-session-diagnostics`. It answers like the public
 * contract: a first page request has `run` and `pageBytes`, and a request with a cursor has neither.
 */
function diagnosticsService(
  pages: readonly PageBody[],
  extra?: (seen: Seen) => Answer | undefined,
) {
  return (seen: Seen): Answer => {
    const body = (seen.wire['body'] ?? {}) as Record<string, unknown>
    if (seen.wire['operation'] !== name) return defaultFor(seen)
    const given = extra?.(seen)
    if (given !== undefined) return given
    const cursor = body['cursor']
    const carriesFirstPageFields = 'run' in body || 'pageBytes' in body
    if (cursor === null ? !carriesFirstPageFields : carriesFirstPageFields)
      return { outcome: 'protocol-rejected', body: {} }
    const index = cursor === null ? 0 : Number(String(cursor).replace('cursor-', ''))
    const found = pages[index]
    return found === undefined
      ? { outcome: 'invalid', body: {} }
      : { outcome: 'succeeded', body: found }
  }
}

function defaultFor(seen: Seen): Answer {
  const body = (seen.wire['body'] ?? {}) as Record<string, unknown>
  return {
    outcome: 'succeeded',
    body: {
      loginIdentifier: body['loginIdentifier'],
      issuedAt: '2026-11-01T12:00:00Z',
      tenantId: tenantText,
      loginProof: issuedProof,
    },
  }
}

async function serve(answer: (seen: Seen) => Answer): Promise<FakeService> {
  const service = await startFakeService(answer)
  services.push(service)
  return service
}

function cli(argv: readonly string[], options: InProcessOptions = {}) {
  return runInProcess(argv, { omneHome: state, homeDirectory: join(root, 'home'), ...options })
}

async function loginOwningSession(service: FakeService) {
  await cli(['login', '--login-identifier', 'alice', '--server', service.origin])
  expect(writeSessionOwners(state, new Map([[sessionId, tenantText]])).kind).toBe('written')
}

const reads = (service: FakeService) => service.seen.filter(item => item.wire['operation'] === name)
const bodyOf = (seen: Seen | undefined) => (seen?.wire['body'] ?? {}) as Record<string, unknown>

describe('read-session-diagnostics', () => {
  describe('paging', () => {
    const pages = [page([noReply], 'cursor-1'), page([], 'cursor-2'), page([refused], null, gaps)]

    it('reads every page to exhausted, keeps the runs in page order, and collects the gaps', async () => {
      const service = await serve(diagnosticsService(pages))
      await loginOwningSession(service)
      const result = await cli([name, '--session', sessionId, '--json'])
      expect(result.code).toBe(0)
      const printed = JSON.parse(result.stdout) as {
        body: { runs: unknown[]; gaps: unknown[]; complete: boolean }
      }
      expect(printed.body.runs).toEqual([noReply, refused])
      expect(printed.body.gaps).toEqual(gaps)
      expect(printed.body.complete).toBe(true)
      expect(reads(service)).toHaveLength(3)
    })

    it('names run and pageBytes on the first request only, and a fresh messageId on each', async () => {
      const service = await serve(diagnosticsService(pages))
      await loginOwningSession(service)
      await cli([name, '--session', sessionId, '--page-bytes', '4096'])
      const [first, second, third] = reads(service).map(bodyOf)
      expect(first).toEqual({
        tenant: tenantText,
        session: sessionId,
        cursor: null,
        run: null,
        pageBytes: '4096',
      })
      expect(second).toEqual({ tenant: tenantText, session: sessionId, cursor: 'cursor-1' })
      expect(third).toEqual({ tenant: tenantText, session: sessionId, cursor: 'cursor-2' })
      expect(new Set(reads(service).map(item => item.wire['messageId'])).size).toBe(3)
    })

    it('sends --run as the run filter of the first request, and the default page size', async () => {
      const service = await serve(diagnosticsService([page([refused], null)]))
      await loginOwningSession(service)
      await cli([name, '--session', sessionId, '--run', 'run-1'])
      expect(bodyOf(reads(service)[0])).toEqual({
        tenant: tenantText,
        session: sessionId,
        cursor: null,
        run: 'run-1',
        pageBytes: '65536',
      })
    })
  })

  describe('text output', () => {
    it('shows the reason of each failed run, the dispatches, usage, timing and the gaps', async () => {
      const service = await serve(diagnosticsService([page([refused, noReply], null, gaps)]))
      await loginOwningSession(service)
      const result = await cli([name, '--session', sessionId])
      expect(result.code).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout).toBe(
        [
          'Run run-1 (entry interactive, execution exec-1): failed',
          '  started: position 2 at unknown',
          '  cause: exec-1/step-1/model-refused',
          '  reason: model-refused capacity',
          '  model calls: 1',
          '    main ref-1 -> call call-1 (settled), 1 dispatch, coverage complete-through-snapshot',
          '      d-1 openai-compatible: not-sent, first content none-proven, pending',
          '        timing: materialize unknown, send to first content unknown, execution unknown',
          '      usage: unknown not-recorded',
          '  tool calls: 0',
          '  messages: message.user 1',
          'Run run-2 (entry interactive, execution exec-2): failed',
          '  started: position 7 at 2026-11-05T08:00:00Z',
          '  cause: exec-2/step-1/model-failed/upstream-unavailable/http-504',
          '  reason: no-reply upstream-unavailable 504',
          '  model calls: 1',
          '    main ref-2 -> call call-2 (settled), 1 dispatch, coverage complete-through-snapshot',
          '      d-2 openai-compatible: sent, first content none-proven, failed upstream-unavailable http 504',
          '        timing: materialize 12 ms, send to first content unknown, execution 1500 ms',
          '      usage: input_tokens 120 token, output_tokens unknown; cost: provider 0.002 USD provisional; duration 1500; receipt received',
          '  tool calls: 1',
          '    tref-1 -> call tcall-1 (settled, foreground), completed',
          '      account: unknown not-recorded',
          '  messages: message.user 1, message.assistant 2',
          'gaps: 2',
          '  model ref-1: not-recorded',
          '  tool tcall-1: unsupported',
          '',
        ].join('\n'),
      )
    })

    it('shows a completed run without a reason line, and a run that has not ended', async () => {
      const completed = run({
        run: 'run-3',
        terminal: {
          outcome: 'completed',
          cause: { record: null, structured: { kind: 'none' } },
        },
      })
      const open = run({
        run: 'run-4',
        controls: [
          { position: '9', kind: 'requested', target: 'run', intent: 'interrupt', state: null },
        ],
        modelCalls: [
          modelCall({
            call: { kind: 'unknown', reason: 'unavailable' },
            dispatches: [],
            coverage: 'unknown',
          }),
        ],
        toolCalls: [
          {
            reference: 'tref-2',
            state: { kind: 'unknown', reason: 'not-found' },
            account: { kind: 'unknown', reason: 'not-found' },
            diagnostics: 'unsupported',
          },
        ],
        messages: [],
      })
      const service = await serve(diagnosticsService([page([completed, open], null)]))
      await loginOwningSession(service)
      const result = await cli([name, '--session', sessionId])
      expect(result.code).toBe(0)
      expect(result.stdout).toBe(
        [
          'Run run-3 (entry interactive, execution exec-1): completed',
          '  started: position 2 at unknown',
          '  model calls: 0',
          '  tool calls: 0',
          '  messages: message.user 1',
          'Run run-4 (entry interactive, execution exec-1): not ended',
          '  started: position 2 at unknown',
          '  control requested at 9: run interrupt -',
          '  model calls: 1',
          '    main ref-1 -> call unknown unavailable, 0 dispatches, coverage unknown',
          '      usage: unknown not-recorded',
          '  tool calls: 1',
          '    tref-2 -> call unknown not-found',
          '      account: unknown not-found',
          '',
        ].join('\n'),
      )
    })

    it('shows every closed cause kind as its words, and every dispatch outcome', async () => {
      const ended = (id: string, structured: unknown) =>
        run({
          run: id,
          terminal: { outcome: 'failed', cause: { record: null, structured } },
          messages: [],
        })
      const dispatches = run({
        run: 'run-d',
        messages: [],
        modelCalls: [
          modelCall({
            dispatches: [
              dispatch({ dispatch: 'd-1', outcome: { kind: 'interrupted' } }),
              dispatch({ dispatch: 'd-2', outcome: { kind: 'completed', reason: 'limit' } }),
              dispatch({
                dispatch: 'd-3',
                outcome: { kind: 'failed', cause: 'stream-lost', upstreamStatus: null },
              }),
            ],
          }),
        ],
      })
      const service = await serve(
        diagnosticsService([
          page(
            [
              ended('run-a', { kind: 'unknown', reason: 'denied' }),
              ended('run-b', { kind: 'no-failure', conclusion: 'fail' }),
              ended('run-c', { kind: 'no-reply', cause: null, upstreamStatus: null }),
              ended('run-e', { kind: 'cannot-fit', reason: 'after-compaction' }),
              ended('run-f', { kind: 'request-rejected' }),
              ended('run-g', { kind: 'guard' }),
              ended('run-h', { kind: 'compaction-invalid' }),
              dispatches,
            ],
            null,
          ),
        ]),
      )
      await loginOwningSession(service)
      const result = await cli([name, '--session', sessionId])
      expect(result.code).toBe(0)
      const reasons = result.stdout.split('\n').filter(line => line.startsWith('  reason: '))
      expect(reasons).toEqual([
        '  reason: unknown denied',
        '  reason: no-failure fail',
        '  reason: no-reply unknown unknown',
        '  reason: cannot-fit after-compaction',
        '  reason: request-rejected',
        '  reason: guard',
        '  reason: compaction-invalid',
      ])
      expect(result.stdout).toContain(
        [
          '      d-1 openai-compatible: not-sent, first content none-proven, interrupted',
          '        timing: materialize unknown, send to first content unknown, execution unknown',
          '      d-2 openai-compatible: not-sent, first content none-proven, completed limit',
          '        timing: materialize unknown, send to first content unknown, execution unknown',
          '      d-3 openai-compatible: not-sent, first content none-proven, failed stream-lost http unknown',
        ].join('\n'),
      )
    })

    it('prints nothing for a session without runs and exits 0', async () => {
      const service = await serve(diagnosticsService([page([], null)]))
      await loginOwningSession(service)
      expect(await cli([name, '--session', sessionId])).toMatchObject({
        code: 0,
        stdout: '',
        stderr: '',
      })
    })
  })

  describe('--json', () => {
    it('prints one result object in the keys of the contract and keeps the proof out', async () => {
      const service = await serve(diagnosticsService([page([refused], null, gaps)]))
      await loginOwningSession(service)
      const result = await cli([name, '--session', sessionId, '--json'])
      expect(result.code).toBe(0)
      expect(result.stdout.endsWith('}\n')).toBe(true)
      expect(result.stdout.trimEnd().split('\n')).toHaveLength(1)
      expect(JSON.parse(result.stdout)).toEqual({
        result: 'response',
        outcome: 'succeeded',
        body: { runs: [refused], gaps, complete: true },
        request: { messageId: 'id-1', tenant: tenantText },
      })
      expect(result.stdout).not.toContain(issuedProof)
    })
  })

  describe('request', () => {
    it('sends to the session location with the proof and the owner tenant, not the selected one', async () => {
      const service = await serve(diagnosticsService([page([], null)]))
      await cli(['login', '--login-identifier', 'alice', '--server', service.origin])
      writeSessionOwners(state, new Map([[sessionId, otherTenantText]]))
      const result = await cli([name, '--session', sessionId, '--json'])
      expect(result.code).toBe(0)
      const [sent] = reads(service)
      expect(sent?.path).toBe('/session-public/1')
      expect(sent?.wire).toMatchObject({ loginProof: issuedProof })
      expect(bodyOf(sent)['tenant']).toBe(otherTenantText)
      expect(JSON.parse(result.stdout).request.tenant).toBe(otherTenantText)
    })

    it('takes --tenant over the record', async () => {
      const service = await serve(diagnosticsService([page([], null)]))
      await loginOwningSession(service)
      await cli([name, '--session', sessionId, '--tenant', otherTenantText])
      expect(bodyOf(reads(service)[0])['tenant']).toBe(otherTenantText)
    })

    it('exits 2 and sends nothing when the owner of the session is unknown', async () => {
      const service = await serve(diagnosticsService([page([], null)]))
      await cli(['login', '--login-identifier', 'alice', '--server', service.origin])
      const result = await cli([name, '--session', sessionId])
      expect(result.code).toBe(2)
      expect(result.stderr).toContain('the owner tenant of this session is unknown')
      expect(reads(service)).toHaveLength(0)
    })

    it.each([
      [['--session', sessionId, '--page-bytes', '0']],
      [['--session', sessionId, '--page-bytes', 'x']],
      [['--session', sessionId, '--json', '--json']],
      [['--session', sessionId, '--json', 'extra']],
      [['--session', sessionId, '--tenant', 'not-a-tenant']],
      [['--session', sessionId, '--run', '']],
    ])('exits 2 for the usage error %j', async args => {
      const service = await serve(diagnosticsService([page([], null)]))
      await loginOwningSession(service)
      const result = await cli([name, ...args])
      expect(result).toMatchObject({ code: 2, stdout: '', stderr: commandUnrecognized(name) })
      expect(reads(service)).toHaveLength(0)
    })

    it('exits 2 and sends nothing when the contract refuses to encode the request', async () => {
      const service = await serve(diagnosticsService([page([], null)]))
      await loginOwningSession(service)
      const result = await cli([name, '--session', 'not-a-session-id', '--tenant', tenantText])
      expect(result).toMatchObject({ code: 2, stdout: '', stderr: commandUnrecognized(name) })
      expect(reads(service)).toHaveLength(0)
    })

    it('exits 2 when --session is missing', async () => {
      const result = await cli([name])
      expect(result).toMatchObject({
        code: 2,
        stdout: '',
        stderr: commandMissing(name, '--session'),
      })
    })
  })

  describe('outcomes and exit codes', () => {
    it.each([
      ['denied', 3],
      ['invalid', 3],
      ['protocol-rejected', 3],
      ['basis-unavailable', 4],
    ])(
      'exits %s -> %i on the first page and says the read is incomplete',
      async (outcome, code) => {
        const service = await serve(diagnosticsService([], () => ({ outcome, body: {} })))
        await loginOwningSession(service)
        const result = await cli([name, '--session', sessionId])
        expect(result.code).toBe(code)
        expect(result.stdout).toBe('')
        expect(result.stderr).toBe(
          `omne ${name}: incomplete after 0 runs: page 1 was answered ${outcome}\n`,
        )
      },
    )

    it('exits 0 when the page is complete but has gaps: a gap is not a failure of the read', async () => {
      const service = await serve(diagnosticsService([page([refused], null, gaps)]))
      await loginOwningSession(service)
      const result = await cli([name, '--session', sessionId, '--json'])
      expect(result.code).toBe(0)
      expect(result.stderr).toBe('')
      expect(JSON.parse(result.stdout).body.gaps).toHaveLength(2)
    })

    it('writes denied as the outcome of the --json object', async () => {
      const service = await serve(diagnosticsService([], () => ({ outcome: 'denied', body: {} })))
      await loginOwningSession(service)
      const result = await cli([name, '--session', sessionId, '--json'])
      expect(result.code).toBe(3)
      expect(JSON.parse(result.stdout)).toMatchObject({
        result: 'response',
        outcome: 'denied',
        body: { runs: [], gaps: [], complete: false },
      })
    })

    it('exits non-zero when a later page fails, and still prints the runs read', async () => {
      const service = await serve(
        diagnosticsService([page([noReply], 'cursor-1')], seen =>
          bodyOf(seen)['cursor'] === 'cursor-1'
            ? { outcome: 'basis-unavailable', body: {} }
            : undefined,
        ),
      )
      await loginOwningSession(service)
      const result = await cli([name, '--session', sessionId])
      expect(result.code).toBe(4)
      expect(
        result.stdout.startsWith('Run run-2 (entry interactive, execution exec-2): failed\n'),
      ).toBe(true)
      expect(result.stderr).toBe(
        `omne ${name}: incomplete after 1 runs: page 2 was answered basis-unavailable\n`,
      )
    })

    it('exits 5 when the service is not running', async () => {
      const service = await serve(diagnosticsService([page([], null)]))
      await loginOwningSession(service)
      const port = await closedPort()
      const result = await cli([
        name,
        '--session',
        sessionId,
        '--json',
        '--server',
        `http://127.0.0.1:${port}`,
      ])
      expect(result.code).toBe(5)
      expect(result.stderr).toContain(resultUncertain(name))
      expect(JSON.parse(result.stdout)).toMatchObject({
        result: 'uncertain',
        body: { runs: [], gaps: [], complete: false },
      })
    })

    it('exits 5 for a page that the public contract refuses to read', async () => {
      const service = await serve(
        diagnosticsService([], () => ({ outcome: 'succeeded', body: { runs: 'no' } })),
      )
      await loginOwningSession(service)
      const result = await cli([name, '--session', sessionId])
      expect(result.code).toBe(5)
      expect(result.stderr).toBe(
        `omne ${name}: incomplete after 0 runs: page 1 had no trusted answer\n` +
          `omne ${name}: result uncertain\n`,
      )
    })

    it('exits 1 when the server says there is more but gives no cursor', async () => {
      const service = await serve(
        diagnosticsService([], () => ({
          outcome: 'succeeded',
          body: { ...page([], null), exhausted: false },
        })),
      )
      await loginOwningSession(service)
      const result = await cli([name, '--session', sessionId])
      expect(result.code).toBe(1)
      expect(result.stderr).toBe(
        `omne ${name}: incomplete after 0 runs: page 1 has no cursor but is not the last\n`,
      )
    })

    it('exits 1 and stops when a page repeats the cursor it was asked with', async () => {
      const service = await serve(
        diagnosticsService([], () => ({ outcome: 'succeeded', body: page([], 'same') })),
      )
      await loginOwningSession(service)
      const result = await cli([name, '--session', sessionId])
      expect(result.code).toBe(1)
      expect(result.stderr).toContain('did not advance the cursor')
      expect(reads(service)).toHaveLength(2)
    })

    it('exits 1 when standard output cannot be written', async () => {
      const service = await serve(diagnosticsService([page([refused], null)]))
      await loginOwningSession(service)
      const result = await cli([name, '--session', sessionId], { failStdout: true })
      expect(result.code).toBe(1)
      expect(result.stderr).toBe(`omne ${name}: cannot write standard output\n`)
    })
  })
})
