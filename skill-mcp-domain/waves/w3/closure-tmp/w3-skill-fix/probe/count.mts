// Runs every exploration of tests/model and prints its cases, violations and time.
const base = new URL('../../../../packages/skills/skill/tests/model/', import.meta.url)
const runs: [string, string][] = [
  ['disclosure.ts', 'exploreDisclosure'],
  ['whole-unknown.ts', 'exploreWholeUnknown'],
  ['basis.ts', 'exploreBasis'],
  ['range.ts', 'exploreRange'],
  ['order.ts', 'exploreOrder'],
  ['abort.ts', 'exploreAbort'],
  ['identity.ts', 'exploreIdentity'],
]
const only = process.argv[2]
for (const [file, name] of runs) {
  if (only !== undefined && !file.startsWith(only)) continue
  const m = await import(new URL(file, base).href)
  const r = await m[name]()
  console.log(`${r.property}: cases ${r.cases}, violations ${r.violations.length}${r.violations.length >= 20 ? '+' : ''}, ${r.ms} ms`)
  for (const v of r.violations.slice(0, 2)) console.log('   e.g.', JSON.stringify(v.request), JSON.stringify(v.schedule?.faults ?? []), v.detail.slice(0, 200))
}
