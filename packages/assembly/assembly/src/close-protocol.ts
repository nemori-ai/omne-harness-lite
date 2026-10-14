export class LeaseId {
  readonly name: string

  private constructor(name: string) {
    this.name = name
  }

  static create(name: string): LeaseId {
    if (name.length === 0) throw new Error('lease name is empty')
    return new LeaseId(name)
  }
}

export type Clock = {
  delay(ms: number): Promise<void>
}

export type Step = {
  name: string
  run: () => void | Promise<void>
  when: 'always' | 'if-no-failure'
}

export type CloseReport =
  | { status: 'closed'; steps: readonly string[] }
  | {
      status: 'failed'
      steps: readonly string[]
      failures: readonly { step: string; message: string }[]
      skipped: readonly string[]
    }
  | { status: 'timed-out'; stillHeld: readonly string[] }

export type CloseProtocol = {
  admit(name: string): LeaseId
  release(id: LeaseId): void
  detachObserver(): void
  held(): readonly string[]
  close(input?: { caller?: LeaseId }): Promise<CloseReport>
}

export function createCloseProtocol(input: {
  steps: readonly Step[]
  drainTimeoutMs: number
  clock: Clock
}): CloseProtocol {
  if (input.drainTimeoutMs < 0) throw new Error('drain timeout is negative')
  const held = new Map<string, LeaseId>()
  let admission: 'open' | 'stopped' = 'open'
  let run: Promise<CloseReport> | null = null
  let drainExcluded: LeaseId | null = null
  let resolveDrain: (() => void) | null = null

  function waiting(): string[] {
    const names: string[] = []
    for (const [name, id] of held) {
      if (id === drainExcluded) continue
      names.push(name)
    }
    return names
  }

  function considerDrain(): void {
    if (resolveDrain === null) return
    if (waiting().length > 0) return
    const resolve = resolveDrain
    resolveDrain = null
    resolve()
  }

  async function finishClose(): Promise<CloseReport> {
    if (waiting().length === 0) return runSteps(input.steps)
    if (input.drainTimeoutMs === 0) return { status: 'timed-out', stillHeld: waiting() }
    const drained = new Promise<void>(resolve => {
      resolveDrain = resolve
    })
    const which = await Promise.race([
      drained.then(() => 'drained' as const),
      input.clock.delay(input.drainTimeoutMs).then(() => 'timeout' as const),
    ])
    resolveDrain = null
    if (which === 'timeout' && waiting().length > 0) {
      return { status: 'timed-out', stillHeld: waiting() }
    }
    return runSteps(input.steps)
  }

  return {
    admit(name) {
      if (admission === 'stopped') throw new Error('admission stopped')
      const existing = held.get(name)
      if (existing !== undefined) return existing
      const id = LeaseId.create(name)
      held.set(name, id)
      return id
    },
    release(id) {
      if (held.get(id.name) !== id) return
      held.delete(id.name)
      considerDrain()
    },
    detachObserver() {},
    held() {
      return [...held.keys()]
    },
    close(request) {
      if (run !== null) return run
      admission = 'stopped'
      const caller = request?.caller
      if (caller !== undefined && held.get(caller.name) === caller) drainExcluded = caller
      run = finishClose()
      return run
    },
  }
}

async function runSteps(steps: readonly Step[]): Promise<CloseReport> {
  const ran: string[] = []
  const failures: { step: string; message: string }[] = []
  const skipped: string[] = []
  let blocked = false
  for (const step of steps) {
    if (blocked && step.when === 'if-no-failure') {
      skipped.push(step.name)
      continue
    }
    try {
      await step.run()
      ran.push(step.name)
    } catch (error) {
      blocked = true
      failures.push({ step: step.name, message: messageOf(error) })
    }
  }
  if (failures.length > 0 || skipped.length > 0) {
    return { status: 'failed', steps: ran, failures, skipped }
  }
  return { status: 'closed', steps: ran }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
