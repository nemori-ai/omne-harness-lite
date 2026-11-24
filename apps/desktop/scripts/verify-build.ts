// pnpm run verify:build [--no-build]: the test and release bundles hold what their profile says,
// checked from the bundler's module records and the bundle text, with a dev build as the control.
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import {
  BUNDLES,
  type Bundle,
  type BuildProfile,
  bundleDir,
  requireBuilt,
} from './build-profile.ts'
import { bundleConfig, desktopDir, readBundleModules } from './bundle-build.ts'
import { checkBundleModules, checkBundleTexts } from './bundle-checks.ts'
import { buildProfile } from './build.ts'

/** Every problem of the bundles in `directory`, which holds `profile`'s build: module lists and text. */
export function profileProblems(profile: BuildProfile, directory: string): string[] {
  const modules = BUNDLES.flatMap(bundle => {
    const record = readBundleModules(profile, bundle, directory)
    return checkBundleModules(profile, bundle, record.modules, record.renderedModules).problems
  })
  const code = Object.fromEntries(
    BUNDLES.map(bundle => [bundle, readFileSync(join(directory, bundle), 'utf8')]),
  ) as Record<Bundle, string>
  return [...modules, ...checkBundleTexts(profile, code).problems]
}

/** The built test and release bundles; the test ones are the control for every marker. */
export function checkBuiltBundles(): string[] {
  return (['test', 'release'] as const).flatMap(profile =>
    profileProblems(profile, resolve(desktopDir, bundleDir(profile))),
  )
}

/** Builds the dev profile's bundles apart from `pnpm run dev`, so a running session is left alone. */
async function devControl(): Promise<string[]> {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'omne-verify-build-')))
  try {
    for (const bundle of BUNDLES) await build(bundleConfig('dev', bundle, false, directory))
    return profileProblems('dev', directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export async function verifyBuild(rebuild: boolean): Promise<string[]> {
  for (const profile of ['test', 'release'] as const)
    if (rebuild) await buildProfile(profile)
    else requireBuilt(profile, desktopDir)
  return [...checkBuiltBundles(), ...(await devControl()).map(problem => `control: ${problem}`)]
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
