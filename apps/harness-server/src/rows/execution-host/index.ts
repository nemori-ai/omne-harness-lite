import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  createHostFilesPlugin,
  hostScreen,
} from '@omne-harness/execution-environment-host-local/cordis'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import { z } from 'zod'
import { ConfigError } from '../../config-schema.ts'
import type { HostFilesRuntime } from '../../host-files.ts'
import { defineRow } from '../../row.ts'
import { recordHostOffers } from './offers.ts'

export const hostFactoryBindings: Readonly<Record<string, string>> = {
  executionHost: 'execution-host',
}

const absolutePath = z
  .string()
  .refine(value => (process.platform === 'win32' ? /^[a-z]:[\\/]/i.test(value) : isAbsolute(value)))
const rowConfig = z
  .object({
    stateDirectory: absolutePath,
    maintainIntervalMs: z.number().int().positive().safe().default(60000),
    /** False: the host does not look for a screen backend and offers no `screen`. */
    screen: z.boolean().default(true),
  })
  .passthrough()

type ScreenChoice = Readonly<{ screen: () => ReturnType<typeof hostScreen> }>

export function createExecutionHostBinding(
  runtime: HostFilesRuntime,
  sources: ScreenChoice = { screen: () => hostScreen() },
) {
  const factory = createHostFilesPlugin(runtime.domain)
  function parseConfig(value: unknown) {
    const parsed = rowConfig.safeParse(value)
    if (!parsed.success)
      throw new ConfigError('invalid-config', 'invalid execution-host configuration')
    const { maintainIntervalMs, screen, ...memberInput } = parsed.data
    const member = factory.Config['~standard'].validate(memberInput)
    if ('issues' in member)
      throw new ConfigError('invalid-config', 'invalid execution-host configuration')
    return { maintainIntervalMs, screen, member: member.value }
  }
  const plugin = defineRow({
    row: 'execution-host',
    implementation: 'real',
    lifecycle: { kind: 'none' },
    manifest: { provides: [], injects: [executionEnvironmentKey], sameProviderGroup: null },
    plugin: {
      name: 'executionHost',
      inject: factory.inject,
      async apply(ctx: Context, value: unknown) {
        const config = parseConfig(value)
        const offered = config.screen ? await sources.screen() : null
        if (offered?.kind === 'absent')
          ctx
            .logger('execution-host')
            .info('the screen facility is not offered: %s', offered.reason)
        const screen = offered?.kind === 'offered' ? { screen: offered.backend } : {}
        factory.apply(ctx, config.member, screen)
        recordHostOffers(ctx, ['files', 'command', 'terminal', ...Object.keys(screen)])
        runtime.start(config.maintainIntervalMs)
      },
    },
  })
  plugin.inject = factory.inject
  return { plugin, parseConfig }
}
