import type { Context, Plugin } from '@deepseek-ai/cordis'
import { createSessionCallControlPlugin } from '@omne-harness/session-adapters/cordis'
import {
  sessionCallControlKey,
  sessionCallStatesKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { toolRuntimeKey, type ToolRuntimeService } from '@omne-harness/tool-cordis-contract/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'
import { coordinatorReadPerCall } from '../session-ad14/index.ts'

export const sessionCallControlConfig = z.strictObject({})

// Tool and the coordinator principal are taken at each control or state read: either away answers
// unavailable.
const plugin: Plugin.Object = {
  name: 'session-call-control',
  Config: sessionCallControlConfig,
  async apply(ctx: Context) {
    const tools = () =>
      (ctx.get(toolRuntimeKey) as ToolRuntimeService<unknown, never> | undefined) ?? null
    await ctx.plugin(
      createSessionCallControlPlugin<unknown>({ tools, principal: coordinatorReadPerCall(ctx) }),
    )
  },
}

export const sessionCallControlRow = defineRow({
  row: 'session-call-control',
  implementation: 'real',
  manifest: {
    provides: [sessionCallControlKey, sessionCallStatesKey],
    injects: [],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
