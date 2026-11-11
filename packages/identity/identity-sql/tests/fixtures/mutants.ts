// Mutant builds for the negative controls: a copy of this package's `dist` with one check taken out
// of the product code, so a test can show that the contract case written for that check turns red
// without it. The copy goes under this package's `tmp/` (ignored by Git, removed after each use):
// inside the package, so its imports of `@omne-harness/*` resolve as the real build's do, and
// outside `node_modules`, so Vitest loads it in the same module graph as the suite and the copy
// shares one `legal-identity` with it (identities minted by one instance are foreign to another).
// Its materials carry the digests of the changed Worker files, so the copy registers its own
// combination. The copy holds the JavaScript only, without source maps. Each mutation names an exact
// text or pattern that must match once; when the product code changes, the mutant fails loudly here instead of
// passing silently. The product code knows nothing of this file.
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { IdentitySqlBuild } from './governance.ts'

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const DIST = join(PACKAGE_ROOT, 'dist')
const CACHE = join(PACKAGE_ROOT, 'tmp', 'mutants')

/** One textual change in one `dist` file. `from` must occur exactly once. */
export type Mutation = Readonly<{ file: string; from: string | RegExp; to: string }>

export type MutantBuild = Readonly<{ build: IdentitySqlBuild; remove(): void }>

/** The checks that the negative controls take out, one mutation each. */
export const CHECKS = {
  /** The participant never finds that a change leaves no super administrator (ID-06). */
  'last-admin': {
    file: 'worker/participant.js',
    from: 'return activeSuperAdmins(port, organization, superAdminRole) <= 1;',
    to: 'return false;',
  },
  /** The participant does not compare the expected role with the role at commit (A6). */
  'expected-role': {
    file: 'worker/participant.js',
    from: "if (facts.expectedRole !== target.role)\n        return reply('conflict');",
    to: "if (false)\n        return reply('conflict');",
  },
  /** Recognition does not treat a revoked login as ended (ID-18, IS-12). */
  'revocation-ends-recognition': {
    file: 'provider.js',
    from: 'if (output.login.revoked)\n            return INVALID;',
    to: 'if (false)\n            return INVALID;',
  },
  /** A governance list read that fails becomes an empty list (ID-18 list completeness). */
  'list-completeness': {
    file: 'governance.js',
    from: "if (listed.kind !== 'answered')\n            return listed;",
    to: "if (listed.kind !== 'answered')\n            return Object.freeze({ kind: 'listed', entries: Object.freeze([]) });",
  },
  /** A revocation finds only a revoked target unchanged: an ended target gets a revocation row. */
  'ended-target-no-change': {
    file: 'worker/participant.js',
    from: "if (standing !== STANDING.live)\n        return reply('no-change');",
    to: "if (standing === STANDING.revoked)\n        return reply('no-change');",
  },
  /** Governance does not take the issue time of a login as the lower bound of the reading (IS-05). */
  'issued-at-floor': {
    file: 'worker/support.js',
    from: 'return `${orderKeySql(`${alias}.issued_at`)} > ?`;',
    to: "return '(? IS NULL)';",
  },
  /** The login checks of the Worker modules do not see a revocation row: a change in `support`. */
  'support-revocation-sql': {
    file: 'worker/support.js',
    from: 'return `EXISTS (SELECT 1 FROM id_login_revocation r WHERE r.login = ${alias}.login)`;',
    to: "return '0';",
  },
  /** The combination version covers the manifest only, not the participant's imports (IS-01). */
  'version-covers-closure': {
    file: 'materials.js',
    from: '.update([`manifest ${digest}`, ...moduleClosure(participantUrl)].join',
    to: '.update([`manifest ${digest}`].join',
  },
} as const satisfies Readonly<Record<string, Mutation>>

export type CheckName = keyof typeof CHECKS

/** Copies `dist`, applies the mutations, and imports the copy's root entry. */
export async function mutantBuild(
  name: string,
  mutations: readonly Mutation[],
): Promise<MutantBuild> {
  mkdirSync(CACHE, { recursive: true })
  const root = mkdtempSync(join(CACHE, `${name}-`))
  cpSync(DIST, root, {
    recursive: true,
    filter: source => !source.endsWith('.map') && !source.endsWith('.d.ts'),
  })
  for (const file of readdirSync(root, { recursive: true, encoding: 'utf8' }))
    if (file.endsWith('.js')) {
      const path = join(root, file)
      const source = readFileSync(path, 'utf8')
      writeFileSync(path, source.replace(/^\/\/# sourceMappingURL=.*$/mu, ''))
    }
  for (const mutation of mutations) {
    const path = join(root, mutation.file)
    const source = readFileSync(path, 'utf8')
    const count =
      typeof mutation.from === 'string'
        ? source.split(mutation.from).length - 1
        : [...source.matchAll(new RegExp(mutation.from.source, 'g'))].length
    if (count !== 1)
      throw new Error(`mutant ${name}: ${mutation.file} has ${String(count)} copies of the anchor`)
    writeFileSync(path, source.replace(mutation.from, mutation.to), 'utf8')
  }
  const loaded = (await import(pathToFileURL(join(root, 'index.js')).href)) as IdentitySqlBuild
  return {
    build: {
      createIdentitySql: loaded.createIdentitySql,
      identitySqlMaterials: loaded.identitySqlMaterials,
      identitySqlRegistration: loaded.identitySqlRegistration,
    },
    remove() {
      rmSync(root, { recursive: true, force: true })
      // `tmp/mutants` and `tmp` go too once nothing else is in them.
      for (const directory of [CACHE, dirname(CACHE)])
        if (readdirSync(directory).length === 0) rmdirSync(directory)
    },
  }
}
