import assert from 'node:assert/strict'
import type {
  FacilityRequest,
  FacilityResult,
  ProcessHandle,
  TerminalFacility,
  TerminalRef,
} from '../index.ts'
import { bounded, NotApplicable, type ConformanceCase } from './case.ts'

export type TerminalConformanceAcquisition = Readonly<{
  facility: TerminalFacility<unknown>
  createRequest: Parameters<TerminalFacility<unknown>['create']>[0]
  request(): FacilityRequest<unknown>
  executeRequest(terminal: TerminalRef): Parameters<TerminalFacility<unknown>['execute']>[0]
}>
export type TerminalConformanceSubject = Readonly<{
  /** Two independent acquisitions, with legal requests for each. */
  acquisitions: readonly [TerminalConformanceAcquisition, TerminalConformanceAcquisition]
  /** A controlled leg stays running until a confirmed stop or `finish` observes exit. */
  control?: {
    start(
      acquisition: TerminalConformanceAcquisition,
      terminal: TerminalRef,
    ): Promise<ProcessHandle>
    finish(process: ProcessHandle): Promise<void>
    stopMode: 'graceful' | 'forced'
    stopAnswer: 'confirmed' | 'unconfirmed'
    closeAnswer: 'confirmed' | 'unconfirmed'
  }
  dispose?(): Promise<void>
}>
export type TerminalConformanceOptions = Readonly<{
  subject(): TerminalConformanceSubject | Promise<TerminalConformanceSubject>
  waitMs?: number
}>

function done<T>(answer: FacilityResult<T>): T {
  assert.equal(answer.kind, 'done')
  if (answer.kind !== 'done') throw new assert.AssertionError({ message: 'expected done' })
  return answer.value
}
async function create(a: TerminalConformanceAcquisition): Promise<TerminalRef> {
  return done(await a.facility.create({ ...a.createRequest, requestId: a.request().requestId }))
    .terminal
}
async function listing(a: TerminalConformanceAcquisition) {
  return done(await a.facility.list(a.request()))
}
async function execute(a: TerminalConformanceAcquisition, terminal: TerminalRef) {
  return done(await a.facility.execute(a.executeRequest(terminal)))
}
async function close(a: TerminalConformanceAcquisition, terminal: TerminalRef) {
  return done(await a.facility.close({ ...a.request(), terminal })).status
}
async function checkLifecycle({ acquisitions: [a] }: TerminalConformanceSubject): Promise<void> {
  const terminal = await create(a)
  assert.ok(
    (await listing(a)).some(item => item.terminal.id === terminal.id && item.state === 'idle'),
  )
  const handle = await execute(a, terminal)
  assert.equal(handle.outputMode, 'terminal')
  for await (const chunk of handle.output) assert.equal(chunk.stream, 'terminal')
  await handle.result
  assert.equal(await close(a, terminal), 'confirmed')
  assert.equal((await a.facility.execute(a.executeRequest(terminal))).kind, 'rejected')
  assert.ok(
    (await listing(a)).every(item => item.terminal.id !== terminal.id || item.state === 'closed'),
  )
}
async function checkOwnership({ acquisitions: [a, b] }: TerminalConformanceSubject): Promise<void> {
  const terminal = await create(a)
  const other = await create(b)
  assert.notDeepEqual(terminal, other)
  assert.equal((await b.facility.execute(b.executeRequest(terminal))).kind, 'rejected')
  assert.equal((await b.facility.close({ ...b.request(), terminal })).kind, 'rejected')
  assert.equal((await listing(a)).find(item => item.terminal.id === terminal.id)?.state, 'idle')
  await (
    await execute(a, terminal)
  ).result
  await close(a, terminal)
  await close(b, other)
}
async function checkGeneration({ acquisitions: [a] }: TerminalConformanceSubject): Promise<void> {
  const terminal = await create(a)
  const stale = { ...terminal, generation: `${terminal.generation}-stale` }
  assert.equal((await a.facility.execute(a.executeRequest(stale))).kind, 'rejected')
  assert.equal((await a.facility.close({ ...a.request(), terminal: stale })).kind, 'rejected')
  await (
    await execute(a, terminal)
  ).result
  await close(a, terminal)
}
async function checkListIsolation({
  acquisitions: [a, b],
}: TerminalConformanceSubject): Promise<void> {
  const first = await create(a)
  const second = await create(b)
  const ids = (await listing(a)).map(item => item.terminal)
  const otherIds = (await listing(b)).map(item => item.terminal)
  assert.ok(ids.some(ref => ref.id === first.id && ref.generation === first.generation))
  assert.ok(otherIds.some(ref => ref.id === second.id && ref.generation === second.generation))
  assert.ok(ids.every(ref => ref.id !== second.id || ref.generation !== second.generation))
  assert.ok(otherIds.every(ref => ref.id !== first.id || ref.generation !== first.generation))
  await close(a, first)
  await close(b, second)
}
function controlOf(s: TerminalConformanceSubject) {
  if (!s.control)
    throw new NotApplicable('requires controlled terminal execution and exit observation')
  return s.control
}
async function checkBusy(s: TerminalConformanceSubject): Promise<void> {
  const control = controlOf(s)
  const [a] = s.acquisitions
  const terminal = await create(a)
  const other = await create(a)
  const process = await control.start(a, terminal)
  try {
    assert.equal(
      (await listing(a)).find(item => item.terminal.id === terminal.id)?.state,
      'running',
    )
    const busy = await a.facility.execute(a.executeRequest(terminal))
    assert.equal(busy.kind, 'rejected')
    if (busy.kind === 'rejected') assert.equal(busy.reason, 'busy')
    await (
      await execute(a, other)
    ).result
  } finally {
    await control.finish(process)
  }
  await process.result
  assert.equal((await listing(a)).find(item => item.terminal.id === terminal.id)?.state, 'idle')
  await close(a, terminal)
  await close(a, other)
}
async function checkStop(s: TerminalConformanceSubject): Promise<void> {
  const control = controlOf(s)
  const [a] = s.acquisitions
  const terminal = await create(a)
  const process = await control.start(a, terminal)
  const reader = process.output[Symbol.asyncIterator]()
  let ended = false
  const outcome = process.result.then(value => {
    ended = true
    return value
  })
  try {
    assert.equal(await process.stop(control.stopMode), control.stopAnswer)
    if (control.stopAnswer === 'unconfirmed') {
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(ended, false, 'unconfirmed stop must not invent a final outcome')
    } else {
      await outcome
    }
  } finally {
    await control.finish(process)
    await reader.return?.()
  }
  await outcome
  await close(a, terminal)
}
async function checkClose(s: TerminalConformanceSubject): Promise<void> {
  const control = controlOf(s)
  const [a] = s.acquisitions
  const terminal = await create(a)
  const process = await control.start(a, terminal)
  try {
    assert.equal(await close(a, terminal), control.closeAnswer)
    assert.equal((await a.facility.execute(a.executeRequest(terminal))).kind, 'rejected')
  } finally {
    await control.finish(process)
  }
  await process.result
}

/** Cases allocate fresh subjects when run. They require no test-only fields on real facilities. */
export function terminalFacilityConformance(
  options: TerminalConformanceOptions,
): readonly ConformanceCase[] {
  const cases: readonly [string, (s: TerminalConformanceSubject) => Promise<void>][] = [
    ['terminal.lifecycle', checkLifecycle],
    ['terminal.acquisition-ownership', checkOwnership],
    ['terminal.generation', checkGeneration],
    ['terminal.list-isolation', checkListIsolation],
    ['terminal.per-terminal-busy', checkBusy],
    ['terminal.stop-observation', checkStop],
    ['terminal.close-observation', checkClose],
  ]
  return cases.map(([name, check]) => ({
    name,
    async run() {
      const subject = await options.subject()
      try {
        await bounded(check(subject), options.waitMs ?? 1000)
      } finally {
        await subject.dispose?.()
      }
    },
  }))
}
