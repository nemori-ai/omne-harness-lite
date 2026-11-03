import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import type { ScenarioResult, WindowsAssembly } from './types.ts'
import { shellCommand, within } from './shell-scenario.ts'

/**
 * Parallel close scenario: verifies that closing two terminals simultaneously
 * both return close=confirmed.
 *
 * This test guards against the race condition where parallel cleanup could
 * cause one terminal to receive close=unconfirmed due to concurrent access
 * to the Session retention ledger.
 *
 * Regression check: if the cleanup logic is changed back to Promise.allSettled
 * without proper synchronization, this test should detect the race by having
 * at least one close operation return unconfirmed.
 */
export async function runParallelCloseScenario(assembly: WindowsAssembly): Promise<ScenarioResult> {
  assert.equal(process.platform, 'win32', 'scenario requires the real Windows backend')
  const root = await mkdtemp(join(assembly.workspace, 'parallel-close-'))
  const workdir = join(root, 'workdir')
  await mkdir(workdir)

  const token = randomUUID()
  const terminals: Array<{ id: string; generation: string }> = []
  const failures: unknown[] = []

  try {
    // Create two independent terminal sessions
    const session1 = await shellCommand(assembly, 'create_session', {
      cwd: workdir,
      env: { PARALLEL_TEST_TOKEN: `session1-${token}` },
      columns: 120,
      rows: 30,
    })

    const terminal1Line = session1.text
      .split(/\r?\n/u)
      .find(line => line.startsWith('terminal='))
    assert.ok(terminal1Line, 'session1 must provide terminal reference')
    const terminal1: unknown = JSON.parse(terminal1Line.slice('terminal='.length))
    assert.ok(
      terminal1 !== null &&
        typeof terminal1 === 'object' &&
        !Array.isArray(terminal1) &&
        'id' in terminal1 &&
        typeof terminal1.id === 'string' &&
        'generation' in terminal1 &&
        typeof terminal1.generation === 'string',
    )
    terminals.push({ id: terminal1.id, generation: terminal1.generation })

    const session2 = await shellCommand(assembly, 'create_session', {
      cwd: workdir,
      env: { PARALLEL_TEST_TOKEN: `session2-${token}` },
      columns: 120,
      rows: 30,
    })

    const terminal2Line = session2.text
      .split(/\r?\n/u)
      .find(line => line.startsWith('terminal='))
    assert.ok(terminal2Line, 'session2 must provide terminal reference')
    const terminal2: unknown = JSON.parse(terminal2Line.slice('terminal='.length))
    assert.ok(
      terminal2 !== null &&
        typeof terminal2 === 'object' &&
        !Array.isArray(terminal2) &&
        'id' in terminal2 &&
        typeof terminal2.id === 'string' &&
        'generation' in terminal2 &&
        typeof terminal2.generation === 'string',
    )
    terminals.push({ id: terminal2.id, generation: terminal2.generation })

    assert.notDeepEqual(terminal1, terminal2, 'two terminals must have distinct references')

    // Execute one command in each terminal to establish state
    await shellCommand(assembly, 'execute', {
      terminal: terminal1,
      script: `Write-Output "parallel-1-${token}"; [Console]::Out.Flush()`,
    })

    await shellCommand(assembly, 'execute', {
      terminal: terminal2,
      script: `Write-Output "parallel-2-${token}"; [Console]::Out.Flush()`,
    })

    await assembly.record('parallel-close.sessions-created', {
      terminals,
      token,
      resources: assembly.resources(),
    })

    // Now close both terminals in parallel - this is the critical test
    const closePromises = terminals.map(async terminal => {
      const closed = await within(
        shellCommand(assembly, 'close_session', { terminal }),
        `close terminal ${terminal.id}`,
      )
      return { terminal, closed }
    })

    const closeResults = await Promise.allSettled(closePromises)

    await assembly.record('parallel-close.results', {
      closeResults,
      resources: assembly.resources(),
    })

    // Verify both closes succeeded and returned confirmed
    const confirmedCount = closeResults.filter(result => {
      if (result.status === 'rejected') {
        failures.push(result.reason)
        return false
      }
      const { closed } = result.value
      const hasConfirmed = closed.text.includes('close=confirmed')
      if (!hasConfirmed) {
        failures.push(
          new Error(
            `Terminal ${result.value.terminal.id} close did not return confirmed: ${closed.text}`,
          ),
        )
      }
      return hasConfirmed
    }).length

    assert.equal(
      confirmedCount,
      2,
      'Both terminals must return close=confirmed when closed in parallel',
    )
  } catch (error) {
    failures.push(error)
    await assembly.record('parallel-close.failed', {
      error: String(error),
      resources: assembly.resources(),
    })
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, 'Parallel close scenario failed')
  }

  return {
    checks: {
      bothTerminalsClosedConfirmed: true,
      parallelCloseRaceConditionGuarded: true,
    },
    observations: {
      root,
      terminals,
      resources: assembly.resources(),
    },
  }
}
