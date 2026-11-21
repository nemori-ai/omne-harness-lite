import type { TenantId } from '@omne-harness/public-contract'
import { useEffect, useState } from 'react'
import { IMAGE_TYPES } from '../model/attachment-tray.ts'
import { readWhole, type DisplayTarget, type MediaClient, type Reference } from '../model/upload.ts'

export type MediaBlockProps = Readonly<{ client: MediaClient; tenant: TenantId; content: unknown }>

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

function Picture(props: MediaBlockProps & { readonly read: Read }) {
  const [whole, setWhole] = useState(false)
  const shown = useAddress(props, props.read.ref, whole)
  if (shown.kind === 'reading') return <p className="omne-media-line">正在读图片…</p>
  if (shown.kind === 'unreadable')
    return <p className="omne-media-line">图片读不出来：{shown.reason}</p>
  const { size } = props.read
  return (
    <button
      type="button"
      className="omne-media-picture"
      data-whole={whole}
      aria-label={whole ? '收起' : '看原图'}
      onClick={() => setWhole(value => !value)}
    >
      <img src={shown.url} alt={size === null ? '图片' : `图片 ${size}`} />
    </button>
  )
}

/** One block of a message that is not words: a picture as a thumbnail, anything else as a line. */
export function MediaBlock(props: MediaBlockProps) {
  const read = readBlock(props.content)
  if (typeof read === 'string')
    return <p className="omne-media-line">〔{read}〕这一块的内容读不懂</p>
  if (read.kind === 'image') return <Picture {...props} read={read} />
  return (
    <p className="omne-media-line">
      〔{read.kind}〕{read.ref.mediaType} · {sizeText(read.ref.bytes)}
    </p>
  )
}
