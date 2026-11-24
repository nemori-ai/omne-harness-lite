import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  StaticBlock,
  StaticReaderRequest,
  StaticScopeHolder,
  SuppliedBlockDescriptor,
} from '@omne-harness/runtime-context-contract'
import type { OutsideFiles } from '@omne-harness/workspace-local'

export type OutsideFilesValue = Readonly<{ access: OutsideFiles }>

declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'workspace.outside-files': OutsideFilesValue
  }
}

const KEY = 'workspace.outside-files'
const LEVELS: readonly OutsideFiles[] = ['none', 'read', 'read-write']

function valueOf(value: unknown): OutsideFilesValue | null {
  if (typeof value !== 'object' || value === null) return null
  const access = LEVELS.find(level => level === (value as OutsideFilesValue).access)
  return access === undefined ? null : { access }
}

/** Required: a read that finds no value is missing, never the default of the setting. */
export const outsideFilesDescriptor = Object.freeze({
  key: KEY,
  kind: 'supplied',
  schema: {
    '~standard': {
      version: 1,
      vendor: 'harness-server',
      validate: (value: unknown) => {
        const read = valueOf(value)
        return read === null
          ? { issues: [{ message: 'Expected how far outside its workspace a session may go' }] }
          : { value: read }
      },
    },
  },
  consumers: ['coordinator'],
  required: true,
  disclosure: 'plain',
  carriesPrevious: false,
  volatility: 'per-read',
  recovery: 'reread',
} satisfies SuppliedBlockDescriptor<typeof KEY, OutsideFilesValue>)

/** The block the owner of the setting contributes. Null from `read`: it cannot be read now. */
export function outsideFilesBlock(
  read: (tenant: TenantId) => Promise<OutsideFiles | null>,
): StaticBlock {
  return Object.freeze({
    declaration: outsideFilesDescriptor,
    supply: async ({ tenant }) => {
      const access = await read(tenant)
      return access === null ? { kind: 'unavailable' } : { kind: 'value', value: { access } }
    },
  })
}

export type OutsideFilesReaderDeps<P> = Readonly<{
  scope(): Pick<StaticScopeHolder<P>, 'read'> | undefined
  /** Null: nothing acts for this tenant at the tenant-level scope now. */
  principal(tenant: TenantId): Promise<P | null>
}>

const REQUEST: StaticReaderRequest = { consumer: 'coordinator', blocks: [KEY], needs: [] }

/** Reads the setting through the tenant-level scope. Whatever is not a value is a failure that says why. */
export function createOutsideFilesReader<P>(deps: OutsideFilesReaderDeps<P>) {
  return async (tenant: TenantId): Promise<Outcome<OutsideFiles, string>> => {
    try {
      const scope = deps.scope()
      if (scope === undefined) return fail('the holder of the tenant-level scope is not there')
      const principal = await deps.principal(tenant)
      if (principal === null) return fail('no principal acts for this tenant now')
      const read = await scope.read(principal, tenant, REQUEST)
      if ('failure' in read) return fail(`the read failed: ${JSON.stringify(read.failure)}`)
      const entry = read.ok.entries.find(item => item.key === KEY)
      const value = entry?.kind === 'value' ? valueOf(entry.value) : null
      return value === null
        ? fail(`the block read as ${JSON.stringify(entry ?? 'absent')}`)
        : succeed(value.access)
    } catch (cause) {
      return fail(`the read threw: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }
}
