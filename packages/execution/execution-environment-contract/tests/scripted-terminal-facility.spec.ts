import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  originRef,
  type FacilityResult,
  type ProcessHandle,
  type TerminalFacility,
} from '@omne-harness/execution-environment-contract'
import {
  createScriptedTerminalFacility,
  type ScriptedTerminalAnswer,
} from '@omne-harness/execution-environment-contract/testing'

const parsed = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_0123456789abcdefghjkmnpqrs',
    account: 'acc_0123456789abcdefghjkmnpqrs',
  }),
)
if (!parsed.ok) throw new Error('invalid tenant fixture')
const tenant = parsed.value
let sequence = 0
function request() {
  return {
    requestId: `terminal-${++sequence}`,
    access: { principal: 'test', tenant },
    origin: originRef('terminal-origin'),
    binding: { kind: 'host_machine' } as const,
  }
}
function value<T>(answer: FacilityResult<T>): T {
  if (answer.kind !== 'done') throw new Error(`expected done, got ${answer.kind}`)
  return answer.value
}
async function create(facility: TerminalFacility<unknown>) {
  return value(await facility.create({ ...request(), cwd: 'base', env: { BASE: '1' } })).terminal
}
const pending = Symbol('pending')
async function observation<T>(promise: Promise<T>) {
  return Promise.race([
    promise,
    new Promise<typeof pending>(resolve => setImmediate(resolve, pending)),
  ])
}
async function execute(
  facility: TerminalFacility<unknown>,
  terminal: Awaited<ReturnType<typeof create>>,
) {
  return value(await facility.execute({ ...request(), terminal, script: 'script' }))
}
async function states(facility: TerminalFacility<unknown>) {
  return value(await facility.list(request())).map(item => item.state)
}

it('creates, executes, lists and closes only its acquired terminals', async () => {
  const scripted = createScriptedTerminalFacility(() => ({ kind: 'started' }))
  expect(scripted.durability).toBe('none')
  const terminal = await create(scripted.facility)
  expect(value(await scripted.facility.list(request()))).toEqual([
    { terminal, state: 'idle', observedCwd: 'base' },
  ])
  const process = value(
    await scripted.facility.execute({ ...request(), terminal, script: 'echo ok' }),
  )
  expect(await process.result).toMatchObject({ kind: 'completed' })
  expect(value(await scripted.facility.close({ ...request(), terminal }))).toEqual({
    status: 'confirmed',
  })
  expect(value(await scripted.facility.list(request()))).toEqual([
    { terminal, state: 'closed', observedCwd: 'base' },
  ])
})

it('rejects foreign, wrong-generation and closed references without invoking the script', async () => {
  const first = createScriptedTerminalFacility(() => ({ kind: 'started' }))
  const second = createScriptedTerminalFacility(() => ({ kind: 'started' }))
  const terminal = await create(first.facility)
  const own = await create(second.facility)
  expect(own).not.toEqual(terminal)
  const foreign = await second.facility.execute({ ...request(), terminal, script: 'foreign' })
  expect(foreign).toMatchObject({ kind: 'rejected', reason: 'invalidInput' })
  expect(await second.facility.close({ ...request(), terminal })).toMatchObject({
    kind: 'rejected',
    reason: 'invalidInput',
  })
  expect(
    await first.facility.execute({
      ...request(),
      terminal: { ...terminal, generation: 'stale' },
      script: 'stale',
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'invalidInput' })
  await first.facility.close({ ...request(), terminal })
  expect(await first.facility.execute({ ...request(), terminal, script: 'closed' })).toMatchObject({
    kind: 'rejected',
    reason: 'closed',
  })
  expect(first.calls).toHaveLength(0)
  expect(second.calls).toHaveLength(0)
  expect(value(await second.facility.list(request()))).toEqual([
    { terminal: own, state: 'idle', observedCwd: 'base' },
  ])
})

it('serializes one terminal before the async script answers while another executes independently', async () => {
  const answer = Promise.withResolvers<ScriptedTerminalAnswer>()
  const scripted = createScriptedTerminalFacility(req =>
    req.script === 'hold' ? answer.promise : { kind: 'started' },
  )
  const first = await create(scripted.facility)
  const second = await create(scripted.facility)
  const starting = scripted.facility.execute({ ...request(), terminal: first, script: 'hold' })
  expect(await states(scripted.facility)).toEqual(['running', 'idle'])
  expect(
    await scripted.facility.execute({ ...request(), terminal: first, script: 'duplicate' }),
  ).toMatchObject({ kind: 'rejected', reason: 'busy' })
  expect(await (await execute(scripted.facility, second)).result).toMatchObject({
    kind: 'completed',
  })
  answer.resolve({ kind: 'started', runs: 'untilStop' })
  const process = value(await starting)
  expect(await states(scripted.facility)).toEqual(['running', 'idle'])
  await process.stop('graceful')
  await process.result
  expect(await states(scripted.facility)).toEqual(['idle', 'idle'])
  expect(scripted.calls.map(call => call.script)).toEqual(['hold', 'script'])
})

it('delivers terminal bytes with offsets, a single reader and a stable final outcome', async () => {
  const bytes = new TextEncoder().encode('中\r\n')
  const scripted = createScriptedTerminalFacility(() => ({
    kind: 'started',
    output: [
      { stream: 'terminal', data: bytes },
      { stream: 'terminal', data: 'x' },
    ],
  }))
  const process = await execute(scripted.facility, await create(scripted.facility))
  bytes[0] = 0
  expect(process.outputMode).toBe('terminal')
  const reader = process.output[Symbol.asyncIterator]()
  expect(() => process.output[Symbol.asyncIterator]()).toThrow(TypeError)
  expect(await reader.next()).toEqual({
    done: false,
    value: {
      stream: 'terminal',
      data: new TextEncoder().encode('中\r\n'),
      observedOffset: 0,
    },
  })
  expect(await reader.next()).toEqual({
    done: false,
    value: {
      stream: 'terminal',
      data: new TextEncoder().encode('x'),
      observedOffset: 5,
    },
  })
  expect(await reader.next()).toMatchObject({ done: true })
  expect(await Promise.all([process.result, process.result])).toEqual([
    await process.result,
    await process.result,
  ])
  expect(await process.result).toMatchObject({
    output: { mode: 'terminal', terminal: { observedBytes: 6, discardedBytes: 0 } },
  })
})

it('keeps an unconfirmed stop pending and permits a later explicit exit observation', async () => {
  const scripted = createScriptedTerminalFacility(() => ({
    kind: 'started',
    runs: 'untilStop',
    stop: 'unconfirmed',
  }))
  const terminal = await create(scripted.facility)
  const process = await execute(scripted.facility, terminal)
  const reader = process.output[Symbol.asyncIterator]()
  const next = reader.next()
  expect(await process.stop('forced')).toBe('unconfirmed')
  expect(await observation(process.result)).toBe(pending)
  expect(await observation(next)).toBe(pending)
  expect(await states(scripted.facility)).toEqual(['running'])
  expect(scripted.stops).toEqual([
    { process: process.process, mode: 'forced', answer: 'unconfirmed' },
  ])
  await scripted.finish(terminal)
  expect(await process.result).toMatchObject({ exit: { kind: 'code', code: 0 } })
  expect(await next).toMatchObject({ done: true })
  expect(await states(scripted.facility)).toEqual(['idle'])
})

it('ends only the targeted execution on a confirmed stop and leaves a reusable terminal', async () => {
  const scripted = createScriptedTerminalFacility(() => ({ kind: 'started', runs: 'untilStop' }))
  const terminal = await create(scripted.facility)
  const other = await create(scripted.facility)
  const process = await execute(scripted.facility, terminal)
  const independent = await execute(scripted.facility, other)
  expect(await process.stop('graceful')).toBe('confirmed')
  expect(await process.result).toMatchObject({ exit: { kind: 'signal', signal: 'SIGTERM' } })
  expect(await observation(independent.result)).toBe(pending)
  const again = await execute(scripted.facility, terminal)
  expect(again.process).not.toEqual(process.process)
  await again.stop('forced')
  expect(await again.result).toMatchObject({ exit: { kind: 'signal', signal: 'SIGKILL' } })
  const afterExit = independent.result.then(() =>
    scripted.facility.execute({
      ...request(),
      terminal: other,
      script: 'during-close',
    }),
  )
  const closing = scripted.facility.close({ ...request(), terminal: other })
  expect(await afterExit).toMatchObject({ kind: 'rejected' })
  expect(value(await closing)).toEqual({ status: 'confirmed' })
})

it('retains explicit cwd observations while request cwd and env overrides leave the base unchanged', async () => {
  const bases: { observedCwd: string; env: Readonly<Record<string, string>> }[] = []
  const scripted = createScriptedTerminalFacility((req, base) => {
    bases.push(base)
    return req.script === 'cd' ? { kind: 'started', observedCwd: 'changed' } : { kind: 'started' }
  })
  const terminal = await create(scripted.facility)
  const overridden = {
    ...request(),
    terminal,
    script: 'override',
    cwd: 'once',
    env: { ONCE: '2' },
    stdin: new Uint8Array([9]),
  }
  await value(await scripted.facility.execute(overridden)).result
  expect(value(await scripted.facility.list(request()))[0]?.observedCwd).toBe('base')
  await value(await scripted.facility.execute({ ...request(), terminal, script: 'cd' })).result
  await (
    await execute(scripted.facility, terminal)
  ).result
  expect(bases).toEqual([
    { observedCwd: 'base', env: { BASE: '1' } },
    { observedCwd: 'base', env: { BASE: '1' } },
    { observedCwd: 'changed', env: { BASE: '1' } },
  ])
  expect(scripted.calls[0]).toBe(overridden)
  expect(scripted.calls[0]?.stdin).toEqual(new Uint8Array([9]))
  expect(value(await scripted.facility.list(request()))[0]?.observedCwd).toBe('changed')
})

it('does not replay an unknown start and allows a new request after a known rejection', async () => {
  const scripted = createScriptedTerminalFacility(req =>
    req.script === 'unknown' ? { kind: 'unknown' } : { kind: 'rejected', reason: 'unavailable' },
  )
  const unknown = await create(scripted.facility)
  const rejected = await create(scripted.facility)
  expect(
    await scripted.facility.execute({ ...request(), terminal: unknown, script: 'unknown' }),
  ).toMatchObject({ kind: 'unknown' })
  expect(
    await scripted.facility.execute({ ...request(), terminal: unknown, script: 'retry' }),
  ).toMatchObject({ kind: 'rejected', reason: 'invalidInput' })
  for (let n = 0; n < 2; n++)
    expect(
      await scripted.facility.execute({ ...request(), terminal: rejected, script: 'reject' }),
    ).toMatchObject({ kind: 'rejected', reason: 'unavailable' })
  expect(await states(scripted.facility)).toEqual(['invalid', 'idle'])
  expect(scripted.calls).toHaveLength(3)
  expect(value(await scripted.facility.close({ ...request(), terminal: unknown }))).toEqual({
    status: 'unconfirmed',
  })
})

it('preserves invalid and closed states after late process completion and acquisition closure', async () => {
  const scripted = createScriptedTerminalFacility(() => ({
    kind: 'started',
    runs: 'untilStop',
    stop: 'unconfirmed',
    observedCwd: 'late',
  }))
  const terminal = await create(scripted.facility)
  const process = await execute(scripted.facility, terminal)
  expect(value(await scripted.facility.close({ ...request(), terminal }))).toEqual({
    status: 'unconfirmed',
  })
  expect(await states(scripted.facility)).toEqual(['invalid'])
  await scripted.finish(terminal)
  expect(await states(scripted.facility)).toEqual(['invalid'])
  expect(value(await scripted.facility.close({ ...request(), terminal }))).toEqual({
    status: 'confirmed',
  })
  scripted.invalidate(terminal)
  expect(await states(scripted.facility)).toEqual(['closed'])
  scripted.close()
  expect(await scripted.facility.create({ ...request(), cwd: '.', env: {} })).toMatchObject({
    kind: 'rejected',
    reason: 'closed',
  })
  expect(await scripted.facility.list(request())).toMatchObject({
    kind: 'rejected',
    reason: 'closed',
  })
  expect(await scripted.facility.close({ ...request(), terminal })).toMatchObject({
    kind: 'rejected',
    reason: 'closed',
  })
  expect(await scripted.facility.execute({ ...request(), terminal, script: 'late' })).toMatchObject(
    { kind: 'rejected', reason: 'closed' },
  )
  expect(await process.result).toMatchObject({ kind: 'completed' })
  expect(scripted.calls).toHaveLength(1)
})

it('keeps a failed control observation invalid and refuses malformed scripted streams', async () => {
  const scripted = createScriptedTerminalFacility(() => ({
    kind: 'started',
    observedCwd: 'unconfirmed',
    outcome: {
      kind: 'failed',
      reason: 'effectUnknown',
      observedDurationMs: 1,
      output: { mode: 'terminal', terminal: { observedBytes: 0, discardedBytes: 0 } },
    },
  }))
  const terminal = await create(scripted.facility)
  await (
    await execute(scripted.facility, terminal)
  ).result
  expect(value(await scripted.facility.list(request()))).toEqual([
    { terminal, state: 'invalid', observedCwd: 'base' },
  ])
  const malformed = createScriptedTerminalFacility(() => ({
    kind: 'started',
    output: [{ stream: 'stdout', data: 'bad' }],
  }))
  await expect(execute(malformed.facility, await create(malformed.facility))).rejects.toThrow(
    TypeError,
  )
})

it('gives up the sole output reader without ending the execution', async () => {
  const scripted = createScriptedTerminalFacility(() => ({ kind: 'started', runs: 'untilStop' }))
  const terminal = await create(scripted.facility)
  const process: ProcessHandle = await execute(scripted.facility, terminal)
  const reader = process.output[Symbol.asyncIterator]()
  const next = reader.next()
  await reader.return?.()
  expect(await next).toMatchObject({ done: true })
  expect(await observation(process.result)).toBe(pending)
  await process.stop('forced')
})
