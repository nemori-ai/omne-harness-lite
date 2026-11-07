import { z } from 'zod'
import { GovernanceIdSchema } from '@omne-harness/governance-contract'
import {
  SettingsSourceRequestSchema,
  type SettingsSourceDestination,
  type SettingsSourceRequest,
} from '@omne-harness/settings-local/preparation'
import type { SqlOperationCoordinator } from './sql-coordinator.ts'
import { bindingSchema } from './operation-schema.ts'
import { equal } from './encoding.ts'
import { isTerminal } from './registrar-results.ts'

const sourceOperationSchema = z.strictObject({
  protocol: z.literal('governance-permission-capture/1'),
  binding: bindingSchema,
})
const unavailable = () => ({ kind: 'unavailable' as const })

export class GovernanceSourceDestination implements SettingsSourceDestination {
  private readonly sql: SqlOperationCoordinator
  private readonly route: string
  constructor(sql: SqlOperationCoordinator, route: string) {
    this.sql = sql
    this.route = GovernanceIdSchema.parse(route)
  }
  private async original(raw: SettingsSourceRequest) {
    const request = SettingsSourceRequestSchema.parse(raw)
    const destination = request.destination
    if (destination.ownerRef !== 'governance' || destination.route !== this.route) return null
    const operation = sourceOperationSchema.safeParse(destination.identity.operation)
    if (!operation.success) return null
    const current = await this.sql.observe(operation.data.binding)
    if (current.kind !== 'found' || current.source.kind === 'not-required') return null
    return equal(current.source.request, request)
      ? { request, binding: operation.data.binding, current }
      : null
  }
  async recognize(raw: SettingsSourceRequest): ReturnType<SettingsSourceDestination['recognize']> {
    try {
      const original = await this.original(raw)
      return original ? { kind: 'known', request: original.request } : unavailable()
    } catch {
      return unavailable()
    }
  }
  async seal(raw: SettingsSourceRequest): ReturnType<SettingsSourceDestination['seal']> {
    try {
      const original = await this.original(raw)
      if (original === null) return unavailable()
      if (!isTerminal(original.current.record))
        await this.sql.executeControl(original.binding, { kind: 'seal', binding: original.binding })
      const current = await this.sql.observe(original.binding)
      if (current.kind !== 'found') return unavailable()
      const outcome = current.record.state
      return outcome === 'committed' || outcome === 'aborted'
        ? { kind: 'terminal', request: original.request, outcome }
        : unavailable()
    } catch {
      return unavailable()
    }
  }
}
