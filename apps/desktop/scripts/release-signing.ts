// The verdict of check 5: a local package may be unsigned; one for distribution must be signed.
import { DISTRIBUTION_FLAG, type Verdict } from './release-verdicts.ts'

type Ran = Readonly<{ ok: boolean; output: string }>

export type SignatureFacts =
  | Readonly<{
      platform: 'darwin'
      signature: 'unsigned' | 'adhoc' | 'identity'
      authority?: string | undefined
      verify?: Ran
      staple?: Ran
      gatekeeper?: Ran
    }>
  | Readonly<{ platform: 'win32'; status: string; message: string; signer?: string | undefined }>
  | Readonly<{ platform: 'linux' }>

export function parseAuthenticode(output: string): Extract<SignatureFacts, { platform: 'win32' }> {
  let facts: unknown
  try {
    facts = JSON.parse(output.replace(/^﻿/, ''))
  } catch (failure) {
    throw new Error(
      `Get-AuthenticodeSignature did not answer in JSON: ${JSON.stringify(output.slice(0, 200))}`,
      {
        cause: failure,
      },
    )
  }
  const get = (name: string): string | undefined => {
    const value: unknown =
      typeof facts === 'object' && facts !== null ? Reflect.get(facts, name) : undefined
    return typeof value === 'string' ? value : undefined
  }
  const status = get('Status')
  if (status === undefined)
    throw new Error(`Get-AuthenticodeSignature gave no Status: ${output.slice(0, 200)}`)
  return { platform: 'win32', status, message: get('StatusMessage') ?? '', signer: get('Signer') }
}

export const requiresSigning = (platform: NodeJS.Platform, distribution: boolean): boolean =>
  distribution && platform !== 'linux'

const first = (output: string): string => output.trim().split('\n')[0] ?? ''

export function judgeSigning(facts: SignatureFacts, distribution: boolean): Verdict {
  const local = (what: string): Verdict => ({
    status: 'skipped',
    reason: `unsigned local package (${what}); ${DISTRIBUTION_FLAG} makes this a failure`,
  })
  if (facts.platform === 'linux')
    return {
      status: 'skipped',
      reason:
        'Linux has no OS code signature on an application; deb and rpm are signed by the repository that publishes them',
    }
  if (facts.platform === 'win32') {
    if (facts.status === 'Valid')
      return {
        status: 'pass',
        reason: `Authenticode signature valid${facts.signer ? `: ${facts.signer}` : ''}`,
      }
    if (facts.status === 'NotSigned' && !distribution) return local('Authenticode: NotSigned')
    return { status: 'fail', reason: `Authenticode status ${facts.status}: ${facts.message}` }
  }
  if (facts.signature !== 'identity') {
    const what =
      facts.signature === 'adhoc'
        ? 'ad-hoc signature only, no signing identity'
        : 'not signed at all'
    if (!distribution) return local(what)
    return {
      status: 'fail',
      reason: `a package for distribution must be signed with a Developer ID: ${what}`,
    }
  }
  const failures = [
    ...(facts.verify?.ok
      ? []
      : [`codesign --verify --deep --strict failed: ${first(facts.verify?.output ?? 'not run')}`]),
    ...(facts.staple?.ok
      ? []
      : [`no stapled notarization ticket: ${first(facts.staple?.output ?? 'not run')}`]),
    ...(facts.gatekeeper?.ok && /source=Notarized Developer ID/.test(facts.gatekeeper.output)
      ? []
      : [
          `Gatekeeper does not accept it as notarized: ${first(facts.gatekeeper?.output ?? 'not run')}`,
        ]),
  ]
  if (failures.length > 0) return { status: 'fail', reason: failures.join('; ') }
  return {
    status: 'pass',
    reason: `signed${facts.authority ? ` by ${facts.authority}` : ''}, verified deep and strict, notarized and stapled, accepted by Gatekeeper`,
  }
}
