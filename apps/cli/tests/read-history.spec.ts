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

let root: string
let state: string
const services: FakeService[] = []

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-hist-')))
  state = join(root, 'state')
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

const block = (fields: Record<string, unknown>) => ({
  id: 'b',
  visibility: { toHuman: true, toModel: true },
  ...fields,
})
const entry = (entryId: string, kind: string, payload: unknown) => ({
  entryId,
  revision: '1',
  kind,
  payload,
})
const message = (role: string, ...blocks: unknown[]) => ({ message: { id: 'm', role, blocks } })

const history = {
  user: entry(
    '1',
    'message.user',
    message('user', block({ kind: 'text', text: 'list the files' })),
  ),
  started: entry('2', 'run.started', { run: 'run-1', entry: 'interactive', first: 'i' }),
  call: entry(
    '3',
    'message.assistant',
    message(
      'assistant',
      block({ kind: 'text', text: 'I will look.' }),
      block({
        kind: 'tool_call',
        callId: 'call-9',
        name: 'list_files',
        arguments: { path: 'src' },
      }),
    ),
  ),
  result: entry(
    '4',
    'message.tool',
    message(
      'tool',
      block({ kind: 'tool_result', callId: 'call-9' }),
      block({ kind: 'text', text: 'a.ts b.ts' }),
    ),
  ),
  terminal: entry('5', 'run.terminal', {
    terminal: { run: 'run-1', outcome: 'completed', evidence: {} },
  }),
}
const all = [history.user, history.started, history.call, history.result, history.terminal]

interface PageBody {
  readonly entries: readonly unknown[]
  readonly next: string | null
  readonly exhausted: boolean
  readonly scannedThrough: string
}
const page = (entries: readonly unknown[], next: string | null): PageBody => ({
  entries,
  next,
  exhausted: next === null,
  scannedThrough: '0',
})

/**
 * A service that serves `pages` for `read-history`. It answers like the public contract: a first
 * page request has `direction` and `pageBytes`, and a request with a cursor has neither.
 */
function historyService(pages: readonly PageBody[], extra?: (seen: Seen) => Answer | undefined) {
  return (seen: Seen): Answer => {
    const body = (seen.wire['body'] ?? {}) as Record<string, unknown>
    if (seen.wire['operation'] !== 'read-history') return defaultFor(seen)
    const given = extra?.(seen)
    if (given !== undefined) return given
    const cursor = body['cursor']
    const carriesFirstPageFields = 'direction' in body || 'pageBytes' in body
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

const reads = (service: FakeService) =>
  service.seen.filter(item => item.wire['operation'] === 'read-history')
const bodyOf = (seen: Seen | undefined) => (seen?.wire['body'] ?? {}) as Record<string, unknown>

describe('read-history', () => {
  describe('paging', () => {
    const pages = [
      page([history.user, history.started], 'cursor-1'),
      page([history.call], 'cursor-2'),
      page([history.result, history.terminal], null),
    ]

    it('reads every page, the second and the later ones included, in order', async () => {
      const service = await serve(historyService(pages))
      await loginOwningSession(service)
      const result = await cli(['read-history', '--session', sessionId, '--json'])
      expect(result.code).toBe(0)
      const printed = JSON.parse(result.stdout) as {
        body: { entries: unknown[]; complete: boolean }
      }
      expect(printed.body.entries).toEqual(all)
      expect(printed.body.complete).toBe(true)
      expect(reads(service)).toHaveLength(3)
    })

    it('names direction and pageBytes on the first request only', async () => {
      const service = await serve(historyService(pages))
      await loginOwningSession(service)
      await cli(['read-history', '--session', sessionId, '--page-bytes', '4096'])
      const [first, second, third] = reads(service).map(bodyOf)
      expect(first).toEqual({
        tenant: tenantText,
        session: sessionId,
        cursor: null,
        direction: 'forward',
        pageBytes: '4096',
      })
      expect(second).toEqual({ tenant: tenantText, session: sessionId, cursor: 'cursor-1' })
      expect(third).toEqual({ tenant: tenantText, session: sessionId, cursor: 'cursor-2' })
    })

    it('uses the cursor of each page as given, and a fresh messageId for each request', async () => {
      const service = await serve(historyService(pages))
      await loginOwningSession(service)
      await cli(['read-history', '--session', sessionId])
      const ids = reads(service).map(item => item.wire['messageId'])
      expect(new Set(ids).size).toBe(3)
    })

    it('does not take an empty page for the end of the history', async () => {
      const service = await serve(
        historyService([page([], 'cursor-1'), page([history.user], null)]),
      )
      await loginOwningSession(service)
      const result = await cli(['read-history', '--session', sessionId, '--json'])
      expect(result.code).toBe(0)
      expect(JSON.parse(result.stdout).body.entries).toEqual([history.user])
    })

    it('shows a page request that carries direction or pageBytes as protocol-rejected (control of the service model)', async () => {
      // The test service refuses a cursor page that carries the first-page fields, as the public
      // contract does. This shows that the service model can tell the two request shapes apart,
      // so the assertions on the CLI's second request above can fail.
      const service = await serve(historyService(pages))
      const answer = await fetch(`${service.origin}/session-public/1`, {
        method: 'POST',
        body: JSON.stringify({
          protocolVersion: 'session-public/1',
          messageId: 'm',
          operation: 'read-history',
          body: {
            tenant: tenantText,
            session: sessionId,
            cursor: 'cursor-1',
            direction: 'forward',
            pageBytes: '65536',
          },
        }),
      })
      expect(await answer.json()).toMatchObject({ outcome: 'protocol-rejected' })
    })
  })

  describe('request', () => {
    it('sends to the session location with the proof and the owner tenant, not the selected one', async () => {
      const service = await serve(historyService([page([], null)]))
      await cli(['login', '--login-identifier', 'alice', '--server', service.origin])
      writeSessionOwners(state, new Map([[sessionId, otherTenantText]]))
      const result = await cli(['read-history', '--session', sessionId, '--json'])
      expect(result.code).toBe(0)
      const [sent] = reads(service)
      expect(sent?.path).toBe('/session-public/1')
      expect(sent?.wire).toMatchObject({ loginProof: issuedProof })
      expect(bodyOf(sent)['tenant']).toBe(otherTenantText)
      expect(JSON.parse(result.stdout).request.tenant).toBe(otherTenantText)
    })

    it('takes --tenant over the record', async () => {
      const service = await serve(historyService([page([], null)]))
      await loginOwningSession(service)
      await cli(['read-history', '--session', sessionId, '--tenant', otherTenantText])
      expect(bodyOf(reads(service)[0])['tenant']).toBe(otherTenantText)
    })

    it('exits 2 and sends nothing when the owner of the session is unknown', async () => {
      const service = await serve(historyService([page([], null)]))
      await cli(['login', '--login-identifier', 'alice', '--server', service.origin])
      const result = await cli(['read-history', '--session', sessionId])
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
    ])('exits 2 for the usage error %j', async args => {
      const service = await serve(historyService([page([], null)]))
      await loginOwningSession(service)
      const result = await cli(['read-history', ...args])
      expect(result).toMatchObject({
        code: 2,
        stdout: '',
        stderr: commandUnrecognized('read-history'),
      })
      expect(reads(service)).toHaveLength(0)
    })

    it('exits 2 when --session is missing', async () => {
      const result = await cli(['read-history'])
      expect(result).toMatchObject({
        code: 2,
        stdout: '',
        stderr: commandMissing('read-history', '--session'),
      })
    })

    it('accepts --json before the other options', async () => {
      const service = await serve(historyService([page([], null)]))
      await loginOwningSession(service)
      const result = await cli(['read-history', '--json', '--session', sessionId])
      expect(result.code).toBe(0)
    })
  })

  describe('text output', () => {
    it('shows text, tool call, tool result, and the start and end of a run', async () => {
      const service = await serve(historyService([page(all, null)]))
      await loginOwningSession(service)
      const result = await cli(['read-history', '--session', sessionId])
      expect(result.code).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout).toBe(
        [
          '#1 message.user: list the files',
          '#2 run.started: Run run-1 started (entry interactive)',
          '#3 message.assistant: I will look.',
          '    [tool call list_files call-9] {"path":"src"}',
          '#4 message.tool: [tool result call-9]',
          '    a.ts b.ts',
          '#5 run.terminal: Run run-1 ended: completed',
          '',
        ].join('\n'),
      )
    })

    it('shows the cause a failed run ended with, and none for a completed run', async () => {
      const record = 'run-2/execution/step-4/model-failed/upstream-unavailable/connect-timeout'
      const failed = entry('6', 'run.terminal', {
        terminal: { run: 'run-2', outcome: 'failed', evidence: {} },
        cause: { owner: '@omne-harness/agent', record, revision: '1', digest: 'sha256:x' },
      })
      const completed = entry('7', 'run.terminal', {
        terminal: { run: 'run-3', outcome: 'completed', evidence: {} },
        cause: { owner: '@omne-harness/agent', record: 'ignored', revision: '1', digest: 'd' },
      })
      const service = await serve(historyService([page([failed, completed], null)]))
      await loginOwningSession(service)
      const result = await cli(['read-history', '--session', sessionId])
      expect(result.code).toBe(0)
      expect(result.stdout).toBe(
        [
          '#6 run.terminal: Run run-2 ended: failed',
          `    cause: ${record}`,
          '#7 run.terminal: Run run-3 ended: completed',
          '',
        ].join('\n'),
      )
    })

    it('shows an entry kind it does not know as its kind and a clipped payload', async () => {
      const unknown = entry('9', 'session.frozen', { evidence: 'x'.repeat(2000) })
      const service = await serve(historyService([page([unknown], null)]))
      await loginOwningSession(service)
      const result = await cli(['read-history', '--session', sessionId])
      expect(result.stdout.startsWith('#9 session.frozen: {"evidence":"xxx')).toBe(true)
      expect(result.stdout.length).toBeLessThan(700)
    })

    it('prints nothing for an empty history and exits 0', async () => {
      const service = await serve(historyService([page([], null)]))
      await loginOwningSession(service)
      expect(await cli(['read-history', '--session', sessionId])).toMatchObject({
        code: 0,
        stdout: '',
        stderr: '',
      })
    })
  })

  describe('--json', () => {
    it('prints one result object whose entries are the raw ones and keeps the proof out', async () => {
      const service = await serve(historyService([page(all, null)]))
      await loginOwningSession(service)
      const result = await cli(['read-history', '--session', sessionId, '--json'])
      expect(result.code).toBe(0)
      expect(result.stdout.endsWith('}\n')).toBe(true)
      expect(result.stdout.trimEnd().split('\n')).toHaveLength(1)
      expect(JSON.parse(result.stdout)).toEqual({
        result: 'response',
        outcome: 'succeeded',
        body: { entries: all, complete: true },
        request: { messageId: 'id-1', tenant: tenantText },
      })
      expect(result.stdout).not.toContain(issuedProof)
    })
  })

  describe('outcomes and exit codes', () => {
    it.each([
      ['denied', 3],
      ['invalid', 3],
      ['protocol-rejected', 3],
      ['basis-unavailable', 4],
    ])(
      'exits %s -> %i on the first page and says the history is incomplete',
      async (outcome, code) => {
        const service = await serve(historyService([], () => ({ outcome, body: {} })))
        await loginOwningSession(service)
        const result = await cli(['read-history', '--session', sessionId])
        expect(result.code).toBe(code)
        expect(result.stdout).toBe('')
        expect(result.stderr).toBe(
          `omne read-history: history incomplete after 0 entries: page 1 was answered ${outcome}\n`,
        )
      },
    )

    it('writes denied as the outcome of the --json object', async () => {
      const service = await serve(historyService([], () => ({ outcome: 'denied', body: {} })))
      await loginOwningSession(service)
      const result = await cli(['read-history', '--session', sessionId, '--json'])
      expect(result.code).toBe(3)
      expect(JSON.parse(result.stdout)).toMatchObject({
        result: 'response',
        outcome: 'denied',
        body: { entries: [], complete: false },
      })
    })

    it('exits non-zero when a later page fails, and still prints the entries read', async () => {
      const service = await serve(
        historyService([page([history.user], 'cursor-1')], seen =>
          bodyOf(seen)['cursor'] === 'cursor-1'
            ? { outcome: 'basis-unavailable', body: {} }
            : undefined,
        ),
      )
      await loginOwningSession(service)
      const result = await cli(['read-history', '--session', sessionId])
      expect(result.code).toBe(4)
      expect(result.stdout).toBe('#1 message.user: list the files\n')
      expect(result.stderr).toBe(
        'omne read-history: history incomplete after 1 entries: page 2 was answered basis-unavailable\n',
      )
    })

    it('exits 5 when the service is not running', async () => {
      const service = await serve(historyService([page([], null)]))
      await loginOwningSession(service)
      const port = await closedPort()
      const result = await cli([
        'read-history',
        '--session',
        sessionId,
        '--json',
        '--server',
        `http://127.0.0.1:${port}`,
      ])
      expect(result.code).toBe(5)
      expect(result.stderr).toContain(resultUncertain('read-history'))
      expect(JSON.parse(result.stdout)).toMatchObject({
        result: 'uncertain',
        body: { entries: [], complete: false },
      })
    })

    it('exits 5 for a page that the public contract refuses to read', async () => {
      const service = await serve(
        historyService([], () => ({ outcome: 'succeeded', body: { entries: 'no' } })),
      )
      await loginOwningSession(service)
      const result = await cli(['read-history', '--session', sessionId])
      expect(result.code).toBe(5)
      expect(result.stderr).toBe(
        'omne read-history: history incomplete after 0 entries: page 1 had no trusted answer\n' +
          'omne read-history: result uncertain\n',
      )
    })

    it('exits 1 when the server says there is more but gives no cursor', async () => {
      const service = await serve(
        historyService([], () => ({
          outcome: 'succeeded',
          body: { entries: [], next: null, exhausted: false, scannedThrough: '0' },
        })),
      )
      await loginOwningSession(service)
      const result = await cli(['read-history', '--session', sessionId])
      expect(result.code).toBe(1)
      expect(result.stderr).toContain('has no cursor but is not the last')
    })

    it('exits 1 and stops when a page repeats the cursor it was asked with', async () => {
      const service = await serve(
        historyService([], () => ({
          outcome: 'succeeded',
          body: { entries: [], next: 'same', exhausted: false, scannedThrough: '0' },
        })),
      )
      await loginOwningSession(service)
      const result = await cli(['read-history', '--session', sessionId])
      expect(result.code).toBe(1)
      expect(result.stderr).toContain('did not advance the cursor')
      expect(reads(service)).toHaveLength(2)
    })

    it('exits 1 when standard output cannot be written', async () => {
      const service = await serve(historyService([page(all, null)]))
      await loginOwningSession(service)
      const result = await cli(['read-history', '--session', sessionId], { failStdout: true })
      expect(result.code).toBe(1)
      expect(result.stderr).toBe('omne read-history: cannot write standard output\n')
    })
  })
})
