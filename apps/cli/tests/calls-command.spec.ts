import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  defaultAnswer,
  sessionId,
  startFakeService,
  tenantText,
  type Answer,
  type FakeService,
  type Seen,
} from './support/fake-service.ts'
import { commandUnrecognized } from './support/expected.ts'
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
  it('list reads the background calls of the session', async () => {
    const calls = [{ producer: { kind: 'tool', call: REFERENCE } }]
    const service = await serve(seen =>
      seen.operation === 'list-background-calls'
        ? { outcome: 'succeeded', body: { calls } }
        : undefined,
    )
    const result = await cli(['list', ...owned])
    expect(last(service)).toMatchObject({
      path: '/api/session/v1/list-background-calls',
      body: { tenant: tenantText, session: sessionId },
    })
    expect(result.code).toBe(0)
    expect(parsed(result.stdout)).toMatchObject({ outcome: 'succeeded', body: { calls } })
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

  it('says the call has no result yet while it runs, and reads nothing more', async () => {
    const service = await serve(seen =>
      seen.operation === 'read-call' ? { outcome: 'succeeded', body: { call } } : undefined,
    )
    const result = await cli(['output', '--call', REFERENCE])
    expect(result).toMatchObject({ code: 3, stdout: '' })
    expect(result.stderr).toContain('has no result yet')
    expect(service.seen.some(seen => seen.operation === 'read-call-result')).toBe(false)
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
    expect(await cli(['show'])).toMatchObject({ code: 2 })
    expect((await cli(['stop', '--call', REFERENCE])).stderr).toContain('missing --session')
    expect(service.seen).toHaveLength(before)
  })
})
