import type { TenantId } from '@omne-harness/public-contract'
import { AttachIcon, Button, DeleteIcon } from '@omne-harness/ui-kit'
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import {
  ACCEPTED_TYPES,
  AttachmentTray,
  type Attachment,
  type Drafts,
  type PickedFile,
} from '../model/attachment-tray.ts'
import type { MediaClient } from '../model/upload.ts'

export type AttachmentTrayProps = Readonly<{
  client: MediaClient
  tenant: TenantId
  session: string
  draft: string
  drafts: () => Drafts | null
}>

const NONE: readonly Attachment[] = []
const idle = () => () => undefined

const READY: Readonly<Record<'none' | 'converted' | 'inconvertible', string>> = {
  none: '已备好',
  converted: '已转出文字（较长，另存了一份）',
  inconvertible: '已备好，没有可转出的文字',
}

function statusOf(item: Attachment): string {
  const { state } = item
  if (state.kind === 'ready')
    return state.text === null ? READY[state.outcome] : `已转出：${state.text}`
  if (state.kind === 'failed') return state.reason
  if (state.kind === 'preparing') return '在转换…'
  const percent = item.bytes === 0 ? 0 : Math.floor((state.sent / item.bytes) * 100)
  return `上传中 ${String(percent)}%`
}

function useTray(props: AttachmentTrayProps): AttachmentTray | null {
  const { client, tenant, session, draft, drafts } = props
  const [tray, setTray] = useState<AttachmentTray | null>(null)
  useEffect(() => {
    const made = new AttachmentTray({
      client,
      tenant,
      session,
      draft,
      drafts,
      newId: () => crypto.randomUUID(),
      preview: file => (file.blob === undefined ? null : URL.createObjectURL(file.blob)),
      release: url => URL.revokeObjectURL(url),
    })
    setTray(made)
    return () => made.dispose()
  }, [client, tenant, session, draft, drafts])
  return tray
}

function attach(tray: AttachmentTray | null, files: Iterable<File> | null | undefined): boolean {
  const list = [...(files ?? [])]
  if (tray === null || list.length === 0) return false
  tray.add(
    list.map((file): PickedFile => ({
      name: file.name,
      type: file.type,
      size: file.size,
      read: async () => new Uint8Array(await file.arrayBuffer()),
      blob: file,
    })),
  )
  return true
}

/** Pictures pasted into or dropped on the form this element stands in are attached too. */
function useFormDrops(root: RefObject<HTMLElement | null>, tray: AttachmentTray | null): void {
  useEffect(() => {
    const form = root.current?.closest('form')
    if (form === null || form === undefined) return undefined
    const onPaste = (event: ClipboardEvent) => {
      if (attach(tray, event.clipboardData?.files)) event.preventDefault()
    }
    const onDrop = (event: DragEvent) => {
      if (attach(tray, event.dataTransfer?.files)) event.preventDefault()
    }
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files') === true) event.preventDefault()
    }
    form.addEventListener('paste', onPaste)
    form.addEventListener('drop', onDrop)
    form.addEventListener('dragover', onDragOver)
    return () => {
      form.removeEventListener('paste', onPaste)
      form.removeEventListener('drop', onDrop)
      form.removeEventListener('dragover', onDragOver)
    }
  }, [root, tray])
}

type ChipProps = Readonly<{ item: Attachment; onRemove: () => void; onRetry: () => void }>

function Chip({ item, onRemove, onRetry }: ChipProps) {
  const retryable = item.state.kind === 'failed' && item.state.ref !== undefined
  return (
    <li className="omne-media-chip" data-state={item.state.kind}>
      {item.preview === null ? null : <img src={item.preview} alt={`${item.name} 的预览`} />}
      <span className="omne-media-chip-name">{item.name}</span>
      <span className="omne-media-chip-status">{statusOf(item)}</span>
      {retryable ? (
        <Button
          type="button"
          variant="ghost"
          size="compact"
          aria-label={`重试 ${item.name}`}
          onClick={onRetry}
        >
          重试
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-compact"
        aria-label={`去掉 ${item.name}`}
        onClick={onRemove}
      >
        <DeleteIcon />
      </Button>
    </li>
  )
}

/** The attachments of the message being written: pick, paste or drop a picture, speech or a PDF; each uploads at once. */
export function AttachmentTrayView(props: AttachmentTrayProps) {
  const tray = useTray(props)
  const items = useSyncExternalStore(tray?.subscribe ?? idle, tray?.read ?? (() => NONE))
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useFormDrops(root, tray)
  return (
    <div className="omne-media-tray" ref={root}>
      {items.length === 0 ? null : (
        <ul className="omne-media-chips">
          {items.map(item => (
            <Chip
              key={item.id}
              item={item}
              onRemove={() => tray?.remove(item.id)}
              onRetry={() => tray?.retry(item.id)}
            />
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        hidden
        multiple
        aria-label="选择附件"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={event => {
          attach(tray, event.target.files)
          event.target.value = ''
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="compact"
        aria-label="附加图片、语音或 PDF"
        onClick={() => input.current?.click()}
      >
        <AttachIcon />
        附件
      </Button>
    </div>
  )
}
