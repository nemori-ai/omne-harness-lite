// The assembly of the ledger guards of the local Tool host (TL-11, the guard table). The
// factories of the table live in their own files; this one fixes the argument budgets, checks the
// parts that the assembly gives, and puts the eight rows together. It creates no store and keeps
// no state. The qualification adapter, the principal comparison and the principal codec are the
// parts of other owners; they enter as parameters of the factories, never from here.
import {
  createToolFactAcknowledgementGuard,
  type AccessVerdict,
  type ToolAccessGuard,
  type ToolGrantVerifier,
  type ToolLedgerBudgets,
  type ToolLedgerGuards,
} from '@omne-harness/tool'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolBindings } from '@omne-harness/tool-contract/provider'
import {
  defaultResultPolicy,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import type { LocalInvocationSource } from './invocation-source.ts'
import type { StartCoordinatorAccess } from './start-coordinator.ts'
import { createLocalStartGuard } from './start-guard.ts'
import { createLocalTextResults } from './text-results.ts'

/**
 * The initial argument budgets of an admission: the json-text limits of the argument parse. Like
 * `ToolConfiguration`, they are initial values of configuration, not a rule of the product.
 */
export const localArgumentLimits: ToolLedgerBudgets['arguments'] = Object.freeze({
  maxBytes: 1_048_576,
  maxDepth: 32,
  maxItems: 4_096,
  maxMembers: 256,
  maxStringLength: 1_048_576,
  maxNumberLength: 32,
})

/** The current policy for a complete fixed target, separate from call identity qualification. */
export interface ToolRequestAccess<P> {
  qualify(input: CallAccess<P> & Readonly<{ request: FixedToolRequest }>): Promise<AccessVerdict>
}

/**
 * The ledger asks for call actions; the coordinator and start guard ask for starts. The optional
 * complete-request policy has the same provider in both start consumers.
 */
export type ToolHostAccess<P> = Readonly<{
  guard: ToolAccessGuard<P>
  start: StartCoordinatorAccess<P>
  request?: ToolRequestAccess<P>
}>

export type LocalToolLedgerGuardsInput<P, E = unknown> = Readonly<{
  access: ToolHostAccess<P>
  /** The value of `createLocalInvocationSource`; its `guard` becomes `guards.sources`. */
  sources: LocalInvocationSource<P>
  /** Recovers the original source confirmation; it answers `unavailable` when it cannot. */
  bindings: Pick<ToolBindings<P, E>, 'recover'>
  /** The value of `createLocalGrantVerifiers`. */
  grants: ReadonlyMap<string, ToolGrantVerifier<P>>
  /** Defaults to `localArgumentLimits`. */
  budgets?: ToolLedgerBudgets
}>

function checkBudgets(budgets: ToolLedgerBudgets | undefined): ToolLedgerBudgets {
  if (budgets === undefined) return { arguments: localArgumentLimits }
  const limits: unknown = budgets.arguments
  if (typeof limits !== 'object' || limits === null)
    throw new TypeError('budgets.arguments: missing')
  for (const key of Object.keys(localArgumentLimits)) {
    const value: unknown = Reflect.get(limits, key)
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
      throw new TypeError(`budgets.arguments.${key}: range`)
  }
  return { arguments: { ...budgets.arguments } }
}

function present(value: unknown, field: string): void {
  if (typeof value !== 'function') throw new TypeError(`${field}: missing`)
}

/**
 * Puts the eight guards of the ledger together. A part that is missing, or a budget that is not a
 * positive safe integer, is a defect of the assembly and throws a `TypeError`. The result policy is
 * `defaultResultPolicy`: pass the same object to the runtime as `resultPolicy`, so the ledger and
 * the runtime judge every result alike.
 */
export function createLocalToolLedgerGuards<P, E = unknown>(
  input: LocalToolLedgerGuardsInput<P, E>,
): ToolLedgerGuards<P, ToolMessageContentBlock> {
  if (typeof input !== 'object' || input === null) throw new TypeError('input: missing')
  const { access, sources, bindings, grants } = input
  if (typeof access !== 'object' || access === null) throw new TypeError('access: missing')
  present(access.guard?.qualify, 'access.guard.qualify')
  present(access.start?.qualify, 'access.start.qualify')
  if (typeof sources !== 'object' || sources === null) throw new TypeError('sources: missing')
  present(sources.guard?.verify, 'sources.guard.verify')
  if (typeof bindings !== 'object' || bindings === null) throw new TypeError('bindings: missing')
  present(bindings.recover, 'bindings.recover')
  if (!(grants instanceof Map)) throw new TypeError('grants: not a Map')
  const budgets = checkBudgets(input.budgets)
  return Object.freeze({
    access: access.guard,
    sources: sources.guard,
    factAcknowledgements: createToolFactAcknowledgementGuard<P, E>(bindings),
    grants,
    starts: createLocalStartGuard<P>({
      access: access.start,
      ...(access.request === undefined ? {} : { requestAccess: access.request }),
    }),
    results: createLocalTextResults(),
    policy: defaultResultPolicy,
    budgets,
  })
}
