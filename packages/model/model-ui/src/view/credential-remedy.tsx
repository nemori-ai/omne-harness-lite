import { Button } from '@omne-harness/ui-kit'
import type { JSX } from 'react'

// Agent writes a failed model call as `model-failed/<cause>/<diagnostic>`; the cause is Model's.
const CREDENTIAL = 'model-failed/credential/'

/** Whether a run failed because the model call had no key, or had one the provider does not take. */
export const failedOnCredential = (detail: string | null): boolean =>
  detail !== null && detail.startsWith(CREDENTIAL)

/** The reason in words, and the way to the page where the key of the provider is filled in. */
export function CredentialRemedy({
  fill,
}: Readonly<{ fill: (() => void) | undefined }>): JSX.Element {
  return (
    <div className="model-credential-remedy">
      <p>调用模型的密钥还没填，或者填的不能用。填好之后按「重试」接着做。</p>
      {fill === undefined ? null : (
        <Button variant="outline" onClick={fill}>
          去填
        </Button>
      )}
    </div>
  )
}
