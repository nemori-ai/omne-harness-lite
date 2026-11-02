import type { Context } from '@deepseek-ai/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ResidentKey } from '@omne-harness/session-contract'
import { sessionKey, type SessionService } from '@omne-harness/session-cordis-contract/cordis'
import { encodeResidentKey, projectResidentReferences } from '@omne-harness/tool-contract'
import {
  ToolResidencyReaderService,
  toolResidencyReaderKey,
  type ToolResidencyReader,
} from '@omne-harness/tool-cordis-contract/cordis'
import { z } from 'zod'
import { TOOL_RESIDENCY_PRINCIPAL_KEY } from '../../entry/tool-residency-principal.ts'
import { defineRow } from '../../row.ts'

const configSchema = z
  .strictObject({
    pageSize: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(100),
  })
  .default({ pageSize: 100 })

type Result = Awaited<ReturnType<ToolResidencyReader['referencing']>>
const unavailable = (diagnostic: string): Result =>
  fail({ kind: 'unavailable', diagnostic: `tool-residency: ${diagnostic}` })

/** One row generation owns its pending settlements. Removal does not wait for Session reads. */
class ToolResidencyBridge extends ToolResidencyReaderService {
  static readonly Config = configSchema
  static readonly inject = {
    [sessionKey]: { caller: 'maintainer' },
    [TOOL_RESIDENCY_PRINCIPAL_KEY]: null,
  }

  private removed = false
  private readonly pending = new Set<(result: Result) => void>()
  readonly referencing: ToolResidencyReader['referencing']

  constructor(ctx: Context, config: z.input<typeof configSchema>) {
    super(ctx)
    const { pageSize } = configSchema.parse(config)
    const session = ctx.session
    const principal: unknown = ctx.get(TOOL_RESIDENCY_PRINCIPAL_KEY)
    ctx.effect(
      () => () => {
        this.removed = true
        for (const settle of this.pending) settle(unavailable('removed'))
      },
      'tool-residency.pending',
    )

    this.referencing = input => {
      if (this.removed) return Promise.resolve(unavailable('removed'))
      return new Promise<Result>(resolve => {
        const settle = (result: Result) => {
          if (!this.pending.delete(settle)) return
          resolve(result)
        }
        this.pending.add(settle)
        void this.read(session, principal, pageSize, input).then(settle)
      })
    }
  }

  private async read(
    session: Pick<SessionService, 'reconciliation'>,
    principal: unknown,
    limit: number,
    { scope, key, after }: Parameters<ToolResidencyReader['referencing']>[0],
  ): Promise<Result> {
    try {
      if (scope !== 'system') return unavailable('scope')
      const encoded = encodeResidentKey(key)
      if ('failure' in encoded) return unavailable('invalid key')
      // Tool minted and validated this opaque text. Session deliberately does not parse it.
      const residentKey = encoded.ok as ResidentKey
      const read = await session.reconciliation.references({
        principal,
        scope: 'system',
        key: residentKey,
        after,
        limit,
      })
      if ('failure' in read) return unavailable('references failed')
      const page = projectResidentReferences(read.ok)
      return 'failure' in page ? unavailable('invalid stored shape') : succeed(page.ok)
    } catch {
      return unavailable('read failed')
    }
  }
}

export const toolResidencyRow = defineRow({
  row: 'tool-residency',
  implementation: 'real',
  manifest: {
    provides: [toolResidencyReaderKey],
    injects: [sessionKey, TOOL_RESIDENCY_PRINCIPAL_KEY],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: ToolResidencyBridge,
})
