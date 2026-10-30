// Preloaded on Windows through NODE_OPTIONS by ghEnv in gh.ts. It does nothing unless this process was
// started as `gh`, that is, through the `gh.exe` link that writeGh puts next to the stand-in script.
// Node then takes the first gh argument as its main module and has already resolved it against the
// working directory. The shim recovers that argument, gives the script the argv it has on POSIX, and
// runs the script `gh` next to the link in its place: a Node script in this process, any other script
// through Git for Windows' bash.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

function refuse(message: string): never {
  process.stderr.write(`gh stand-in: ${message}\n`)
  process.exit(2)
}

function bash(): string {
  const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim()
  return join(resolve(exec), '..', '..', '..', 'bin', 'bash.exe')
}

if (/^gh(\.exe)?$/iu.test(basename(process.argv0))) {
  const script = join(dirname(process.execPath), 'gh')
  const main = process.argv[1]
  if (main === undefined) refuse('gh was started without a subcommand')
  const first = relative(process.cwd(), main)
  if (first === '' || isAbsolute(first) || first.startsWith('..'))
    refuse(`cannot recover the first argument from ${main}`)
  const args = [first.split(sep).join('/'), ...process.argv.slice(2)]
  if (!/^#!.*\bnode\b/u.test(readFileSync(script, 'utf8').split('\n', 1)[0] ?? '')) {
    const result = spawnSync(bash(), [script, ...args], { stdio: 'inherit' })
    process.exit(result.status ?? 1)
  }
  process.argv = [process.execPath, script, ...args]
  const url = pathToFileURL(script).href
  registerHooks({
    resolve: (specifier, context, next) =>
      context.parentURL === undefined ? { url, shortCircuit: true } : next(specifier, context),
  })
}
