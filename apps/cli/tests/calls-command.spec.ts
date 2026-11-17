import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeSessionOwners } from '@omne-harness/cli'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closedPort,
  defaultAnswer,
  sessionId,
  startFakeService,
  tenantText,
  type Answer,
  type FakeService,
  type Seen,
} from './support/fake-service.ts'
import { commandUnrecognized, notLoggedIn } from './support/expected.ts'
import { runInProcess } from './support/in-process.ts'

const REFERENCE = 'tool-invocation:v1:call-9:admit-9'
const call = {
  phase: 'running',
  relation: 'background',
  result: null,
  terminal: null,
  effect: 'unknown',
  controls: [],
}

let root: string
let state: string
const services: FakeService[] = []
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-calls-')))
  state = join(root, 'state')
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

async function serve(answer: (seen: Seen) => Answer | undefined = () => undefined) {
  const service = await startFakeService(seen => answer(seen) ?? defaultAnswer(seen))
  services.push(service)
  const login = await runInProcess(
    ['login', '--login-identifier', 'alice', '--server', service.origin],
    { omneHome: state, homeDirectory: join(root, 'home') },
  )
  expect(login.code).toBe(0)
  return service
}

const cli = (argv: readonly string[]) =>
  runInProcess(['calls', ...argv], { omneHome: state, homeDirectory: join(root, 'home') })

const last = (service: FakeService) => service.seen.at(-1)
const parsed = (text: string) => JSON.parse(text) as Record<string, unknown>
const owned = ['--session', sessionId, '--tenant', tenantText]

describe('calls list, stop and background speak session/v1 for the owner tenant', () => {
  const listed = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    producer: { kind: 'tool', call: `${REFERENCE}-${id}` },
    label: {
      intent: 'build the front end',
      tool: 'Shell',
      command: 'execute',
      preview: 'pnpm build',
    },
    source: 'threshold',
    status: 'running',
    lastLine: 'done 3/7',
    ...extra,
  })

  it('list reads the background calls of the session; --json gives the whole answer', async () => {
    const calls = [listed('b1')]
    const service = await serve(seen =>
      seen.operation === 'list-background-calls'
        ? { outcome: 'succeeded', body: { calls } }
        : undefined,
    )
    const result = await cli(['list', ...owned, '--json'])
    expect(last(service)).toMatchObject({
      path: '/api/session/v1/list-background-calls',
      body: { tenant: tenantText, session: sessionId },
    })
    expect(result.code).toBe(0)
    expect(parsed(result.stdout)).toMatchObject({ outcome: 'succeeded', body: { calls } })
  })

  it('list shows one line per call: short number, state, intent, action and last line (C25)', async () => {
    const calls = [
      listed('b1'),
      listed('b3', {
        status: 'unknown',
        lastLine: null,
        label: { intent: null, tool: 'Shell', command: 'execute', preview: '' },
      }),
    ]
    await serve(seen =>
      seen.operation === 'list-background-calls'
        ? { outcome: 'succeeded', body: { calls } }
        : undefined,
    )
    expect(await cli(['list', ...owned])).toMatchObject({
      code: 0,
      stdout:
        'b1  running  build the front end  Shell execute · pnpm build  | done 3/7\n' +
        'b3  unknown  (no intent)  Shell execute\n',
    })
    await serve(seen =>
      seen.operation === 'list-background-calls'
        ? { outcome: 'succeeded', body: { calls: [] } }
        : undefined,
    )
    expect((await cli(['list', ...owned])).stdout).toBe('No calls in the background.\n')
  })

  it('stop and output take a short number of the session and resolve it by the list', async () => {
    const service = await serve(seen => {
      if (seen.operation === 'list-background-calls')
        return { outcome: 'succeeded', body: { calls: [listed('b1'), listed('b2')] } }
      if (seen.operation === 'stop-call')
        return {
          outcome: 'succeeded',
          body: { kind: 'requested', controlId: 'ctl', producer: seen.body['producer'] },
        }
      if (seen.operation === 'read-call')
        return { outcome: 'succeeded', body: { call: { ...call, result: null } } }
      if (seen.operation === 'read-call-output')
        return { outcome: 'succeeded', body: { kind: 'none' } }
      return undefined
    })
    expect((await cli(['stop', ...owned, '--call', 'b2', '--control-id', 'ctl'])).code).toBe(0)
    expect(last(service)).toMatchObject({
      path: '/api/session/v1/stop-call',
      body: { producer: { kind: 'tool', call: `${REFERENCE}-b2` } },
    })
    expect((await cli(['output', ...owned, '--call', 'b1'])).code).toBe(0)
    expect(last(service)).toMatchObject({
      path: '/api/tool/v1/read-call-output',
      body: { reference: `${REFERENCE}-b1` },
    })
    expect(await cli(['stop', ...owned, '--call', 'b9'])).toMatchObject({
      code: 3,
      stderr: expect.stringContaining('no call b9 is in the background of this session'),
    })
  })

  it.each([
    ['stop', 'stop-call'],
    ['background', 'background-call'],
  ])(
    '%s sends a control of the tool call under the given control id',
    async (action, operation) => {
      const service = await serve(seen =>
        seen.operation === 'background-call'
          ? {
              outcome: 'succeeded',
              body: { kind: 'requested', controlId: 'ctl', producer: seen.body['producer'] },
            }
          : undefined,
      )
      const result = await cli([action, ...owned, '--call', REFERENCE, '--control-id', 'ctl'])
      expect(last(service)).toMatchObject({
        path: `/api/session/v1/${operation}`,
        body: {
          tenant: tenantText,
          session: sessionId,
          controlId: 'ctl',
          producer: { kind: 'tool', call: REFERENCE },
        },
      })
      expect(result.code).toBe(0)
      expect(parsed(result.stdout)).toMatchObject({
        outcome: 'succeeded',
        body: { kind: 'requested' },
        request: { controlId: 'ctl', tenant: tenantText },
      })
    },
  )
})

describe('calls show reads tool/v1 and never shows an accepted stop as stopped', () => {
  const showing = (value: unknown) => (seen: Seen) =>
    seen.operation === 'read-call' ? { outcome: 'succeeded', body: { call: value } } : undefined

  it('prints the phase, the end, the result, the effect and each control in words', async () => {
    const service = await serve(
      showing({
        ...call,
        phase: 'settled',
        result: 'v1',
        terminal: { kind: 'interrupted', detail: 'control' },
        effect: 'occurred',
        controls: [
          { operation: 'op-1', intent: 'stop', progress: 'accepted' },
          { operation: 'op-2', intent: 'stop', progress: 'stopped' },
          { operation: 'op-3', intent: 'stop', progress: 'unknown' },
          { operation: 'op-4', intent: 'background', progress: 'relation-changed' },
        ],
      }),
    )
    const result = await cli(['show', '--call', REFERENCE])
    expect(last(service)).toMatchObject({
      path: '/api/tool/v1/read-call',
      body: { tenant: tenantText, reference: REFERENCE },
    })
    expect(result).toMatchObject({ code: 0, stderr: '' })
    expect(result.stdout).toBe(
      [
        'Call: settled, background',
        'End: interrupted (control)',
        'Result: v1',
        'Effect: occurred',
        'Control op-1: stop accepted',
        'Control op-2: stopped',
        'Control op-3: unknown',
        'Control op-4: background relation changed',
        '',
      ].join('\n'),
    )
  })

  it('prints the whole answer with --json and the outcome alone when the read is refused', async () => {
    await serve(showing(call))
    const json = await cli(['show', '--call', REFERENCE, '--json'])
    expect(parsed(json.stdout)).toMatchObject({ outcome: 'succeeded', body: { call } })
    const refused = await serve(seen =>
      seen.operation === 'read-call' ? { outcome: 'denied', body: {} } : undefined,
    )
    const denied = await cli(['show', '--call', REFERENCE, '--server', refused.origin])
    expect(denied).toMatchObject({ code: 3, stdout: 'Result: denied\n' })
  })
})

describe('calls output reads the result of the call page by page', () => {
  it('takes the result version from the call and prints the text of every page', async () => {
    const page = (content: unknown[], next: string | null) => ({
      result: 'v1',
      terminal: { kind: 'completed', detail: null },
      effect: 'occurred',
      content,
      next,
    })
    const text = (value: string) => ({
      kind: 'text',
      id: 'b',
      text: value,
      visibility: { toHuman: true, toModel: true },
    })
    const service = await serve(seen => {
      if (seen.operation === 'read-call')
        return { outcome: 'succeeded', body: { call: { ...call, phase: 'settled', result: 'v1' } } }
      if (seen.operation !== 'read-call-result') return undefined
      return {
        outcome: 'succeeded',
        body:
          seen.body['cursor'] === null
            ? page([text('first\n'), { kind: 'image', id: 'i' }], 'p2')
            : page([text('second\n')], null),
      }
    })
    const result = await cli(['output', '--call', REFERENCE])
    expect(result).toMatchObject({ code: 0, stdout: 'first\n[image block]\nsecond\n' })
    expect(
      service.seen.filter(seen => seen.operation === 'read-call-result').map(seen => seen.body),
    ).toEqual([
      { tenant: tenantText, reference: REFERENCE, result: 'v1', cursor: null },
      { tenant: tenantText, reference: REFERENCE, result: 'v1', cursor: 'p2' },
    ])
  })

  it('prints what it read before a page is refused and says on stderr where it stopped', async () => {
    await serve(seen => {
      if (seen.operation !== 'read-call-result') return undefined
      return seen.body['cursor'] === null
        ? {
            outcome: 'succeeded',
            body: {
              result: 'v1',
              terminal: { kind: 'completed', detail: null },
              effect: 'occurred',
              content: [
                {
                  kind: 'text',
                  id: 'b',
                  text: 'first\n',
                  visibility: { toHuman: true, toModel: true },
                },
              ],
              next: 'p2',
            },
          }
        : { outcome: 'denied', body: {} }
    })
    const result = await cli(['output', '--call', REFERENCE, '--result', 'v1'])
    expect(result).toMatchObject({
      code: 3,
      stdout: 'first\n',
      stderr: 'omne calls output: output incomplete: page 2 was answered denied\n',
    })
  })

  it('reads the output body of a call that has not ended, and where to read on (C13)', async () => {
    const part = { kind: 'open', from: '0', through: '11', total: '11', text: 'hello world' }
    const service = await serve(seen => {
      if (seen.operation === 'read-call') return { outcome: 'succeeded', body: { call } }
      if (seen.operation === 'read-call-output') return { outcome: 'succeeded', body: part }
      return undefined
    })
    const result = await cli(['output', '--call', REFERENCE])
    expect(result).toMatchObject({
      code: 0,
      stdout: 'hello world',
      stderr: 'omne calls output: open output; read on with --after 11\n',
    })
    expect(service.seen.some(seen => seen.operation === 'read-call-result')).toBe(false)
    const next = await cli(['output', '--call', REFERENCE, '--after', '11'])
    expect(next.code).toBe(0)
    expect(
      service.seen.filter(seen => seen.operation === 'read-call-output').map(seen => seen.body),
    ).toEqual([
      { tenant: tenantText, reference: REFERENCE, after: null },
      { tenant: tenantText, reference: REFERENCE, after: '11' },
    ])
  })

  it('says so when the call has no output body', async () => {
    await serve(seen => {
      if (seen.operation === 'read-call') return { outcome: 'succeeded', body: { call } }
      if (seen.operation === 'read-call-output')
        return { outcome: 'succeeded', body: { kind: 'none' } }
      return undefined
    })
    const result = await cli(['output', '--call', REFERENCE])
    expect(result).toMatchObject({ code: 0, stdout: '' })
    expect(result.stderr).toContain('has no output body')
  })
})

describe('calls show and output, the edges', () => {
  const page = (content: unknown[], next: string | null) => ({
    outcome: 'succeeded',
    body: {
      result: 'v1',
      terminal: { kind: 'completed', detail: null },
      effect: 'occurred',
      content,
      next,
    },
  })

  it('shows a running call without an end or a result, and an end without detail', async () => {
    await serve(seen =>
      seen.operation === 'read-call'
        ? { outcome: 'succeeded', body: { call: { ...call, controls: [] } } }
        : undefined,
    )
    expect((await cli(['show', '--call', REFERENCE])).stdout).toBe(
      'Call: running, background\nEffect: unknown\n',
    )
    await serve(seen =>
      seen.operation === 'read-call'
        ? {
            outcome: 'succeeded',
            body: {
              call: { ...call, phase: 'settled', terminal: { kind: 'completed', detail: null } },
            },
          }
        : undefined,
    )
    const ended = await cli(['show', '--call', REFERENCE, '--tenant', tenantText])
    expect(ended.stdout).toBe('Call: settled, background\nEnd: completed\nEffect: unknown\n')
  })

  it('names a block that is not text even when it carries text, and stops on a cursor that does not move', async () => {
    await serve(seen =>
      seen.operation === 'read-call-result'
        ? page([{ kind: 'thinking', id: 't', text: 'hidden' }], 'same')
        : undefined,
    )
    const result = await cli(['output', '--call', REFERENCE, '--result', 'v1'])
    expect(result).toMatchObject({
      code: 1,
      stdout: '[thinking block]\n[thinking block]\n',
      stderr: 'omne calls output: output incomplete: page 2 did not advance the cursor\n',
    })
  })

  it('says a page was not sent when the server cannot be reached', async () => {
    await serve()
    const port = await closedPort()
    const result = await cli([
      'output',
      '--call',
      REFERENCE,
      '--result',
      'v1',
      '--server',
      `http://127.0.0.1:${port}`,
    ])
    expect(result).toMatchObject({
      code: 4,
      stdout: '',
      stderr:
        'omne calls output: output incomplete: page 1 was not sent: the service is unavailable\n',
    })
  })

  it('reads the call of a session for the owner tenant of that session', async () => {
    const service = await serve(seen =>
      seen.operation === 'read-call' ? { outcome: 'succeeded', body: { call } } : undefined,
    )
    writeSessionOwners(state, new Map([[sessionId, tenantText]]))
    const shown = await cli(['show', '--call', REFERENCE, '--session', sessionId, '--json'])
    expect(shown.code).toBe(0)
    expect(last(service)?.body).toEqual({ tenant: tenantText, reference: REFERENCE })
  })
})

describe('calls show and output, the answers that are not a success', () => {
  it('show says unavailable when the server cannot be reached, and a refused read with its outcome', async () => {
    await serve()
    const port = await closedPort()
    const away = await cli(['show', '--call', REFERENCE, '--server', `http://127.0.0.1:${port}`])
    expect(away).toMatchObject({ code: 4, stdout: 'Result: unavailable\n', stderr: '' })
    await serve(seen =>
      seen.operation === 'read-call' ? { outcome: 'unknown', body: {} } : undefined,
    )
    const unknown = await cli(['show', '--call', REFERENCE])
    expect(unknown.code).toBe(5)
    expect(unknown.stderr).toBe('omne calls show: result uncertain\n')
  })

  it('output says why it read nothing when the call read is refused, and when a page has no trusted answer', async () => {
    await serve(seen => {
      if (seen.operation === 'read-call') return { outcome: 'denied', body: {} }
      if (seen.operation === 'read-call-result') return { outcome: 'unknown', body: {} }
      return undefined
    })
    expect(await cli(['output', '--call', REFERENCE, '--tenant', tenantText])).toMatchObject({
      code: 3,
      stdout: '',
      stderr: 'omne calls output: output incomplete: the call read was answered denied\n',
    })
    const paged = await cli(['output', '--call', REFERENCE, '--result', 'v1'])
    expect(paged.code).toBe(5)
    expect(paged.stderr).toBe(
      'omne calls output: output incomplete: page 1 had no trusted answer\nomne calls output: result uncertain\n',
    )
  })

  it('output reads the call of a session for its owner tenant, and names a text block without text', async () => {
    const service = await serve(seen =>
      seen.operation === 'read-call-result'
        ? {
            outcome: 'succeeded',
            body: {
              result: 'v1',
              terminal: { kind: 'completed', detail: null },
              effect: 'occurred',
              content: [{ kind: 'text', id: 't' }],
              next: null,
            },
          }
        : undefined,
    )
    writeSessionOwners(state, new Map([[sessionId, tenantText]]))
    const read = await cli([
      'output',
      '--call',
      REFERENCE,
      '--result',
      'v1',
      '--session',
      sessionId,
    ])
    expect(read).toMatchObject({ code: 0, stdout: '[text block]\n' })
    expect(last(service)?.body).toMatchObject({ tenant: tenantText, result: 'v1' })
  })
})

describe('usage', () => {
  it('refuses an unknown action, and an action without its required option', async () => {
    const service = await serve()
    const before = service.seen.length
    expect(await cli(['restart', '--call', REFERENCE])).toMatchObject({
      code: 2,
      stderr: commandUnrecognized('calls'),
    })
    expect((await cli(['show'])).stderr).toContain('missing --call')
    expect((await cli(['output'])).stderr).toContain('missing --call')
    expect((await cli(['list'])).stderr).toContain('missing --session')
    expect((await cli(['stop', '--call', REFERENCE])).stderr).toContain('missing --session')
    expect((await cli(['background', '--call', REFERENCE])).stderr).toContain('missing --session')
    expect(service.seen).toHaveLength(before)
  })

  it('refuses an option of another action, an unknown option and a tenant that does not parse', async () => {
    const service = await serve()
    const before = service.seen.length
    for (const argv of [
      ['show', '--call', REFERENCE, '--bogus', 'x'],
      ['show', '--call', REFERENCE, '--tenant', 'not-a-tenant'],
    ])
      expect(await cli(argv)).toMatchObject({
        code: 2,
        stderr: commandUnrecognized(`calls ${argv[0]}`),
      })
    expect(service.seen).toHaveLength(before)
  })

  it('refuses a call the protocol cannot carry, before anything is sent', async () => {
    const service = await serve()
    const before = service.seen.length
    for (const argv of [
      ['show', '--call', ''],
      ['output', '--call', ''],
      ['output', '--call', REFERENCE, '--result', ''],
      ['list', '--session', '', '--tenant', tenantText],
      ['stop', ...owned, '--call', ''],
    ])
      expect(await cli(argv)).toMatchObject({
        code: 2,
        stderr: commandUnrecognized(`calls ${argv[0]}`),
      })
    expect(service.seen).toHaveLength(before)
  })

  it('needs a login, and the owner tenant of a session it does not know', async () => {
    const fresh = await runInProcess(['calls', 'show', '--call', REFERENCE], {
      omneHome: join(root, 'nobody'),
      homeDirectory: join(root, 'home'),
    })
    expect(fresh).toMatchObject({ code: 1, stderr: notLoggedIn })
    await serve()
    const unknown = await cli(['list', '--session', 'f'.repeat(64)])
    expect(unknown).toMatchObject({
      code: 2,
      stderr:
        'omne calls list: the owner tenant of this session is unknown\nAdd --tenant <tenant>.\n',
    })
  })
})
