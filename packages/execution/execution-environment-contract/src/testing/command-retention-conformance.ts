import assert from 'node:assert/strict'
import type {
  CommandFacility,
  CommandOutcome,
  FacilityRequest,
  FacilityResult,
  FacilityReason,
  ProcessHandle,
  RetainedOutput,
  RetainedOutputFrom,
  RetainedProcessInformation,
  RetainedProcessRef,
  RetainedStreamTail,
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
    /**
     * A command whose main process writes at least one byte to stdout and exits, and leaves one
     * process that writes `after` to stdout once the domain was handed over, then keeps running.
     * Without it `V-EE31.tail-keeps-the-byte-relation` is not applicable.
     */
    writing?(): Readonly<{ body: CommandRetentionBody; after: Uint8Array }>
  }>
  /** Closes the retention scope of `acquisition` (not of `elsewhere`). Returns when the close was issued. */
  closeScope(): Promise<void>
  /** True once the execution domain of the retained process is known to be stopped. Read, never assumed. */
  domainStopped(process: RetainedProcessRef): Promise<boolean>
  /**
   * How many stops of the retained process's domain the provider issued so far. Read, never
   * assumed. Without it the stop cases still run but do not count the stops.
   */
  stopsIssued?(process: RetainedProcessRef): Promise<number>
  /**
   * An acquisition in the same retention scope and for the same tenant as `acquisition` whose
   * facility guard refuses `stop` and `output`. Without it the guard cases are not applicable.
   */
  refusing?: CommandRetentionAcquisition
  /**
   * An acquisition that retains in a retention scope whose retained process ledger view has no
   * `ended`. Without it `V-EE30.stop-without-ended-is-unavailable` is not applicable.
   */
  withoutEnded?: CommandRetentionAcquisition
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
  const deadline =
    /* wall-clock: operation-timing -- bound the wait for a confirmed stop */ Date.now() + waitMs
  while (!(await s.domainStopped(process))) {
    assert.ok(
      /* wall-clock: operation-timing -- bound the wait for a confirmed stop */ Date.now() <
        deadline,
      'the scope closed but the domain is not confirmed stopped',
    )
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

function refused<T>(answer: FacilityResult<T>, reason: FacilityReason, message: string): void {
  assert.equal(answer.kind, 'rejected', message)
  if (answer.kind === 'rejected') assert.equal(answer.reason, reason, message)
}

function requireStop(a: CommandRetentionAcquisition): void {
  if (a.facility.retention?.stop === undefined)
    throw new NotApplicable('requires the retention extension to provide stop')
}

function requireOutput(a: CommandRetentionAcquisition): void {
  if (a.facility.retention?.output === undefined)
    throw new NotApplicable('requires the retention extension to provide output')
}

async function stop(
  a: CommandRetentionAcquisition,
  process: RetainedProcessRef,
  mode: 'graceful' | 'forced',
): Promise<FacilityResult<{ readonly status: 'confirmed' | 'unconfirmed' }>> {
  const retention = a.facility.retention
  assert.ok(retention?.stop, 'the retention extension provides stop')
  return retention.stop({ ...a.request(), process, mode })
}

async function output(
  a: CommandRetentionAcquisition,
  process: RetainedProcessRef,
  from?: RetainedOutputFrom,
): Promise<FacilityResult<RetainedOutput>> {
  const retention = a.facility.retention
  assert.ok(retention?.output, 'the retention extension provides output')
  return retention.output({ ...a.request(), process, ...(from === undefined ? {} : { from }) })
}

/** References that no handover in any scope produced: the same id with another generation, and another id. */
const absent = (ref: RetainedProcessRef): readonly RetainedProcessRef[] => [
  { id: ref.id, generation: `${ref.generation}-absent` },
  { id: `${ref.id}-absent`, generation: ref.generation },
]

async function checkStopConfirms(s: CommandRetentionSubject): Promise<void> {
  requireStop(s.acquisition)
  const { process } = await retained(s.acquisition, s.commands.leftover())
  assert.deepEqual(done(await stop(s.acquisition, process, 'graceful')), { status: 'confirmed' })
  assert.equal(await s.domainStopped(process), true, 'a confirmed stop is a stopped domain')
  assert.equal(
    find(await listing(s.acquisition), process),
    undefined,
    'a stopped one is not listed',
  )
}

async function checkStopScope(s: CommandRetentionSubject): Promise<void> {
  requireStop(s.acquisition)
  requireStop(s.elsewhere)
  const { process } = await retained(s.acquisition, s.commands.leftover())
  refused(
    await stop(s.elsewhere, process, 'forced'),
    'notFound',
    'a stop does not cross the scope or tenant',
  )
  for (const ref of absent(process))
    refused(await stop(s.acquisition, ref, 'forced'), 'notFound', 'id and generation both match')
  assert.equal(await s.domainStopped(process), false, 'a refused stop stops nothing')
  assert.equal(find(await listing(s.acquisition), process)?.state, 'running')
}

async function checkStopJoins(s: CommandRetentionSubject): Promise<void> {
  requireStop(s.acquisition)
  const { process } = await retained(s.acquisition, s.commands.leftover())
  const before = (await s.stopsIssued?.(process)) ?? 0
  const answers = await Promise.all([
    stop(s.acquisition, process, 'forced'),
    stop(s.acquisition, process, 'forced'),
  ])
  for (const answer of answers) assert.deepEqual(done(answer), { status: 'confirmed' })
  if (s.stopsIssued)
    assert.equal(await s.stopsIssued(process), before + 1, 'a repeated stop joins the first')
}

async function checkStopAfterEnd(s: CommandRetentionSubject): Promise<void> {
  requireStop(s.acquisition)
  const { process } = await retained(s.acquisition, s.commands.leftover())
  assert.deepEqual(done(await stop(s.acquisition, process, 'forced')), { status: 'confirmed' })
  const issued = await s.stopsIssued?.(process)
  assert.deepEqual(
    done(await stop(s.acquisition, process, 'forced')),
    { status: 'confirmed' },
    'a stopped process answers confirmed while its end fact is kept, never notFound',
  )
  if (s.stopsIssued) assert.equal(await s.stopsIssued(process), issued, 'no second stop is issued')
}

async function checkStopWithoutEnded(s: CommandRetentionSubject): Promise<void> {
  const a = s.withoutEnded
  if (!a) throw new NotApplicable('requires an acquisition whose process ledger has no ended')
  requireStop(a)
  const { process } = await retained(a, s.commands.leftover())
  assert.deepEqual(done(await stop(a, process, 'forced')), { status: 'confirmed' })
  refused(
    await stop(a, process, 'forced'),
    'unavailable',
    'without ended the end fact cannot be read, so the qualification is unavailable',
  )
}

async function checkStopRefusedByGuard(s: CommandRetentionSubject): Promise<void> {
  const a = s.refusing
  if (!a) throw new NotApplicable('requires an acquisition whose guard refuses stop')
  requireStop(a)
  const { process } = await retained(s.acquisition, s.commands.leftover())
  refused(await stop(a, process, 'forced'), 'notAuthorized', 'the guard decides the stop')
  assert.equal(await s.domainStopped(process), false, 'a refused stop stops nothing')
}

const continuation = (byte: number) => byte >= 0x80 && byte <= 0xbf

/** `from` is what the read asked for this stream; without it the tail starts at the first saved byte. */
function checkStreamTail(tail: RetainedStreamTail, from?: number): void {
  for (const field of ['savedFrom', 'start', 'end', 'discardedBytes'] as const)
    assert.ok(Number.isInteger(tail[field]) && tail[field] >= 0, `${field} is a byte offset`)
  const firstSaved = tail.savedFrom + tail.discardedBytes
  assert.equal(tail.start + tail.data.length, tail.end, 'start + data length = end')
  assert.ok(tail.start >= firstSaved, 'nothing before the handover or discarded is given')
  if (from === undefined || from <= firstSaved)
    assert.equal(tail.start, firstSaved, 'the tail starts at the first saved byte')
  else assert.equal(tail.start, Math.min(from, tail.end), 'the tail starts at from')
  const skipped = tail.text.start - tail.start
  assert.equal(tail.text.encoding, 'utf-8')
  assert.ok(skipped >= 0 && skipped <= 3, 'the text skips at most one cut character')
  assert.ok(
    tail.data.subarray(0, skipped).every(continuation),
    'only continuation bytes are skipped',
  )
  assert.equal(
    tail.text.value,
    new TextDecoder().decode(tail.data.subarray(skipped)),
    'the text is the data decoded as UTF-8 from its start',
  )
  assert.equal(typeof tail.text.replaced, 'boolean')
}

function stdoutOf(answer: RetainedOutput): RetainedStreamTail | undefined {
  return answer.kind === 'tail' ? answer.streams.find(item => item.stream === 'stdout') : undefined
}

async function checkTail(s: CommandRetentionSubject, waitMs: number): Promise<void> {
  if (!s.commands.writing) throw new NotApplicable('requires a command that writes after handover')
  requireOutput(s.acquisition)
  const { body, after } = s.commands.writing()
  const { process } = await retained(s.acquisition, body)
  const deadline =
    /* wall-clock: operation-timing -- bound the wait for the tail */ Date.now() + waitMs
  let answer = done(await output(s.acquisition, process))
  for (;;) {
    if (answer.kind === 'unsupported')
      throw new NotApplicable('the provider keeps no output for this retained process')
    const out = stdoutOf(answer)
    if (out !== undefined && out.end - out.savedFrom >= after.length) break
    assert.ok(
      /* wall-clock: operation-timing -- bound the wait for the tail */ Date.now() < deadline,
      'the bytes written after the handover did not reach the tail',
    )
    await new Promise(resolve => setTimeout(resolve, 20))
    answer = done(await output(s.acquisition, process))
  }
  assert.equal(answer.kind, 'tail')
  if (answer.kind !== 'tail') return
  assert.ok(Number.isInteger(answer.version))
  for (const tail of answer.streams) checkStreamTail(tail)
  const out = stdoutOf(answer)
  assert.ok(out)
  assert.ok(out.savedFrom > 0, 'bytes observed before the handover count, but are not saved')
  if (out.discardedBytes === 0)
    assert.deepEqual([...out.data], [...after], 'the tail holds exactly the bytes after handover')
  for (const from of [0, out.start, out.start + 1, out.end, out.end + 1]) {
    const read = stdoutOf(done(await output(s.acquisition, process, { stdout: from })))
    assert.ok(read, 'a read with from still gives the stream')
    checkStreamTail(read, from)
    const offset: number = read.start - out.start
    if (offset >= 0 && offset <= out.data.length)
      assert.deepEqual(
        [...read.data.subarray(0, out.data.length - offset)],
        [...out.data.subarray(offset)],
        'a read with from gives the same bytes from there',
      )
  }
}

async function checkOutputScope(s: CommandRetentionSubject): Promise<void> {
  requireOutput(s.acquisition)
  requireOutput(s.elsewhere)
  const { process } = await retained(s.acquisition, s.commands.leftover())
  assert.ok(
    ['tail', 'none', 'unsupported'].includes(done(await output(s.acquisition, process)).kind),
    'the scope that holds it reads it',
  )
  refused(
    await output(s.elsewhere, process),
    'notFound',
    'output does not cross the scope or tenant',
  )
  for (const ref of absent(process))
    refused(await output(s.acquisition, ref), 'notFound', 'id and generation both match')
}

async function checkOutputAfterStop(s: CommandRetentionSubject): Promise<void> {
  requireStop(s.acquisition)
  requireOutput(s.acquisition)
  const { process } = await retained(s.acquisition, s.commands.leftover())
  assert.deepEqual(done(await stop(s.acquisition, process, 'forced')), { status: 'confirmed' })
  refused(
    await output(s.acquisition, process),
    'notFound',
    'a process that left the index has no output',
  )
}

async function checkOutputRefusedByGuard(s: CommandRetentionSubject): Promise<void> {
  const a = s.refusing
  if (!a) throw new NotApplicable('requires an acquisition whose guard refuses output')
  requireOutput(a)
  const { process } = await retained(s.acquisition, s.commands.leftover())
  refused(await output(a, process), 'notAuthorized', 'the guard decides the read')
}

async function checkNoLedger(s: CommandRetentionSubject): Promise<void> {
  if (!s.unbound) throw new NotApplicable('requires an acquisition without a process ledger view')
  assert.equal(s.unbound.facility.retention, undefined)
  const { residue } = await ended(s.unbound, s.commands.leftover())
  assert.deepEqual(residue, { kind: 'stopping', reason: 'unbound' })
}

/**
 * Cases for what a one-shot command leaves behind: the disposition, the listing, the handover, the
 * closure of the scope, and the extension's `stop` and `output`. Cases allocate fresh subjects when
 * run, and use only the public command operations and the retention extension. Case names start
 * with their obligation id: `V-EE28.`, `V-EE30.` (stop) or `V-EE31.` (output).
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
    ['V-EE30.stop-confirms-a-stopped-domain', checkStopConfirms],
    ['V-EE30.stop-stays-in-scope-and-tenant', checkStopScope],
    ['V-EE30.repeated-stop-joins', checkStopJoins],
    ['V-EE30.stop-after-end-is-confirmed', checkStopAfterEnd],
    ['V-EE30.stop-without-ended-is-unavailable', checkStopWithoutEnded],
    ['V-EE30.guard-refuses-stop', checkStopRefusedByGuard],
    ['V-EE31.tail-keeps-the-byte-relation', s => checkTail(s, waitMs)],
    ['V-EE31.output-stays-in-scope-and-tenant', checkOutputScope],
    ['V-EE31.output-after-stop-is-not-found', checkOutputAfterStop],
    ['V-EE31.guard-refuses-output', checkOutputRefusedByGuard],
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
