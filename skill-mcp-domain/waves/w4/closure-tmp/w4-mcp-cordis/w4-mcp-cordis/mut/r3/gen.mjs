// Writes mutants.json: the r3 mutants of the closure w4-mcp-cordis (D-face supplement).
import { writeFileSync } from 'node:fs'
const HL = 'packages/mcp/mcp-host-local'
const SRC = `${HL}/src/cordis.ts`
const FAST = { member: HL, file: SRC, test: 'tests/cordis-entry.spec.ts', mode: 'fast' }
const SLOW = { member: HL, file: SRC, test: 'tests/cordis-journey.spec.ts', mode: 'slow' }
const e = (from, to) => ({ from, to })
const m = []
const add = (id, name, base, edits, expect = 'red') => m.push({ id, name, ...base, edits, expect })
add('BASE-HL-FAST', 'unmutated fast file', FAST, [], 'green')
add('BASE-HL-SLOW', 'unmutated slow file', SLOW, [], 'green')
add('M01', 'the plugin is named mcp-x', FAST, [e("    name: 'mcp',", "    name: 'mcp-x',")])
add('M02', 'a null configuration is not refused as a non-object', FAST, [e("if (typeof value !== 'object' || value === null) return false", "if (typeof value !== 'object') return false")])
add('M03', 'an undefined configuration is not refused as a non-object', FAST, [e("if (typeof value !== 'object' || value === null) return false", 'if (value === null) return false')])
add('M04', 'the message of maxActions names another field', FAST, [e("if (typeof maxActions !== 'number') return 'maxActions'", "if (typeof maxActions !== 'number') return 'maxListingPages'")])
add('M05', 'the message of instructionsByteLimit names another field', FAST, [e("if (typeof instructionsByteLimit !== 'number') return 'instructionsByteLimit'", "if (typeof instructionsByteLimit !== 'number') return 'maxActions'")])
add('M06', 'the plugin never passes fetch to the transport factory', FAST, [e('          ...(parts.fetch === undefined ? {} : { fetch: parts.fetch }),\n', '')])
add('M07', 'the credential adapter does not forward an http-authorization acquire', FAST, [e('    return port.acquire(access, holding, purpose, binding)\n  }\n  return { acquire }', "    return fail('unknown')\n  }\n  return { acquire }")])
add('M08', 'the plugin never passes the clock to the services', SLOW, [e('        ...(parts.clock === undefined ? {} : { clock: parts.clock }),\n', '')])
writeFileSync(new URL('./mutants.json', import.meta.url), JSON.stringify(m, null, 1))
console.log(m.length)
