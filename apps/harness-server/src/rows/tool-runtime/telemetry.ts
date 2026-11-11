import { createHash } from 'node:crypto'
import { tenantScope } from '@omne-harness/legal-identity'
import { defineEvent, type OwnedRef, type TelemetryPort } from '@omne-harness/telemetry-contract'
import type { ToolLifecycleObserver } from '@omne-harness/tool'

export const toolMaterialLifecycle = defineEvent({
  owner: 'tool',
  name: 'omne.tool.material.lifecycle',
  version: 1,
  level: 'info',
  schema: {
    phase: {
      kind: 'enum',
      values: ['result-commit', 'offload', 'delivery-release', 'expire', 'reclaim', 'failure'],
    },
    failure: { kind: 'enum', values: ['none', 'unknown', 'conflict', 'unavailable', 'rejected'] },
    items: { kind: 'number', min: 1, max: Number.MAX_SAFE_INTEGER },
    bytes: { kind: 'number', min: 0, max: Number.MAX_SAFE_INTEGER, optional: true },
  },
})

export function createToolLifecycleTelemetry(
  read: () => TelemetryPort | undefined,
  instance: OwnedRef,
): ToolLifecycleObserver {
  return event => {
    try {
      const port = read()
      if (port === undefined) return
      let scope
      try {
        scope = tenantScope(event.tenant)
      } catch {
        port.discard(toolMaterialLifecycle, 'invalid')
        return
      }
      port
        .bind({
          scope,
          component: 'tool',
          instance,
          call: {
            owner: '@omne-harness/tool',
            ref: createHash('sha256').update(event.call).digest('hex'),
          },
        })
        .event(toolMaterialLifecycle, {
          phase: event.phase,
          failure: event.failure,
          items: event.items,
          ...(event.bytes === undefined ? {} : { bytes: event.bytes }),
        })
    } catch {
      /* Telemetry cannot change the confirmed Tool outcome. */
    }
  }
}
