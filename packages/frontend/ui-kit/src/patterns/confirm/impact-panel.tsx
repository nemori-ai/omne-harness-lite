import { Dialog } from 'radix-ui'
import { useRef } from 'react'

import { usePresenceInert } from '../../motion/motion.ts'
import { LoadingIndicator } from '../loading-state.tsx'
import { Button } from '../../controls/button.tsx'
import type { ConfirmTone } from './inline-confirm.tsx'

const IMPACT_SECTION_LABELS = {
  affected: '会改变什么',
  kept: '会保留什么',
  unfinished: '还没完成的',
} as const

export function ImpactPanel({
  open,
  onOpenChange,
  title,
  description,
  affected,
  kept,
  unfinished,
  children,
  confirmLabel,
  cancelLabel = '取消',
  sectionLabels = IMPACT_SECTION_LABELS,
  tone = 'default',
  pending = false,
  confirmDisabled = false,
  error,
  onConfirm,
  returnFocus,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: React.ReactNode

  readonly description?: React.ReactNode

  readonly affected?: React.ReactNode

  readonly kept?: React.ReactNode

  readonly unfinished?: React.ReactNode

  readonly children?: React.ReactNode
  readonly confirmLabel: string
  readonly cancelLabel?: string
  readonly sectionLabels?: Readonly<Record<'affected' | 'kept' | 'unfinished', string>>

  readonly tone?: ConfirmTone
  readonly pending?: boolean
  readonly confirmDisabled?: boolean

  readonly error?: React.ReactNode
  readonly onConfirm: () => void

  readonly returnFocus?: () => HTMLElement | null | undefined
}): React.JSX.Element {
  const cancel = useRef<HTMLButtonElement>(null)
  const presence = usePresenceInert<HTMLDivElement>()
  const sections = [
    ['affected', affected],
    ['kept', kept],
    ['unfinished', unfinished],
  ] as const
  return (
    <Dialog.Root
      open={open}
      onOpenChange={next => {
        if (next || !pending) onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="pe-impact-overlay" data-motion="overlay" />
        <Dialog.Content
          ref={presence}
          className="pe-impact-panel"
          data-motion="dialog"
          data-keyboard-modal=""
          data-tone={tone}
          aria-busy={pending}
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
          onOpenAutoFocus={event => {
            event.preventDefault()
            cancel.current?.focus({ preventScroll: true })
          }}
          onCloseAutoFocus={event => {
            const target = returnFocus?.()
            if (target?.isConnected !== true) return
            event.preventDefault()
            target.focus({ preventScroll: true })
          }}
        >
          <Dialog.Title className="pe-impact-title">{title}</Dialog.Title>
          {description !== undefined && (
            <Dialog.Description className="pe-impact-description">{description}</Dialog.Description>
          )}
          {sections.map(([key, body]) =>
            body === undefined || body === null || body === false ? null : (
              <section key={key} className="pe-impact-section" data-impact={key}>
                <h3>{sectionLabels[key]}</h3>
                <div>{body}</div>
              </section>
            ),
          )}
          {children}
          {error !== undefined && error !== null && error !== false && error}
          <div className="pe-impact-actions">
            <Button
              ref={cancel}
              variant="ghost"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={tone === 'danger' ? 'destructive' : 'default'}
              disabled={pending || confirmDisabled}
              onClick={event => {
                event.currentTarget
                  .closest<HTMLElement>('[role="dialog"]')
                  ?.focus({ preventScroll: true })
                onConfirm()
              }}
            >
              {pending && <LoadingIndicator size="sm" />}
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
