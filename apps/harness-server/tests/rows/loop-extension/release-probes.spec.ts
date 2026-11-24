// @module-tag slow
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import type { LoopExtensionDeclaration, Passage } from '@omne-harness/agent-contract'
import type { BuiltinExtensions } from '@omne-harness/loop-extension-contract'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { shellRound, shellScript } from '../../governance/tenant-settings-support.ts'
import type { GatewayScript } from '../../fixtures/model-gateway.ts'
import { historyOf, onReleaseTree, type ReleaseTree } from '../../support/release-tree.ts'
import { assetOf, tenantOf } from './support.ts'

const GUARD: LoopExtensionDeclaration = {
  name: 'guard',
  position: 'before_action',
  power: 'veto',
  implementation: { kind: 'builtin', builtinName: 'guard' },
}
const WATCH: LoopExtensionDeclaration = {
  name: 'watch',
  position: 'execution_started',
  power: 'observe',
  implementation: { kind: 'command', interpreter: 'node', entry: 'watch.mjs', timeout: 'PT30S' },
}
// The probe a tenant would write: it reads the request, leaves a line where it runs, and answers.
const WATCH_SCRIPT = `
import { appendFileSync } from 'node:fs'
let text = ''
for await (const chunk of process.stdin) text += chunk
const request = JSON.parse(text)
appendFileSync('watch.log', request.mode + ' ' + request.input.position + '\\n')
process.stdout.write(JSON.stringify({ kind: 'observed' }))
`

function sqliteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory()
      ? sqliteFiles(join(dir, entry.name))
      : /\.(sqlite|db)$/u.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  )
}

type Call = Omit<Passage, 'declaration'>
const RANK = { requested: 0, asked: 1, resolved: 2, applied: 3 } as const

// The extension calls the execution records hold now, each in the furthest state it reached. An
// execution record lives as long as its Run: it is reclaimed when the Run is settled.
function extensionCalls(storageRoot: string, calls = new Map<string, Call>()): readonly Call[] {
  for (const file of sqliteFiles(storageRoot)) {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const table = "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'er_block'"
      if (db.prepare(table).get() === undefined) continue
      for (const row of db.prepare('SELECT payload FROM er_block').all()) {
        let value: Partial<Call>
        try {
          value = JSON.parse(unpackText(row['payload'] as Uint8Array)) as Partial<Call>
        } catch {
          continue
        }
        if (value.implementation?.owner !== 'loop-extension' || value.progress === undefined)
          continue
        const call = value as Call
        // A call id is unique within one execution; its input names the execution.
        const key = `${call.id}|${call.input.digest}`
        const known = calls.get(key)
        if (known === undefined || RANK[call.progress.kind] >= RANK[known.progress.kind])
          calls.set(key, call)
      }
    } finally {
      db.close()
    }
  }
  return [...calls.values()]
}

const conclusionOf = (call: Call | undefined) =>
  call?.progress.kind === 'resolved' || call?.progress.kind === 'applied'
    ? call.progress.conclusion
    : undefined

async function kindsOf(tree: ReleaseTree, session: string): Promise<string[]> {
  return (await historyOf(tree, session)).map(entry => String(entry.kind))
}

it('with a builtin probe and a command probe enabled, the same request leaves in the execution record exactly the calls of these two and their consequence, each naming its extension; a failing and an unlawful version are recorded as errors and the Run goes on', async () => {
  // Read while each Run is still open: at its model request that carries the tool result.
  const seen = new Map<string, Call>()
  let root: string | undefined
  const script: GatewayScript = async input => {
    if (root !== undefined && input.body.includes('"role":"tool"')) extensionCalls(root, seen)
    return shellScript(input)
  }
  const recorded = (): readonly Call[] => [...seen.values()]
  const exit = await onReleaseTree({ script }, async tree => {
    root = tree.storageRoot
    const tenant = await tenantOf(tree)
    const workspace = join(dirname(tree.storageRoot), 'workspace')
    const ledgers = join(tree.storageRoot, 'loop-extension-calls')

    const without = await shellRound(tree, 'same')
    expect(without.started).toBe(true)
    expect(recorded()).toEqual([])

    const builtins = tree.scope.get('loopExtensionBuiltins') as BuiltinExtensions
    builtins.register('guard', async () => ({
      kind: 'output',
      value: { kind: 'veto', reason: 'the guard probe does not let Shell run' },
    }))
    const guard = await tenant.publish(GUARD)
    const watch = await tenant.publish(WATCH, { 'watch.mjs': WATCH_SCRIPT })
    await tenant.run('guard', true)
    await tenant.run('watch', true)

    const guarded = await shellRound(tree, 'same')
    expect(guarded).toMatchObject({
      started: false,
      result: 'The tool call was denied by a rule or a prohibition and did not run.',
      calls: [],
    })
    expect(await kindsOf(tree, guarded.session)).toEqual(await kindsOf(tree, without.session))
    const first = recorded()
    expect(first.map(call => [call.implementation, call.position]).toSorted()).toEqual(
      [
        [
          { owner: 'loop-extension', name: 'guard', revision: guard, digest: assetOf('guard') },
          'before_action',
        ],
        [
          { owner: 'loop-extension', name: 'watch', revision: watch, digest: assetOf('watch') },
          'execution_started',
        ],
      ].toSorted(),
    )
    const byName = (calls: readonly Call[], name: string) =>
      calls.filter(call => call.implementation.name === name)
    expect(conclusionOf(byName(first, 'guard')[0])).toMatchObject({
      extension: 'guard',
      output: { kind: 'veto', reason: 'the guard probe does not let Shell run' },
    })
    expect(conclusionOf(byName(first, 'watch')[0])).toMatchObject({
      extension: 'watch',
      output: { kind: 'observed' },
    })
    expect(readFileSync(join(workspace, 'watch.log'), 'utf8')).toBe('fresh execution_started\n')
    const ledger = readdirSync(ledgers).map(name => readFileSync(join(ledgers, name), 'utf8'))
    expect(ledger).toHaveLength(1)
    const steps = (ledger[0] ?? '')
      .split('\n')
      .filter(line => line !== '')
      .map(line => (JSON.parse(line) as { at: string }).at)
    expect(steps).toEqual(['intended', 'resource', 'started', 'ended'])

    await tenant.run('guard', false)
    const failing = await tenant.publish(WATCH, { 'watch.mjs': 'process.exit(3)\n' })
    const failed = await shellRound(tree, 'fail')
    expect(failed.started).toBe(true)
    const second = byName(recorded(), 'watch').find(
      call => call.implementation.revision === failing,
    )
    expect(conclusionOf(second)).toMatchObject({ skipped: 'errored' })
    expect(JSON.stringify(conclusionOf(second))).toContain('nonzero_exit')

    const unlawful = await tenant.publish(WATCH, {
      'watch.mjs': 'process.stdout.write("this is not an output")\n',
    })
    const garbled = await shellRound(tree, 'garbled')
    expect(garbled.started).toBe(true)
    const third = byName(recorded(), 'watch').find(
      call => call.implementation.revision === unlawful,
    )
    expect(conclusionOf(third)).toMatchObject({ skipped: 'errored' })
    expect(JSON.stringify(conclusionOf(third))).toContain('bad_output')
    expect(JSON.stringify(conclusionOf(third))).not.toContain('this is not an output')
    expect(byName(recorded(), 'guard')).toHaveLength(1)
    expect(existsSync(join(workspace, 'watch.log'))).toBe(true)
  })
  expect(exit).toBe(0)
})
