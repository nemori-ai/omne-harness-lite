import {
  createToolFactAcknowledgementGuard,
  type AccessVerdict,
  type LedgerCommit,
  type LedgerCommitInput,
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

export const localArgumentLimits: ToolLedgerBudgets['arguments'] = Object.freeze({
  maxBytes: 1_048_576,
  maxDepth: 32,
  maxItems: 4_096,
  maxMembers: 256,
  maxStringLength: 1_048_576,
  maxNumberLength: 32,
})

export type StartCondition = Readonly<Record<string, unknown>>

export type RequestAccessVerdict =
  | Readonly<{ kind: 'allowed'; condition: StartCondition | null }>
  | Exclude<AccessVerdict, { kind: 'allowed' }>

export interface ToolRequestAccess<P> {
  qualify(
    input: CallAccess<P> & Readonly<{ request: FixedToolRequest }>,
  ): Promise<RequestAccessVerdict>
}

export interface ConditionalLedgerCommit {
  commit(
    input: Readonly<{ condition: StartCondition; ledger: LedgerCommitInput }>,
  ): Promise<LedgerCommit | Readonly<{ kind: 'condition-failed' }>>
}

export type ToolHostAccess<P> = Readonly<{
  guard: ToolAccessGuard<P>
  start: StartCoordinatorAccess<P>
  request?: ToolRequestAccess<P>
}>

export type LocalToolLedgerGuardsInput<P, E = unknown> = Readonly<{
  access: ToolHostAccess<P>
  sources: LocalInvocationSource<P>
  bindings: Pick<ToolBindings<P, E>, 'recover'>
  grants: ReadonlyMap<string, ToolGrantVerifier<P>>
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
