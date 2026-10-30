// 构建产物用例（例如 model-credential-boundary 的 CLI 一致性）运行本成员的 dist。
// 单独跑测试时先用 turbo 构建本成员及其依赖；pnpm run check 已构建过时命中缓存，几乎不耗时。
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export default function setup(): void {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  // 由当前 Node 运行 turbo 包的 bin 入口：`.bin/turbo` 在 Windows 上是 shell 垫片，Node 不经 shell 起不了。
  execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL('../../../node_modules/turbo/bin/turbo', import.meta.url)),
      'run',
      'build',
      '--filter=@omne-harness/product-checks',
      '--output-logs=errors-only',
    ],
    {
      cwd: root,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: {
        ...process.env,
        TURBO_TELEMETRY_DISABLED: '1',
        TURBO_NO_UPDATE_NOTIFIER: '1',
      },
    },
  )
}
