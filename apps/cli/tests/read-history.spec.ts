import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeSessionOwners } from '@omne-harness/cli'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commandMissing, commandUnrecognized } from './support/expected.ts'
import {
  closedPort,
  defaultAnswer,
  issuedProof,
  otherTenantText,
  sessionId,
  startFakeService,
  tenantText,
  type Answer,
  type FakeService,
  type Seen,
} from './support/fake-service.ts'
import { modelCall, page as diagnosticsPage, run } from './support/diagnostics-page.ts'
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
  readonly upper: string
  readonly scannedThrough: string
}
const page = (entries: readonly unknown[], next: string | null): PageBody => ({
  entries,
  next,
  exhausted: next === null,
  upper: '0',
  scannedThrough: '0',
})

function historyService(pages: readonly PageBody[], extra?: (seen: Seen) => Answer | undefined) {
  return (seen: Seen): Answer => {
    const { body } = seen
    if (seen.operation !== 'read-history') return defaultAnswer(seen)
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
  service.seen.filter(item => item.operation === 'read-history')
const bodyOf = (seen: Seen | undefined) => (seen?.body ?? {}) as Record<string, unknown>

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

    it('asks for the prefix of a forked session with --inherited, and says whose entries follow', async () => {
      const inherited = { ...page([history.user], 'cursor-1'), from: 'source-session-0001' }
      const service = await serve(historyService([inherited, page([history.call], null)]))
      await loginOwningSession(service)
      const text = await cli(['read-history', '--session', sessionId, '--inherited'])
      expect(text.code).toBe(0)
      expect(bodyOf(reads(service)[0])).toEqual({
        tenant: tenantText,
        session: sessionId,
        cursor: null,
        direction: 'forward',
        pageBytes: '65536',
        inherited: true,
      })
      expect(bodyOf(reads(service)[1])).toEqual({
        tenant: tenantText,
        session: sessionId,
        cursor: 'cursor-1',
      })
      const lines = text.stdout.split('\n')
      expect(lines[0]).toBe('--- inherited: session source-session-0001 ---')
      expect(lines[1]).toMatch(/^#1 message\.user: /u)
      expect(lines).toContain('--- this session ---')
      expect(lines.indexOf('--- this session ---')).toBeLessThan(
        lines.findIndex(line => line.startsWith('#3 ')),
      )
      const json = await cli(['read-history', '--session', sessionId, '--inherited', '--json'])
      const printed = JSON.parse(json.stdout) as { body: { entries: Record<string, unknown>[] } }
      expect(printed.body.entries[0]).toMatchObject({ inheritedFrom: 'source-session-0001' })
      expect(printed.body.entries[1]).not.toHaveProperty('inheritedFrom')
    })

    it('prints no line about a source for a history read without --inherited', async () => {
      const service = await serve(historyService([page([history.user, history.call], null)]))
      await loginOwningSession(service)
      const text = await cli(['read-history', '--session', sessionId])
      expect(text.stdout).not.toContain('---')
      expect(bodyOf(reads(service)[0])).not.toHaveProperty('inherited')
    })

    it('uses the cursor of each page as given, and a fresh messageId for each request', async () => {
      const service = await serve(historyService(pages))
      await loginOwningSession(service)
      await cli(['read-history', '--session', sessionId])
      const ids = reads(service).map(item => item.messageId)
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
      const service = await serve(historyService(pages))
      const answer = await fetch(`${service.origin}/api/session/v1/read-history`, {
        method: 'POST',
        headers: { 'omne-message-id': 'm' },
        body: JSON.stringify({
          tenant: tenantText,
          session: sessionId,
          cursor: 'cursor-1',
          direction: 'forward',
          pageBytes: '65536',
        }),
      })
      expect(await answer.json()).toMatchObject({ outcome: 'protocol-rejected' })
    })
  })

  describe('request', () => {
    it('sends to the session protocol with the proof in the header and the owner tenant, not the selected one', async () => {
      const service = await serve(historyService([page([], null)]))
      await cli(['login', '--login-identifier', 'alice', '--server', service.origin])
      writeSessionOwners(state, new Map([[sessionId, otherTenantText]]))
      const result = await cli(['read-history', '--session', sessionId, '--json'])
      expect(result.code).toBe(0)
      const [sent] = reads(service)
      expect(sent?.path).toBe('/api/session/v1/read-history')
      expect(sent?.headers['authorization']).toBe(`Bearer ${issuedProof}`)
      expect(sent?.headers['omne-acting-tenant']).toBeUndefined()
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

    it('shows a block that is not words by its kind, its media type and its size', async () => {
      const ref = (mediaType: string, bytes: string) => ({
        storage: 'local',
        key: 'k',
        mediaType,
        bytes,
        digest: 'sha256:d',
      })
      const pictured = entry(
        '7',
        'message.user',
        message(
          'user',
          block({ kind: 'text', text: 'look' }),
          block({ kind: 'image', ref: ref('image/png', '2048'), transcript: null }),
          block({ kind: 'file', ref: ref('application/pdf', '3145728'), transcript: null }),
          block({ kind: 'voice', ref: ref('audio/wav', '512'), transcript: 'hello there' }),
          block({ kind: 'image', mediaType: 'image/png', inline: 'AAAA' }),
          block({ kind: 'hologram' }),
        ),
      )
      const service = await serve(historyService([page([pictured], null)]))
      await loginOwningSession(service)
      const result = await cli(['read-history', '--session', sessionId])
      expect(result.stdout).toBe(
        [
          '#7 message.user: look',
          '    [image image/png 2.0 KB]',
          '    [file application/pdf 3.0 MB]',
          '    [voice audio/wav 512 B] hello there',
          '    [image image/png]',
          '    [hologram]',
          '',
        ].join('\n'),
      )
    })

    it('says after a block that is not words which form of it the model read, from the session diagnostics', async () => {
      const ref = (mediaType: string) => ({
        storage: 'local',
        key: 'k',
        mediaType,
        bytes: '512',
        digest: 'sha256:d',
      })
      const media = (id: string, kind: string, mediaType: string, transcript: string | null) => ({
        ...block({ kind, ref: ref(mediaType), transcript }),
        id,
      })
      const pictured = entry('7', 'message.user', {
        message: {
          id: 'm7',
          role: 'user',
          blocks: [
            media('b1', 'image', 'image/png', null),
            media('b2', 'voice', 'audio/wav', 'hello'),
            media('b3', 'file', 'application/pdf', null),
          ],
        },
      })
      const readOf = (blockId: string, read: string) => ({ message: 'm7', block: blockId, read })
      const runOf = (position: string, ...reads: object[]) =>
        run({
          run: `run-${position}`,
          started: { position, at: { kind: 'unknown' } },
          modelCalls: [modelCall({ reads })],
        })
      const diagnosed: unknown[] = []
      const histories = historyService([page([pictured], null)])
      const service = await serve(seen => {
        if (seen.operation !== 'read-session-diagnostics') return histories(seen)
        diagnosed.push(seen.body)
        const runs = [
          runOf('20', readOf('b1', 'fitted')),
          runOf('10', readOf('b1', 'original'), readOf('b2', 'transcript')),
        ]
        return { outcome: 'succeeded', body: diagnosticsPage(runs, null) }
      })
      await loginOwningSession(service)
      const result = await cli(['read-history', '--session', sessionId])
      expect(result.stdout).toBe(
        [
          '#7 message.user: [image image/png 512 B] · model read: fitted',
          '    [voice audio/wav 512 B] hello · model read: transcript',
          '    [file application/pdf 512 B]',
          '',
        ].join('\n'),
      )
      expect(diagnosed).toHaveLength(1)
      await cli(['read-history', '--session', sessionId, '--json'])
      expect(diagnosed).toHaveLength(1)
    })

    it('reads no diagnostics for a history without blocks that are not words, and writes nothing when they cannot be read', async () => {
      const operations: string[] = []
      const histories = historyService([page([history.user], null)])
      const words = await serve(seen => {
        operations.push(seen.operation)
        return histories(seen)
      })
      await loginOwningSession(words)
      await cli(['read-history', '--session', sessionId])
      expect(operations).not.toContain('read-session-diagnostics')
    })

    it.each(['image', 'voice', 'file'])(
      'reads the diagnostics for a history whose only block that is not words is a %s, page after page',
      async kind => {
        const held = entry('7', 'message.user', {
          message: {
            id: 'm7',
            role: 'user',
            blocks: [
              block({ kind: 'text', text: 'see' }),
              {
                ...block({
                  kind,
                  ref: { storage: 'local', key: 'k', mediaType: 'x/y', bytes: '1', digest: 'd' },
                }),
                id: 'b1',
              },
            ],
          },
        })
        const pages = [
          diagnosticsPage(
            [
              run({
                run: 'r1',
                started: { position: '1', at: { kind: 'unknown' } },
                modelCalls: [modelCall({ reads: [] })],
              }),
            ],
            'cursor-1',
          ),
          diagnosticsPage(
            [
              run({
                run: 'r2',
                started: { position: '2', at: { kind: 'unknown' } },
                modelCalls: [
                  modelCall({ reads: [{ message: 'm7', block: 'b1', read: 'derived' }] }),
                ],
              }),
            ],
            null,
          ),
        ]
        const asked: unknown[] = []
        const histories = historyService([page([held], null)])
        const service = await serve(seen => {
          if (seen.operation !== 'read-session-diagnostics') return histories(seen)
          asked.push(seen.body['cursor'])
          const at = seen.body['cursor'] === null ? 0 : 1
          return { outcome: 'succeeded', body: pages[at] }
        })
        await loginOwningSession(service)
        const result = await cli(['read-history', '--session', sessionId])
        expect(asked).toEqual([null, 'cursor-1'])
        expect(result.stdout).toContain(' · model read: derived')
      },
    )

    it('writes no form when the diagnostics are refused, and the history as it is', async () => {
      const held = entry('7', 'message.user', {
        message: {
          id: 'm7',
          role: 'user',
          blocks: [{ ...block({ kind: 'image', mediaType: 'image/png' }), id: 'b1' }],
        },
      })
      const histories = historyService([page([held], null)])
      const service = await serve(seen =>
        seen.operation === 'read-session-diagnostics'
          ? { outcome: 'denied', body: {} }
          : histories(seen),
      )
      await loginOwningSession(service)
      const result = await cli(['read-history', '--session', sessionId])
      expect(result.code).toBe(0)
      expect(result.stdout).toBe('#7 message.user: [image image/png]\n')
    })

    it('shows the command of a one-slot call after the tool name, and other calls as they are', async () => {
      const call = (callId: string, name: string, args: unknown) =>
        block({ kind: 'tool_call', callId, name, arguments: args })
      const calls = entry(
        '8',
        'message.assistant',
        message(
          'assistant',
          call('c1', 'Files', { command: 'read', params: { path: 'a.ts' } }),
          call('c2', 'Shell', { command: 'info' }),
          call('c3', 'Files.read', { path: 'a.ts' }),
          call('c4', 'run', { command: 'ls', cwd: '/' }),
          call('c5', 'run', { command: 'ls', params: 'x' }),
          call('c6', 'run', { command: 'ls -la' }),
        ),
      )
      const service = await serve(historyService([page([calls], null)]))
      await loginOwningSession(service)
      const result = await cli(['read-history', '--session', sessionId])
      expect(result.code).toBe(0)
      expect(result.stdout).toBe(
        [
          '#8 message.assistant: [tool call Files read c1] {"path":"a.ts"}',
          '    [tool call Shell info c2]',
          '    [tool call Files.read c3] {"path":"a.ts"}',
          '    [tool call run c4] {"command":"ls","cwd":"/"}',
          '    [tool call run c5] {"command":"ls","params":"x"}',
          '    [tool call run c6] {"command":"ls -la"}',
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

    it('exits 4 when the service is not running, as nothing was sent', async () => {
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
      expect(result.code).toBe(4)
      expect(result.stderr).toBe(
        'omne read-history: history incomplete after 0 entries: page 1 was not sent: the service is unavailable\n',
      )
      expect(JSON.parse(result.stdout)).toMatchObject({
        result: 'unavailable',
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
          body: { entries: [], next: null, exhausted: false, upper: '0', scannedThrough: '0' },
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
          body: { entries: [], next: 'same', exhausted: false, upper: '0', scannedThrough: '0' },
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
