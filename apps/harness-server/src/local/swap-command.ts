import { parseArgs } from 'node:util'
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'
import { askControl } from '../control-port.ts'
import { UsageError } from './serve-command.ts'
import { localServeInputs } from './serve-local.ts'

export const SWAP_USAGE = 'usage: swap <row> <abs version directory> [--state-root <abs dir>]'

function stateRootOf(given: string | undefined): string {
  if (given !== undefined) {
    if (!isAbsolute(given)) throw new UsageError('--state-root must be an absolute path')
    return given
  }
  const local = localServeInputs({
    platform: process.platform,
    env: process.env,
    home: homedir(),
    needOperator: false,
    needStateRoot: true,
    distribution: undefined,
    shutdownDeadlineMs: 0,
  })
  if (local.kind !== 'ready' || local.stateRoot === undefined)
    throw new UsageError('missing --state-root: this machine has no server set up')
  return local.stateRoot
}

/** Exit 0: swapped. 3: refused, with the reason. 2: usage, or no process serves that state directory. */
export async function swapCommand(
  argv: readonly string[],
  out: (line: string) => void,
  err: (line: string) => void,
): Promise<number> {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: { 'state-root': { type: 'string' } },
  })
  const [row, directory] = positionals
  if (positionals.length !== 2 || row === undefined || directory === undefined)
    throw new UsageError('expected a row and a version directory')
  if (!isAbsolute(directory)) throw new UsageError('the version directory must be an absolute path')
  const stateRoot = stateRootOf(values['state-root'])
  let lines: Awaited<ReturnType<typeof askControl>>
  try {
    lines = await askControl(stateRoot, { op: 'swap', row, directory })
  } catch (error) {
    err(
      `swap: no serving process answers at ${stateRoot}: ${error instanceof Error ? error.message : String(error)}`,
    )
    return 2
  }
  for (const line of lines) out(JSON.stringify(line))
  return lines.at(-1)?.['outcome'] === 'swapped' ? 0 : 3
}
