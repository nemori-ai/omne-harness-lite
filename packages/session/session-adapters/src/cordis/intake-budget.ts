import type { TenantId } from '@omne-harness/legal-identity'
import type {
  StaticBlock,
  StaticReaderRequest,
  StaticScopeHolder,
  SuppliedBlockDescriptor,
} from '@omne-harness/runtime-context-contract'
import type { SessionIntakeBudget } from '@omne-harness/session-contract'

export type SessionIntakeBudgetValue = Readonly<{ maxPendingInputs: number }>

declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'session.intake-budget': SessionIntakeBudgetValue
  }
}

const KEY = 'session.intake-budget'

function valueOf(value: unknown): SessionIntakeBudgetValue | null {
  if (typeof value !== 'object' || value === null) return null
  const { maxPendingInputs } = value as SessionIntakeBudgetValue
  return Number.isSafeInteger(maxPendingInputs) && maxPendingInputs >= 1
    ? { maxPendingInputs }
    : null
}

/** Required: a read that finds no value is missing, never an empty budget. */
export const sessionIntakeBudgetDescriptor = Object.freeze({
  key: KEY,
  kind: 'supplied',
  schema: {
    '~standard': {
      version: 1,
      vendor: 'session-adapters',
      validate: (value: unknown) => {
        const budget = valueOf(value)
        return budget === null
          ? { issues: [{ message: 'Expected the intake budget of a tenant' }] }
          : { value: budget }
      },
    },
  },
  consumers: ['coordinator'],
  required: true,
  disclosure: 'plain',
  carriesPrevious: false,
  volatility: 'per-read',
  recovery: 'reread',
} satisfies SuppliedBlockDescriptor<typeof KEY, SessionIntakeBudgetValue>)

/** The block the owner of the setting contributes. Null from `read`: it cannot be read now. */
export function sessionIntakeBudgetBlock(
  read: (tenant: TenantId) => Promise<number | null>,
): StaticBlock {
  return Object.freeze({
    declaration: sessionIntakeBudgetDescriptor,
    supply: async ({ tenant }) => {
      const maxPendingInputs = await read(tenant)
      return maxPendingInputs === null
        ? { kind: 'unavailable' }
        : { kind: 'value', value: { maxPendingInputs } }
    },
  })
}

export type IntakeBudgetReaderDeps<P> = Readonly<{
  scope(): Pick<StaticScopeHolder<P>, 'read'> | undefined
  /** Null: Session cannot act for this tenant now. */
  principal(tenant: TenantId): Promise<P | null>
  /** The size limit of one input: a deployment value, not a setting of the tenant. */
  maxInputBytes: number
  report?(diagnostic: string): void
}>

const REQUEST: StaticReaderRequest = { consumer: 'coordinator', blocks: [KEY], needs: [] }

/** Reads the budget through the tenant-level scope. Whatever is not a value reads as null. */
export function createIntakeBudgetReader<P>(deps: IntakeBudgetReaderDeps<P>): SessionIntakeBudget {
  const none = (diagnostic: string): null => {
    deps.report?.(diagnostic)
    return null
  }
  return Object.freeze({
    async read(tenant: TenantId) {
      try {
        const scope = deps.scope()
        if (scope === undefined) return none('the holder of the tenant-level scope is not there')
        const principal = await deps.principal(tenant)
        if (principal === null) return none('no principal acts for this tenant now')
        const read = await scope.read(principal, tenant, REQUEST)
        if ('failure' in read) return none(`the read failed: ${JSON.stringify(read.failure)}`)
        const entry = read.ok.entries.find(item => item.key === KEY)
        const budget = entry?.kind === 'value' ? valueOf(entry.value) : null
        if (budget === null) return none(`the block read as ${JSON.stringify(entry ?? 'absent')}`)
        return { ...budget, maxInputBytes: deps.maxInputBytes }
      } catch (cause) {
        return none(`the read threw: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    },
  })
}
