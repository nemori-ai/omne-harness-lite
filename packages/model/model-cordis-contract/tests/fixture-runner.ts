// Runs role fixtures. A fixture is a consumer written against the public entries only. The runner
// does not judge what a fixture proves; it refuses fixtures that do not declare both a normal path
// and a failure path, because a consumer that was never shown a failure has not shown that it can
// decide anything. A failure path names the external coordination decision that the failure changes.

export type FixturePath = Readonly<{
  name: string
  kind: 'normal' | 'failure'
  /** Failure paths only: the decision of the external coordinator that this failure changes. */
  decision?: string
  /** Throws when the consumer behaves wrongly on this path. */
  run: () => void | Promise<void>
}>

export type Fixture = Readonly<{ role: string; paths: readonly FixturePath[] }>

export type PathResult = Readonly<{
  name: string
  kind: FixturePath['kind']
  decision?: string
  ok: boolean
  error?: string
}>

export type FixtureReport = Readonly<{
  ok: boolean
  fixtures: readonly Readonly<{ role: string; paths: readonly PathResult[] }>[]
  /** Declaration problems. A fixture with a problem is not run. */
  problems: readonly string[]
}>

/** What the declaration rules read of a fixture; a report that a fixture process wrote has the same fields. */
export type Declared = Readonly<{
  role: string
  paths: readonly Pick<FixturePath, 'name' | 'kind' | 'decision'>[]
}>

export function declarationProblems(fixture: Declared): string[] {
  const problems: string[] = []
  const label = `fixture ${fixture.role}`
  if (!fixture.paths.some(path => path.kind === 'normal'))
    problems.push(`${label}: no normal path declared`)
  if (!fixture.paths.some(path => path.kind === 'failure'))
    problems.push(`${label}: no failure path declared`)
  for (const path of fixture.paths)
    if (path.kind === 'failure' && (path.decision ?? '').trim() === '')
      problems.push(`${label}: failure path ${path.name} names no coordination decision`)
  const names = fixture.paths.map(path => path.name)
  for (const name of new Set(names.filter((value, index) => names.indexOf(value) !== index)))
    problems.push(`${label}: path name ${name} is declared twice`)
  return problems
}

export async function runFixtures(
  fixtures: readonly Fixture[],
  requiredRoles: readonly string[],
): Promise<FixtureReport> {
  const problems = requiredRoles
    .filter(role => !fixtures.some(fixture => fixture.role === role))
    .map(role => `fixture ${role}: required role has no fixture`)
  const results: { role: string; paths: PathResult[] }[] = []
  for (const fixture of fixtures) {
    const declared = declarationProblems(fixture)
    problems.push(...declared)
    const paths: PathResult[] = []
    if (declared.length === 0) {
      for (const path of fixture.paths) {
        const base = {
          name: path.name,
          kind: path.kind,
          ...(path.decision === undefined ? {} : { decision: path.decision }),
        }
        try {
          await path.run()
          paths.push({ ...base, ok: true })
        } catch (error) {
          paths.push({
            ...base,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }
    results.push({ role: fixture.role, paths })
  }
  const failed = results.some(result => result.paths.some(path => !path.ok))
  return { ok: problems.length === 0 && !failed, fixtures: results, problems }
}
