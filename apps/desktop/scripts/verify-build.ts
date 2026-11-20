// pnpm run verify:build [--no-build]: the test and release bundles hold what their profile says,
// checked from the bundler's module records and the bundle text, with a dev build as the control.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { BUNDLES, type BuildProfile, bundleDir } from './build-profile.ts'
import { bundleConfig, desktopDir, readBundleModules, sha256 } from './bundle-build.ts'
import { bundleProblems } from './bundle-checks.ts'
import { buildProfile } from './build.ts'

/** Every problem of the bundles in `directory`, which holds `profile`'s build. */
export function profileProblems(profile: BuildProfile, directory: string): string[] {
  return BUNDLES.flatMap(bundle => {
    const file = join(directory, bundle)
    const code = readFileSync(file)
    const record = readBundleModules(profile, bundle, directory)
    return bundleProblems(profile, bundle, record, code.toString('utf8'), sha256(code))
  })
}

/** Builds the dev profile's bundles apart from `pnpm run dev`, so a running session is left alone. */
async function devControl(): Promise<string[]> {
  const directory = mkdtempSync(join(tmpdir(), 'omne-verify-build-'))
  try {
    for (const bundle of BUNDLES) await build(bundleConfig('dev', bundle, false, directory))
    return profileProblems('dev', directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export async function verifyBuild(rebuild: boolean): Promise<string[]> {
  if (rebuild) for (const profile of ['test', 'release'] as const) await buildProfile(profile)
  const problems = (['test', 'release'] as const).flatMap(profile =>
    profileProblems(profile, resolve(desktopDir, bundleDir(profile))),
  )
  return [...problems, ...(await devControl()).map(problem => `control: ${problem}`)]
}

if (import.meta.main) {
  try {
    const problems = await verifyBuild(!process.argv.includes('--no-build'))
    for (const problem of problems) process.stderr.write(`verify:build: ${problem}\n`)
    if (problems.length > 0) process.exit(1)
    process.stdout.write('verify:build: test and release bundles hold what their profiles say\n')
  } catch (failure) {
    process.stderr.write(
      `verify:build: ${failure instanceof Error ? failure.message : String(failure)}\n`,
    )
    process.exit(1)
  }
}
