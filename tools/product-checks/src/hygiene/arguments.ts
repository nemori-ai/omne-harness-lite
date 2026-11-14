export const HYGIENE_FLAG = '--hygiene'

export interface CliArguments {
  readonly paths: readonly string[]
  readonly hygiene: boolean
}

export function parseArguments(args: readonly string[]): CliArguments {
  const paths = args.filter(arg => arg !== HYGIENE_FLAG)
  return {
    paths: paths.length > 0 ? paths : ['packages'],
    hygiene: args.includes(HYGIENE_FLAG),
  }
}
