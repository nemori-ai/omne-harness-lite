import { useRef } from 'react'

import {
  AboutIcon,
  CloseIcon,
  DoneIcon,
  FailedIcon,
  type Icon,
  WarningIcon,
} from '../icons/index.ts'
import { cn } from '../lib/utils.ts'
import { useArrival } from '../motion/motion.ts'
import { Button } from '../controls/button.tsx'
import { TONE_SURFACE, type Tone } from './ai/tone.ts'
import { Disclosure } from './disclosure.tsx'
import { IconButton } from './icon-button.tsx'

const TONE_ICON: Record<Tone, Icon> = {
  neutral: AboutIcon,
  danger: FailedIcon,
  caution: WarningIcon,
  info: AboutIcon,
  good: DoneIcon,
}

export interface NoticeAction {
  readonly label: string
  readonly onClick: () => void
}

export interface InlineNoticeProps {
  readonly tone?: Tone
  readonly title?: React.ReactNode
  readonly children?: React.ReactNode
  readonly detail?: string
  readonly detailLabel?: string
  readonly action?: NoticeAction
  readonly onDismiss?: () => void
  readonly dismissLabel?: string
  readonly still?: boolean
  readonly role?: 'alert' | 'status'
  readonly className?: string
  readonly 'data-testid'?: string
}

function defaultRole(tone: Tone): 'alert' | 'status' {
  return tone === 'danger' || tone === 'caution' ? 'alert' : 'status'
}

export function InlineNotice({
  tone = 'danger',
  title,
  children,
  detail,
  detailLabel = '详情',
  action,
  onDismiss,
  dismissLabel = '关闭',
  still = false,
  role = defaultRole(tone),
  className,
  'data-testid': testId,
}: InlineNoticeProps): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  useArrival(root, { still })
  const ToneIcon = TONE_ICON[tone]
  return (
    <div
      ref={root}
      data-inline-notice=""
      data-tone={tone}
      {...(testId !== undefined && { 'data-testid': testId })}
      role={role}
      className={cn(
        'flex items-start gap-2 rounded-control px-2.5 py-2 text-sm leading-(--omne-leading-wrapped)',
        TONE_SURFACE[tone],
        className,
      )}
    >
      <ToneIcon aria-hidden="true" className="mt-px size-4 shrink-0" />
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        {title !== undefined && <p className="font-medium">{title}</p>}
        {children}
        {detail !== undefined && detail !== '' && (
          <Disclosure label={detailLabel}>
            <code className="font-mono text-xs">{detail}</code>
          </Disclosure>
        )}
        {action !== undefined && (
          <Button type="button" variant="ghost" className="-ml-2 mt-1" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
      {onDismiss !== undefined && (
        <IconButton
          label={dismissLabel}
          size="icon-compact"
          variant="ghost"
          className="-mr-1 shrink-0"
          onClick={onDismiss}
        >
          <CloseIcon aria-hidden="true" />
        </IconButton>
      )}
    </div>
  )
}
