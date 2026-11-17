import { Button, LoadingIndicator, SendIcon, StopIcon } from '@omne-harness/ui-kit'
import { useLayoutEffect, useRef } from 'react'
import type { StopFace } from '../model/composer.ts'

const LABEL: Readonly<Record<StopFace, string>> = {
  none: '发送',
  stop: '停止',
  stopping: '正在停止',
  'confirm-stop': '再确认停止',
}

const STOP_CONSEQUENCE = '停止这一轮。还没答的问题会一起关掉。'

function Glyph({ face }: { readonly face: StopFace }) {
  if (face === 'none') return <SendIcon aria-hidden="true" />
  if (face === 'stopping') return <LoadingIndicator />
  return <StopIcon aria-hidden="true" />
}

export function ComposerActionSlot({
  face,
  canSend,
  onStop,
}: {
  readonly face: StopFace
  readonly canSend: boolean
  readonly onStop: () => void
}) {
  const sending = face === 'none'
  const disabled = sending ? !canSend : face === 'stopping'
  const button = useRef<HTMLButtonElement>(null)
  const focused = useRef(false)
  useLayoutEffect(() => {
    const element = button.current
    if (!sending || !disabled || !focused.current || element === null) return
    focused.current = false
    const active = document.activeElement
    if (active === element || active === document.body || active === null)
      element.form?.querySelector<HTMLTextAreaElement>('textarea:not([disabled])')?.focus()
  }, [sending, disabled])
  return (
    <Button
      ref={button}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={event => {
        if (event.relatedTarget !== null) focused.current = false
      }}
      type={sending ? 'submit' : 'button'}
      variant={sending ? 'default' : 'outline'}
      size="compact"
      data-action={face}
      disabled={disabled}
      {...(sending ? {} : { onClick: onStop, title: STOP_CONSEQUENCE })}
    >
      <Glyph face={face} />
      {LABEL[face]}
    </Button>
  )
}
