import type { SettingView } from '@omne-harness/settings'
import { loginAccess } from '../model/public-stream-support.ts'
import { onReleaseTree } from '../support/release-tree.ts'
import {
  SHELL,
  faceOf,
  shellRound,
  shellScript,
  type ShellRound,
} from './tenant-settings-support.ts'

const print = (line: string) => process.stdout.write(`${line}\n`)

function shown(item: SettingView): string {
  if (item.kind !== 'permission') return JSON.stringify(item)
  return JSON.stringify({
    revision: item.revision,
    own: item.own,
    effective: item.effective,
    bound: item.bound,
    editable: item.editable,
    appliesAt: item.declaration.appliesAt,
  })
}

function round(name: string, value: ShellRound): void {
  const lines = value.result.split('\n').filter(line => line.length > 0)
  print(`${name}: started=${String(value.started)} result=${JSON.stringify(lines.at(-1))}`)
}

const exit = await onReleaseTree({ script: shellScript }, async tree => {
  const face = faceOf(tree)
  await shellRound(tree, 'warmup')
  const { principal, tenant } = await loginAccess(tree)
  const item = { principal, tenant, asset: SHELL, item: 'invoke' }
  const before = await face.describe(item)
  if (before.kind !== 'described') throw new Error(JSON.stringify(before))
  print(`describe before: ${shown(before.item)}`)
  const denied = await face.set({
    ...item,
    operation: 'demo-deny-shell',
    expectedRevision: before.item.revision,
    value: { kind: 'permission', pick: 'deny' },
  })
  print(`set deny: ${JSON.stringify(denied)}`)
  if (denied.kind !== 'written') throw new Error('the pick was not written')
  const middle = await face.describe(item)
  if (middle.kind === 'described') print(`describe after set: ${shown(middle.item)}`)
  round('Shell call 1 (after deny)', await shellRound(tree, 'first'))
  const cleared = await face.clear({
    ...item,
    operation: 'demo-clear-shell',
    expectedRevision: denied.revision,
  })
  print(`clear: ${JSON.stringify(cleared)}`)
  round('Shell call 2 (after clear)', await shellRound(tree, 'second'))
  const after = await face.describe(item)
  if (after.kind !== 'described') throw new Error(JSON.stringify(after))
  print(`describe after clear: ${shown(after.item)}`)
})
print(`service exit code: ${String(exit)}`)
