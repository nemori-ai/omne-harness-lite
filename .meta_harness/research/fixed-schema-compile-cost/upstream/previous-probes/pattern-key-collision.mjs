// Counterexample probe for Ajv 8.20.0 usePattern (dist/vocabularies/code.js:70-79):
// the scope key is rx.toString(). A regExp engine that returns a non-RegExp matcher
// ({ test }) yields the key "[object Object]" for every such pattern, so within one Ajv
// instance the second such pattern silently reuses the first one's matcher.
// Also checks today's content-blocks schemaPattern (only one non-RegExp special case).
// Usage: node pattern-key-collision.mjs
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const REPO = '/data/qiwei/repos/omne-harness-lite/.worktrees/test-tiers-mutation'
const AJV = `${REPO}/node_modules/.pnpm/ajv@8.20.0/node_modules/ajv`
const require = createRequire(import.meta.url)
const { Ajv2020 } = require(`${AJV}/dist/2020.js`)
const { version } = require(`${AJV}/package.json`)

const out = { ajv: version, node: process.version }

// 1) Two patterns, both served by non-RegExp matchers.
{
  const engine = Object.assign(
    (source, flags) =>
      source === '^a+$'
        ? { test: s => /^a+$/u.test(s) }
        : source === '^b+$'
          ? { test: s => /^b+$/u.test(s) }
          : new RegExp(source, flags),
    { code: 'engine' },
  )
  const ajv = new Ajv2020({ strict: false, code: { regExp: engine } })
  const validate = ajv.compile({
    type: 'object',
    properties: { a: { type: 'string', pattern: '^a+$' }, b: { type: 'string', pattern: '^b+$' } },
  })
  out.twoObjectMatchers = {
    'b:"bbb" (should be true)': validate({ b: 'bbb' }),
    'b:"aaa" (should be false)': validate({ b: 'aaa' }),
    keys: [...ajv.scope._values.pattern.keys()],
  }
}
// 2) Same two patterns compiled in separate compile() calls of one instance.
{
  const engine = Object.assign(
    (source, flags) =>
      source === '^a+$'
        ? { test: s => /^a+$/u.test(s) }
        : source === '^b+$'
          ? { test: s => /^b+$/u.test(s) }
          : new RegExp(source, flags),
    { code: 'engine' },
  )
  const ajv = new Ajv2020({ strict: false, validateSchema: false, code: { regExp: engine } })
  const first = ajv.compile({ type: 'string', pattern: '^a+$' })
  const second = ajv.compile({ type: 'string', pattern: '^b+$' })
  out.acrossCompileCalls = {
    'first("aaa") (true)': first('aaa'),
    'second("bbb") (should be true)': second('bbb'),
    'second("aaa") (should be false)': second('aaa'),
  }
}
// 3) Control: native RegExp for both -> distinct keys, correct verdicts.
{
  const ajv = new Ajv2020({ strict: false })
  const validate = ajv.compile({
    type: 'object',
    properties: { a: { type: 'string', pattern: '^a+$' }, b: { type: 'string', pattern: '^b+$' } },
  })
  out.nativeControl = { 'b:"bbb" (true)': validate({ b: 'bbb' }), 'b:"aaa" (false)': validate({ b: 'aaa' }) }
}
// 3b) Standalone codegen of case 1: how many pattern constants are emitted for the two patterns.
{
  const standaloneCode = require(`${AJV}/dist/standalone/index.js`).default
  const engine = Object.assign(
    (source, flags) =>
      source === '^a+$'
        ? { test: s => /^a+$/u.test(s) }
        : source === '^b+$'
          ? { test: s => /^b+$/u.test(s) }
          : new RegExp(source, flags),
    { code: 'engine' },
  )
  const ajv = new Ajv2020({
    strict: false,
    validateSchema: false,
    code: { regExp: engine, source: true, esm: true },
  })
  ajv.addSchema({
    $id: 'https://probe.example/two',
    type: 'object',
    properties: { a: { type: 'string', pattern: '^a+$' }, b: { type: 'string', pattern: '^b+$' } },
  })
  const src = standaloneCode(ajv, { Two: 'https://probe.example/two' })
  out.standaloneTwoObjectMatchers = {
    patternConsts: src.match(/const pattern\d+ = [^;]+;/g),
  }
}
// 4) Today's schemaPattern: which sources map to a non-RegExp matcher.
{
  const { schemaPattern } = await import(
    pathToFileURL(`${REPO}/packages/core/content-blocks/dist/schema-pattern.js`).href
  )
  const inline =
    '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)(?![\\s\\S])'
  out.schemaPattern = {
    inlineBytesIsRegExp: schemaPattern(inline, 'u') instanceof RegExp,
    inlineBytesKey: String(schemaPattern(inline, 'u')),
    otherIsRegExp: schemaPattern('^x$', 'u') instanceof RegExp,
    inlineBytesWithoutUFlagIsRegExp: schemaPattern(inline, '') instanceof RegExp,
  }
}
console.log(JSON.stringify(out, null, 1))
