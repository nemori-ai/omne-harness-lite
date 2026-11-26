import type { TenantId } from '@omne-harness/public-contract'
import {
  Button,
  IconButton,
  LoadingState,
  PlayIcon,
  Sheet,
  SheetContent,
  SheetTitle,
} from '@omne-harness/ui-kit'
import type { ContentBlockKind } from '@omne-harness/content-block'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IMAGE_TYPES } from '../model/attachment-tray.ts'
import { mediaFile, mediaPicture, mediaRead } from '../parts.ts'
import { UNREADABLE, unreadableOf, type Unreadable } from '../model/prepare.ts'
import { readWhole, type DisplayTarget, type MediaClient, type Reference } from '../model/upload.ts'

/** The kinds of block that are not words, as both ends name them. */
export type MediaBlockKind = Exclude<ContentBlockKind, 'text' | 'thinking'>

export type MediaBlockProps = Readonly<{
  client: MediaClient
  tenant: TenantId
  content: unknown
  modelRead?: string | undefined
  /** Where the original opens: in place of the thumbnail, as in a message; or over the paper, as on a canvas. */
  opens?: 'in-place' | 'over'
}>

const THUMBNAIL: DisplayTarget = {
  mediaTypes: [...IMAGE_TYPES],
  maxBytes: 262_144,
  maxWidth: 480,
  maxHeight: 360,
}
const REFERENCE_FIELDS = ['storage', 'key', 'mediaType', 'bytes', 'digest'] as const

type Read = Readonly<{ kind: string; ref: Reference; size: string | null }>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function referenceOf(value: unknown): Reference | null {
  if (!isRecord(value)) return null
  const fields = REFERENCE_FIELDS.map(name => value[name])
  if (!fields.every(field => typeof field === 'string')) return null
  const [storage, key, mediaType, bytes, digest] = fields as string[]
  return { storage, key, mediaType, bytes, digest } as Reference
}

function readBlock(content: unknown): Read | string {
  const kind = isRecord(content) && typeof content['kind'] === 'string' ? content['kind'] : '内容'
  const ref = isRecord(content) ? referenceOf(content['ref']) : null
  if (ref === null) return kind
  const facts = isRecord(content) ? content['facts'] : undefined
  const sized =
    isRecord(facts) && typeof facts['widthPixels'] === 'number'
      ? `${String(facts['widthPixels'])}×${String(facts['heightPixels'])}`
      : null
  return { kind, ref, size: sized }
}

function sizeText(bytes: string): string {
  const count = Number(bytes)
  if (!Number.isFinite(count)) return bytes
  if (count < 1024) return `${String(count)} B`
  return count < 1024 * 1024
    ? `${(count / 1024).toFixed(1)} KB`
    : `${(count / 1024 / 1024).toFixed(1)} MB`
}

type Shown =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'shown'; url: string }>
  | Readonly<{ kind: 'unreadable'; reason: string }>

/** The address of the bytes of a medium, read through the protocol: the original, or a thumbnail. */
function useAddress(props: MediaBlockProps, ref: Reference, whole: boolean): Shown {
  const { client, tenant } = props
  const [shown, setShown] = useState<Shown>({ kind: 'reading' })
  useEffect(() => {
    let live = true
    let url: string | null = null
    setShown({ kind: 'reading' })
    void readWhole({ client, tenant, ref, target: whole ? null : THUMBNAIL }).then(read => {
      if (!live) return
      if (read.kind === 'unreadable') return setShown(read)
      url = URL.createObjectURL(new Blob([new Uint8Array(read.bytes)], { type: read.mediaType }))
      setShown({ kind: 'shown', url })
    })
    return () => {
      live = false
      if (url !== null) URL.revokeObjectURL(url)
    }
  }, [client, tenant, ref.storage, ref.key, ref.digest, whole])
  return shown
}

const altOf = (read: Read): string => (read.size === null ? '图片' : `图片 ${read.size}`)

function Shown({ shown, alt }: Readonly<{ shown: Shown; alt: string }>) {
  if (shown.kind === 'reading') return <LoadingState label="正在读图片…" />
  if (shown.kind === 'unreadable')
    return <p className="omne-media-line">图片读不出来：{shown.reason}</p>
  return <img src={shown.url} alt={alt} />
}

function Original(props: MediaBlockProps & { readonly read: Read }) {
  return <Shown shown={useAddress(props, props.read.ref, true)} alt={altOf(props.read)} />
}

function Picture(props: MediaBlockProps & { readonly read: Read }) {
  const over = props.opens === 'over'
  const [whole, setWhole] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const shown = useAddress(props, props.read.ref, whole && !over)
  if (shown.kind !== 'shown') return <Shown shown={shown} alt="" />
  const alt = altOf(props.read)
  return (
    <>
      <Button
        ref={button}
        variant="ghost"
        className="omne-media-picture"
        {...mediaPicture.props}
        data-whole={whole}
        aria-label={whole && !over ? '收起' : '看原图'}
        onClick={() => setWhole(value => !value)}
      >
        <img src={shown.url} alt={alt} />
      </Button>
      {over ? (
        <Sheet open={whole} onOpenChange={setWhole}>
          <SheetContent
            side="top"
            className="omne-media-original"
            closeLabel="收起"
            aria-describedby={undefined}
            onCloseAutoFocus={event => {
              event.preventDefault()
              button.current?.focus({ preventScroll: true })
            }}
          >
            <SheetTitle className="omne-media-original-title">{alt}</SheetTitle>
            <div className="omne-media-original-frame">
              <Original {...props} />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  )
}

const READ: Readonly<Record<string, string>> = {
  original: '原件',
  fitted: '缩小的图',
  derived: '另一种表示',
}

/** What the model read of a block, in words; null when it is not known. */
function readText(read: string | undefined, kind: string, note: Unreadable | null): string | null {
  if (read === 'transcript' && note !== null) return `一句说明（${UNREADABLE[note]}）`
  if (read === 'transcript') return kind === 'voice' ? '转写' : '提取的文字'
  return read === undefined ? null : (READ[read] ?? null)
}

type Described = Extract<
  Awaited<ReturnType<MediaClient['describe-media']>>,
  { outcome: 'succeeded' }
>['body']

function useDescription(
  props: MediaBlockProps,
  ref: Reference | null,
  asks: boolean,
): Described | null {
  const { client, tenant } = props
  const [described, setDescribed] = useState<Described | null>(null)
  const key = ref === null ? null : JSON.stringify(ref)
  useEffect(() => {
    if (!asks || ref === null) return undefined
    let live = true
    void client['describe-media']({ tenant, ref }).then(
      answer => live && answer.outcome === 'succeeded' && setDescribed(answer.body),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [client, tenant, key, asks])
  return described
}

/** The words a voice was made into: inline, or a sentence when they were kept aside. */
function transcriptOf(content: unknown, described: Described | null): string | null {
  if (isRecord(content) && typeof content['transcript'] === 'string') return content['transcript']
  const preprocess = described?.preprocess
  if (preprocess?.kind !== 'done' || preprocess.representation.outcome !== 'converted') return null
  const { text } = preprocess.representation
  return typeof text === 'string' ? text : '转写较长，已另存'
}

type Said = Readonly<{
  kind: MediaBlockKind
  modelRead: string | undefined
  note?: Unreadable | null
  children: ReactNode
}>

function WithRead({ kind, modelRead, note = null, children }: Said) {
  const said = readText(modelRead, kind, note)
  if (said === null) return children
  return (
    <div className="omne-media-block">
      {children}
      <p className="omne-media-read" {...mediaRead.props}>
        模型读的是{said}
      </p>
    </div>
  )
}

const unread = (kind: string) => (
  <p className="omne-media-line" {...mediaFile.props}>
    〔{kind}〕这一块的内容读不懂
  </p>
)

function ImageBlock(props: MediaBlockProps) {
  const read = readBlock(props.content)
  return (
    <WithRead kind="image" modelRead={props.modelRead}>
      {typeof read === 'string' ? unread(read) : <Picture {...props} read={read} />}
    </WithRead>
  )
}

function FileBlock(props: MediaBlockProps) {
  const read = readBlock(props.content)
  const ref = typeof read === 'string' ? null : read.ref
  const described = useDescription(props, ref, props.modelRead === 'transcript')
  const note = described === null ? null : unreadableOf(described.preprocess)
  return (
    <WithRead kind="file" modelRead={props.modelRead} note={note}>
      {typeof read === 'string' ? (
        unread(read)
      ) : (
        <p className="omne-media-line" {...mediaFile.props}>
          〔{read.kind}〕{read.ref.mediaType} · {sizeText(read.ref.bytes)}
        </p>
      )}
    </WithRead>
  )
}

function durationText(content: unknown): string | null {
  const facts = isRecord(content) ? content['facts'] : undefined
  const ms = isRecord(facts) ? facts['durationMs'] : undefined
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${String(seconds)} 秒`
  return `${String(Math.floor(seconds / 60))} 分 ${String(seconds % 60)} 秒`
}

function Player(props: MediaBlockProps & { readonly medium: Reference }) {
  const shown = useAddress(props, props.medium, true)
  if (shown.kind === 'reading') return <LoadingState label="正在读语音…" />
  if (shown.kind === 'unreadable')
    return <p className="omne-media-line">语音读不出来：{shown.reason}</p>
  return <audio className="omne-media-player" controls autoPlay src={shown.url} />
}

function Voice(props: MediaBlockProps & { readonly read: Read }) {
  const { ref } = props.read
  const [playing, setPlaying] = useState(false)
  const inline = isRecord(props.content) && typeof props.content['transcript'] === 'string'
  const described = useDescription(props, ref, !inline)
  const transcript = transcriptOf(props.content, described)
  const length = durationText(props.content) ?? ref.mediaType
  return (
    <div className="omne-media-voice">
      <div className="omne-media-voice-row">
        <p className="omne-media-line" {...mediaFile.props}>
          〔{props.read.kind}〕{length} · {sizeText(ref.bytes)}
        </p>
        {playing ? null : (
          <IconButton
            type="button"
            size="icon-compact"
            label="播放"
            onClick={() => setPlaying(true)}
          >
            <PlayIcon />
          </IconButton>
        )}
      </div>
      {playing ? <Player {...props} medium={ref} /> : null}
      {transcript === null ? null : <p className="omne-media-transcript">{transcript}</p>}
    </div>
  )
}

function VoiceBlock(props: MediaBlockProps) {
  const read = readBlock(props.content)
  return (
    <WithRead kind="voice" modelRead={props.modelRead}>
      {typeof read === 'string' ? unread(read) : <Voice {...props} read={read} />}
    </WithRead>
  )
}

/** How each kind of block that is not words is drawn: a picture as a thumbnail, a file as a line, a voice as a line that plays. */
export const MEDIA_BLOCKS: Readonly<Record<MediaBlockKind, (props: MediaBlockProps) => ReactNode>> =
  {
    image: ImageBlock,
    file: FileBlock,
    voice: VoiceBlock,
  }
