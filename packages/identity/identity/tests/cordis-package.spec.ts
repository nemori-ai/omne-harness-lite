/** @module-tag slow */
// Packs the member and starts independent Node and TypeScript consumers of the unpacked archive.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
  existsSync,
} from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('consumes the packed ./cordis entry with original types and keeps Cordis out of the root load', () => {
  const member = fileURLToPath(new URL('../', import.meta.url))
  const root = resolve(member, '../../..')
  const evidence = join(root, 'tmp/issue-992/package-consumers')
  mkdirSync(evidence, { recursive: true })
  const scratch = realpathSync(mkdtempSync(join(evidence, 'consumer-')))
  let sequence = 0
  const run = (file: string, args: string[], cwd = scratch) => {
    const result = spawnSync(file, args, {
      cwd,
      encoding: 'utf8',
      timeout: 90_000,
      env: { ...process.env, NODE_OPTIONS: '' },
    })
    writeFileSync(
      join(scratch, `command-${sequence++}.json`),
      JSON.stringify({ file, args, ...result }, null, 2),
    )
    expect(result.error).toBeUndefined()
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    return result.stdout
  }
  const pnpm = (process.env['PATH'] ?? process.env['Path'] ?? '')
    .split(delimiter)
    .map(directory => join(directory, 'node_modules/pnpm/bin/pnpm.cjs'))
    .find(entry => existsSync(entry))
  if (pnpm) run(process.execPath, [pnpm, 'pack', '--pack-destination', scratch], member)
  else run('pnpm', ['pack', '--pack-destination', scratch], member)
  const archive = readdirSync(scratch).find(name => name.endsWith('.tgz'))
  if (!archive) throw new Error('pack produced no archive')
  const installed = join(scratch, 'node_modules/@omne-harness/identity')
  mkdirSync(installed, { recursive: true })
  run('tar', ['-xzf', archive, '--strip-components=1', '-C', installed])
  expect(readdirSync(installed)).not.toContain('src')
  // Reuse locked dependency artifacts. The identity package itself is the unpacked tarball.
  for (const dependency of [
    '@deepseek-ai/cordis',
    '@omne-harness/legal-identity',
    '@omne-harness/operation-result',
    '@omne-harness/utc-instant',
  ]) {
    const manifest = findPackageJSON(dependency, new URL('../package.json', import.meta.url).href)
    if (!manifest) throw new Error(`dependency manifest missing: ${dependency}`)
    const destination = join(scratch, 'node_modules', dependency)
    mkdirSync(dirname(destination), { recursive: true })
    symlinkSync(dirname(manifest), destination, process.platform === 'win32' ? 'junction' : 'dir')
  }
  writeFileSync(join(scratch, 'package.json'), JSON.stringify({ type: 'module', private: true }))
  writeFileSync(
    join(scratch, 'root.mjs'),
    `
import { registerHooks } from 'node:module'
registerHooks({ resolve(specifier, context, next) {
  if (specifier.includes('cordis')) throw new Error('root loaded Cordis: ' + specifier)
  return next(specifier, context)
} })
const root = await import('@omne-harness/identity')
if ('IdentityOperationsService' in root) throw new Error('root leaked service')
if (!import.meta.resolve('@omne-harness/identity').endsWith('/dist/index.js')) throw new Error('root resolution')
`,
  )
  run(process.execPath, ['root.mjs'])
  writeFileSync(
    join(scratch, 'consumer.ts'),
    `
import { Context } from '@deepseek-ai/cordis'
import type { IdentityOperations, PrincipalIssuer, PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { IdentityOperationsService, PrincipalIssuerService, PrincipalVerifierService, TenantStandingSourceService, principalVerifierKey } from '@omne-harness/identity/cordis'
const assertTypes = (operations: IdentityOperationsService, standing: TenantStandingSourceService, issuer: PrincipalIssuerService, verifier: PrincipalVerifierService) => {
  const ports: [IdentityOperations, TenantStandingSource, PrincipalIssuer, PrincipalVerifier] = [operations, standing, issuer, verifier]
  // @ts-expect-error sync login results remain invalid
  const bad: IdentityOperationsService['issueLogin'] = () => ({ kind: 'uniform-auth-failure' })
  // @ts-expect-error an issuer cannot verify
  const wrong: PrincipalVerifier = issuer
  void ports; void bad; void wrong
}
void assertTypes
const authority = inProcessPrincipalAuthority()
class Verifier extends PrincipalVerifierService { readonly verify = authority.verifier.verify }
const ctx = new Context()
const fiber = await ctx.plugin(Verifier)
const verifier = ctx.get(principalVerifierKey)
if (!(verifier instanceof Verifier)) throw new Error('registration')
const issued = authority.issuer.issueSystem({ component: 'packed-consumer' })
if ('failure' in issued) throw new Error('issue')
if ((await verifier.verify(issued.ok)).kind !== 'verified') throw new Error('verify')
await fiber.dispose()
if (ctx.get(principalVerifierKey) !== undefined) throw new Error('disposal')
if (!import.meta.resolve('@omne-harness/identity/cordis').endsWith('/dist/cordis.js')) throw new Error('cordis resolution')
`,
  )
  writeFileSync(
    join(scratch, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        target: 'ES2022',
        strict: true,
        types: [],
        skipLibCheck: false,
        outDir: 'out',
      },
      include: ['consumer.ts'],
    }),
  )
  const require = createRequire(new URL('../package.json', import.meta.url))
  const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc')
  run(process.execPath, [tsc, '-p', 'tsconfig.json'])
  run(process.execPath, ['out/consumer.js'])
  writeFileSync(
    join(scratch, 'artifact.json'),
    JSON.stringify(
      {
        archive,
        sha256: createHash('sha256')
          .update(readFileSync(join(scratch, archive)))
          .digest('hex'),
        dependencySource: 'locked workspace node_modules; identity extracted from pack',
      },
      null,
      2,
    ),
  )
})
