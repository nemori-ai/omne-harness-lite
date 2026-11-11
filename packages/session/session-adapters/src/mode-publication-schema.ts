import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Adoption } from '@omne-harness/session-contract'

const text = z.string().min(1)
const revision = z.string().regex(/^(0|[1-9][0-9]*)$/)
const adoption = z
  .strictObject({ owner: text, name: text, revision: text, digest: text })
  .readonly()
const evidence = z
  .strictObject({ owner: text, record: text, revision: text, digest: text })
  .readonly()
const inquiry = z
  .strictObject({
    policy: z.strictObject({ onAsk: z.enum(['deny', 'ask-human', 'skip-ask']) }).readonly(),
    source: evidence,
    translation: adoption,
  })
  .readonly()
const basis = z
  .strictObject({
    tenant: text,
    session: text,
    sessionRevision: revision,
    permissionRevision: revision,
    permissionSource: evidence,
  })
  .readonly()

export const sessionInquirySchema = z.strictObject({ inquiry, basis }).readonly()
export type SessionInquiryView = z.infer<typeof sessionInquirySchema>

export const sessionModesPublicationSchema = z
  .strictObject({
    modes: z
      .strictObject({
        permission: z.enum(['never', 'auto_permission', 'bypass-permissions']),
        environment: adoption,
        collaboration: z.enum(['co-work', 'auto-drive']),
      })
      .readonly(),
    inquiry,
    basis,
  })
  .readonly()
export type SessionModesPublication = z.infer<typeof sessionModesPublicationSchema>

/** Identifies the adapter's wire carrier, separately from Session's three-axis Modes value. */
export const SESSION_MODES_PUBLICATION: Adoption = Object.freeze({
  owner: '@omne-harness/session-adapters',
  name: 'session.modes-publication',
  revision: '1',
  digest: `sha256:${createHash('sha256')
    .update(JSON.stringify(z.toJSONSchema(sessionModesPublicationSchema)))
    .digest('hex')}`,
})
