// 令牌：一件活（一个成员的一层测试、一个成员的验收）先要令牌再跑，拿到几个就并行几路，跑完归还。
// 令牌从哪来有两种，规则相同（先来先得、队首在空闲数不少于 min 时拿 min(want, 空闲数) 个、拿到之后个数不变）：
// - 整机的令牌池（`scripts/with-test-slot.mjs`）：本进程不在任何令牌之内时用它。每件活起一个持有进程，
//   经令牌池脚本排队；拿到后它把令牌数写到标准输出，一直持有到本进程关上它的标准输入（本进程死了也一样关上）。
// - 进程内的池子：本进程已经在令牌之内（`OMNE_TEST_SLOT_HELD` 非空，例如 `pnpm run test` 整条命令拿了 g 个）时，
//   把这 g 个在本进程的各件活之间分，不再去整机的池子要。
// 一件活接着一件活去要：前一件拿到了才排下一件，本进程的活按给定的次序进队，别的进程的活按到达先后插在中间。
import { spawn } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'
import { WORKER_BUDGET_ENV } from './parallelism.ts'

/** 令牌池脚本：取运行器所在检出里的那份（被检查的检出可以是另一棵树）。 */
export const SLOT_SCRIPT = fileURLToPath(
  new URL('../../../../scripts/with-test-slot.mjs', import.meta.url),
)

/** 已持有令牌的标记：令牌池脚本把它设成第一个令牌文件的路径。 */
export const SLOT_HELD_ENV = 'OMNE_TEST_SLOT_HELD'

export interface TokenRequest {
  /** 最多用得上几个。 */
  readonly want: number
  /** 至少几个才跑。 */
  readonly min: number
  /** 写进令牌池账本的命令里，看得出是哪件活。 */
  readonly label: string
}

export interface Lease {
  readonly tokens: number
  /** 归还全部令牌；重复调用无害。 */
  release(): Promise<void>
}

export interface TokenSource {
  /** 令牌总数。 */
  readonly capacity: number
  acquire(request: TokenRequest): Promise<Lease>
}

/** min 大于容量的请求永远等不到，按容量算；want 至少是 min。 */
function normalized(request: TokenRequest, capacity: number): { want: number; min: number } {
  const min = Math.max(1, Math.min(request.min, capacity))
  return { want: Math.max(min, request.want), min }
}

/**
 * 进程内的池子：`capacity` 个令牌，先来先得。发放规则与令牌池脚本的 `grant` 相同：只有队首拿，
 * 空闲数不少于它的 min 时拿 min(want, 空闲数) 个，否则谁都不拿，等归还。
 */
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

/** 持有进程：把拿到的令牌数写到标准输出，标准输入关上（本进程归还或死去）就退出，令牌池脚本随之归还。 */
const HOLDER = [
  "process.stdout.write(String(process.env['OMNE_WORKER_BUDGET']) + '\\n')",
  "process.stdin.on('data', () => {})",
  "process.stdin.on('end', () => process.exit(0))",
  "process.stdin.on('error', () => process.exit(0))",
].join(';')

/** 整机的令牌池：经 `scripts/with-test-slot.mjs` 排队，容量由它按核数算，这里算同一个数只用来报。 */
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
  // 活多而短：令牌一空出来就该有人接上，看得勤一些（脚本最短 1 秒）。调用方已设的照旧。
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
      return new Promise<Lease>((resolve, reject) => {
        let output = ''
        holder.stdout.setEncoding('utf8')
        const onData = (chunk: string) => {
          output += chunk
          const line = output.split('\n')[0]
          if (!output.includes('\n') || line === undefined) return
          holder.stdout.off('data', onData)
          const tokens = Number(line.trim())
          if (!Number.isSafeInteger(tokens) || tokens < 1) {
            holder.stdin.end()
            reject(new Error(`令牌池给了认不出的令牌数：${line}`))
            return
          }
          let released: Promise<void> | undefined
          resolve({
            tokens,
            release: () => {
              released ??= (async () => {
                holder.stdin.end()
                await exited
              })()
              return released
            },
          })
        }
        holder.stdout.on('data', onData)
        void exited.then(code => {
          if (!output.includes('\n'))
            reject(
              new Error(
                `没拿到令牌：令牌池脚本以 ${code} 退出${code === 75 ? '（等太久放弃）' : ''}（${request.label}）`,
              ),
            )
        })
      })
    },
  }
}

/**
 * 本进程的活从哪要令牌：已在令牌之内（`OMNE_TEST_SLOT_HELD` 非空）就在进程内分那些令牌
 * （个数取 `OMNE_WORKER_BUDGET`，没有时取整机容量），否则去整机的令牌池要。
 */
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

/** 一件活：要多少令牌，拿到 `tokens` 个之后怎样跑。 */
export interface Job<T> extends TokenRequest {
  run(tokens: number): Promise<T>
}

/**
 * 按给定次序一件一件去要令牌，拿到就起，不等它跑完再要下一件；全部跑完后按原次序返回结果。
 * 一件活出错（抛出）时照样归还它的令牌，其余的照跑，最后把第一个错误抛出。
 */
export async function runJobs<T>(jobs: readonly Job<T>[], source: TokenSource): Promise<T[]> {
  const running: Promise<T>[] = []
  for (const job of jobs) running.push(started(await source.acquire(job), job))
  const settled = await Promise.allSettled(running)
  const failure = settled.find(result => result.status === 'rejected')
  if (failure !== undefined) throw failure.reason
  return settled.map(result => (result as PromiseFulfilledResult<T>).value)
}

/** 一件活：要到令牌、跑、归还，返回它的结果；出错照样归还再抛出。 */
export async function runJob<T>(job: Job<T>, source: TokenSource): Promise<T> {
  return started(await source.acquire(job), job)
}

/** 拿着 `lease` 跑这件活，跑完（含出错）归还。 */
async function started<T>(lease: Lease, job: Job<T>): Promise<T> {
  try {
    return await job.run(lease.tokens)
  } finally {
    await lease.release()
  }
}
