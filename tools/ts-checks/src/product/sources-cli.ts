import { writeFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { canonicalPath, inspectCurrentSources } from './sources.ts'

try {
  const args = new Map<string, string>()
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i],
      value = process.argv[i + 1]
    if (
      key === undefined ||
      value === undefined ||
      !['--root', '--product-root', '--config', '--capture', '--report'].includes(key) ||
      args.has(key)
    )
      throw new Error(
        'Usage: source-status [--root path] [--product-root path] [--config path] [--capture path] [--report path]',
      )
    args.set(key, value)
  }
  const root = resolve(args.get('--root') ?? process.cwd())
  const configPath = args.get('--config'),
    capturePath = args.get('--capture')
  const report = inspectCurrentSources({
    root,
    productRoot: args.get('--product-root') ?? '.meta_harness/design/product',
    ...(configPath === undefined ? {} : { configPath }),
    ...(capturePath === undefined ? {} : { capturePath }),
  })
  const json = `${JSON.stringify(report, null, 2)}\n`,
    output = args.get('--report')
  if (output !== undefined) {
    const target = fileIdentity(output)
    if (report.bindings.some(binding => fileIdentity(binding.path) === target))
      throw new Error('report must not overwrite an observation input')
    writeFileSync(output, json)
  } else process.stdout.write(json)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}

function fileIdentity(path: string): string {
  try {
    const stat = statSync(path)
    if (!stat.isFile()) throw new Error('report and inputs must be regular files')
    return `${stat.dev}:${stat.ino}`
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
  }
  return canonicalPath(path)
}
