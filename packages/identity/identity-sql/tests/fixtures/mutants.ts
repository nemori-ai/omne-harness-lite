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

export type Mutation = Readonly<{ file: string; from: string | RegExp; to: string }>

export type MutantBuild = Readonly<{ build: IdentitySqlBuild; remove(): void }>

export const CHECKS = {
  'last-admin': {
    file: 'worker/participant.js',
    from: 'return activeSuperAdmins(port, organization, superAdminRole) <= 1;',
    to: 'return false;',
  },
  'expected-role': {
    file: 'worker/participant.js',
    from: "if (facts.expectedRole !== target.role)\n        return reply('conflict');",
    to: "if (false)\n        return reply('conflict');",
  },
  'revocation-ends-recognition': {
    file: 'provider.js',
    from: 'if (output.login.revoked)\n            return INVALID;',
    to: 'if (false)\n            return INVALID;',
  },
  'list-completeness': {
    file: 'governance.js',
    from: "if (listed.kind !== 'answered')\n            return listed;",
    to: "if (listed.kind !== 'answered')\n            return Object.freeze({ kind: 'listed', entries: Object.freeze([]) });",
  },
  'ended-target-no-change': {
    file: 'worker/participant.js',
    from: "if (standing !== STANDING.live)\n        return reply('no-change');",
    to: "if (standing === STANDING.revoked)\n        return reply('no-change');",
  },
  'issued-at-floor': {
    file: 'worker/support.js',
    from: 'return `${orderKeySql(`${alias}.issued_at`)} > ?`;',
    to: "return '(? IS NULL)';",
  },
  'support-revocation-sql': {
    file: 'worker/support.js',
    from: 'return `EXISTS (SELECT 1 FROM id_login_revocation r WHERE r.login = ${alias}.login)`;',
    to: "return '0';",
  },
  'version-covers-closure': {
    file: 'materials.js',
    from: '.update([`manifest ${digest}`, ...moduleClosure(participantUrl)].join',
    to: '.update([`manifest ${digest}`].join',
  },
} as const satisfies Readonly<Record<string, Mutation>>

export type CheckName = keyof typeof CHECKS

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
      for (const directory of [CACHE, dirname(CACHE)])
        if (readdirSync(directory).length === 0) rmdirSync(directory)
    },
  }
}
