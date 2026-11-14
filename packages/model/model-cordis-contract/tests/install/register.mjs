import { registerHooks } from 'node:module'
import { appendFileSync } from 'node:fs'

registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context)
    appendFileSync(
      process.env.PROBE_RESOLUTIONS,
      `${JSON.stringify({ specifier, parent: context.parentURL ?? null, url: result.url })}\n`,
    )
    return result
  },
})
