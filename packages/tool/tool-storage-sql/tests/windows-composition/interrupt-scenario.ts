import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { readToolInvocationRef } from '@omne-harness/tool-contract/provider'
import { assertInvocation, powershellLiteral, within } from './shell-scenario.ts'
import type { Invocation, ScenarioResult, WindowsAssembly } from './types.ts'

async function marker(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
}

async function waitForMarker(path: string, expected: string): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const actual = await marker(path)
    if (actual !== undefined && actual.length > 0) {
      assert.equal(actual, expected, 'started marker belongs to the intended process')
      return
    }
    await delay(40)
  }
  throw new Error(`Timed out waiting for real process marker ${path}`)
}

function gatedScript(root: string, name: string, token: string): string {
  const started = powershellLiteral(join(root, `${name}.started`))
  const release = powershellLiteral(join(root, `${name}.release`))
  const done = powershellLiteral(join(root, `${name}.done`))
  return [
    "$ErrorActionPreference = 'Stop'",
    `[IO.File]::WriteAllText(${started}, ${powershellLiteral(`${name}-started-${token}`)})`,
    '$deadline = [DateTime]::UtcNow.AddSeconds(60)',
    `while (-not [IO.File]::Exists(${release})) { if ([DateTime]::UtcNow -gt $deadline) { throw 'Release timeout' }; Start-Sleep -Milliseconds 40 }`,
    `[IO.File]::WriteAllText(${done}, ${powershellLiteral(`${name}-done-${token}`)})`,
    `Write-Output ${powershellLiteral(`${name}-done-${token}`)}`,
  ].join('; ')
}

function resourcesFor(assembly: WindowsAssembly, invocation: Invocation) {
  const call = readToolInvocationRef(invocation.reference).call
  return assembly.resources().filter(item => item.call === call)
}

async function waitForStop(assembly: WindowsAssembly, invocation: Invocation): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const resources = resourcesFor(assembly, invocation)
    if (resources.length > 0 && resources.every(item => item.stopped === 'confirmed')) return
    await delay(40)
  }
  await assembly.record('interrupt.stop-timeout', { invocation, resources: assembly.resources() })
  throw new Error('A resources did not report confirmed termination')
}

export async function runInterruptScenario(assembly: WindowsAssembly): Promise<ScenarioResult> {
  assert.equal(process.platform, 'win32', 'scenario requires the real Windows backend')
  const root = await mkdtemp(join(assembly.workspace, 'shell-interrupt-'))
  const token = randomUUID()
  const running: Invocation[] = []
  const settled = new Set<string>()
  const failures: unknown[] = []
  try {
    const a = await within(
      assembly.invoke(
        'Shell',
        'execute',
        { script: gatedScript(root, 'A', token) },
        { authorizeScript: true },
      ),
      'invoke long call A',
    )
    running.push(a)
    await assembly.record('interrupt.invocation-a', a)
    await waitForMarker(join(root, 'A.started'), `A-started-${token}`)
    const b = await within(
      assembly.invoke(
        'Shell',
        'execute',
        { script: gatedScript(root, 'B', token) },
        { authorizeScript: true },
      ),
      'invoke overlapping call B',
    )
    running.push(b)
    await assembly.record('interrupt.invocation-b', b)
    await waitForMarker(join(root, 'B.started'), `B-started-${token}`)
    const before = { a: resourcesFor(assembly, a), b: resourcesFor(assembly, b) }
    await assembly.record('interrupt.overlap', {
      a,
      b,
      before,
      startedA: await marker(join(root, 'A.started')),
      startedB: await marker(join(root, 'B.started')),
      doneA: await marker(join(root, 'A.done')),
      doneB: await marker(join(root, 'B.done')),
    })
    assert.notEqual(a.reference, b.reference, 'independent calls overlap')
    assert.ok(before.a.length > 0 && before.b.length > 0, 'both calls own real managed resources')
    assert.ok(
      [...before.a, ...before.b].every(item => item.stopped === null),
      'both calls are active',
    )
    assert.ok(
      before.a.every(a => before.b.every(b => a.resource.key !== b.resource.key)),
      'calls own distinct resources',
    )
    assert.equal(await marker(join(root, 'A.done')), undefined, 'A is still waiting')
    assert.equal(await marker(join(root, 'B.done')), undefined, 'B is still waiting')
    const stopped = await within(assembly.stop(a), 'stop only A')
    await assembly.record('interrupt.stop-a', stopped)
    assert.equal(stopped.kind, 'committed', 'stop A is committed')
    if (stopped.kind !== 'committed') throw new Error('A stop was not committed')
    assert.equal(
      stopped.receipt.state.call,
      readToolInvocationRef(a.reference).call,
      'stop targets A',
    )
    const completedA = await within(assembly.settle(a), 'settle stopped A')
    await assembly.record('interrupt.completed-a', completedA)
    assertInvocation(a, completedA)
    settled.add(a.reference)
    assert.equal(completedA.state.terminal.kind, 'interrupted', 'A has an interrupted terminal')
    assert.ok(
      completedA.state.controls.some(
        control =>
          control.operation === stopped.receipt.operation && control.intent.kind === 'stop',
      ),
      'A retains its original stop control',
    )
    await waitForStop(assembly, a)
    const afterStop = { a: resourcesFor(assembly, a), b: resourcesFor(assembly, b) }
    await assembly.record('interrupt.resource-stop', afterStop)
    assert.ok(afterStop.a.length > 0, 'A resources remain observable')
    assert.ok(
      afterStop.a.every(item => item.stopped === 'confirmed'),
      'real A stop is confirmed',
    )
    assert.deepEqual(
      afterStop.a.map(item => item.resource),
      before.a.map(item => item.resource),
      'A retains the original resource identities',
    )
    assert.ok(afterStop.b.length > 0, 'B resources remain observable')
    assert.ok(
      afterStop.b.every(item => item.stopped === null),
      'stop A did not stop B',
    )
    assert.equal(
      await marker(join(root, 'A.done')),
      undefined,
      'A never reached its completion effect',
    )
    assert.equal(await marker(join(root, 'B.done')), undefined, 'B still waits after A stopped')
    await writeFile(join(root, 'B.release'), `release-B-${token}`, 'utf8')
    const completedB = await within(assembly.settle(b), 'settle continuing B')
    await assembly.record('interrupt.completed-b', completedB)
    assertInvocation(b, completedB)
    settled.add(b.reference)
    assert.equal(completedB.state.terminal.kind, 'completed', 'B completes after A stopped')
    assert.match(completedB.text, /^done\b/u, 'B facility completed')
    assert.ok(
      completedB.text.replaceAll('\r', '').split('\n').includes(`B-done-${token}`),
      'B delivers its unique output',
    )
    assert.equal(
      await marker(join(root, 'B.done')),
      `B-done-${token}`,
      'B performed its own completion effect',
    )
    assert.equal(
      await marker(join(root, 'A.done')),
      undefined,
      'A remains stopped when B completes',
    )
    assert.ok(
      completedB.state.controls.every(control => control.intent.kind !== 'stop'),
      'B has no stop control',
    )
    assert.deepEqual(
      resourcesFor(assembly, b).map(item => item.resource),
      before.b.map(item => item.resource),
      'B retains the original resource identities',
    )
  } catch (error) {
    failures.push(error)
    await assembly.record('interrupt.failed', {
      error: String(error),
      resources: assembly.resources(),
    })
  } finally {
    const cleanup = await Promise.allSettled(
      running
        .filter(invocation => !settled.has(invocation.reference))
        .map(async invocation => {
          const stop = await within(assembly.stop(invocation), 'cleanup unfinished call')
          await assembly.record('interrupt.cleanup-stop', { invocation, stop })
          assert.equal(stop.kind, 'committed', 'cleanup stop is committed')
          const completed = await within(
            assembly.settle(invocation),
            'cleanup settle unfinished call',
          )
          await assembly.record('interrupt.cleanup-completed', completed)
          assertInvocation(invocation, completed)
          const resources = resourcesFor(assembly, invocation)
          assert.ok(
            resources.length > 0 && resources.every(item => item.stopped === 'confirmed'),
            'unfinished resources stopped',
          )
        }),
    )
    await assembly.record('interrupt.cleanup', { cleanup, resources: assembly.resources() })
    failures.push(...cleanup.flatMap(item => (item.status === 'rejected' ? [item.reason] : [])))
  }
  if (failures.length > 0) throw new AggregateError(failures, 'Interrupt scenario failed')
  return {
    checks: { callsOverlap: true, onlyAInterrupted: true, aStopConfirmed: true, bContinues: true },
    observations: { root, invocations: running, resources: assembly.resources() },
  }
}
