import type { TenantId } from '@omne-harness/public-contract'
import { Button, LoadingState, Sheet, SheetContent, SheetTitle } from '@omne-harness/ui-kit'
import type { ContentBlockKind } from '@omne-harness/content-block'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IMAGE_TYPES } from '../model/attachment-tray.ts'
import { mediaFile, mediaPicture, mediaRead } from '../parts.ts'
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
function readText(read: string | undefined, kind: string): string | null {
  if (read === 'transcript') return kind === 'voice' ? '转写' : '提取的文字'
  return read === undefined ? null : (READ[read] ?? null)
}

type Said = Readonly<{ kind: MediaBlockKind; modelRead: string | undefined; children: ReactNode }>

function WithRead({ kind, modelRead, children }: Said) {
  const said = readText(modelRead, kind)
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

const lineBlock = (kind: 'file' | 'voice') =>
  function LineBlock(props: MediaBlockProps) {
    const read = readBlock(props.content)
    return (
      <WithRead kind={kind} modelRead={props.modelRead}>
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

/** How each kind of block that is not words is drawn: a picture as a thumbnail, a file or a voice as a line. */
export const MEDIA_BLOCKS: Readonly<Record<MediaBlockKind, (props: MediaBlockProps) => ReactNode>> =
  {
    image: ImageBlock,
    file: lineBlock('file'),
    voice: lineBlock('voice'),
  }
