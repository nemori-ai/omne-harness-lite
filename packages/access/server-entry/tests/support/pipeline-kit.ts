import type { AccessDiagnostic, ServerEntryDiagnostic } from '../../src/index.ts'
import { accessSide, type AccessSide, type AccessSideOptions } from './access-kit.ts'
import { startFixture, type Fixture, type FixtureOptions } from './harness.ts'

export * from './access-kit.ts'

export type AccessFixture = Omit<Fixture, 'diagnostics'> &
  Omit<AccessSide, 'access'> & {
    readonly diagnostics: (ServerEntryDiagnostic | AccessDiagnostic)[]
  }

export type AccessFixtureOptions = FixtureOptions & AccessSideOptions

export async function startAccessFixture(
  options: AccessFixtureOptions = {},
): Promise<AccessFixture> {
  const diagnostics: (ServerEntryDiagnostic | AccessDiagnostic)[] = []
  const { access, ...side } = accessSide(options, event => diagnostics.push(event))
  const fixture = await startFixture({
    ...options,
    dependencies: { ...options.dependencies, diagnostics: event => diagnostics.push(event) },
    access,
  })
  return { ...fixture, ...side, diagnostics }
}
