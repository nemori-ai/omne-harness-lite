import { z } from 'zod'
import { sourceRequestSchema, type SourceRequest } from './source-retention-schema.ts'
import { sourceCustodyReceiptSchema } from './source-custody-schema.ts'
import type { SettingsSourceDestination } from './source-service-schema.ts'
import type { PreparationSql } from './preparation-sql.ts'
import { attemptBinding } from './preparation-observation.ts'
import { attemptTerminalSchema } from './finalization-schema.ts'
import { equal } from './encoding.ts'
const custodySchema = z.union([
  sourceCustodyReceiptSchema,
  z.strictObject({ kind: z.literal('not_found') }),
  z.object({ kind: z.enum(['planned', 'requested']), request: sourceRequestSchema }),
])
export function preparationSourceDestination<Context>(
  sql: PreparationSql<Context>,
): SettingsSourceDestination {
  async function recognize(request: SourceRequest) {
    const destination = request.destination
    if (
      destination.ownerRef !== 'settings' ||
      !equal(destination.identity.domain, sql.options.domain)
    )
      return undefined
    const root = await sql.root(destination.identity)
    if (root.kind !== 'found') return undefined
    const binding = attemptBinding(root, destination.attemptId)
    if (binding.commandDigest !== destination.commandDigest) return undefined
    const record = custodySchema.parse(
      await sql.read({
        kind: 'source',
        input: {
          identity: destination.identity,
          attemptId: destination.attemptId,
          source: request.source,
        },
      }),
    )
    if (record.kind === 'not_found' || record.kind === 'planned' || !equal(record.request, request))
      return undefined
    return binding
  }
  async function seal(request: SourceRequest) {
    const binding = await recognize(request)
    if (!binding) return { kind: 'unavailable' as const }
    await sql.write({ kind: 'seal', binding })
    const terminal = attemptTerminalSchema.parse(await sql.read({ kind: 'terminal', binding }))
    return equal(terminal.binding, binding)
      ? { kind: 'terminal' as const, request, outcome: terminal.state }
      : { kind: 'unavailable' as const }
  }
  return {
    async recognize(raw) {
      const request = sourceRequestSchema.safeParse(raw)
      if (!request.success) return { kind: 'unavailable' }
      try {
        return (await recognize(request.data))
          ? { kind: 'known', request: request.data }
          : { kind: 'unavailable' }
      } catch {
        return { kind: 'unavailable' }
      }
    },
    async seal(raw) {
      const request = sourceRequestSchema.safeParse(raw)
      if (!request.success) return { kind: 'unavailable' }
      return seal(request.data).catch(() => ({ kind: 'unavailable' as const }))
    },
  }
}
