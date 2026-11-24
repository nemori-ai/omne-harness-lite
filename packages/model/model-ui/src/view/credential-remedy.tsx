import { Button } from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import type { AssetPort } from './asset-body.ts'
import { useProvidersWithoutKey } from './provider-keys.ts'

// Agent writes a failed model call as `model-failed/<cause>/<diagnostic>`; the cause is Model's.
const REFUSED_KEY = 'model-failed/credential/'

/** Whether a model call went out and the provider turned its key away. */
export const keyRefused = (detail: string | null): boolean =>
  detail !== null && detail.startsWith(REFUSED_KEY)

type RemedyProps = Readonly<{
  port: AssetPort | undefined
  tenant: string
  category: string
  detail: string | null
  fill: (() => void) | undefined
}>

// Under a failed run, two facts this module reads, neither claimed as the cause: a provider with no key at any
// layer, by name, whatever the reason; or a key the provider turned away.
export function CredentialRemedy({
  port,
  tenant,
  category,
  detail,
  fill,
}: RemedyProps): JSX.Element | null {
  const missing = useProvidersWithoutKey(port, tenant, category)
  const text =
    missing.length > 0
      ? `${missing.join('、')} 还没填密钥。填好之后按「重试」接着做。`
      : keyRefused(detail)
        ? '模型供应商没有收下填的密钥。换一把之后按「重试」接着做。'
        : undefined
  if (text === undefined) return null
  return (
    <div className="model-credential-remedy">
      <p>{text}</p>
      {fill === undefined ? null : (
        <Button variant="outline" onClick={fill}>
          去填
        </Button>
      )}
    </div>
  )
}
