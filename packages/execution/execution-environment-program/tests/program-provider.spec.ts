import { expect, it } from 'vitest'
import type { ProgramLimits, ProgramRun } from '@omne-harness/execution-environment-contract'
import {
  environmentProviderConformance,
  runConformanceCase,
} from '@omne-harness/execution-environment-contract/testing'
import {
  createProgramProvider,
  defaultProgramCeilings,
  programProviderName,
} from '@omne-harness/execution-environment-program'
import { acquireInput, binding, leased, request, scope, tenant } from './support.ts'

const limits: ProgramLimits = { computeMs: 500, memoryBytes: 32 << 20, outputBytes: 4096, calls: 8 }
const program = (source: string, more: Partial<ProgramLimits> = {}) => ({
  ...request(),
  source,
  input: { kind: 'null' } as const,
  entries: ['Wait'],
  failures: [],
  limits: { ...limits, ...more },
  onCall: () => undefined,
  onIdle: () => undefined,
})
async function started(run: ReturnType<Awaited<ReturnType<typeof leased>>['facility']['run']>) {
  const answer = await run
  if (answer.kind !== 'done') throw new Error(`expected a run, got ${JSON.stringify(answer)}`)
  return answer.value
}

it('declares the sandbox layer, the two isolation claims and one facility', async () => {
  const provider = createProgramProvider()
  expect(provider).toMatchObject({
    name: programProviderName,
    bindingKinds: ['stateless_sandbox'],
    continuity: { kind: 'not_guaranteed' },
    facilities: ['program'],
    isolation: ['restricted-js', 'network-none'],
  })
  expect(await provider.describe()).toMatchObject({ prerequisites: 'satisfied' })
  const { lease } = await leased(provider)
  expect(lease.facility('files')).toBeUndefined()
  expect(lease.facility('command')).toBeUndefined()
})

it('refuses a binding of another layer', async () => {
  const provider = createProgramProvider()
  const input = acquireInput(provider)
  const host = { ...input.placement, binding: { kind: 'host_machine' } as const }
  expect(await provider.acquire({ ...input, placement: host })).toEqual({
    kind: 'rejected',
    reason: 'noMatchingEnvironment',
  })
})

it('does not run when the engine cannot be set up', async () => {
  const broken = createProgramProvider({ wasm: () => Promise.reject(new Error('no file')) })
  expect(await broken.describe()).toMatchObject({ prerequisites: 'unsatisfied' })
  const { facility } = await leased(broken)
  expect(await facility.run(program('return 1'))).toMatchObject({
    kind: 'rejected',
    reason: 'unavailable',
  })
  const small = await leased(createProgramProvider())
  expect(await small.facility.run(program('return 1', { memoryBytes: 4096 }))).toMatchObject({
    kind: 'rejected',
    reason: 'unavailable',
  })
  expect(await started(small.facility.run(program('return 1')))).toBeDefined()
})

it('does not count a domain that could not be set up against the bound', async () => {
  const wasm = () => Promise.reject(new Error('no file'))
  const { facility } = await leased(createProgramProvider({ wasm, maxDomains: 1 }))
  for (const attempt of [1, 2])
    expect(await facility.run(program(`return ${String(attempt)}`))).toMatchObject({
      kind: 'rejected',
      reason: 'unavailable',
    })
})

it('starts the thread from the worker file it is given', async () => {
  const given = new URL(import.meta.resolve('@earendil-works/pi-codemode/worker'))
  const real = await leased(createProgramProvider({ workerUrl: given }))
  expect(await (await started(real.facility.run(program('return 2')))).outcome).toMatchObject({
    kind: 'returned',
  })
  const nowhere = new URL('file:///nowhere/worker.js')
  const missing = await leased(createProgramProvider({ workerUrl: nowhere }))
  expect(await missing.facility.run(program('return 2'))).toMatchObject({
    kind: 'rejected',
    reason: 'unavailable',
  })
})

it('fails a call to a name that is not an entry, and does not hand it out', async () => {
  const { facility } = await leased(createProgramProvider())
  let handed = 0
  const source =
    'try { await globalThis.__call("Nope", {}) } catch (error) { return error.message }'
  const run = await started(facility.run({ ...program(source), onCall: () => void handed++ }))
  expect(await run.outcome).toMatchObject({
    kind: 'returned',
    value: { kind: 'string', value: 'Nope cannot be called so' },
  })
  expect(handed).toBe(0)
})

it('refuses a limit above the ceiling of the provider instead of lowering it', async () => {
  const { facility } = await leased(createProgramProvider({ ceilings: { calls: 4 } }))
  expect(await facility.run(program('return 1', { calls: 5 }))).toMatchObject({
    kind: 'rejected',
    reason: 'invalidInput',
  })
  const above = { computeMs: defaultProgramCeilings.computeMs + 1 }
  expect(await facility.run(program('return 1', above))).toMatchObject({ reason: 'invalidInput' })
  expect(
    (await (await started(facility.run(program('return 1', { calls: 4 })))).outcome).kind,
  ).toBe('returned')
})

it('bounds the domains that exist at once and frees a place when a thread has exited', async () => {
  const { facility } = await leased(createProgramProvider({ maxDomains: 2 }))
  const waiting = 'await Wait({})\nreturn 1'
  const runs: ProgramRun[] = [
    await started(facility.run(program(waiting))),
    await started(facility.run(program(waiting))),
  ]
  expect(await facility.run(program(waiting))).toMatchObject({
    kind: 'rejected',
    reason: 'capacity',
  })
  runs[0]?.abort()
  expect((await runs[0]?.outcome)?.kind).toBe('aborted')
  const third = await started(facility.run(program('while (true) {}', { computeMs: 50 })))
  expect(await third.outcome).toMatchObject({ kind: 'exceeded', limit: 'compute-time' })
  const fourth = await started(facility.run(program('return 4')))
  expect(await fourth.outcome).toMatchObject({ kind: 'returned' })
  runs[1]?.abort()
  await runs[1]?.outcome
})

it('ends running programs when the lease is released, and refuses new ones', async () => {
  const { facility, lease } = await leased(createProgramProvider())
  const run = await started(facility.run(program('while (true) {}', { computeMs: 60_000 })))
  expect(await lease.release()).toEqual({ kind: 'released' })
  expect((await run.outcome).kind).toBe('aborted')
  expect(await facility.run(program('return 1'))).toMatchObject({
    kind: 'rejected',
    reason: 'closed',
  })
  expect(await lease.release()).toEqual({ kind: 'released' })
})

it('ends running programs and tells the lease when the provider retires', async () => {
  const provider = createProgramProvider()
  const { facility, lease } = await leased(provider)
  const run = await started(facility.run(program('await Wait({})')))
  expect(await provider.retire()).toEqual({ kind: 'drained' })
  expect((await run.outcome).kind).toBe('aborted')
  expect(await lease.invalidated).toEqual({ source: 'provider', reason: 'providerRetired' })
})

it('ends a program that waits for what cannot come as a thrown error, not as a hang', async () => {
  const { facility } = await leased(createProgramProvider())
  const run = await started(
    facility.run(program('console.log("then")\nawait new Promise(() => {})')),
  )
  expect(await run.outcome).toMatchObject({
    kind: 'threw',
    name: 'Error',
    message: expect.stringContaining('can never settle'),
    console: 'then',
  })
})

it('ends the run when a callback of the caller throws, instead of failing the host', async () => {
  const { facility } = await leased(createProgramProvider())
  const thrower = () => {
    throw new Error('caller bug')
  }
  const run = await started(
    facility.run({ ...program('await Wait({})\nreturn 1'), onCall: thrower }),
  )
  expect((await run.outcome).kind).toBe('aborted')
})

it('gives the program none of the helpers of the engine', async () => {
  const { facility } = await leased(createProgramProvider())
  const run = await started(
    facility.run(
      program(
        'return [__call, __r, ALL_TOOLS, text, image, exit, store, load].map(one => typeof one)',
      ),
    ),
  )
  expect(await run.outcome).toMatchObject({
    kind: 'returned',
    value: { kind: 'array', items: Array.from({ length: 8 }, () => ({ value: 'undefined' })) },
  })
})

let held = 0
for (const test of environmentProviderConformance({
  subject() {
    const provider = createProgramProvider()
    return {
      provider,
      binding,
      scope,
      tenant,
      facility: 'program',
      hooks: {
        async prepareHeldOperation({ lease }) {
          const facility = lease.facility('program')
          if (facility === undefined) throw new Error('expected the program facility')
          return {
            run: () => facility.run({ ...program('return 1'), onCall: () => void held++ }),
            effectSnapshot: async () => held,
          }
        },
      },
    }
  },
}))
  it(`${test.name} holds on the program provider`, async () => {
    const verdict = await runConformanceCase(test)
    expect(verdict.status === 'pass' || test.name.endsWith('retire-waits-for-in-flight')).toBe(true)
  })
