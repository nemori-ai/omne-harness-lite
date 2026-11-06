import { Context } from '@deepseek-ai/cordis'
import { mcpActionDiscoveryKey } from '@omne-harness/mcp-cordis-contract/cordis'
import { probe } from './plugin/mcp-wrap.js'
const variant = process.argv[2]
const { createMcpPlugin } = await import(`./plugin/${variant}.js`)
const CONFIG = { maxListingPages: 5, maxActions: 100, instructionsByteLimit: 4096, probeTimeoutMs: 10000, clientInfo: { name: 'p', version: '0' } }
const plugin = createMcpPlugin({ principalKey: String, checkOutput: () => ({ kind: 'conforms' }) })
async function run(label, reject) {
  const ctx = new Context()
  const errors = []
  ctx.logger.exporter({ export(m) { if (m.type === 'error') errors.push(...m.args) } })
  probe.delayMs = 300; probe.reject = reject; probe.settledAt = undefined
  const fiber = await ctx.plugin(plugin, CONFIG)
  const before = ctx.get(mcpActionDiscoveryKey) !== undefined
  let disposeOutcome
  try { await fiber.dispose(); disposeOutcome = 'resolved' } catch (e) { disposeOutcome = 'rejected ' + e }
  const returnedAt = Date.now()
  console.log(JSON.stringify({ variant, label, before, disposeOutcome,
    closeAllSettledBeforeDisposeReturned: probe.settledAt !== undefined && probe.settledAt <= returnedAt,
    after: ctx.get(mcpActionDiscoveryKey) === undefined ? 'undefined' : 'present',
    loggedErrors: errors.map(e => e?.message ?? String(e)) }))
  await new Promise(r => setTimeout(r, 400))
}
await run('closeAll resolves after 300ms', undefined)
await run('closeAll rejects with AggregateError after 300ms', new AggregateError([new Error('defect-1'), new Error('defect-2')], 'closeAll failed'))
