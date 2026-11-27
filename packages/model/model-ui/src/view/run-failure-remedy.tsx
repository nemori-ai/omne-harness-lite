import { Button } from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import type { AssetPort } from './asset-body.ts'
import { useProvidersWithoutKey } from './provider-keys.ts'

export type RunFault = Readonly<{
  cause: string
  upstreamStatus: string | null
  throttled: boolean
}>

type Remedy = Readonly<{ text: string; way: 'fill' | 'choose' }>

const REFUSED_KEY = '模型供应商没有收下填的密钥。换一把之后按「重试」接着做。'
const WAYS_ON = '请求没有得到回复。可以稍后按「重试」，或换一个模型再试。'

function remedyOf(missing: readonly string[], fault: RunFault | null): Remedy | null {
  if (missing.length > 0)
    return { text: `${missing.join('、')} 还没填密钥。填好之后按「重试」接着做。`, way: 'fill' }
  if (fault?.cause === 'credential') return { text: REFUSED_KEY, way: 'fill' }
  if (fault?.cause === 'upstream-unavailable')
    return {
      text: `模型供应商${fault.throttled ? '在限流' : '暂时不可用'}，${WAYS_ON}`,
      way: 'choose',
    }
  return null
}

type RemedyProps = Readonly<{
  port: AssetPort | undefined
  tenant: string
  category: string
  fault: RunFault | null
  fill: (() => void) | undefined
  choose: (() => void) | undefined
}>

// Under a failed run, what this module knows of it: a provider with no key at any layer, by name, whatever the
// reason; or what Model said of the failed call, with the way on that fits it.
export function RunFailureRemedy({
  port,
  tenant,
  category,
  fault,
  fill,
  choose,
}: RemedyProps): JSX.Element | null {
  const missing = useProvidersWithoutKey(port, tenant, category)
  const remedy = remedyOf(missing, fault)
  if (remedy === null) return null
  const act = remedy.way === 'fill' ? fill : choose
  return (
    <>
      <p>{remedy.text}</p>
      {act === undefined ? null : (
        <Button variant="outline" onClick={act}>
          {remedy.way === 'fill' ? '去填' : '换模型'}
        </Button>
      )}
    </>
  )
}
