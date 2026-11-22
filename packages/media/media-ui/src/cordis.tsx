import { mediaProtocol } from '@omne-harness/media-protocol'
import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import { needProtocol, serviceKey, type PointSink } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { useMemo, type ReactNode } from 'react'
import type { Drafts } from './model/attachment-tray.ts'
import type { Microphone } from './model/recorder.ts'
import type { MediaClient } from './model/upload.ts'
import { AttachmentTrayView } from './view/attachment-tray.tsx'
import { MediaBlock } from './view/media-block.tsx'
import { browserMicrophone } from './view/microphone.ts'

export type { DraftOffer, Drafts } from './model/attachment-tray.ts'

/** The message being written in a session, as the host of the composer names it. */
export type MediaDraftSubject = Readonly<{ session: string; draft: string }>
/** One block of a message that is not words, with the block as the history holds it. */
export type MediaBlockSubject = Readonly<{
  session: string
  message: string
  block: string
  content: unknown
  /** Which representation the model read of this block in its latest request, when known. */
  read?: string
}>

export type MediaUiOptions = Readonly<{
  composerAttachments?: PointSink<MediaDraftSubject>
  block?: PointSink<MediaBlockSubject>
  /** Where recordings come from; the browser's microphone when not given. */
  microphone?: Microphone
}>

export type DraftsHolder = Readonly<{ attach(given: Drafts): () => void }>

/** Where the assembly hands over what takes the attachments of a draft; the module works without. */
export const mediaComposerIntakeKey = serviceKey<DraftsHolder>('media.composer-intake')

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
  return defineUiModule({
    name: 'media-ui',
    needs: { media: needProtocol<MediaClient>(mediaProtocol) },
    apply(shell, { media: client }, provide) {
      let given: Drafts | null = null
      const drafts = () => given
      provide(mediaComposerIntakeKey, {
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
                microphone={options.microphone ?? browserMicrophone}
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
            {tenant => (
              <MediaBlock
                client={client}
                tenant={tenant}
                content={subject.content}
                modelRead={subject.read}
              />
            )}
          </Scoped>
        ),
      })
    },
  })
}
