// Records every module resolution of the consumer process, ESM `import` and CommonJS `require`
// alike, so the facility can prove that none of them left the consumer directory. The hook is
// synchronous because only `registerHooks` sees `require`.
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
