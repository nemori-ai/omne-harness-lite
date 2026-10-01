import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { sessionSeedBoundary, sessionMappingImmutable } from '../src/rules/session-seed.ts'
import { collectRepositorySources, REPOSITORY_RULES } from '../src/repository.ts'
import { runRules } from '../src/index.ts'

const seed = '@omne-harness-lite/session-tenancy-table/seed'
const use = `import { seedHoldingTenant as seed } from '${seed}'; await seed(tx, session, tenant);`
const bootstrap = 'examples/model-invocation-minimal-demo/src/bootstrap.ts'
test.each([
  bootstrap,
  'examples/model-invocation-minimal-demo/tests/real-sql.spec.ts',
  'apps/cli/tests/session.spec.ts',
])('precise approved consumer %s can invoke the closure', path => {
  expect(sessionSeedBoundary.check([{ path, text: use }])).toEqual([])
})
test.each([
  'examples/model-invocation-minimal-demo/src/test.ts',
  'apps/cli/src/run.ts',
  'apps/model-request-acceptance/src/bootstrap.ts',
  'examples/unrelated/src/bootstrap.ts',
  'examples/unrelated/tests/test.ts',
  'packages/model/runtime/src/index.ts',
  'packages/session/session-tenancy-table/tests/seed.spec.ts',
  'apps/unrelated/tests/acceptance.spec.ts',
  'tools/probe/test.ts',
  'scripts/seed.mjs',
])('generic test naming does not exempt %s', path => {
  expect(sessionSeedBoundary.check([{ path, text: use }])).not.toEqual([])
})
test.each([
  `export { seedHoldingTenant } from '${seed}';`,
  `export * from '${seed}';`,
  `const value = await import('${seed}');`,
  `const value = require('${seed}');`,
  `import * as seed from '${seed}'; seed.seedHoldingTenant(tx, session, tenant);`,
  `${use} export {seed};`,
  `${use} export function escape(){return seed}`,
  `${use} const copy = seed;`,
  `${use} ctx.provide('write', seed);`,
  `${use} await import(path);`,
])('approved bootstrap cannot forward or hide seed: %s', text => {
  expect(sessionSeedBoundary.check([{ path: bootstrap, text }])).not.toEqual([])
})
test('relative access and an actually resolved configured alias cannot bypass the public entry', () => {
  expect(
    sessionSeedBoundary.check([
      {
        path: bootstrap,
        text: "import {seedHoldingTenant} from '../../../packages/session/session-tenancy-table/src/seed.ts';",
      },
    ]),
  ).not.toEqual([])
  expect(
    sessionSeedBoundary.check([
      {
        path: bootstrap,
        text: "import {seedHoldingTenant} from '@custom/seed';",
        resolvedModules: { '@custom/seed': 'packages/session/session-tenancy-table/src/seed.ts' },
      },
    ]),
  ).not.toEqual([])
})
test.each([
  "await tx.db.updateTable('session_tenancy').set({tenant_account:'x'}).execute();",
  "await tx.db.deleteFrom('session_tenancy').execute();",
  "const table='session_tenancy'; await db.updateTable(table).execute();",
  'await sql`UPDATE "session_tenancy" SET tenant_account=${account}`.execute(db);',
  "await sql.raw('DELETE FROM session_tenancy').execute(db);",
  "const statement='UPDATE session_tenancy SET tenant_account=x'; await sql.raw(statement).execute(db);",
])('immutable mapping rejects mutation: %s', text => {
  expect(sessionMappingImmutable.check([{ path: bootstrap, text }])).not.toEqual([])
})
test('mapping insertion and lookup remain available; SQL example strings are not execution', () => {
  expect(
    sessionMappingImmutable.check([
      {
        path: bootstrap,
        text: "await tx.db.insertInto('session_tenancy').values(row).execute(); await tx.db.selectFrom('session_tenancy').selectAll().execute(); const fixture=\"sql.raw('DELETE FROM session_tenancy')\";",
      },
    ]),
  ).toEqual([])
})
test('repository collector preserves full path, scans forwarding scripts, and resolves TS paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'omne-seed-guard-'))
  try {
    const files = {
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          baseUrl: '.',
          paths: { '@custom/*': ['packages/session/session-tenancy-table/src/*'] },
        },
      }),
      'packages/session/session-tenancy-table/src/seed.ts': 'export function seedHoldingTenant(){}',
      [bootstrap]: "import {seedHoldingTenant} from '@custom/seed'; await seedHoldingTenant();",
      'scripts/forward.mjs': `export * from '${seed}';`,
    }
    for (const [path, text] of Object.entries(files)) {
      const full = join(root, path)
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, text)
    }
    const sources = collectRepositorySources(root)
    expect(sources.map(file => file.path)).toContain('scripts/forward.mjs')
    expect(sources.find(file => file.path === bootstrap)?.resolvedModules?.['@custom/seed']).toBe(
      'packages/session/session-tenancy-table/src/seed.ts',
    )
    const violations = runRules(sources, REPOSITORY_RULES)
    expect(violations.map(item => item.path)).toContain(bootstrap)
    expect(violations.map(item => item.path)).toContain('scripts/forward.mjs')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
