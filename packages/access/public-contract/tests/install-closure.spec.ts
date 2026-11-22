/** @module-tag slow */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from 'node:fs'
import { basename, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

// pnpm is the one that runs this test (npm_execpath). The consumer pins no pnpm, so a pnpm on PATH
// would be whatever the machine has; there is no fallback to it.
function commandLine(command: string, args: string[]): [string, string[]] {
  if (command !== 'pnpm') return [command, args]
  const entry = process.env['npm_execpath']
  if (entry === undefined || entry === '')
    throw new Error(
      'npm_execpath is not set: run the tests through pnpm (pnpm exec vitest, pnpm run test) so that the pinned pnpm is known',
    )
  return /\.[cm]?js$/u.test(entry) ? [process.execPath, [entry, ...args]] : [entry, args]
}

it('installs only the pure tarball closure and consumes both ends through dist exports', () => {
  const root = fileURLToPath(new URL('../../../../', import.meta.url))
  const evidence = resolve(root, 'tmp/issue-319/implementation')
  mkdirSync(evidence, { recursive: true })
  const logs = mkdtempSync(join(evidence, 'install-logs-'))
  const scratch = mkdtempSync(join(evidence, 'install-'))
  const tarballs = join(scratch, 'tarballs')
  const consumer = join(scratch, 'consumer')
  mkdirSync(tarballs)
  mkdirSync(consumer)
  const env = { ...process.env, NODE_OPTIONS: '' }
  let commandIndex = 0
  const run = (command: string, args: string[], cwd: string) => {
    const [file, argv] = commandLine(command, args)
    const result = spawnSync(file, argv, {
      cwd,
      env,
      encoding: 'utf8',
      timeout: 90_000,
      maxBuffer: 8_000_000,
    })
    const log = join(logs, `command-${commandIndex++}.json`)
    writeFileSync(
      log,
      JSON.stringify(
        {
          command,
          args,
          status: result.status,
          signal: result.signal,
          stdout: result.stdout,
          stderr: result.stderr,
        },
        null,
        2,
      ),
    )
    if (result.error !== undefined || result.status !== 0)
      throw new Error(`Install closure command failed; see ${log}`)
    return result.stdout
  }
  try {
    const dependencies: Record<string, string> = {}
    const packages: { name: string; sha256: string; manifest: unknown }[] = []
    for (const member of [
      'common/json-text',
      'common/legal-identity',
      'common/utc-instant',
      'access/public-contract',
    ]) {
      const directory = resolve(root, 'packages', member)
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
        name: string
      }
      const before = new Set(readdirSync(tarballs))
      run('pnpm', ['pack', '--pack-destination', tarballs], directory)
      const added = readdirSync(tarballs).filter(name => !before.has(name))
      expect(added).toHaveLength(1)
      const archive = join(tarballs, added[0] ?? '')
      const members = run('tar', ['-tzf', basename(archive)], tarballs)
        .trim()
        .split('\n')
      expect(members.some(name => name === 'package/dist/index.js')).toBe(true)
      expect(members.some(name => name.startsWith('package/src/'))).toBe(false)
      const packedManifest: unknown = JSON.parse(
        run('tar', ['-xOf', basename(archive), 'package/package.json'], tarballs),
      )
      packages.push({
        name: manifest.name,
        sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'),
        manifest: packedManifest,
      })
      dependencies[manifest.name] = `file:${archive}`
    }
    type Installed = { version: string; path?: string; dependencies?: Record<string, Installed> }
    const thirdParty: Record<string, string> = {}
    const listing = [
      ...(JSON.parse(
        run(
          'pnpm',
          ['list', '--prod', '--depth', 'Infinity', '--json'],
          resolve(root, 'packages/access/public-contract'),
        ),
      ) as Installed[]),
    ]
    while (listing.length > 0)
      for (const [name, tree] of Object.entries(listing.pop()?.dependencies ?? {})) {
        if (!tree.version.startsWith('link:') && tree.path !== undefined)
          thirdParty[name] = `file:${tree.path}`
        listing.push(tree)
      }
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({
        name: 'public-contract-independent-consumer',
        private: true,
        type: 'module',
        dependencies,
      }),
    )
    // pnpm 12 reads overrides only from pnpm-workspace.yaml. The file also makes the consumer its own
    // workspace root, so pnpm does not adopt the repository's. No packageManager: with an empty
    // cache and --offline, a pinned pnpm fails with ERR_PNPM_BAD_CONFIG_DEP.
    writeFileSync(
      join(consumer, 'pnpm-workspace.yaml'),
      `packages: []\noverrides:\n${Object.entries({ ...thirdParty, ...dependencies })
        .map(([name, target]) => `  ${JSON.stringify(name)}: ${JSON.stringify(target)}\n`)
        .join('')}`,
    )
    // The pnpm that installs the consumer, recorded in the evidence: the pinned one (npm_execpath).
    const pnpmVersion = run('pnpm', ['-v'], consumer).trim()
    const installation = run(
      'pnpm',
      [
        'install',
        '--ignore-scripts',
        '--offline',
        '--store-dir',
        join(scratch, 'pnpm-store'),
        `--config.cache-dir=${join(scratch, 'pnpm-cache')}`,
      ],
      consumer,
    )
    copyFileSync(
      new URL('./fixtures/browser/example-protocol.ts', import.meta.url),
      join(consumer, 'example-protocol.ts'),
    )
    writeFileSync(
      join(consumer, 'main.ts'),
      [
        `import { readTenantText } from '@omne-harness/public-contract'`,
        `import { exampleLimits, notesProtocol } from './example-protocol.js'`,
        `const { body } = notesProtocol.operations['save-note']`,
        `const written = body.write({ noteId: 'n-1', title: 'Plan', tags: ['draft'], revision: '7' }, exampleLimits)`,
        `if (!written.ok) throw new Error('write')`,
        `const read = body.read(written.value, exampleLimits)`,
        `if (!read.ok) throw new Error('read')`,
        `const refused = body.read({ kind: 'object', entries: [] }, exampleLimits)`,
        `const tenant = readTenantText(JSON.stringify({ organization: 'org_00000000000000000000000000', account: 'acc_00000000000000000000000000' }))`,
        `console.log(JSON.stringify({ read: read.value.noteId, refused: refused.ok, tenant: tenant !== undefined }))`,
        ``,
      ].join('\n'),
    )
    const tsc = resolve(root, 'packages/access/public-contract/node_modules/typescript/bin/tsc')
    writeFileSync(
      join(consumer, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          target: 'ES2022',
          strict: true,
          skipLibCheck: false,
          types: [],
          outDir: 'out',
        },
        include: ['*.ts'],
      }),
    )
    run(process.execPath, [tsc, '-p', 'tsconfig.json'], consumer)
    const execution = JSON.parse(run(process.execPath, ['out/main.js'], consumer)) as unknown
    expect(execution).toEqual({ read: 'n-1', refused: false, tenant: true })
    const resolved = run(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "console.log(import.meta.resolve('@omne-harness/public-contract'))",
      ],
      consumer,
    ).trim()
    expect(resolved).toContain('/dist/index.js')
    const resolutions = Object.fromEntries(
      Object.keys(dependencies).map(name => [
        name,
        run(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `console.log(import.meta.resolve(${JSON.stringify(name)}))`,
          ],
          consumer,
        ).trim(),
      ]),
    )
    for (const location of Object.values(resolutions)) expect(location).toContain('/dist/index.js')
    const closure = run('pnpm', ['list', '--prod', '--depth', 'Infinity', '--json'], consumer)
    type DependencyTree = { dependencies?: Record<string, DependencyTree> }
    const trees = JSON.parse(closure) as DependencyTree[]
    const installed = new Set<string>()
    const pending = [...trees]
    while (pending.length > 0) {
      const tree = pending.pop()
      for (const [name, dependency] of Object.entries(tree?.dependencies ?? {})) {
        installed.add(name)
        pending.push(dependency)
      }
    }
    expect([...installed].sort()).toEqual([...Object.keys(dependencies), 'jsonc-parser'].sort())
    for (const forbidden of [
      'server-entry',
      'identity-sql',
      'authorization',
      'cordis',
      'postgres',
      '.legacy',
    ])
      expect(closure.toLowerCase()).not.toContain(forbidden)
    const manifest = JSON.parse(
      readFileSync(
        join(consumer, 'node_modules/@omne-harness/public-contract/package.json'),
        'utf8',
      ),
    ) as { exports: unknown; dependencies: Record<string, string> }
    expect(manifest.exports).toEqual({
      '.': { source: './src/index.ts', types: './dist/index.d.ts', import: './dist/index.js' },
      './snapshot': {
        source: './src/snapshot.ts',
        types: './dist/snapshot.d.ts',
        import: './dist/snapshot.js',
      },
    })
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      '@omne-harness/json-text',
      '@omne-harness/legal-identity',
      '@omne-harness/utc-instant',
    ])
    writeFileSync(
      join(evidence, 'install-closure.json'),
      JSON.stringify(
        {
          commandLogs: logs,
          pnpmVersion,
          installation,
          execution,
          resolved,
          packages,
          resolutions,
          closure: trees,
          manifest,
        },
        null,
        2,
      ),
    )
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})
