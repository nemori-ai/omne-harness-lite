import { readFileSync } from 'node:fs'

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n',
  )
}

/** The help text of an empty command catalog. */
export const expectedEmptyHelp = fixture('help-empty-catalog.txt')

/** The help text of the production catalog with its 30 commands. */
export const expectedHelp = fixture('help.txt')

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
