// Runs inside the consumer directory: imports the compiled fixture, runs its paths one after the
// other and writes what each did to the report file named on the command line. A path that throws
// is a failed path in the report. A fixture that cannot be imported, or that does not export the
// expected shape, ends this process with an error and writes no report.
import { writeFileSync } from 'node:fs'

const [, , reportPath] = process.argv
// The specifier is computed: the compiled file does not exist where the dependency graph of the
// repository reads this file.
const { fixture } = await import(new URL('./fixture-out/fixture.js', import.meta.url).href)
if (typeof fixture?.role !== 'string' || !Array.isArray(fixture.paths))
  throw new TypeError('fixture.ts must export `fixture` with a role and a list of paths')

const paths = []
for (const path of fixture.paths) {
  if (typeof path?.run !== 'function')
    throw new TypeError(`the path ${String(path?.name)} has no run function`)
  const entry = {
    name: path.name,
    kind: path.kind,
    ...(path.decision === undefined ? {} : { decision: path.decision }),
  }
  try {
    await path.run()
    paths.push({ ...entry, ok: true })
  } catch (error) {
    paths.push({
      ...entry,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
writeFileSync(reportPath, JSON.stringify({ role: fixture.role, paths }))
