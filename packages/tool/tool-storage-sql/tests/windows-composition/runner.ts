import assert from 'node:assert/strict'
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ScenarioResult, WindowsAssembly } from './types.ts'
import { openWindowsAssembly } from './assembly.ts'
import { runFilesScenario } from './files-scenario.ts'
import { runShellScenario } from './shell-scenario.ts'
import { runInterruptScenario } from './interrupt-scenario.ts'
import { failureDetails } from './helpers.ts'

export type WindowsScenario = (assembly: WindowsAssembly) => Promise<ScenarioResult>

export async function runWindowsToolComposition() {
  assert.equal(process.platform, 'win32')
  const directory = process.env.OMNE_TOOL_E2_ARTIFACTS
  assert.ok(directory, 'OMNE_TOOL_E2_ARTIFACTS must name the parent-owned evidence directory')
  const evidenceDirectory = resolve(directory)
  await mkdir(evidenceDirectory, { recursive: true })
  const startedAt = new Date().toISOString()
  await writeFile(
    resolve(evidenceDirectory, 'runner-start.json'),
    JSON.stringify({ platform: process.platform, startedAt, executionAttempted: true }, null, 2),
  )
  const results: Record<string, ScenarioResult> = {}
  const failures: unknown[] = []
  let assembly: WindowsAssembly | undefined
  let cleanup: Awaited<ReturnType<WindowsAssembly['close']>> | undefined
  try {
    assembly = await openWindowsAssembly(evidenceDirectory)
    results.files = await runFilesScenario(assembly)
    results.shell = await runShellScenario(assembly)
    results.interrupt = await runInterruptScenario(assembly)
    const beforeDenial = {
      executions: assembly.authorExecutions(),
      acquisitions: assembly.acquisitions(),
      resources: assembly.resources(),
    }
    const denied = await assembly.attempt(
      'Files',
      'read',
      { path: 'foreign.txt' },
      { foreignTenant: true },
    )
    assert.equal(denied.outcome.kind, 'rejected')
    assert.ok(
      denied.outcome.kind === 'rejected' && denied.outcome.failure.kind === 'denied',
      'The foreign tenant must be refused by the real Tool entry',
    )
    assert.deepEqual(
      assembly.authorExecutions(),
      beforeDenial.executions,
      'A foreign tenant reached a real author',
    )
    assert.deepEqual(
      assembly.acquisitions(),
      beforeDenial.acquisitions,
      'A foreign tenant acquired an environment',
    )
    assert.deepEqual(
      assembly.resources(),
      beforeDenial.resources,
      'A foreign tenant changed the known resources',
    )
    await assembly.record('cross-tenant-denied', denied)
    results.identity = {
      checks: {
        foreignTenantDenied:
          denied.outcome.kind === 'rejected' && denied.outcome.failure.kind === 'denied',
      },
      observations: denied,
    }
    const executions = assembly.authorExecutions()
    for (const key of [
      'Files.write',
      'Files.read',
      'Files.edit',
      'Shell.create_session',
      'Shell.execute',
      'Shell.close_session',
    ])
      assert.ok((executions[key] ?? 0) > 0, `The real author never executed ${key}`)
    await assembly.record('real-author-counts', executions)
    for (const [name, result] of Object.entries(results)) {
      assert.ok(Object.keys(result.checks).length > 0, `${name} has no observable checks`)
      assert.ok(
        Object.values(result.checks).every(passed => passed === true),
        `${name} failed`,
      )
    }
  } catch (error) {
    failures.push(error)
  } finally {
    if (assembly) {
      try {
        cleanup = await assembly.close()
        assert.deepEqual(cleanup.provider, {
          result: { kind: 'drained' },
          maintained: { pending: 0 },
        })
        assert.deepEqual(cleanup.storage, { kind: 'closed' })
        assert.ok(
          cleanup.knownResources.length > 0,
          'The real process providers recorded no resources',
        )
        assert.ok(
          cleanup.knownResources.every(resource => resource.stopped === 'confirmed'),
          'A known real resource was not confirmed stopped',
        )
      } catch (error) {
        failures.push(error)
      }
    }
  }
  const summary = {
    schemaVersion: 1,
    suite: 'tool-exec-c06-windows',
    startedAt,
    finishedAt: new Date().toISOString(),
    platform: process.platform,
    results,
    cleanup,
    failures: failures.map(failureDetails),
  }
  await writeFile(resolve(evidenceDirectory, 'result.json'), JSON.stringify(summary, null, 2))
  if (failures.length > 0)
    throw new AggregateError(failures, `Real Windows C06 failed; see ${evidenceDirectory}`)
  const lines = (await readFile(resolve(evidenceDirectory, 'events.jsonl'), 'utf8'))
    .split('\n')
    .filter(Boolean)
  const saved = lines.filter(line => {
    const row: unknown = JSON.parse(line)
    return (
      typeof row === 'object' && row !== null && 'event' in row && row.event === 'receiver-saved'
    )
  })
  assert.ok(saved.length > 0, 'The real consumer saved no payload')
  if (assembly)
    for (const candidate of [
      assembly.workspace,
      assembly.outside,
      resolve(evidenceDirectory, 'native-state'),
      resolve(evidenceDirectory, 'sql'),
    ]) {
      const absolute = await realpath(candidate)
      assert.ok(
        absolute.toLowerCase().startsWith((await realpath(evidenceDirectory)).toLowerCase() + '\\'),
        'Cleanup target escaped the owned evidence root',
      )
      await rm(candidate, { recursive: true, force: false })
    }
  const files = results.files
  const shell = results.shell
  const interrupt = results.interrupt
  assert.ok(files && shell && interrupt, 'Every required scenario must have completed')
  const passed = (result: ScenarioResult) =>
    Object.values(result.checks).length > 0 && Object.values(result.checks).every(Boolean)
  return {
    backend: process.platform === 'win32' ? 'windows-real' : 'invalid-platform',
    files: passed(files) ? 'passed' : 'failed',
    shell: passed(shell) ? 'passed' : 'failed',
    retainedTerminal:
      shell.checks.retainedCwd && shell.checks.freshAttachment ? 'passed' : 'failed',
    targetStopped: interrupt.checks.aStopConfirmed === true,
    otherCallContinued: interrupt.checks.bContinues === true,
    originalConsumerSaved: saved.length > 0 && passed(files) && passed(shell) && passed(interrupt),
    evidenceDirectory,
    observations: summary,
  }
}
