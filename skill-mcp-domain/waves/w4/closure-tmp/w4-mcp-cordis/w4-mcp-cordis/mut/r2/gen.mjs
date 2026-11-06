// Writes mutants.json: the r2 mutants of the closure w4-mcp-cordis.
import { writeFileSync } from 'node:fs'
const HL = 'packages/mcp/mcp-host-local'
const CC = 'packages/mcp/mcp-cordis-contract'
const SRC = `${HL}/src/cordis.ts`
const FAST = { member: HL, file: SRC, test: 'tests/cordis-entry.spec.ts', mode: 'fast' }
const SLOW = { member: HL, file: SRC, test: 'tests/cordis-journey.spec.ts', mode: 'slow' }
const CON = { member: CC, file: `${CC}/src/cordis.ts`, test: 'tests/cordis-entry.spec.ts', mode: 'fast' }
const ROOT = { member: CC, file: `${CC}/src/index.ts`, test: 'tests/public-entry.spec.ts', mode: 'fast' }
const e = (from, to, all) => ({ from, to, ...(all ? { all: true } : {}) })
const readAtApply = (fn, type, key) => [
  e(`function ${fn}(ctx: Context): ${type} {\n`, `function ${fn}(ctx: Context): ${type} {\n  const loaded = ctx.get(${key})\n`),
  e(`const port = ctx.get(${key})`, 'const port = loaded', true),
]
const cachesFirst = (fn, type, key) => [
  e(`function ${fn}(ctx: Context): ${type} {\n`, `function ${fn}(ctx: Context): ${type} {\n  let cached: ${type} | undefined\n`),
  e(`const port = ctx.get(${key})`, `const port = (cached ??= ctx.get(${key}))`, true),
]
const forward = [
  ['current', 'discovery', "{ failure: { kind: 'unknown' as const } }"],
  ['refresh', 'discovery', "{ failure: { kind: 'unknown' as const } }"],
  ['peer', 'discovery', "{ failure: { kind: 'unknown' as const } }"],
  ['invoke', 'invoker', "{ kind: 'not-sent' as const, reason: { kind: 'unknown' as const } }"],
  ['continueWithInput', 'invoker', "{ kind: 'not-sent' as const, reason: { kind: 'unknown' as const } }"],
  ['cancel', 'invoker', "'no-call-in-flight' as const"],
  ['queryTask', 'invoker', "{ failure: { kind: 'effect-unknown' as const, cause: 'no-connection' as const } }"],
  ['taskResult', 'invoker', "{ failure: { kind: 'effect-unknown' as const, cause: 'no-connection' as const } }"],
  ['provideTaskInput', 'invoker', "{ failure: { kind: 'effect-unknown' as const, cause: 'no-connection' as const } }"],
  ['cancelTask', 'invoker', "{ failure: { kind: 'effect-unknown' as const, cause: 'no-connection' as const } }"],
  ['inspect', 'status', "{ failure: { kind: 'not-available-to-you' as const } }"],
  ['list', 'status', "{ failure: 'unknown' as const }"],
]
const m = []
const add = (id, name, base, edits, expect = 'red') => m.push({ id, name, ...base, edits, expect })
// Fast layer.
add('F01', 'eligibility absent answers granted', FAST, [e("if (port === undefined) return { kind: 'unknown' }", "if (port === undefined) return { kind: 'granted' }")])
add('F02', 'adoption endpoint absent answers not-adopted', FAST, [e("if (port === undefined) return fail('unknown')\n      return port.endpoint(", "if (port === undefined) return { ok: 'not-adopted' as const }\n      return port.endpoint(")])
add('F03', 'adoption endpoints absent answers an empty list', FAST, [e("if (port === undefined) return fail('unknown')\n      return port.endpoints(", "if (port === undefined) return { ok: [] }\n      return port.endpoints(")])
add('F04', 'credential absent answers missing', FAST, [e("if (port === undefined) return fail('unknown')\n    // Each branch", "if (port === undefined) return fail('missing')\n    // Each branch")])
add('F05', 'landing absent answers facility-missing', FAST, [e("if (port === undefined) return fail('unknown')\n      return port.start(", "if (port === undefined) return fail('facility-missing')\n      return port.start(")], 'equivalent')
add('F06', 'eligibility adapter reads the port at apply', FAST, readAtApply('eligibilityOf', 'UseEligibility<unknown>', 'mcpUseEligibilityKey'))
add('F07', 'eligibility adapter caches the first reference', FAST, cachesFirst('eligibilityOf', 'UseEligibility<unknown>', 'mcpUseEligibilityKey'))
add('F08', 'adoption adapter reads the port at apply', FAST, readAtApply('adoptionOf', 'AdoptionView<unknown, unknown>', 'mcpAdoptionViewKey'))
add('F09', 'adoption adapter caches the first reference', FAST, cachesFirst('adoptionOf', 'AdoptionView<unknown, unknown>', 'mcpAdoptionViewKey'))
add('F10', 'credential adapter reads the port at apply', FAST, readAtApply('credentialsOf', 'CredentialUse<unknown>', 'mcpCredentialUseKey'))
add('F11', 'landing adapter reads the port at apply', FAST, readAtApply('landingOf', 'ProcessLanding<unknown>', 'mcpProcessLandingKey'))
add('F42', 'credential adapter caches the first reference', FAST, cachesFirst('credentialsOf', 'CredentialUse<unknown>', 'mcpCredentialUseKey'))
add('F43', 'landing adapter caches the first reference', FAST, cachesFirst('landingOf', 'ProcessLanding<unknown>', 'mcpProcessLandingKey'))
add('F12', 'the endpoint status service is not provided', FAST, [e('new HostEndpointStatus(ctx, services.status)', 'void services.status')])
forward.forEach(([method, field, answer], i) =>
  add(`F${13 + i}`, `${method} is not forwarded`, FAST, [e(`return this.${field}.${method}(...args)`, `void args\n    return Promise.resolve(${answer})`)]))
add('F25', 'plain record does not check the prototype', FAST, [e('return prototype === Object.prototype || prototype === null', 'return !Array.isArray(value)')])
add('F26', 'plain record refuses a null prototype', FAST, [e('return prototype === Object.prototype || prototype === null', 'return prototype === Object.prototype')])
add('F27', 'extra keys found with Object.keys', FAST, [e('Reflect.ownKeys(record).find(', 'Object.keys(record).find(')])
add('F28', 'an extra field is not reported', FAST, [e('if (extra !== undefined) return `${what} has no field ${String(extra)}`', 'void extra')])
add('F29', 'a missing field is not reported', FAST, [e('if (missing !== undefined) return `${what} needs the field ${missing}`', 'void missing')])
add('F30', 'clientInfo is not checked for extra fields', FAST, [e("const fields = fieldsIssue(value, CLIENT_INFO_FIELDS, 'clientInfo')\n  if (fields !== undefined) return fields", "const fields = Object.keys(CLIENT_INFO_FIELDS).find(field => !Object.hasOwn(value, field))\n  if (fields !== undefined) return `clientInfo needs the field ${fields}`")])
add('F31', 'the message of maxListingPages names another field', FAST, [e("if (typeof maxListingPages !== 'number') return 'maxListingPages'", "if (typeof maxListingPages !== 'number') return 'maxActions'")])
add('F32', 'the message of probeTimeoutMs names another field', FAST, [e("if (typeof probeTimeoutMs !== 'number') return 'probeTimeoutMs'", "if (typeof probeTimeoutMs !== 'number') return 'maxListingPages'")])
add('F33', 'two bounds swap their values', FAST, [e('return { maxListingPages, maxActions, instructionsByteLimit, probeTimeoutMs }', 'return { maxListingPages: maxActions, maxActions: maxListingPages, instructionsByteLimit, probeTimeoutMs }')])
add('F34', 'clientInfo.name has the message of version', FAST, [e("if (typeof name !== 'string') return 'clientInfo.name must be a text'", "if (typeof name !== 'string') return 'clientInfo.version must be a text'")])
add('F35', 'clientInfo.version has the message of name', FAST, [e("if (typeof version !== 'string') return 'clientInfo.version must be a text'", "if (typeof version !== 'string') return 'clientInfo.name must be a text'")])
add('F36', 'clientInfo that is not an object has another message', FAST, [e("return 'clientInfo must be an object'", "return 'clientInfo must be a record'")])
add('F37', 'a configuration that is not an object has another message', FAST, [e("return issue('configuration must be an object')", "return issue('configuration must be a record')")])
add('F38', 'the schema accepts any value', FAST, [e('Config: mcpPluginConfig,', "Config: { '~standard': { version: 1, vendor: 'omne-harness', validate: (value: unknown) => ({ value: Object(value) }) } },")])
add('F39', 'the plugin replaces a zero maxActions', FAST, [e('maxActions: config.maxActions,', 'maxActions: config.maxActions || 100,')])
add('F40', 'the plugin replaces a zero probe timeout', FAST, [e('probeTimeoutMs: config.probeTimeoutMs,', 'probeTimeoutMs: config.probeTimeoutMs || 1,')])
add('F41', 'test-side: the probe removal resolves instead of throwing (the probe tests Cordis)', { member: HL, file: `${HL}/tests/cordis-entry.spec.ts`, test: 'tests/cordis-entry.spec.ts', mode: 'fast' }, [e('            throw failure\n', '            void failure\n')])
// Slow layer.
forward.forEach(([method, field, answer], i) =>
  add(`S${String(1 + i).padStart(2, '0')}`, `${method} is not forwarded`, SLOW, [e(`return this.${field}.${method}(...args)`, `void args\n    return Promise.resolve(${answer})`)]))
add('S13', 'eligibility adapter reads the port at apply', SLOW, readAtApply('eligibilityOf', 'UseEligibility<unknown>', 'mcpUseEligibilityKey'))
add('S14', 'adoption adapter caches the first reference', SLOW, cachesFirst('adoptionOf', 'AdoptionView<unknown, unknown>', 'mcpAdoptionViewKey'))
add('S15', 'credential adapter reads the port at apply', SLOW, readAtApply('credentialsOf', 'CredentialUse<unknown>', 'mcpCredentialUseKey'))
add('S16', 'landing adapter reads the port at apply', SLOW, readAtApply('landingOf', 'ProcessLanding<unknown>', 'mcpProcessLandingKey'))
add('S17', 'the removal does not await closeAll', SLOW, [e('          const report = await services.connections.closeAll()\n', "          void services.connections.closeAll()\n          const report: readonly Readonly<{ ref: unknown; process: string }>[] = []\n")])
add('S18', 'the removal does not call closeAll', SLOW, [e('          const report = await services.connections.closeAll()\n', "          const report: readonly Readonly<{ ref: unknown; process: string }>[] = []\n")])
add('S19', 'the removal warns only of unconfirmed', SLOW, [e("if (closed.process === 'root-only' || closed.process === 'unconfirmed')", "if (closed.process === 'unconfirmed')")])
add('S20', 'the removal warns of every scope but no-process', SLOW, [e("if (closed.process === 'root-only' || closed.process === 'unconfirmed')", "if (closed.process !== 'no-process')")])
add('S21', 'the warning does not name the endpoint', SLOW, [e("logger.warn('the stop of the process was not confirmed', closed.ref, closed.process)", "logger.warn('the stop of the process was not confirmed', closed.process)")])
// Definition member.
const classes = ['ActionDiscoveryService', 'ActionInvokerService', 'EndpointStatusService', 'AdoptionViewService', 'UseEligibilityService', 'CredentialUseService', 'ProcessLandingService']
classes.forEach((cls, i) => {
  const other = classes[(i + 1) % classes.length]
  add(`K0${1 + i}`, `${cls} registers under the key of ${other}`, CON, [e(`super(ctx, ${cls}.provide)`, `super(ctx, ${other}.provide)`)])
})
add('K08', 'a key literal changes', CON, [e("static readonly provide = 'mcpActionDiscovery'", "static readonly provide = 'mcpDiscovery'")])
add('K09', 'two Services share a key', CON, [e("static readonly provide = 'mcpCredentialUse'", "static readonly provide = 'mcpUseEligibility'")])
add('K10', 'an extra runtime export', CON, [e('export const mcpProcessLandingKey = ProcessLandingService.provide', "export const mcpProcessLandingKey = ProcessLandingService.provide\nexport const mcpExtraKey = 'mcpExtra'")])
add('K11', 'a key constant differs from its provide', CON, [e('export const mcpAdoptionViewKey = AdoptionViewService.provide', "export const mcpAdoptionViewKey = 'mcpAdoptionViews'")])
add('K12', 'the root entry has a runtime value', ROOT, [e('export {}', 'export const root = 1')])
add('K13', 'the root entry loads Cordis', ROOT, [e('export {}', "import '@deepseek-ai/cordis'\nexport {}")])
writeFileSync(new URL('./mutants.json', import.meta.url), JSON.stringify(m, null, 1))
console.log(m.length)
