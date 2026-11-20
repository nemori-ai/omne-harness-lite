import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import { mediaProtocol } from '@omne-harness/media-protocol'
import { readTenantText } from '@omne-harness/public-contract'
import { serviceKey, type PointSink } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
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
        render: ({ scope, subject }) => {
          const tenant = scope === undefined ? undefined : readTenantText(scope)
          return tenant === undefined ? null : (
            <AttachmentTrayView
              client={client}
              tenant={tenant}
              session={subject.session}
              draft={subject.draft}
              drafts={drafts}
            />
          )
        },
      })
      options.block?.contribute(shell, {
        id: ITEM,
        order: 0,
        render: ({ scope, subject }) => {
          const tenant = scope === undefined ? undefined : readTenantText(scope)
          return tenant === undefined ? null : (
            <MediaBlock client={client} tenant={tenant} content={subject.content} />
          )
        },
      })
    },
  })
}
