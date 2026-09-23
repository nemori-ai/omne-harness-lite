// 进程入口：`node apps/tenancy-host/dist/cli.js keygen <dir>` 或 `… serve`（子命令见 main.ts）。
import { main } from './main.ts'

process.exitCode = await main(process.argv.slice(2))
