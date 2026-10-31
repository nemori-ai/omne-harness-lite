// A register service for the self-proof of the registration suite. It has the semantics of the
// conforming double of `./testing` with no flaw set, and one rule broken for each flaw that is
// set. A service cannot be broken from outside, because the rules are the order of its own steps,
// so the variants are built here and not laid over the double. With no flaw it must pass the
// suite, which keeps this copy from drifting from the double.
import { AsyncLocalStorage } from 'node:async_hooks'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type { DurableEvidence, ToolExecutionRef } from '@omne-harness/tool-contract'
import type { ToolHandle } from '@omne-harness/tool-contract/provider'
import {
  memoryToolRegistrationFixture,
  type ToolRegistrationFixture,
} from '@omne-harness/tool-cordis-contract/testing'
import type {
  ToolRegistration,
  ToolRegistrationFailure,
  ToolRegistrationInput,
} from '@omne-harness/tool-cordis-contract/cordis'

/** Each flag breaks one rule of IC-3. */
export type Flaws = Readonly<
  Partial<{
    /** The receipt names another execution. */
    receiptOtherExecution: boolean
    /** The token of the receipt is empty. */
    emptyToken: boolean
    /** A register that recalls the registration takes a new token. */
    recallFresh: boolean
    /** A recall that meets another register in flight answers another token. */
    crowdedRecallFresh: boolean
    /** A recall that comes alone (no other register in flight) answers another token. */
    loneRecallFresh: boolean
    /** After any release, a recall answers another token. */
    recallFreshAfterRelease: boolean
    /** Another handle is refused as unavailable, not as a conflict. */
    otherHandleUnavailable: boolean
    /** Another fiber is refused as unavailable, not as a conflict. */
    otherFiberUnavailable: boolean
    /** A release of a registration that is no longer current mutes the current one. */
    lateReleaseMutesSuccessor: boolean
    /** A release of a registration that is no longer current answers removed true, and keeps the current one. */
    lateReleaseClaimsRemoval: boolean
    /** The first release of a registration removes the entry and answers removed false. */
    firstReleaseAnswersFalse: boolean
    /** The second release of a registration answers removed true. */
    secondReleaseRemoves: boolean
    /** The third release of a registration answers removed true. */
    thirdReleaseRemoves: boolean
    /** A refusal of the kind denied is reported as unavailable. */
    deniedAsUnavailable: boolean
    /** A refused check leaves the entry that was written before it. */
    keepOnRefusal: boolean
    /** A release gives the registrations of the other tenants for the same call another token. */
    foreignReleaseRewrites: boolean
    /** A release mutes the registrations of the other tenants for the same call. */
    foreignReleaseMutes: boolean
    /** Another handle takes the identity over instead of conflicting. */
    overwriteOtherHandle: boolean
    /** The qualification of the registration (its authority) is not compared on a recall. */
    ignoreAuthority: boolean
    /** Another qualification of the same identity is refused as unavailable, not as conflict. */
    otherQualificationUnavailable: boolean
    /** Another qualification of the same identity removes the registration it conflicts with. */
    conflictSpoilsEntry: boolean
    /** The generation of the publication is not compared: the receipt of the first is recalled. */
    ignoreGeneration: boolean
    /** Another generation of the identity takes the registration over. */
    generationOverwrites: boolean
    /** The fiber is not compared: any fiber recalls the registration of another. */
    shareAcrossFibers: boolean
    /** A release removes the entry of the identity, whichever registration holds it. */
    releaseByIdentity: boolean
    /** A repeated release answers removed true again. */
    repeatedReleaseRemoves: boolean
    /** The release of a registration of another tenant than the first one removes nothing. */
    foreignReleaseRemovesNothing: boolean
    /** After a release the identity is burned for every other fiber. */
    burnedAfterRelease: boolean
    /** A release ends the observation of the original work. */
    releaseTouchesWork: boolean
    /** A refused check is written and taken back after the answer is on its way. */
    writeThenRollback: boolean
    /** A register that sees the check change while it is in flight rejects instead of answering. */
    rejectsWhenCheckChanges: boolean
    /** A refused check is written this many milliseconds after the answer, and kept. */
    writeAfterAnswerMs: number
    /** The directory entry is written before the check is made. */
    writeBeforeCheck: boolean
    /** The check is made, the register yields, and the entry is written without a second check. */
    checkThenYield: boolean
    /** A register yields between the test for a conflict and the write. */
    yieldBeforeWrite: boolean
    /** Registers that meet in flight all take the conflict, so none registers. */
    bothLose: boolean
    /** Every refusal of the check is reported as denied. */
    refusalAsDenied: boolean
    /** A recall that the check refuses answers conflict, not the refusal. */
    recallRefusedAsConflict: boolean
    /** A recall does not consult the check. */
    skipCheckOnRecall: boolean
    /** A fiber that has exited can still register. */
    exitedFiberRegisters: boolean
    /** The end of a fiber leaves its registration behind. */
    fiberEndKeepsEntry: boolean
    /** The key ignores the tenant. */
    tenantBlind: boolean
    /** The check accepts an authority for a publication of any tenant. */
    authorityTenantBlind: boolean
  }>
>

type Entry = {
  token: string
  muted: boolean
  readonly fiber: string
  readonly execution: ToolExecutionRef
  readonly authority: DurableEvidence
  readonly handle: ToolHandle<string>
  registration: ToolRegistration
}

const tenantText = (tenant: TenantId): string =>
  JSON.stringify([tenant.organization.text, tenant.account.text])

const sameEvidence = (left: DurableEvidence, right: DurableEvidence): boolean =>
  left.owner === right.owner && left.record === right.record && left.digest === right.digest

/** A fixture over a register service that has the given flaws. */
export function flawedFixture(flaws: Flaws = {}): ToolRegistrationFixture<string> {
  const base = memoryToolRegistrationFixture()
  const grants: readonly (readonly [DurableEvidence, TenantId])[] = [
    [base.authority, base.tenant],
    [base.renewedAuthority!, base.tenant],
    [base.otherAuthority!, base.otherTenant!],
  ]
  const entries = new Map<string, Entry>()
  const ended = new Set<string>()
  const checks: (readonly string[])[] = []
  const fibers = new AsyncLocalStorage<string>()
  let refusal: ToolRegistrationFailure | null = null
  let minted = 0
  let inflight = 0
  let met = false
  let released = false
  const flying = new Set<{ met: boolean }>()
  const listing = (): readonly string[] => [...entries.values()].map(entry => entry.token)
  const keyOf = (execution: ToolExecutionRef): string =>
    JSON.stringify([flaws.tenantBlind === true ? '' : tenantText(execution.tenant), execution.call])
  const granted = (input: ToolRegistrationInput<string>): boolean =>
    grants.some(
      ([authority, tenant]) =>
        sameEvidence(authority, input.authority) &&
        (flaws.authorityTenantBlind === true ||
          tenantText(tenant) === tenantText(input.publication[0].tenant)),
    )
  const burned = new Map<string, string>()

  const registrationOf = (
    key: string,
    execution: ToolExecutionRef,
    handle: ToolHandle<string>,
    token: string,
    fiber: string,
  ): ToolRegistration => {
    let releases = 0
    return {
      receipt: {
        execution:
          flaws.receiptOtherExecution === true ? { ...execution, generation: '2' } : execution,
        registration: flaws.emptyToken === true ? '' : token,
      },
      release: () => {
        releases += 1
        if (flaws.releaseTouchesWork === true)
          handle.observation.observe({
            ref: 'not-a-reference' as never,
            access: { principal: 'tester', tenant: execution.tenant },
            signal: AbortSignal.abort(),
          })
        if (
          flaws.foreignReleaseRemovesNothing === true &&
          tenantText(execution.tenant) !== tenantText(base.tenant)
        )
          return Promise.resolve({ removed: false })
        const current = entries.get(key)
        if (current === undefined) {
          const again =
            flaws.repeatedReleaseRemoves === true ||
            (flaws.secondReleaseRemoves === true && releases === 2) ||
            (flaws.thirdReleaseRemoves === true && releases === 3)
          return Promise.resolve({ removed: again })
        }
        if (current.token !== token && flaws.releaseByIdentity !== true) {
          if (flaws.lateReleaseMutesSuccessor === true) current.muted = true
          return Promise.resolve({ removed: flaws.lateReleaseClaimsRemoval === true })
        }
        if (current.muted) return Promise.resolve({ removed: false })
        entries.delete(key)
        burned.set(key, fiber)
        released = true
        for (const [otherKey, other] of entries) {
          if (otherKey === key || other.execution.call !== execution.call) continue
          if (flaws.foreignReleaseMutes === true) other.muted = true
          if (flaws.foreignReleaseRewrites === true) {
            minted += 1
            other.token = `registration-${minted}`
            other.registration = registrationOf(
              otherKey,
              other.execution,
              other.handle,
              other.token,
              other.fiber,
            )
          }
        }
        return Promise.resolve({
          removed: !(flaws.firstReleaseAnswersFalse === true && releases === 1),
        })
      },
    }
  }

  const register = async (
    input: ToolRegistrationInput<string>,
  ): Promise<Outcome<ToolRegistration, ToolRegistrationFailure>> => {
    const [execution, handle] = input.publication
    const fiber = fibers.getStore() ?? 'ambient'
    if (flaws.rejectsWhenCheckChanges === true) {
      const before = refusal
      await Promise.resolve()
      if (refusal !== before) throw new Error('the check changed while the register was in flight')
    }
    // The flaw yields first, so that registers meet in flight; the one that meets another is crowded.
    const crowded = flaws.crowdedRecallFresh === true && inflight > 0
    const flight = { met: false }
    if (flaws.crowdedRecallFresh === true || flaws.loneRecallFresh === true) {
      if (flying.size > 0) {
        flight.met = true
        for (const other of flying) other.met = true
      }
      flying.add(flight)
      inflight += 1
      await Promise.resolve()
      inflight -= 1
      flying.delete(flight)
    }
    const key = keyOf(execution)
    const existing = entries.get(key)
    const sameWork =
      existing !== undefined &&
      (flaws.shareAcrossFibers === true || existing.fiber === fiber) &&
      existing.handle === handle &&
      existing.execution.instance === execution.instance
    const sameQualification =
      existing !== undefined &&
      (flaws.ignoreAuthority === true || sameEvidence(existing.authority, input.authority)) &&
      (flaws.ignoreGeneration === true || existing.execution.generation === execution.generation)
    const recalled = sameWork && sameQualification
    const write = (): Entry => {
      minted += 1
      const token = `registration-${minted}`
      const entry: Entry = {
        token,
        muted: false,
        fiber,
        execution,
        authority: input.authority,
        handle,
        registration: registrationOf(key, execution, handle, token, fiber),
      }
      entries.set(key, entry)
      return entry
    }
    // The flaw writes the entry before the check; it takes the entry back if the check refuses.
    const early = flaws.writeBeforeCheck === true && existing === undefined ? write() : null
    const skipsCheck = recalled && flaws.skipCheckOnRecall === true
    if (!skipsCheck) checks.push(listing())
    const denied: ToolRegistrationFailure | null =
      refusal ?? (granted(input) || skipsCheck ? null : { kind: 'denied' })
    if (denied !== null && !skipsCheck) {
      const failure: ToolRegistrationFailure =
        flaws.recallRefusedAsConflict === true && existing !== undefined
          ? { kind: 'conflict' }
          : flaws.refusalAsDenied === true
            ? { kind: 'denied' }
            : flaws.deniedAsUnavailable === true && denied.kind === 'denied'
              ? { kind: 'unavailable', diagnostic: 'the check cannot say' }
              : denied
      if (early !== null && flaws.keepOnRefusal !== true) entries.delete(key)
      if (flaws.writeThenRollback === true && existing === undefined) {
        write()
        await Promise.resolve()
        entries.delete(key)
      }
      if (flaws.writeAfterAnswerMs !== undefined && existing === undefined)
        setTimeout(() => {
          write()
        }, flaws.writeAfterAnswerMs)
      return fail(failure)
    }
    if (ended.has(fiber) && flaws.exitedFiberRegisters !== true) {
      if (early !== null) entries.delete(key)
      return fail({ kind: 'unavailable', diagnostic: 'the caller fiber has exited' })
    }
    if (flaws.checkThenYield === true) {
      // The check was made above; the write below does not make it again.
      await Promise.resolve()
      const taken = entries.get(key)
      if (taken !== undefined)
        return recalled && taken === existing
          ? succeed(taken.registration)
          : fail({ kind: 'conflict' })
      return succeed(write().registration)
    }
    if (recalled) {
      if (crowded)
        return succeed({
          ...existing.registration,
          receipt: {
            ...existing.registration.receipt,
            registration: `${existing.registration.receipt.registration}-x`,
          },
        })
      if (
        (flaws.loneRecallFresh === true && !flight.met) ||
        (flaws.recallFreshAfterRelease === true && released)
      )
        return succeed({
          ...existing.registration,
          receipt: {
            ...existing.registration.receipt,
            registration: `${existing.registration.receipt.registration}-y`,
          },
        })
      if (flaws.recallFresh !== true) return succeed(existing.registration)
      const fresh = write()
      return succeed(fresh.registration)
    }
    if (existing !== undefined && sameWork && flaws.ignoreGeneration !== true) {
      // The same work under another qualification or another generation.
      if (flaws.conflictSpoilsEntry === true) entries.delete(key)
      if (
        flaws.generationOverwrites === true &&
        existing.execution.generation !== execution.generation
      )
        return succeed(write().registration)
      return fail(
        flaws.otherQualificationUnavailable === true
          ? { kind: 'unavailable', diagnostic: 'the qualification cannot be compared' }
          : { kind: 'conflict' },
      )
    }
    if (
      existing !== undefined &&
      (flaws.overwriteOtherHandle !== true || existing.handle === handle)
    ) {
      const unavailable =
        (flaws.otherHandleUnavailable === true && existing.handle !== handle) ||
        (flaws.otherFiberUnavailable === true &&
          existing.handle === handle &&
          existing.fiber !== fiber)
      return fail(
        unavailable
          ? { kind: 'unavailable', diagnostic: 'the registration is held by another' }
          : { kind: 'conflict' },
      )
    }
    if (flaws.burnedAfterRelease === true) {
      const owner = burned.get(key)
      if (owner !== undefined && owner !== fiber) return fail({ kind: 'conflict' })
    }
    if (flaws.yieldBeforeWrite === true) await Promise.resolve()
    if (flaws.bothLose === true) {
      if (inflight > 0) met = true
      inflight += 1
      await Promise.resolve()
      const crowded = met
      inflight -= 1
      if (inflight === 0) met = false
      if (crowded) return fail({ kind: 'conflict' })
    }
    return succeed((early ?? write()).registration)
  }

  return {
    ...base,
    service: { register },
    asFiber: (fiber, work) => fibers.run(fiber, work),
    endFiber: async fiber => {
      ended.add(fiber)
      if (flaws.fiberEndKeepsEntry === true) return
      for (const entry of entries.values())
        if (entry.fiber === fiber) await entry.registration.release()
    },
    refuseCheck: failure => {
      refusal = failure
    },
    listing,
    checkedAgainst: () => checks.map(seen => [...seen]),
  }
}
