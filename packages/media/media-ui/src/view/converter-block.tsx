import { FactList, FactRow, Section } from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import { useAssetBody, type AssetPort } from './asset-body.ts'

const TURNS: Readonly<Record<string, string>> = {
  voice: '语音转成文字',
  'application-pdf': 'PDF 抽出文字',
}

type Converter = Readonly<{ kind: string; egress: string }>

function converterOf(body: unknown): Converter | undefined {
  const { kind, egress } = (body ?? {}) as {
    kind?: unknown
    egress?: { kind?: unknown; destination?: unknown }
  }
  if (typeof kind !== 'string') return undefined
  if (egress?.kind === 'in-process') return { kind, egress: '只在本机，不发到外面' }
  if (egress?.kind === 'remote' && typeof egress.destination === 'string')
    return { kind, egress: `发到 ${egress.destination}` }
  return undefined
}

type BlockProps = Readonly<{ port: AssetPort; tenant: string; category: string; name: string }>

/** What a converter turns into what, and where the content goes while it does. */
export function ConverterBlock({ port, tenant, category, name }: BlockProps): JSX.Element | null {
  const converter = converterOf(useAssetBody(port, tenant, category, name))
  if (converter === undefined) return null
  return (
    <Section id="media-converter" title="转换">
      <FactList>
        <FactRow term="做什么">{TURNS[converter.kind] ?? converter.kind}</FactRow>
        <FactRow term="内容去向">{converter.egress}</FactRow>
      </FactList>
    </Section>
  )
}
