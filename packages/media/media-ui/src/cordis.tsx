import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import { mediaProtocol } from '@omne-harness/media-protocol'
import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import { serviceKey, type PointSink } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { useMemo, type ReactNode } from 'react'
import type { Drafts } from './model/attachment-tray.ts'
import type { MediaClient } from './model/upload.ts'
import { AttachmentTrayView } from './view/attachment-tray.tsx'
import { MediaBlock } from './view/media-block.tsx'

export type { DraftOffer, Drafts } from './model/attachment-tray.ts'

/** The message being written in a session, as the host of the composer names it. */
export type MediaDraftSubject = Readonly<{ session: string; draft: string }>
/** One block of a message that is not words, with the block as the history holds it. */
export type MediaBlockSubject = Readonly<{
  session: string
  message: string
  block: string
  content: unknown
}>

export type MediaUiOptions = Readonly<{
  composerAttachments?: PointSink<MediaDraftSubject>
  block?: PointSink<MediaBlockSubject>
}>

export type DraftsHolder = Readonly<{ attach(given: Drafts): () => void }>

/** Where the assembly hands over what takes the attachments of a draft; the module works without. */
export const mediaComposerDraftsKey = serviceKey<DraftsHolder>('media.composer-drafts')

const MEDIA = protocolServiceName({ name: mediaProtocol.name, major: mediaProtocol.major })
const ITEM = 'media'

type ScopedProps = Readonly<{
  scope: string | undefined
  children: (tenant: TenantId) => ReactNode
}>

/** The tenant of the scope, the same value while the scope is the same: hosts draw an item often. */
function Scoped({ scope, children }: ScopedProps) {
  const tenant = useMemo(() => (scope === undefined ? undefined : readTenantText(scope)), [scope])
  return tenant === undefined ? null : children(tenant)
}

export function createMediaUiModule(options: MediaUiOptions = {}) {
  return defineUiModule<Record<string, MediaClient>>({
    name: 'media-ui',
    inject: [MEDIA],
    apply(shell, services, provide) {
      const client = services[MEDIA]!
      let given: Drafts | null = null
      const drafts = () => given
      provide(mediaComposerDraftsKey, {
        attach(next) {
          given = next
          return () => {
            if (given === next) given = null
          }
        },
      })
      options.composerAttachments?.contribute(shell, {
        id: ITEM,
        order: 0,
        render: ({ scope, subject }) => (
          <Scoped scope={scope}>
            {tenant => (
              <AttachmentTrayView
                client={client}
                tenant={tenant}
                session={subject.session}
                draft={subject.draft}
                drafts={drafts}
              />
            )}
          </Scoped>
        ),
      })
      options.block?.contribute(shell, {
        id: ITEM,
        order: 0,
        render: ({ scope, subject }) => (
          <Scoped scope={scope}>
            {tenant => <MediaBlock client={client} tenant={tenant} content={subject.content} />}
          </Scoped>
        ),
      })
    },
  })
}
