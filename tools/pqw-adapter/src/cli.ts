#!/usr/bin/env node
import { availableParallelism, tmpdir } from 'node:os'
import { COMMANDS, isCommandName, runCommand, usageExitCode, type Deps } from './commands.ts'
import { readReadingConfig } from './config.ts'
import { spawnExecutor } from './process.ts'
import { gitRepo } from './repo.ts'

const HELP = `用法：
  cli.ts metrics  --base <起点> [--scope <路径>...] [--full] [--out <目录>] [--workers N]
  cli.ts mutation --base <起点> [--scope <路径>...] [--files <路径>...] [--plan-only] [--max-lines N] [--out <目录>]
  cli.ts risk     --base <起点>
在仓库根运行。根脚本是 pnpm run closeout:metrics、closeout:mutation、risk。
  --base        基线提交。不是 HEAD 的祖先时改用它与 HEAD 的合并点。改动文件是合并点到工作树的全部改动，含未提交与未跟踪的文件。
  --scope       只量这些路径下的改动，可给几个。
  --files       mutation 只变异这些文件，可给几个。
  --full        metrics 快慢两层测试都跑，缺省只跑快层。
  --workers     metrics 每个成员的 vitest 工作进程数，缺省为 CPU 数的一半。
  --plan-only   mutation 只列出各成员的变异范围，不构建、不跑。
  --max-lines   mutation 的范围合计上限，缺省 600 行。超过时拒绝运行，用 --scope 收窄，或显式放宽。
  --out         产物目录，缺省为系统临时目录下的 omne-closeout/<提交>[-dirty]/。
risk 的工具链路径从 origin/github-gate（没有时读本地 github-gate）的 gate/toolchain-paths.txt 读，读不到时照样打印级别并标「不完整」。
退出 0 正常；1 构建失败、读数失败、测量无效或风险规则没判全；2 用法错误或变异范围超过上限。`

const [name, ...argv] = process.argv.slice(2)
if (!isCommandName(name)) {
  console.error(HELP)
  process.exit(usageExitCode(name))
}
const repo = gitRepo(process.cwd())
const deps: Deps = {
  repo,
  exec: spawnExecutor,
  print: line => console.log(line),
  scratch: tmpdir(),
  cpus: availableParallelism(),
  config: () => readReadingConfig(repo.root),
}
process.exitCode = await runCommand(COMMANDS[name], argv, deps)
