import { FactList, FactRow, Section } from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import { useAssetBody, type AssetPort } from './asset-body.ts'

const PROTOCOLS: Readonly<Record<string, string>> = {
  'chat-completions': 'Chat Completions',
  messages: 'Messages',
  responses: 'Responses',
}

type Endpoint = Readonly<{ protocol: string; url: string }>

function endpointsOf(body: unknown): readonly Endpoint[] {
  const endpoints = (body as { endpoints?: unknown } | null)?.endpoints
  if (!Array.isArray(endpoints)) return []
  return endpoints.flatMap(item => {
    const { protocol, url } = (item ?? {}) as { protocol?: unknown; url?: unknown }
    return typeof protocol === 'string' && typeof url === 'string' ? [{ protocol, url }] : []
  })
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

type BlockProps = Readonly<{ port: AssetPort; tenant: string; category: string; name: string }>

/** How a provider is reached: the hosts its requests go to and the interfaces it speaks. */
export function ProviderBlock({ port, tenant, category, name }: BlockProps): JSX.Element | null {
  const body = useAssetBody(port, tenant, category, name)
  const endpoints = endpointsOf(body)
  if (endpoints.length === 0) return null
  const hosts = [...new Set(endpoints.map(endpoint => hostOf(endpoint.url)))]
  const protocols = endpoints.map(endpoint => PROTOCOLS[endpoint.protocol] ?? endpoint.protocol)
  return (
    <Section id="model-provider-access" title="接入方式">
      <FactList>
        <FactRow term="请求发往">{hosts.join('、')}</FactRow>
        <FactRow term="接口">{protocols.join('、')}</FactRow>
      </FactList>
    </Section>
  )
}
