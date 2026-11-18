import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  StaticBlock,
  StaticReaderRequest,
  StaticScopeHolder,
  SuppliedBlockDescriptor,
} from '@omne-harness/runtime-context-contract'
import {
  runtimeContextTenantBlocksKey,
  runtimeContextTenantScopeKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import {
  sessionIntakeLimits,
  type SessionIntakeBudget,
  type SessionIntakeLimits,
} from '@omne-harness/session-contract'
import { SessionIntakeBudgetService } from '@omne-harness/session-cordis-contract/cordis'

declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'session.intake-budget': SessionIntakeLimits
  }
}

const KEY = 'session.intake-budget'

function limitsOf(value: unknown): SessionIntakeLimits | null {
  if (typeof value !== 'object' || value === null) return null
  try {
    return sessionIntakeLimits(value as SessionIntakeLimits)
  } catch {
    return null
  }
}

/** The budget of ordinary inputs of a tenant now. Required: a read that finds no value is missing. */
export const sessionIntakeBudgetDescriptor = Object.freeze({
  key: KEY,
  kind: 'supplied',
  schema: {
    '~standard': {
      version: 1,
      vendor: 'session-adapters',
      validate: (value: unknown) => {
        const limits = limitsOf(value)
        return limits === null
          ? { issues: [{ message: 'Expected the intake limits of a tenant' }] }
          : { value: limits }
      },
    },
  },
  consumers: ['coordinator'],
  required: true,
  disclosure: 'plain',
  carriesPrevious: false,
  volatility: 'per-request',
  recovery: 'reread',
} satisfies SuppliedBlockDescriptor<typeof KEY, SessionIntakeLimits>)

export function sessionIntakeBudgetBlock(
  read: (tenant: TenantId) => Promise<SessionIntakeLimits | null>,
): StaticBlock {
  return Object.freeze({
    declaration: sessionIntakeBudgetDescriptor,
    supply: async ({ tenant }) => {
      const limits = await read(tenant)
      return limits === null ? { kind: 'unavailable' } : { kind: 'value', value: limits }
    },
  })
}

export type IntakeBudgetReaderDeps<P> = Readonly<{
  scope: Pick<StaticScopeHolder<P>, 'read'>
  /** Null: Session cannot act for this tenant now. */
  principal(tenant: TenantId): Promise<P | null>
}>

const REQUEST: StaticReaderRequest = { consumer: 'coordinator', blocks: [KEY], needs: [] }

/** Reads the budget through the tenant-level scope. Whatever is not a value reads as null. */
export function createIntakeBudgetReader<P>(deps: IntakeBudgetReaderDeps<P>): SessionIntakeBudget {
  return Object.freeze({
    async read(tenant: TenantId) {
      try {
        const principal = await deps.principal(tenant)
        if (principal === null) return null
        const read = await deps.scope.read(principal, tenant, REQUEST)
        if ('failure' in read) return null
        const entry = read.ok.entries.find(item => item.key === KEY)
        return entry?.kind === 'value' ? limitsOf(entry.value) : null
      } catch {
        return null
      }
    },
  })
}

export type IntakeBudgetPluginInput = Readonly<{
  principal(tenant: TenantId): Promise<unknown | null>
}>

class IntakeBudgetProvider extends SessionIntakeBudgetService {
  private readonly reader: SessionIntakeBudget

  constructor(ctx: Context, input: IntakeBudgetPluginInput) {
    super(ctx)
    this.reader = createIntakeBudgetReader<unknown>({
      scope: ctx[runtimeContextTenantScopeKey],
      principal: input.principal,
    })
  }

  read(...args: Parameters<SessionIntakeBudget['read']>) {
    return this.reader.read(...args)
  }
}

export function createIntakeBudgetPlugin(input: IntakeBudgetPluginInput): Plugin.Object {
  return {
    name: 'session-intake-budget',
    inject: [runtimeContextTenantScopeKey],
    apply(ctx: Context) {
      new IntakeBudgetProvider(ctx, input)
    },
  }
}

export function createIntakeBudgetOwnerPlugin(
  read: (tenant: TenantId) => Promise<SessionIntakeLimits | null>,
): Plugin.Object {
  return {
    name: 'session-intake-budget-owner',
    inject: [runtimeContextTenantBlocksKey],
    apply(ctx: Context) {
      ctx[runtimeContextTenantBlocksKey].register({ blocks: [sessionIntakeBudgetBlock(read)] })
    },
  }
}
