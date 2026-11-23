import {
  ActionTooltip,
  Button,
  LoadingIndicator,
  RetryIcon,
  SendIcon,
  StopIcon,
} from '@omne-harness/ui-kit'
import { useId, useLayoutEffect, useRef } from 'react'
import type { StopFace } from '../model/composer.ts'
import { sessionComposerSend } from '../parts.ts'

const NAME: Readonly<Record<StopFace, string>> = {
  none: '发送',
  stop: '停止',
  stopping: '正在停止',
  'confirm-stop': '再确认停止',
}

const STOP_CONSEQUENCE = '停止这一轮。还没答的问题会一起关掉。'

function Glyph({ face }: { readonly face: StopFace }) {
  switch (face) {
    case 'none':
      return <SendIcon aria-hidden="true" />
    case 'stop':
      return <StopIcon aria-hidden="true" />
    case 'stopping':
      return <LoadingIndicator />
    case 'confirm-stop':
      return <RetryIcon aria-hidden="true" />
  }
}

// One button through every face, so it keeps its place and the focus. A stop face says what stopping does in the
// tooltip and the description; `IconButton` gives one label to both, so this is built of the two parts it is made of.
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
  const consequence = useId()
  useLayoutEffect(() => {
    const element = button.current
    if (!sending || !disabled || !focused.current || element === null) return
    focused.current = false
    const active = document.activeElement
    if (active === element || active === document.body || active === null)
      element.form?.querySelector<HTMLTextAreaElement>('textarea:not([disabled])')?.focus()
  }, [sending, disabled])
  return (
    <>
      <ActionTooltip label={sending ? NAME[face] : `${NAME[face]}：${STOP_CONSEQUENCE}`}>
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
          size="icon"
          aria-label={NAME[face]}
          data-action={face}
          {...sessionComposerSend.props}
          disabled={disabled}
          {...(sending ? {} : { onClick: onStop, 'aria-describedby': consequence })}
        >
          <Glyph face={face} />
        </Button>
      </ActionTooltip>
      {sending ? null : (
        <span id={consequence} hidden>
          {STOP_CONSEQUENCE}
        </span>
      )}
    </>
  )
}
