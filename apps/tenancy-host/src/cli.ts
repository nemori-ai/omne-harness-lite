process.stdout.on('error', () => {})
process.stderr.on('error', () => {})
// 进程入口：`node apps/tenancy-host/dist/cli.js keygen <dir>` 或 `… serve`（子命令见 main.ts）。
if (process.argv.length === 3 && process.argv[2] === '--version') {
  const { printBuildVersion } = await import('./build-version.ts')
  process.exitCode = await printBuildVersion({
    stdout: text =>
      new Promise((yes, no) => process.stdout.write(text, error => (error ? no(error) : yes()))),
    stderr: text =>
      new Promise((yes, no) => process.stderr.write(text, error => (error ? no(error) : yes()))),
  })
} else {
  const { main } = await import('./main.ts')
  try {
    process.exitCode = await main(process.argv.slice(2))
  } catch {
    process.exitCode = 1
    await new Promise<void>(resolve =>
      process.stderr.write('tenancy-host: command failed\n', () => resolve()),
    )
  }
}
// A failed command can retain resources deliberately. Flush diagnostics before
// ending the process; failure is not a claim that those resources closed cleanly.
if (process.exitCode === 1) {
  await Promise.all([
    new Promise<void>(resolve => process.stdout.write('', () => resolve())),
    new Promise<void>(resolve => process.stderr.write('', () => resolve())),
  ])
  process.exit(1)
}
