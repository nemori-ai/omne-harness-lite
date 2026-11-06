import { Context } from '@deepseek-ai/cordis'
const ctx = new Context()
const plain = [], leveled = []
ctx.logger.exporter({ export(m) { plain.push(m.type) } })
ctx.logger.exporter({ levels: { default: 2 }, export(m) { leveled.push([m.type, m.name, m.args]) } })
const fiber = await ctx.plugin({ name: 'p', apply(c) { const l = c.logger('mcp'); c.effect(() => async () => { l.warn('process stop not confirmed', { name: 'files' }, 'unconfirmed') }, 'x') } })
await fiber.dispose()
console.log(JSON.stringify({ plain, leveled }))
