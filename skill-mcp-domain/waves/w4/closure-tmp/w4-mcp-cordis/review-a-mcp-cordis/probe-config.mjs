import { Context } from '@deepseek-ai/cordis'
import { mcpActionDiscoveryKey } from '@omne-harness/mcp-cordis-contract/cordis'
import { createMcpPlugin } from './plugin/cordis.js'
const C = { maxListingPages: 5, maxActions: 100, instructionsByteLimit: 4096, probeTimeoutMs: 10000, clientInfo: { name: 'p', version: '0' } }
const plugin = createMcpPlugin({ principalKey: String, checkOutput: () => ({ kind: 'conforms' }) })
const cases = {
  clientInfoExtra: { ...C, clientInfo: { name: 'p', version: '0', title: 'x' } },
  clientInfoVersionNumber: { ...C, clientInfo: { name: 'p', version: 1 } },
  clientInfoArray: { ...C, clientInfo: ['p', '0'] },
  configArray: [],
  configNull: null,
  maxListingPagesNaN: { ...C, maxListingPages: NaN },
  maxActionsInfinity: { ...C, maxActions: Infinity },
  instructionsNegative: { ...C, instructionsByteLimit: -1 },
  probeTimeoutFraction: { ...C, probeTimeoutMs: 0.5 },
  maxListingPages0: { ...C, maxListingPages: 0 },
  instructions0: { ...C, instructionsByteLimit: 0 },
  emptyName: { ...C, clientInfo: { name: '', version: '0' } },
  lawful: C,
}
for (const [name, cfg] of Object.entries(cases)) {
  const v = plugin.Config['~standard'].validate(cfg)
  const ctx = new Context()
  let load
  try { const f = await Reflect.apply(ctx.plugin, ctx, [plugin, cfg]); load = 'loaded'; await f.dispose() } catch (e) { load = `failed ${e?.constructor?.name}: ${String(e?.message).slice(0, 90)}` }
  console.log(name.padEnd(26), JSON.stringify(v).slice(0, 80).padEnd(82), load)
}
