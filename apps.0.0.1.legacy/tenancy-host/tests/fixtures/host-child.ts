// 子进程一侧：按父进程给的规格 boot() 一个治理中心，在标准输出上逐行报到；父进程据此 SIGKILL 或让它撤除。
//   migrating             测试片段 `hang` 开始跑（迁移中途、快照已建）
//   before-confirm        全部 fiber ACTIVE、确认之前（停在这里直到被杀）
//   serving <centerId>    boot() 返回
//   failed <stage>        boot() 拒绝
//   disposed <complete>   收到标准输入上的一行 `dispose` 之后撤完
// 日志（JSONL）照常写标准错误流。
import { createInterface } from 'node:readline'
import { type HostStartupFailure, boot } from '../../src/index.ts'
import { type FragmentName, fragment } from '../support/fragments.ts'

interface ChildSpec {
  readonly env: Record<string, string | undefined>
  readonly extra?: readonly FragmentName[]
  readonly stopAt?: 'before-confirm'
  readonly lockDirectory?: string
}

const spec = JSON.parse(process.argv[2] ?? '{}') as ChildSpec
const say = (line: string) => void process.stdout.write(`${line}\n`)

const extra = (spec.extra ?? []).map(name =>
  fragment(name, {
    onHang: () => say('migrating'),
    ...(spec.lockDirectory === undefined ? {} : { directory: spec.lockDirectory }),
  }),
)

try {
  const host = await boot({
    env: spec.env,
    hooks: {
      extraMigrations: extra,
      ...(spec.stopAt === 'before-confirm'
        ? {
            beforeConfirm: async () => {
              say('before-confirm')
              await new Promise(() => undefined)
            },
          }
        : {}),
    },
  })
  say(`serving ${host.serving.centerId} ${String(host.serving.startedAt)}`)
  const lines = createInterface({ input: process.stdin })
  for await (const line of lines) {
    if (line.trim() === 'dispose') {
      const result = await host.dispose()
      say(`disposed ${String(result.complete)}`)
      lines.close()
      break
    }
  }
} catch (error) {
  say(`failed ${(error as HostStartupFailure).stage}`)
  process.exitCode = 1
}
