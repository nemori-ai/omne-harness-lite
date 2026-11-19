// The start scan: it reads the calls each tenant left and wakes every one that still has work. A
// call it has looked at, or every call once it read them all, may be answered as lost.
import type { TenantId } from '@omne-harness/legal-identity'
import type { ModelCallId, ModelFailure } from '@omne-harness/model-contract'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { delayAfter } from './push-values.ts'
import type { ResultPushRecovery, RuntimeEvent } from './runtime.ts'

type Scan<T> = Readonly<{ kind: 'read'; value: T }> | Readonly<{ kind: 'again' | 'given-up' }>
type Target = Readonly<{ tenant: TenantId; call: ModelCallId }>
type Access = Readonly<{ principal: unknown; tenant: TenantId }>

export type StartScanInput = Readonly<{
  commands: ModelCommands<unknown>
  paused(ms: number): Promise<boolean>
  delaysMs: readonly number[]
  size: number
  stopping: AbortSignal
  report(event: RuntimeEvent): void
  wake(target: Target): void
  schedule?(target: Target): void
}>

export type StartScan = Readonly<{ run(): Promise<void>; scanned(call: ModelCallId): boolean }>

export function createStartScan(
  input: StartScanInput,
  source: ResultPushRecovery | undefined,
): StartScan {
  const seen = new Set<string>()
  let swept = source === undefined

  async function recover(source: ResultPushRecovery): Promise<void> {
    const scopes = await persistently(() => listScopes(source))
    if (scopes === null) return
    const again: Promise<void>[] = []
    let woken = 0
    for (const scope of scopes) {
      const scan = await scanTenant(scope)
      if (scan.kind === 'read') woken += scan.value
      if (scan.kind === 'again') again.push(scanAgain(scope))
    }
    input.report({ kind: 'recovered', woken })
    await Promise.all(again)
    swept = true
  }

  async function scanAgain(scope: Access): Promise<void> {
    const woken = await readAgain(() => scanTenant(scope))
    if (woken !== null) input.report({ kind: 'recovered', woken })
  }

  async function persistently<T>(read: () => Promise<Scan<T>>): Promise<T | null> {
    const scan = await read()
    if (scan.kind === 'read') return scan.value
    return scan.kind === 'again' ? readAgain(read) : null
  }

  async function readAgain<T>(read: () => Promise<Scan<T>>): Promise<T | null> {
    for (let failures = 0; ; failures += 1) {
      if (!(await input.paused(delayAfter(input.delaysMs, failures)))) return null
      const scan = await read()
      if (scan.kind === 'read') return scan.value
      if (scan.kind === 'given-up') return null
    }
  }

  function failed(
    step: 'scopes' | 'scan' | 'load',
    failure: ModelFailure | 'threw',
  ): 'again' | 'given-up' {
    const again = failure === 'threw' || failure.kind === 'unavailable'
    input.report({
      kind: 'recovery-failed',
      step,
      failure: failure === 'threw' ? failure : failure.kind,
      again,
    })
    return again ? 'again' : 'given-up'
  }

  async function listScopes(source: ResultPushRecovery): Promise<Scan<readonly Access[]>> {
    try {
      const scopes = await source.scopes()
      if ('ok' in scopes) return { kind: 'read', value: scopes.ok }
      return { kind: failed('scopes', scopes.failure) }
    } catch {
      return { kind: failed('scopes', 'threw') }
    }
  }

  async function scanTenant(scope: Access): Promise<Scan<number>> {
    let woken = 0
    let again = false
    let after: string | null = null
    try {
      do {
        if (input.stopping.aborted) break
        const page = await input.commands.scanPending({ ...scope, after, limit: input.size })
        if ('failure' in page) return { kind: failed('scan', page.failure) }
        for (const call of page.ok.calls) {
          const owed = await wakeIfOwed(scope, call)
          if (owed === 'woken') woken += 1
          if (owed === 'again') again = true
        }
        after = page.ok.next
      } while (after !== null)
    } catch {
      return { kind: failed('scan', 'threw') }
    }
    return again ? { kind: 'again' } : { kind: 'read', value: woken }
  }

  async function wakeIfOwed(
    scope: Access,
    call: ModelCallId,
  ): Promise<'woken' | 'skipped' | 'again'> {
    if (input.stopping.aborted) return 'skipped'
    const loaded = await input.commands.loadRecovery({ ...scope, call })
    if ('failure' in loaded) {
      const { failure } = loaded
      if (failure.kind === 'invalid' && failure.reason === 'recovery-material-released') {
        seen.add(call)
        return 'skipped'
      }
      return failed('load', failure) === 'again' ? 'again' : 'skipped'
    }
    seen.add(call)
    if (loaded.ok.state.phase !== 'settled') input.schedule?.({ tenant: scope.tenant, call })
    else input.wake({ tenant: scope.tenant, call })
    return 'woken'
  }

  return {
    run: () => (source === undefined ? Promise.resolve() : recover(source)),
    scanned: call => swept || seen.has(call),
  }
}
