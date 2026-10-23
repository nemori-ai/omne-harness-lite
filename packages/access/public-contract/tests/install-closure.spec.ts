/** @module-tag slow */
// Packing, a fresh install, TypeScript and Node each run in a child process.
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
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

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
    const result = spawnSync(command, args, {
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
      const members = run('tar', ['-tzf', archive], directory).trim().split('\n')
      expect(members.some(name => name === 'package/dist/index.js')).toBe(true)
      expect(members.some(name => name.startsWith('package/src/'))).toBe(false)
      const packedManifest: unknown = JSON.parse(
        run('tar', ['-xOf', archive, 'package/package.json'], directory),
      )
      packages.push({
        name: manifest.name,
        sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'),
        manifest: packedManifest,
      })
      dependencies[manifest.name] = `file:${archive}`
    }
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({
        name: 'public-contract-independent-consumer',
        private: true,
        type: 'module',
        dependencies,
        pnpm: { overrides: dependencies },
      }),
    )
    const installation = run(
      'pnpm',
      ['install', '--ignore-scripts', '--ignore-workspace'],
      consumer,
    )
    for (const name of ['client', 'server'])
      copyFileSync(new URL(`./fixtures/${name}.ts`, import.meta.url), join(consumer, `${name}.ts`))
    writeFileSync(
      join(consumer, 'main.ts'),
      `import { healthRequest, healthResponse } from './client.js'\nimport { receive } from './server.js'\nconst limits = { maxBytes: 4096, maxDepth: 16, maxItems: 128, maxMembers: 32, maxStringLength: 1024, maxNumberLength: 64 }\nconst request = healthRequest('installed', limits)\nif (request.kind !== 'encoded') throw new Error('request')\nconst response = receive(request.bytes, limits)\nif (response.kind !== 'encoded') throw new Error('response')\nconst read = healthResponse(response.bytes, 'installed', limits)\nif (read.kind !== 'response' || read.response.outcome !== 'succeeded') throw new Error('correlation')\nconsole.log(JSON.stringify({ kind: read.kind, outcome: read.response.outcome }))\n`,
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
    const execution = JSON.parse(run(process.execPath, ['out/main.js'], consumer)) as {
      kind: string
      outcome: string
    }
    expect(execution.kind).toBe('response')
    expect(execution.outcome).toBe('succeeded')
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
    const closure = run(
      'pnpm',
      ['list', '--prod', '--depth', 'Infinity', '--json', '--ignore-workspace'],
      consumer,
    )
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
    })
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      '@omne-harness/json-text',
      '@omne-harness/legal-identity',
      '@omne-harness/utc-instant',
      'jsonc-parser',
    ])
    writeFileSync(
      join(evidence, 'install-closure.json'),
      JSON.stringify(
        {
          commandLogs: logs,
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
