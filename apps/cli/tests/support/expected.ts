import { readFileSync } from 'node:fs'

// The help texts are read from the behavior spec, so the tests compare the build with the
// spec's own words and not with a second copy that can drift.
const spec = readFileSync(new URL('../../SPEC.md', import.meta.url), 'utf8').replaceAll(
  '\r\n',
  '\n',
)

function specBlock(marker: string): string {
  const at = spec.indexOf(marker)
  if (at === -1) throw new Error(`SPEC.md has no passage that starts with ${marker}`)
  const open = spec.indexOf('```text\n', at)
  const close = spec.indexOf('\n```', open + 8)
  if (open === -1 || close === -1) throw new Error(`SPEC.md has no text block after ${marker}`)
  return spec.slice(open + 8, close + 1)
}

/** The help text of an empty command catalog. */
export const expectedEmptyHelp = specBlock('命令目录为空时，生成结果是下面的原文')

/** The help text of the production catalog with its six commands. */
export const expectedHelp = specBlock('登记[命令](#命令)的六个命令之后，生成结果是下面的原文')

export const expectedVersion = '0.0.0\n'

export const identityFailure = 'omne: build identity is missing or invalid\n'

export const missingCommand = 'omne: missing command\nRun omne --help for usage.\n'
export const homeRequiresDirectory = 'omne: --home requires a directory\n'
export const unrecognizedArguments = 'omne: unrecognized arguments\nRun omne --help for usage.\n'

export const notLoggedIn = 'omne: not logged in\nRun omne login first.\n'
export const loginStateInvalid = 'omne: login state is invalid\n'
export const serverRefused = 'omne: --server must be a loopback http address\n'
export const emptyCredential = 'omne: empty credential\n'

export function commandUnrecognized(command: string): string {
  return `omne ${command}: unrecognized arguments\nRun omne --help for usage.\n`
}
export function commandMissing(command: string, option: string): string {
  return `omne ${command}: missing ${option}\nRun omne --help for usage.\n`
}
export function resultUncertain(command: string): string {
  return `omne ${command}: result uncertain\n`
}
