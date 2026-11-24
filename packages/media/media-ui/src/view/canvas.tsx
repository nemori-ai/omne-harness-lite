import { readReferenceText } from '@omne-harness/media-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import { InlineNotice, LoadingState, RetryIcon } from '@omne-harness/ui-kit'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Attachment } from '../model/attachment-tray.ts'
import { FilesIntake, type PlacedReference } from '../model/files-intake.ts'
import type { MediaClient, Reference } from '../model/upload.ts'
import { mediaIntake, mediaObject } from '../parts.ts'
import { pickedOf, statusOf } from './attachment-tray.tsx'
import { MEDIA_BLOCKS } from './media-block.tsx'

export type CanvasFrame = 'sheet' | 'pile' | 'search'

type Facts = Extract<
  Awaited<ReturnType<MediaClient['describe-media']>>,
  { outcome: 'succeeded' }
>['body']['facts']

type Found =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'gone' }>
  | Readonly<{ kind: 'unreadable' }>
  | Readonly<{ kind: 'found'; facts: Facts }>

const GONE = '这个文件不在这里了'
const UNREADABLE = '现在读不到'

/** Whether the medium is there for this tenant: another tenant's and a missing one answer the same. */
function useFound(client: MediaClient, tenant: TenantId, ref: Reference | null, round: number) {
  const [found, setFound] = useState<Found>({ kind: 'reading' })
  useEffect(() => {
    if (ref === null) return setFound({ kind: 'gone' })
    let live = true
    setFound({ kind: 'reading' })
    void client['describe-media']({ tenant, ref }).then(
      answer => {
        if (!live) return
        if (answer.outcome === 'succeeded') setFound({ kind: 'found', facts: answer.body.facts })
        else if (answer.outcome === 'not-found' || answer.outcome === 'denied')
          setFound({ kind: 'gone' })
        else setFound({ kind: 'unreadable' })
      },
      () => live && setFound({ kind: 'unreadable' }),
    )
    return () => {
      live = false
    }
  }, [client, tenant, ref, round])
  return found
}

export type CanvasObjectProps = Readonly<{
  client: MediaClient
  tenant: TenantId
  reference: PlacedReference
  frame: CanvasFrame
}>

/** One medium on a canvas, drawn as in a message; a row of the search is one line whatever its kind. */
export function CanvasObject({ client, tenant, reference, frame }: CanvasObjectProps) {
  const ref = useMemo(() => readReferenceText(reference.ref), [reference.ref])
  const [round, reread] = useState(0)
  const found = useFound(client, tenant, ref, round)
  return (
    <div className="omne-media-object" data-frame={frame} {...mediaObject.props}>
      {found.kind === 'reading' ? <LoadingState label="正在读…" /> : null}
      {found.kind === 'gone' ? <p className="omne-media-line">{GONE}</p> : null}
      {found.kind === 'unreadable' ? (
        <InlineNotice
          tone="neutral"
          action={{ label: '重试', icon: RetryIcon, onClick: () => reread(value => value + 1) }}
        >
          {UNREADABLE}
        </InlineNotice>
      ) : null}
      {found.kind === 'found' && ref !== null ? (
        <Drawn client={client} tenant={tenant} medium={ref} facts={found.facts} frame={frame} />
      ) : null}
    </div>
  )
}

type DrawnProps = Readonly<{
  client: MediaClient
  tenant: TenantId
  medium: Reference
  facts: Facts
  frame: CanvasFrame
}>

function Drawn({ client, tenant, medium, facts, frame }: DrawnProps) {
  const content = useMemo(() => ({ kind: facts.kind, ref: medium, facts }), [facts, medium])
  const Block = MEDIA_BLOCKS[frame === 'search' ? 'file' : facts.kind]
  return <Block client={client} tenant={tenant} content={content} />
}

export type CanvasFilesProps = Readonly<{
  client: MediaClient
  tenant: TenantId
  files: readonly File[]
  place: (reference: PlacedReference) => void
  done: () => void
}>

const NONE: readonly Attachment[] = []
const idle = () => () => undefined

/** Files handed onto a canvas: each says how far it has come, and why when it is not placed. */
export function CanvasFiles({ client, tenant, files, place, done }: CanvasFilesProps) {
  const ports = useRef({ place, done })
  useEffect(() => {
    ports.current = { place, done }
  })
  const [intake, setIntake] = useState<FilesIntake | null>(null)
  useEffect(() => {
    const made = new FilesIntake({
      client,
      tenant,
      newId: () => crypto.randomUUID(),
      place: reference => ports.current.place(reference),
      done: () => ports.current.done(),
    })
    setIntake(made)
    made.take(files.map(pickedOf))
    return () => made.dispose()
  }, [client, tenant, files])
  const items = useSyncExternalStore(
    intake?.tray.subscribe ?? idle,
    intake?.tray.read ?? (() => NONE),
  )
  return (
    <ul className="omne-media-chips omne-media-intake" {...mediaIntake.props}>
      {items.map(item => (
        <li key={item.id} className="omne-media-chip" data-state={item.state.kind}>
          <span className="omne-media-chip-name">{item.name}</span>
          <span className="omne-media-chip-status">{statusOf(item)}</span>
        </li>
      ))}
    </ul>
  )
}
