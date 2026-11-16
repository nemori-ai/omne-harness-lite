import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  canonicalDigest,
  type PendingCall,
  type ToolLedgerRecovery,
  type ToolLedgerStore,
} from '@omne-harness/tool'

const BACKOFF_MS = [1000, 5000, 30_000] as const

const PAGE = 100

type PageAnswer =
  | Readonly<{ kind: 'page'; calls: readonly PendingCall[]; next: PendingCall | null }>
  | Readonly<{ kind: 'unavailable'; reason: string }>
  | Readonly<{ kind: 'unsupported' }>

type Job = {
  readonly key: string
  readonly label: string
  readonly read: (after: PendingCall | null) => Promise<PageAnswer>
  state: 'ready' | 'running' | 'backoff' | 'blocked'
  after: PendingCall | null
  failures: number
  timer: ReturnType<typeof setTimeout> | null
}

const STARTUP = 'startup'

type RecoveryScanState = 'waiting' | 'running' | 'done' | 'unsupported'

export type RecoveryScansInput = Readonly<{
  startup: ToolLedgerRecovery['scan']
  pending: ToolLedgerStore['scanPending']
  rescanMs: number
  remember(call: PendingCall): boolean
  schedule(call: PendingCall): void
  warn(message: string): void
  signal: AbortSignal
}>

function tenantText(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? encoded.value : '(no tenant text)'
}

function reasonOf(failure: Readonly<{ kind: string }>): string {
  const diagnostic: unknown = Reflect.get(failure, 'diagnostic')
  return typeof diagnostic === 'string' ? diagnostic : failure.kind
}

export function createRecoveryScans(input: RecoveryScansInput) {
  const owed = new Map<string, { tenant: TenantId; calls: Set<string> }>()
  const jobs = new Map<string, Job>()
  let startup: RecoveryScanState = 'waiting'
  let rescans = true
  let reading = false
  let full = false
  let recovered = 0

  const tenantKeyOf = (tenant: TenantId) => canonicalDigest(tenant)
  const callKeyOf = (call: PendingCall) => canonicalDigest([call.tenant, call.call])

  const startupJob = (): Job => ({
    key: STARTUP,
    label: 'The recovery scan',
    read: async after => {
      const page = await input.startup({ after, limit: PAGE })
      if ('ok' in page) return { kind: 'page', ...page.ok }
      return page.failure.kind === 'unsupported'
        ? { kind: 'unsupported' }
        : { kind: 'unavailable', reason: reasonOf(page.failure) }
    },
    state: 'ready',
    after: null,
    failures: 0,
    timer: null,
  })

  const tenantJob = (key: string, tenant: TenantId, state: Job['state']): Job => ({
    key,
    label: `The recovery scan of tenant ${tenantText(tenant)}`,
    read: async after => {
      const page = await input.pending({ tenant, after, limit: PAGE })
      if (page.kind === 'unavailable') return { kind: 'unavailable', reason: page.diagnostic }
      if (page.kind === 'unsupported') return page
      const last = page.calls.at(-1)
      return { kind: 'page', calls: page.calls, next: page.more && last ? last : null }
    },
    state,
    after: null,
    failures: 0,
    timer: null,
  })

  const drop = (job: Job) => {
    if (job.timer !== null) clearTimeout(job.timer)
    job.timer = null
    if (jobs.get(job.key) === job) jobs.delete(job.key)
  }

  const kick = (): void => {
    if (reading || input.signal.aborted) return
    const job = [...jobs.values()].find(candidate => candidate.state === 'ready')
    if (job === undefined) return
    reading = true
    void readPage(job).finally(() => {
      reading = false
      kick()
    })
  }

  const backOff = (job: Job, reason: string | null) => {
    job.failures += 1
    const step = Math.min(job.failures, BACKOFF_MS.length) - 1
    const delay = BACKOFF_MS[step] as number
    if (job.failures === 1 || step === BACKOFF_MS.length - 1)
      input.warn(
        reason === null
          ? `${job.label} failed; its error text is withheld. It goes on in ${delay} ms.`
          : `${job.label} is unavailable (${reason}); it goes on in ${delay} ms.`,
      )
    job.state = 'backoff'
    job.timer = setTimeout(() => {
      job.timer = null
      if (jobs.get(job.key) !== job) return
      job.state = 'ready'
      kick()
    }, delay)
    job.timer.unref()
  }

  const finish = (job: Job, state: 'done' | 'unsupported') => {
    drop(job)
    if (job.key === STARTUP) startup = state
  }

  const readPage = async (job: Job): Promise<void> => {
    job.state = 'running'
    if (job.key === STARTUP) startup = 'running'
    let answer: PageAnswer | null
    try {
      answer = await job.read(job.after)
    } catch {
      answer = null
    }
    if (job.key === STARTUP) startup = 'waiting'
    if (input.signal.aborted || jobs.get(job.key) !== job) return
    if (answer === null || answer.kind === 'unavailable') {
      backOff(job, answer?.reason ?? null)
      return
    }
    if (answer.kind === 'unsupported') {
      if (job.key === STARTUP)
        input.warn('The recovery scan is unsupported; old calls are not taken over.')
      else {
        rescans = false
        for (const other of jobs.values()) if (other.key !== STARTUP) drop(other)
        input.warn('The recovery rescan is unsupported; calls whose hint was lost are not found.')
      }
      finish(job, 'unsupported')
      return
    }
    job.failures = 0
    for (const call of answer.calls) {
      if (!input.remember(call)) {
        register(call)
        if (!full)
          input.warn('The executor is full; the recovery scan goes on when a call retires.')
        full = true
        job.state = 'blocked'
        return
      }
      full = false
      job.after = call
      recovered += 1
      input.schedule(call)
    }
    if (answer.next === null || (job.key !== STARTUP && !owed.has(job.key))) {
      finish(job, 'done')
      return
    }
    jobs.delete(job.key)
    jobs.set(job.key, job)
    job.state = 'ready'
  }

  const register = (call: PendingCall): void => {
    const key = tenantKeyOf(call.tenant)
    const found = owed.get(key) ?? { tenant: call.tenant, calls: new Set<string>() }
    found.calls.add(callKeyOf(call))
    owed.set(key, found)
  }

  const round = setInterval(() => {
    if (!rescans) return
    for (const [key, { tenant }] of owed)
      if (!jobs.has(key)) jobs.set(key, tenantJob(key, tenant, 'ready'))
    kick()
  }, input.rescanMs)
  round.unref()

  return {
    start(): void {
      jobs.set(STARTUP, startupJob())
      kick()
    },
    registered: register,
    ended(call: PendingCall): void {
      const key = tenantKeyOf(call.tenant)
      const found = owed.get(key)
      if (found === undefined) return
      found.calls.delete(callKeyOf(call))
      if (found.calls.size > 0) return
      owed.delete(key)
      const job = jobs.get(key)
      if (job !== undefined && job.state !== 'running') drop(job)
    },
    wanted(call: PendingCall): void {
      register(call)
      const key = tenantKeyOf(call.tenant)
      if (rescans && !jobs.has(key)) jobs.set(key, tenantJob(key, call.tenant, 'blocked'))
    },
    roomMade(): void {
      for (const job of jobs.values()) if (job.state === 'blocked') job.state = 'ready'
      kick()
    },
    diagnostics: () => ({ startup, recovered, owedTenants: owed.size }),
    close(): void {
      clearInterval(round)
      for (const job of jobs.values()) drop(job)
    },
  }
}
