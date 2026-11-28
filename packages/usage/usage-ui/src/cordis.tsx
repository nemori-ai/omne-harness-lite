import type { ClientOf } from '@omne-harness/sdk/core'
import { needProtocol } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { usageProtocol, type UsageProtocol } from '@omne-harness/usage-protocol'
import { ianaZoneOf } from './model/range.ts'
import { contributeUsage, type UsageUiOptions } from './places.tsx'
import { usageParts } from './parts.ts'
import { usagePresentation, usageWidget } from './points.ts'
import { createUsageReads } from './view/reads.ts'

const localZone = (): string => ianaZoneOf(Intl.DateTimeFormat().resolvedOptions().timeZone)

type UiModule = ReturnType<typeof defineUiModule>

export function createUsageUiModule(options: UsageUiOptions = {}): UiModule {
  return defineUiModule({
    name: 'usage-ui',
    needs: { usage: needProtocol<ClientOf<UsageProtocol>>(usageProtocol) },
    apply(shell, { usage }) {
      for (const part of usageParts) part.declare(shell)
      usageWidget.declare(shell)
      usagePresentation.declare(shell)
      const reads = createUsageReads(usage, options.zone ?? localZone)
      contributeUsage(shell, reads, options)
    },
  })
}

export { usageExampleModule } from './example.tsx'
export { usageParts } from './parts.ts'
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
