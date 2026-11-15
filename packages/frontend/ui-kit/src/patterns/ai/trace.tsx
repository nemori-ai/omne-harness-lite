import { cn } from '../../lib/utils.ts'
import { DisclosureTrigger } from '../disclosure.tsx'
import { Shimmer } from './shimmer.tsx'
import { LoadingIndicator } from '../loading-state.tsx'
import { CancelledIcon, DoneIcon, FailedIcon, type Icon as SetIcon } from '../../icons/index.ts'

export type TraceState = 'live' | 'settled'

export type TraceStatus = 'running' | 'done' | 'failed' | 'stopped'

const MARK_TONE: Record<TraceStatus, string> = {
  running: 'text-ink-muted',
  done: 'text-ink-faint',
  failed: 'text-danger-ink',
  stopped: 'text-ink-faint',
}

export function TraceHeader({
  state,
  quiet = false,
  announce = true,
  label,
  expanded,
  controls,
  onToggle,
  icon: Icon,
  className,
}: {
  readonly state: TraceState

  readonly quiet?: boolean

  readonly announce?: boolean

  readonly label: React.ReactNode
  readonly expanded: boolean

  readonly controls: string
  readonly onToggle: () => void
  readonly icon?: SetIcon
  readonly className?: string
}): React.JSX.Element {
  const live = state === 'live'
  return (
    <DisclosureTrigger
      open={expanded}
      controls={controls}
      onToggle={onToggle}
      data-trace-header=""
      data-run-state={state}
      className={cn('w-fit', className)}
    >
      {Icon !== undefined && (
        <Icon
          aria-hidden="true"
          className={cn('size-4 shrink-0', live ? 'text-ink-muted' : 'text-ink-faint')}
        />
      )}
      <span data-trace-label="" role={announce ? 'status' : undefined} className="contents">
        <Shimmer
          active={live && !quiet}
          className={cn('text-sm font-medium whitespace-nowrap', !live && 'text-ink-muted')}
        >
          {label}
        </Shimmer>
      </span>
    </DisclosureTrigger>
  )
}

export function TraceRows({
  children,
  className,
}: {
  readonly children: React.ReactNode
  readonly className?: string
}): React.JSX.Element {
  return (
    <div className={cn('relative mt-1 ml-[5px] pl-4', className)}>
      <span aria-hidden="true" className="absolute inset-y-1 left-[3px] w-px bg-line-subtle" />
      <div role="list" className="flex flex-col gap-0.5 py-1">
        {children}
      </div>
    </div>
  )
}

export function TraceRow({
  status,
  statusLabel,
  verb,
  chip,
  mono = false,
  meter,
  animateIn = false,
  children,
  className,
}: {
  readonly status: TraceStatus

  readonly statusLabel: string

  readonly verb: string

  readonly chip?: React.ReactNode

  readonly mono?: boolean

  readonly meter?: string

  readonly animateIn?: boolean

  readonly children?: React.ReactNode
  readonly className?: string
}): React.JSX.Element {
  return (
    <div
      role="listitem"
      data-trace-row=""
      className={cn(
        'flex min-h-7 flex-col justify-center gap-0.5 rounded-chip px-1.5 py-0.5',
        animateIn && 'animate-fade-up',
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          data-trace-mark={status}
          className={cn('flex size-3.5 shrink-0 items-center justify-center', MARK_TONE[status])}
        >
          {status === 'running' ? (
            <LoadingIndicator size="sm" />
          ) : status === 'done' ? (
            <DoneIcon aria-hidden="true" className="size-3.5" />
          ) : status === 'failed' ? (
            <FailedIcon aria-hidden="true" className="size-3.5" />
          ) : (
            <CancelledIcon aria-hidden="true" className="size-3.5" />
          )}
        </span>
        <span data-trace-status="" className="sr-only">
          {statusLabel}
        </span>
        <span className="min-w-0 truncate text-xs font-medium text-ink-primary">{verb}</span>
        {chip !== undefined && (
          <span
            className={cn(
              'shrink-0 rounded-chip bg-surface-field px-1.5 py-px text-xs text-ink-muted shadow-hairline',
              mono && 'font-mono',
            )}
          >
            {chip}
          </span>
        )}
        {meter !== undefined && (
          <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-faint">{meter}</span>
        )}
      </span>
      {children !== undefined && (
        <div className="pl-5 text-xs leading-wrapped text-ink-muted">{children}</div>
      )}
    </div>
  )
}
