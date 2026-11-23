import { mediaProtocol } from '@omne-harness/media-protocol'
import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import {
  needPoint,
  needProtocol,
  type PointSink,
  type RenderPointSink,
  type ServiceKey,
} from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { useMemo, type ReactNode } from 'react'
import type { Drafts } from './model/attachment-tray.ts'
import type { Microphone } from './model/recorder.ts'
import type { MediaClient } from './model/upload.ts'
import { mediaParts } from './parts.ts'
import { AttachmentTrayView } from './view/attachment-tray.tsx'
import { MEDIA_BLOCKS } from './view/media-block.tsx'
import { browserMicrophone } from './view/microphone.ts'

export { mediaParts } from './parts.ts'
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
  block?: RenderPointSink<MediaBlockSubject>
  /** Where recordings come from; the browser's microphone when not given. */
  microphone?: Microphone
  /** What takes the attachments of a draft, when the assembly names who provides it; the module works without. */
  drafts?: ServiceKey<Drafts>
}>

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
    needs: {
      media: needProtocol<MediaClient>(mediaProtocol),
      intake: needPoint(options.drafts, { optional: true }),
    },
    apply(shell, { media: client, intake }) {
      for (const part of mediaParts) part.declare(shell)
      const drafts = () => intake.get() ?? null
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
      for (const [kind, Block] of Object.entries(MEDIA_BLOCKS))
        options.block?.put(shell, kind, ({ scope, subject }) => (
          <Scoped scope={scope}>
            {tenant => (
              <Block
                client={client}
                tenant={tenant}
                content={subject.content}
                modelRead={subject.read}
              />
            )}
          </Scoped>
        ))
    },
  })
}
