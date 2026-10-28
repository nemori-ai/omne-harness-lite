import type { AdmissionProject } from '../delivery/admission.ts'
import { fields, integer, literal, string, IntegrationError } from './parse.ts'

export const FACTS_MARKER = 'omne-delivery-facts:v1'

export type AuthorityFacts = {
  url: string
  author: string
  authorNodeId: string
  reviewer: boolean
  bodySha256: string
  updatedAt: string
}
export type DeliveryFacts = {
  nonce: string
  run: number
  issue: number
  authority: AuthorityFacts
  project: AdmissionProject
}
/** Strict shape of the facts block. Any parse failure is one fixed message without API content. */
export function parseDeliveryFacts(value: unknown): DeliveryFacts {
  try {
    const v = fields(
      value,
      ['schemaVersion', 'nonce', 'run', 'issue', 'authority', 'project'],
      'facts',
    )
    const a = fields(
      v.authority,
      ['url', 'author', 'authorNodeId', 'reviewer', 'bodySha256', 'updatedAt'],
      'facts.authority',
    )
    const p = fields(v.project, ['id', 'item', 'stage'], 'facts.project')
    literal(v.schemaVersion, 1, 'facts.schemaVersion')
    const nonce = string(v.nonce, 'facts.nonce'),
      bodySha256 = string(a.bodySha256, 'facts.authority.bodySha256')
    if (!/^[0-9a-f]{32}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(bodySha256))
      throw new IntegrationError('input-error', 'facts digest format')
    if (typeof a.reviewer !== 'boolean')
      throw new IntegrationError('input-error', 'facts.authority.reviewer must be a boolean')
    return {
      nonce,
      run: integer(v.run, 'facts.run'),
      issue: integer(v.issue, 'facts.issue'),
      authority: {
        url: string(a.url, 'facts.authority.url'),
        author: string(a.author, 'facts.authority.author'),
        authorNodeId: string(a.authorNodeId, 'facts.authority.authorNodeId'),
        reviewer: a.reviewer,
        bodySha256,
        updatedAt: string(a.updatedAt, 'facts.authority.updatedAt'),
      },
      project: {
        id: string(p.id, 'facts.project.id'),
        item: string(p.item, 'facts.project.item'),
        stage: p.stage === null ? null : string(p.stage, 'facts.project.stage'),
      },
    }
  } catch {
    throw new IntegrationError('unknown', 'Delivery facts block is malformed. API output omitted.')
  }
}
