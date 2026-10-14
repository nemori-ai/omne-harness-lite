import { readFileSync } from 'node:fs'

export type BuildIdentityResult =
  | { readonly kind: 'identity'; readonly version: string }
  | { readonly kind: 'error'; readonly message: string }

const invalidIdentity: BuildIdentityResult = {
  kind: 'error',
  message: 'omne: build identity is missing or invalid\n',
}

/** Reads `cli-identity.json` beside this build module; no other version source is consulted. */
export function readBuildIdentity(): BuildIdentityResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(new URL('./cli-identity.json', import.meta.url), 'utf8'))
  } catch {
    return invalidIdentity
  }
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed))
    return invalidIdentity
  if (typeof parsed.version !== 'string') return invalidIdentity
  return { kind: 'identity', version: parsed.version }
}
