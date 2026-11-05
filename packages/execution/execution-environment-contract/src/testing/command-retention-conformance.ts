import assert from 'node:assert/strict'
import type {
  CommandFacility,
  CommandOutcome,
  FacilityRequest,
  FacilityResult,
  ProcessHandle,
  RetainedProcessInformation,
  RetainedProcessRef,
} from '../index.ts'
import { bounded, NotApplicable, type ConformanceCase } from './case.ts'

type StartRequest = Parameters<CommandFacility<unknown>['start']>[0]

/** What a command asks for; the suite adds the request identity. Platform shells differ, so the subject writes it. */
export type CommandRetentionBody = Pick<
  StartRequest,
  'executable' | 'args' | 'cwd' | 'env' | 'outputMode'
>

/** One acquisition's command facility and the identity it asks with. */
export type CommandRetentionAcquisition = Readonly<{
  facility: CommandFacility<unknown>
  /** A legal base request of this acquisition: its tenant, origin and binding, and a fresh `requestId` per call. */
  request(): FacilityRequest<unknown>
}>

/**
 * What the suite needs from the integrator. The suite does not know the platform: how a command is
 * written, how a scope closes and how a stopped domain is read all come from here.
 */
export type CommandRetentionSubject = Readonly<{
  /**
   * An acquisition with a trusted retention scope and a retention process ledger view, so its
   * `facility.retention` exists and a leftover is retained.
   */
  acquisition: CommandRetentionAcquisition
  /**
   * Another acquisition that also retains, in another retention scope or for another tenant. It
   * must also have `facility.retention`, so that the suite can show it lists its own and only its own.
   */
  elsewhere: CommandRetentionAcquisition
  commands: Readonly<{
    /** A command that ends with nothing left in its execution domain. */
    clean(): CommandRetentionBody
    /** A command whose main process exits and leaves one process running. */
    leftover(): CommandRetentionBody
  }>
  /** Closes the retention scope of `acquisition` (not of `elsewhere`). Returns when the close was issued. */
  closeScope(): Promise<void>
  /** True once the execution domain of the retained process is known to be stopped. Read, never assumed. */
  domainStopped(process: RetainedProcessRef): Promise<boolean>
  /**
   * An acquisition without a retention process ledger view. A leftover there is stopped, not retained.
   * Without it, `V-EE28.no-ledger-stops-with-reason` is not applicable.
   */
  unbound?: CommandRetentionAcquisition
  /** Stops everything the case left and frees the subject. Runs after every case, also after a failure. */
  dispose?(): Promise<void>
}>

export type CommandRetentionOptions = Readonly<{
  subject(): CommandRetentionSubject | Promise<CommandRetentionSubject>
  /** The upper bound of one case, including the wait for the stop after a scope closed. Default 5000. */
  waitMs?: number
}>

function done<T>(answer: FacilityResult<T>): T {
  assert.equal(answer.kind, 'done')
  if (answer.kind !== 'done') throw new assert.AssertionError({ message: 'expected done' })
  return answer.value
}

async function begin(
  a: CommandRetentionAcquisition,
  body: CommandRetentionBody,
): Promise<{ handle: ProcessHandle; request: StartRequest }> {
  const request: StartRequest = { ...a.request(), ...body }
  return { handle: done(await a.facility.start(request)), request }
}

async function outcomeOf(handle: ProcessHandle): Promise<CommandOutcome> {
  for await (const _ of handle.output) void _
  return handle.result
}

/** Runs the command to its end and returns the disposition its outcome reports. */
async function ended(a: CommandRetentionAcquisition, body: CommandRetentionBody) {
  const { handle, request } = await begin(a, body)
  const outcome = await outcomeOf(handle)
  assert.equal(outcome.kind, 'completed')
  if (outcome.kind !== 'completed')
    throw new assert.AssertionError({ message: 'expected completed' })
  return { handle, request, residue: outcome.residue }
}

async function retained(a: CommandRetentionAcquisition, body: CommandRetentionBody) {
  const result = await ended(a, body)
  assert.equal(result.residue?.kind, 'retained')
  if (result.residue?.kind !== 'retained')
    throw new assert.AssertionError({ message: 'expected retained' })
  const { processes } = result.residue
  assert.ok(
    processes === 'unknown' || (Number.isInteger(processes) && processes >= 1),
    'the process count is a positive number or unknown',
  )
  assert.equal(typeof result.residue.process.id, 'string')
  assert.ok(result.residue.process.id.length > 0)
  assert.equal(typeof result.residue.process.generation, 'string')
  return { ...result, process: result.residue.process }
}

async function listing(
  a: CommandRetentionAcquisition,
): Promise<readonly RetainedProcessInformation[]> {
  const retention = a.facility.retention
  assert.ok(retention, 'a retaining acquisition has the retention extension')
  return done(await retention.list(a.request()))
}

const same = (a: RetainedProcessRef, b: RetainedProcessRef) =>
  a.id === b.id && a.generation === b.generation
const find = (items: readonly RetainedProcessInformation[], ref: RetainedProcessRef) =>
  items.find(item => same(item.process, ref))

async function checkCleanExit(s: CommandRetentionSubject): Promise<void> {
  const { residue } = await ended(s.acquisition, s.commands.clean())
  assert.deepEqual(residue, { kind: 'none' })
}

async function checkRetainedAndListed(s: CommandRetentionSubject): Promise<void> {
  const { request, process } = await retained(s.acquisition, s.commands.leftover())
  const entry = find(await listing(s.acquisition), process)
  assert.ok(entry, 'the retained process is listed by the acquisition that handed it over')
  assert.equal(entry.state, 'running')
  assert.equal(entry.origin, request.origin)
  assert.equal(typeof entry.handedOverAtMs, 'number')
  assert.ok(entry.processes === 'unknown' || entry.processes >= 1)
}

async function checkListScope(s: CommandRetentionSubject): Promise<void> {
  const mine = await retained(s.acquisition, s.commands.leftover())
  const theirs = await retained(s.elsewhere, s.commands.leftover())
  assert.ok(!same(mine.process, theirs.process), 'two handovers have two references')
  const ownList = await listing(s.acquisition)
  const otherList = await listing(s.elsewhere)
  assert.ok(find(ownList, mine.process), 'a list shows what its own scope holds')
  assert.ok(find(otherList, theirs.process), 'a list shows what its own scope holds')
  assert.equal(
    find(ownList, theirs.process),
    undefined,
    'a list does not cross the scope or tenant',
  )
  assert.equal(
    find(otherList, mine.process),
    undefined,
    'a list does not cross the scope or tenant',
  )
}

async function checkHandleStop(s: CommandRetentionSubject): Promise<void> {
  const { handle, process } = await retained(s.acquisition, s.commands.leftover())
  assert.equal(await handle.stop('graceful'), 'unconfirmed')
  assert.equal(await handle.stop('forced'), 'unconfirmed')
  assert.equal(find(await listing(s.acquisition), process)?.state, 'running')
  assert.equal(await s.domainStopped(process), false, 'the handle stop did not stop the domain')
}

async function checkScopeClose(s: CommandRetentionSubject, waitMs: number): Promise<void> {
  const { process } = await retained(s.acquisition, s.commands.leftover())
  assert.equal(await s.domainStopped(process), false, 'retained before the scope closes')
  await s.closeScope()
  const deadline = Date.now() + waitMs
  while (!(await s.domainStopped(process))) {
    assert.ok(Date.now() < deadline, 'the scope closed but the domain is not confirmed stopped')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

async function checkNoLedger(s: CommandRetentionSubject): Promise<void> {
  if (!s.unbound) throw new NotApplicable('requires an acquisition without a process ledger view')
  assert.equal(s.unbound.facility.retention, undefined)
  const { residue } = await ended(s.unbound, s.commands.leftover())
  assert.deepEqual(residue, { kind: 'stopping', reason: 'unbound' })
}

/**
 * Cases for what a one-shot command leaves behind: the disposition, the listing, the handover and
 * the closure of the scope. Cases allocate fresh subjects when run, and use only the public command
 * operations and `retention.list`. Case names start with the obligation id `V-EE28.`.
 */
export function commandRetentionConformance(
  options: CommandRetentionOptions,
): readonly ConformanceCase[] {
  const waitMs = options.waitMs ?? 5000
  const cases: readonly [string, (s: CommandRetentionSubject) => Promise<void>][] = [
    ['V-EE28.clean-exit-reports-none', checkCleanExit],
    ['V-EE28.leftover-is-retained-and-listed', checkRetainedAndListed],
    ['V-EE28.list-stays-in-scope-and-tenant', checkListScope],
    ['V-EE28.handle-stop-after-handover-is-unconfirmed', checkHandleStop],
    ['V-EE28.scope-close-stops-retained', s => checkScopeClose(s, waitMs)],
    ['V-EE28.no-ledger-stops-with-reason', checkNoLedger],
  ]
  return cases.map(([name, check]) => ({
    name,
    async run() {
      const subject = await options.subject()
      try {
        await bounded(check(subject), waitMs)
      } finally {
        await subject.dispose?.()
      }
    },
  }))
}
