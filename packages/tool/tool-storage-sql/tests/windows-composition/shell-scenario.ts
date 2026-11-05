import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { readToolInvocationRef } from '@omne-harness/tool-contract/provider'
import type { CompletedInvocation, Invocation, ScenarioResult, WindowsAssembly } from './types.ts'

export function powershellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export async function within<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 45_000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export function assertInvocation(invocation: Invocation, completed: CompletedInvocation): void {
  // A v2 reference carries no tenant (R2-D357); the tenant is the invocation's own Access.
  const expected = readToolInvocationRef(invocation.reference)
  assert.deepEqual(completed.invocation, invocation, 'settle returns the original invocation')
  assert.equal(completed.state.call, expected.call, 'settled state belongs to the original call')
  assert.equal(completed.delivery.kind, 'result', 'consumer received a result payload')
  assert.equal(completed.delivery.key.reference, invocation.reference, 'delivery keeps the call')
  assert.deepEqual(completed.delivery.consumer, invocation.request.consumer, 'original consumer')
  if (completed.delivery.kind !== 'result') throw new Error('Expected result delivery')
  assert.equal(completed.delivery.key.result, completed.state.result, 'original result version')
  assert.equal(completed.delivery.delivery, completed.result.delivery, 'original delivery id')
  assert.equal(completed.result.result, completed.state.result, 'page retains result version')
  assert.deepEqual(completed.delivery.value, completed.result.value, 'consumer retains payload')
}

export async function shellCommand(
  assembly: WindowsAssembly,
  command: string,
  args: Readonly<Record<string, unknown>>,
): Promise<CompletedInvocation> {
  const invocation = await within(
    assembly.invoke('Shell', command, args, { authorizeScript: command === 'execute' }),
    `invoke Shell.${command}`,
  )
  await assembly.record('shell.invocation', { invocation, command, args })
  const completed = await within(assembly.settle(invocation), `settle Shell.${command}`)
  await assembly.record('shell.completed', completed)
  assertInvocation(invocation, completed)
  assert.equal(completed.state.terminal.kind, 'completed', `Shell.${command} completed`)
  assert.match(completed.text, /^done\b/u, `Shell.${command} facility confirmed`)
  return completed
}

function terminalOf(completed: CompletedInvocation): Readonly<{ id: string; generation: string }> {
  const line = completed.text.split(/\r?\n/u).find(item => item.startsWith('terminal='))
  assert.ok(line, 'create_session supplies the exact TerminalRef')
  const value: unknown = JSON.parse(line.slice('terminal='.length))
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value))
  assert.ok('id' in value && typeof value.id === 'string' && value.id.length > 0)
  assert.ok(
    'generation' in value && typeof value.generation === 'string' && value.generation.length > 0,
  )
  return { id: value.id, generation: value.generation }
}

function assertOutput(completed: CompletedInvocation, expected: string): void {
  assert.ok(
    stripVTControlCharacters(completed.text).replaceAll('\r', '').split('\n').includes(expected),
    `Shell output must contain the exact observation ${JSON.stringify(expected)}`,
  )
}

function assertFreshAttachments(
  assembly: WindowsAssembly,
  first: Invocation,
  second: Invocation,
): void {
  const firstCall = readToolInvocationRef(first.reference).call
  const secondCall = readToolInvocationRef(second.reference).call
  assert.notEqual(firstCall, secondCall, 'two independent Tool calls')
  const a = assembly.acquisitions().filter(item => item.call === firstCall)
  const b = assembly.acquisitions().filter(item => item.call === secondCall)
  assert.equal(a.length, 1, 'call A has exactly one observed acquisition')
  assert.equal(b.length, 1, 'call B has exactly one observed acquisition')
  const previous = a[0]
  const next = b[0]
  assert.ok(previous && next)
  assert.ok(previous.origin && previous.acquisition && previous.sessionScope)
  assert.ok(next.origin && next.acquisition && next.sessionScope)
  assert.notEqual(previous.origin, next.origin, 'new origin attaches to retained terminal')
  assert.notEqual(previous.acquisition, next.acquisition, 'new acquisition per invocation')
  assert.equal(previous.sessionScope, next.sessionScope, 'Session remains the same')
}

export async function runShellScenario(assembly: WindowsAssembly): Promise<ScenarioResult> {
  assert.equal(process.platform, 'win32', 'scenario requires the real Windows backend')
  const root = await mkdtemp(join(assembly.workspace, 'shell-retention-'))
  const retainedCwd = join(root, "retained cwd's")
  const overrideCwd = join(root, 'one-call cwd')
  await Promise.all([mkdir(retainedCwd), mkdir(overrideCwd)])
  const token = randomUUID()
  const envName = `OMNE_SHELL_${token.replaceAll('-', '')}`
  const baseline = `base-${token}`
  const override = `override-${token}`
  const terminals: ReturnType<typeof terminalOf>[] = []
  const failures: unknown[] = []
  try {
    const created = await shellCommand(assembly, 'create_session', {
      cwd: root,
      env: { [envName]: baseline },
      columns: 4096,
      rows: 40,
    })
    const terminal = terminalOf(created)
    terminals.push(terminal)
    const a = await shellCommand(assembly, 'execute', {
      terminal,
      script: `Set-Location -LiteralPath ${powershellLiteral(retainedCwd)}; Write-Output ${powershellLiteral(`A-${token}`)}; [Console]::Out.Flush(); Start-Sleep -Milliseconds 200`,
    })
    assertOutput(a, `A-${token}`)
    const observationScript = `Write-Output ('CWD=' + (Get-Location).ProviderPath); Write-Output ('ENV=' + $env:${envName}); [Console]::Out.Flush(); Start-Sleep -Milliseconds 200`
    const b = await shellCommand(assembly, 'execute', { terminal, script: observationScript })
    await assembly.record('shell.retained-attachment', {
      terminal,
      a: a.invocation,
      b: b.invocation,
      acquisitions: assembly.acquisitions(),
      expected: { cwd: retainedCwd, env: baseline },
      actual: b.text,
    })
    assertOutput(b, `CWD=${retainedCwd}`)
    assertOutput(b, `ENV=${baseline}`)
    assertFreshAttachments(assembly, a.invocation, b.invocation)
    const local = await shellCommand(assembly, 'execute', {
      terminal,
      script: observationScript,
      cwd: overrideCwd,
      env: { [envName]: override },
    })
    assertOutput(local, `CWD=${overrideCwd}`)
    assertOutput(local, `ENV=${override}`)
    const restored = await shellCommand(assembly, 'execute', {
      terminal,
      script: observationScript,
    })
    assertOutput(restored, `CWD=${retainedCwd}`)
    assertOutput(restored, `ENV=${baseline}`)
    const nextCreated = await shellCommand(assembly, 'create_session', {
      cwd: root,
      columns: 4096,
      rows: 40,
    })
    const nextTerminal = terminalOf(nextCreated)
    terminals.push(nextTerminal)
    assert.notDeepEqual(nextTerminal, terminal, 'later terminal has a distinct reference')
    const clean = await shellCommand(assembly, 'execute', {
      terminal: nextTerminal,
      script: observationScript,
    })
    assertOutput(clean, `CWD=${root}`)
    assertOutput(clean, 'ENV=')
  } catch (error) {
    failures.push(error)
    await assembly.record('shell.failed', { error: String(error), resources: assembly.resources() })
  } finally {
    const cleanup: PromiseSettledResult<void>[] = []
    for (const terminal of terminals) {
      try {
        const closed = await shellCommand(assembly, 'close_session', { terminal })
        assert.ok(closed.text.includes('close=confirmed'), 'terminal close is confirmed')
        cleanup.push({ status: 'fulfilled', value: undefined })
      } catch (reason) {
        cleanup.push({ status: 'rejected', reason })
      }
    }
    await assembly.record('shell.cleanup', { terminals, cleanup, resources: assembly.resources() })
    failures.push(...cleanup.flatMap(item => (item.status === 'rejected' ? [item.reason] : [])))
  }
  if (failures.length > 0) throw new AggregateError(failures, 'Shell scenario failed')
  return {
    checks: {
      retainedCwd: true,
      freshAttachment: true,
      localOverrides: true,
      nextSessionClean: true,
      terminalCloseConfirmed: true,
    },
    observations: {
      root,
      terminals,
      acquisitions: assembly.acquisitions(),
      resources: assembly.resources(),
    },
  }
}
