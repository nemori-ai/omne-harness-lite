#!/usr/bin/env node
// 命令面：根 package.json 的 closeout:metrics、closeout:mutation 与 risk。逻辑在 commands.ts，这里只装真实的 Git、执行器与配置。
import { availableParallelism, tmpdir } from 'node:os'
import { COMMANDS, isCommandName, runCommand, usageExitCode, type Deps } from './commands.ts'
import { readReadingConfig } from './config.ts'
import { spawnExecutor } from './process.ts'
import { gitRepo } from './repo.ts'

const HELP = `用法：
  cli.ts metrics  --base <起点> [--scope <路径>...] [--full] [--out <目录>] [--workers N]
  cli.ts mutation --base <起点> [--scope <路径>...] [--files <路径>...] [--plan-only] [--max-lines N] [--out <目录>]
  cli.ts risk     --base <起点>
退出 0 正常；1 读数失败、测量无效或风险规则没判全；2 用法错误或变异范围超过上限。`

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
