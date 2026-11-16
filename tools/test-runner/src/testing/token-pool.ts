import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { availableParallelism } from 'node:os'
import type { Readable, Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { WORKER_BUDGET_ENV } from './parallelism.ts'

export const SLOT_SCRIPT = fileURLToPath(
  new URL('../../../../scripts/with-test-slot.mjs', import.meta.url),
)

export const SLOT_HELD_ENV = 'OMNE_TEST_SLOT_HELD'

export interface TokenRequest {
  readonly want: number
  readonly min: number
  readonly label: string
}

export interface Lease {
  readonly tokens: number
  release(): Promise<void>
}

export interface TokenSource {
  readonly capacity: number
  acquire(request: TokenRequest): Promise<Lease>
}

function normalized(request: TokenRequest, capacity: number): { want: number; min: number } {
  const min = Math.max(1, Math.min(request.min, capacity))
  return { want: Math.max(min, request.want), min }
}

export function localPool(capacity: number): TokenSource {
  if (!Number.isSafeInteger(capacity) || capacity < 1)
    throw new Error(`令牌数须为正整数，现在是 ${capacity}`)
  let free = capacity
  const queue: { want: number; min: number; grant: (tokens: number) => void }[] = []
  const serve = () => {
    for (;;) {
      const head = queue[0]
      if (head === undefined || free < head.min) return
      const tokens = Math.min(head.want, free)
      queue.shift()
      free -= tokens
      head.grant(tokens)
    }
  }
  return {
    capacity,
    acquire: request =>
      new Promise(resolve => {
        const { want, min } = normalized(request, capacity)
        queue.push({
          want,
          min,
          grant: tokens => {
            let held = true
            resolve({
              tokens,
              release: async () => {
                if (!held) return
                held = false
                free += tokens
                serve()
              },
            })
          },
        })
        serve()
      }),
  }
}

const HOLDER = [
  "process.stdout.write(String(process.env['OMNE_WORKER_BUDGET']) + '\\n')",
  "process.stdin.on('data', () => {})",
  "process.stdin.on('end', () => process.exit(0))",
  "process.stdin.on('error', () => process.exit(0))",
].join(';')

function holderLease(
  { stdin, stdout }: ChildProcessByStdio<Writable, Readable, null>,
  exited: Promise<number>,
  label: string,
): Promise<Lease> {
  return new Promise<Lease>((resolve, reject) => {
    let output = ''
    stdout.setEncoding('utf8')
    const onData = (chunk: string) => {
      output += chunk
      const line = output.split('\n')[0]
      if (!output.includes('\n') || line === undefined) return
      stdout.off('data', onData)
      const tokens = Number(line.trim())
      if (!Number.isSafeInteger(tokens) || tokens < 1) {
        stdin.end()
        reject(new Error(`令牌池给了认不出的令牌数：${line}`))
        return
      }
      let released: Promise<void> | undefined
      resolve({
        tokens,
        release: () => {
          released ??= (async () => {
            stdin.end()
            await exited
          })()
          return released
        },
      })
    }
    stdout.on('data', onData)
    void exited.then(code => {
      if (!output.includes('\n'))
        reject(
          new Error(
            `没拿到令牌：令牌池脚本以 ${code} 退出${code === 75 ? '（等太久放弃）' : ''}（${label}）`,
          ),
        )
    })
  })
}

export function machinePool(
  root: string,
  env: NodeJS.ProcessEnv,
  reserveCores: number,
  cores: number = availableParallelism(),
): TokenSource {
  const given = env['OMNE_TEST_SLOT_CAPACITY']
  const capacity =
    given !== undefined && /^[1-9]\d*$/u.test(given)
      ? Number(given)
      : Math.max(1, cores - reserveCores)
  const childEnv: NodeJS.ProcessEnv = { ...env }
  delete childEnv[SLOT_HELD_ENV]
  childEnv['OMNE_TEST_SLOT_POLL_SECONDS'] ??= '1'
  return {
    capacity,
    acquire: request => {
      const { want, min } = normalized(request, capacity)
      const holder = spawn(
        process.execPath,
        [
          SLOT_SCRIPT,
          '--want',
          String(want),
          '--min',
          String(min),
          '--',
          process.execPath,
          '-e',
          HOLDER,
          request.label,
        ],
        { cwd: root, env: childEnv, stdio: ['pipe', 'pipe', 'inherit'] },
      )
      const exited = new Promise<number>(resolve => {
        holder.once('error', () => resolve(-1))
        holder.once('exit', code => resolve(code ?? -1))
      })
      return holderLease(holder, exited, request.label)
    },
  }
}

export function tokenSource(
  root: string,
  env: NodeJS.ProcessEnv,
  reserveCores: number,
  cores: number = availableParallelism(),
): TokenSource {
  const machine = machinePool(root, env, reserveCores, cores)
  if ((env[SLOT_HELD_ENV] ?? '') === '') return machine
  const given = env[WORKER_BUDGET_ENV]
  return localPool(
    given !== undefined && /^[1-9]\d*$/u.test(given) ? Number(given) : machine.capacity,
  )
}

export interface Job<T> extends TokenRequest {
  run(tokens: number): Promise<T>
}

export async function runJobs<T>(jobs: readonly Job<T>[], source: TokenSource): Promise<T[]> {
  const running: Promise<T>[] = []
  for (const job of jobs) running.push(started(await source.acquire(job), job))
  const settled = await Promise.allSettled(running)
  const failure = settled.find(result => result.status === 'rejected')
  if (failure !== undefined) throw failure.reason
  return settled.map(result => (result as PromiseFulfilledResult<T>).value)
}

export async function runJob<T>(job: Job<T>, source: TokenSource): Promise<T> {
  return started(await source.acquire(job), job)
}

async function started<T>(lease: Lease, job: Job<T>): Promise<T> {
  try {
    return await job.run(lease.tokens)
  } finally {
    await lease.release()
  }
}
