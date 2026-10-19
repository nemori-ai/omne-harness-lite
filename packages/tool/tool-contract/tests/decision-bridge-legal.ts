// The providers of the decision bridge suite that the contract allows, beyond the shared ones of
// external-association-legal.ts, and how a provider of the shared calls becomes a fixture of this
// port. Each is built at the port boundary and never calls a control of a double.
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DurableEvidence,
  ExternalOperationResolution,
  ToolDecisionBridge,
  ToolFailure,
} from '@omne-harness/tool-contract'
import {
  decisionBridgeAnswers,
  memoryToolDecisionBridgeFixture,
  type ToolDecisionBridgeFixture,
} from '@omne-harness/tool-contract/testing'
import { externalGenerated } from './external-association-legal.ts'
import type { ExternalPort, MakeVariant } from './external-association-variants.ts'

type Fixture = ToolDecisionBridgeFixture<string>
type Bridge = ToolDecisionBridge<string>

/** The fixture of a provider laid over the calls that the decision bridge shares (P06). */
export const makeShared: MakeVariant<Fixture> = build => () => {
  const base = memoryToolDecisionBridgeFixture()
  const laid = build(base.bridge as unknown as ExternalPort, base)
  const bridge = { ...base.bridge, ...laid.port } as Bridge
  return { ...base, ...laid.handles, bridge }
}

/** The generated provider of the table, with or without its `settle`. */
export const generated = (kind: string, settle = true): (() => Fixture) =>
  externalGenerated(makeShared, decisionBridgeAnswers, kind, { settle })

/** The double with one tenant only: the cross-tenant cases have no second access. */
export function oneTenant(): Fixture {
  const { otherAccess: _other, ...rest } = memoryToolDecisionBridgeFixture()
  return rest
}

/**
 * A decision owner that names its records by a sequence number, as the row number of a table
 * does: "1", "2", and so on, in the order that it first answers them. It is the double behind a
 * renaming at the port boundary: the record of every evidence that the bridge or a handle answers
 * is replaced by its number, and the decision that `resolve` is given gets its record back. The
 * owner, the revision and the digest of each evidence stay as they are.
 */
export function shortRecords(): Fixture {
  const base = memoryToolDecisionBridgeFixture()
  const { bridge, decide, invalidations } = base
  const numbers = new Map<string, string>()
  const records = new Map<string, string>()
  const rename = (evidence: DurableEvidence): DurableEvidence => {
    const known = numbers.get(evidence.record)
    const number = known ?? String(numbers.size + 1)
    numbers.set(evidence.record, number)
    records.set(number, evidence.record)
    return { ...evidence, record: number }
  }
  const restore = (evidence: DurableEvidence): DurableEvidence => ({
    ...evidence,
    record: records.get(evidence.record) ?? evidence.record,
  })
  const renamed = <T>(
    outcome: Outcome<T, ToolFailure>,
    change: (value: T) => T,
  ): Outcome<T, ToolFailure> => ('ok' in outcome ? succeed(change(outcome.ok)) : outcome)
  const resolution = (found: ExternalOperationResolution): ExternalOperationResolution => {
    if (found.kind === 'committed') return { ...found, receipt: rename(found.receipt) }
    if (found.kind === 'excluded') return { ...found, exclusion: rename(found.exclusion) }
    return found
  }
  const renamedBridge: Bridge = {
    ...bridge,
    ensure: async input => renamed(await bridge.ensure(input), rename),
    invalidate: async input => renamed(await bridge.invalidate(input), rename),
    inspect: async input =>
      renamed(await bridge.inspect(input), found => ({
        registration: rename(found.registration),
        decision: found.decision === null ? null : rename(found.decision),
      })),
    inspectOperation: async input => renamed(await bridge.inspectOperation(input), resolution),
    resolve: input => bridge.resolve({ ...input, decision: restore(input.decision) }),
  }
  return {
    ...base,
    bridge: renamedBridge,
    ...(decide === undefined
      ? {}
      : { decide: async input => rename(await decide.call(base, input)) }),
    ...(invalidations === undefined
      ? {}
      : { invalidations: () => invalidations.call(base).map(rename) }),
  }
}
