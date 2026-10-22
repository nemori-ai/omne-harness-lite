import { bodyFields, bodySections } from './body.ts'
import type { CapturedIssue } from './protocol.ts'

/** Card attribute values adopted in docs/engineering/delivery.md「卡属性与合法组合」. */
export const natures = ['design', 'contract', 'impl', 'integration', 'baseline'] as const
export const contractChanges = ['none', 'additive', 'breaking'] as const
export type Nature = (typeof natures)[number]
export type ContractChange = (typeof contractChanges)[number]

/** The body field name of each card attribute in「身份与责任」. */
export const ATTRIBUTE_FIELDS = {
  line: '交付线',
  nature: '性质',
  contractChange: '契约变更',
} as const
export type AttributeName = keyof typeof ATTRIBUTE_FIELDS
/**
 * The card attributes as written, before judgement. Each body field keeps every value found in
 * 「身份与责任」, so a missing or repeated field stays visible. `milestone` is the Issue milestone
 * title, null without one, and undefined when the capture did not read it.
 */
export type CardAttributes = {
  issue: string
  fields: Record<AttributeName, string[]>
  milestone: string | null | undefined
  labels: string[]
}
export function readCardAttributes(
  body: string,
  issue: Pick<CapturedIssue, 'url' | 'labels' | 'milestone'>,
): CardAttributes {
  const identity = bodyFields((bodySections(body).get('身份与责任') ?? []).join('\n'))
  const values = (name: AttributeName) => identity.get(ATTRIBUTE_FIELDS[name]) ?? []
  return {
    issue: issue.url,
    fields: {
      line: values('line'),
      nature: values('nature'),
      contractChange: values('contractChange'),
    },
    milestone: issue.milestone,
    labels: [...issue.labels],
  }
}
