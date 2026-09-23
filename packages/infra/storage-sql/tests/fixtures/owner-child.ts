// 子进程：对一份库起一个开了升级守卫的属主实例，在指定时点报告并挂住，等父进程 SIGKILL（真崩溃）。
// 用法：node --experimental-transform-types owner-child.ts '<json spec>'
// 报告（stdout 每行一条）：`at:<hook>`（到达时点、挂住）、`at:migration`（hang 迁移）、`ready`（启动完成、未确认、挂住）、
// `failed:<stage>`（StorageStartupFailure，随后退出 0）、`error:<message>`（其他失败，退出 1）。
import { createUpgradeGuard, StorageStartupFailure } from '../../src/index.ts'
import { openStorageWithHooks } from '../../src/open.ts'
import type { UpgradeHooks } from '../../src/upgrade/owner.ts'
import { migrationsOf } from './migrations.ts'

interface ChildSpec {
  readonly file: string
  readonly migrations: readonly string[]
  readonly stopAt?: 'beforeMigrate' | 'beforeSnapshotRename' | 'afterSidecarsRemoved'
}

const spec = JSON.parse(process.argv[2] ?? '{}') as ChildSpec
const hang = () => new Promise<void>(() => undefined)
const stop = (name: string) => async () => {
  process.stdout.write(`at:${name}\n`)
  await hang()
}
const hooks: UpgradeHooks = spec.stopAt === undefined ? {} : { [spec.stopAt]: stop(spec.stopAt) }
// 挂住期间事件循环要有活物，否则进程自己退出
const keepAlive = setInterval(() => undefined, 60_000)

try {
  // 故意不留实例的引用，并在报 ready 之前强制回收：属主锁必须只随 release() 或进程死亡结束，不随 GC 放掉
  await openStorageWithHooks(
    {
      dialect: 'sqlite',
      file: spec.file,
      migrations: migrationsOf(...spec.migrations),
      upgrade: { checks: [], guard: createUpgradeGuard() },
    },
    {},
    hooks,
  )
  const gc = (globalThis as { gc?: () => void }).gc
  for (let i = 0; i < 3; i += 1) {
    gc?.()
    await new Promise<void>(resolve => setImmediate(resolve))
  }
  process.stdout.write('ready\n')
  await hang()
} catch (error) {
  clearInterval(keepAlive)
  if (error instanceof StorageStartupFailure) {
    process.stdout.write(`failed:${error.stage}\n`)
    process.exit(0)
  }
  process.stdout.write(`error:${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
