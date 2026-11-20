import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { usageProtocol, type UsageProtocol } from '@omne-harness/usage-protocol'
import { ianaZoneOf } from './model/range.ts'
import { contributeUsage, type UsageUiOptions } from './places.tsx'
import { createUsageReads } from './view/reads.ts'

export const USAGE = protocolServiceName({ name: usageProtocol.name, major: usageProtocol.major })

const localZone = (): string => ianaZoneOf(Intl.DateTimeFormat().resolvedOptions().timeZone)

type UiModule = ReturnType<typeof defineUiModule>

export function createUsageUiModule(options: UsageUiOptions = {}): UiModule {
  return defineUiModule<Record<string, ClientOf<UsageProtocol>>>({
    name: 'usage-ui',
    inject: [USAGE],
    apply(shell, services) {
      const reads = createUsageReads(services[USAGE]!, options.zone ?? localZone)
      contributeUsage(shell, reads, options)
    },
  })
}

export { usageExampleModule } from './example.tsx'
export {
  USAGE_PRESENTATION,
  USAGE_WIDGET,
  usagePresentation,
  usageWidget,
  type WidgetSubject,
} from './points.ts'
export {
  memoryLayoutStore,
  USAGE_IN_SESSION,
  USAGE_PAGE,
  USAGE_STATUS,
  type UsageUiOptions,
} from './places.tsx'
