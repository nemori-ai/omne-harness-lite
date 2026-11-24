import { cn } from '../../lib/utils.ts'
import { IconButton } from '../icon-button.tsx'
import {
  AppointmentIcon,
  AssistantIcon,
  CloseIcon,
  ContactIcon,
  ConversationIcon,
  DeviceIcon,
  FileIcon,
  type Icon,
  LinkIcon,
  MaterialIcon,
  MatterIcon,
  ResourceIcon,
  ViewIcon,
} from '../../icons/index.ts'
import { DisclosureIcon } from '../../icons/kit-only.ts'

export type EntityKind =
  | 'material'
  | 'file'
  | 'matter'
  | 'appointment'
  | 'contact'
  | 'resource'
  | 'view'
  | 'source'
  | 'conversation'
  | 'device'
  | 'agent'

const KIND_ICON: Record<EntityKind, Icon> = {
  material: MaterialIcon,
  file: FileIcon,
  matter: MatterIcon,
  appointment: AppointmentIcon,
  contact: ContactIcon,
  resource: ResourceIcon,
  view: ViewIcon,
  source: LinkIcon,
  conversation: ConversationIcon,
  device: DeviceIcon,
  agent: AssistantIcon,
}

export function EntityKindIcon({
  kind,
  className,
}: {
  readonly kind: EntityKind
  readonly className?: string
}): React.JSX.Element {
  const Icon = KIND_ICON[kind]
  return <Icon aria-hidden="true" className={cn('size-3.5 shrink-0 text-ink-faint', className)} />
}

interface EntityChipBase {
  readonly kind: EntityKind

  readonly label: string

  readonly meta?: string

  readonly navigates?: boolean

  readonly href?: string

  readonly onClick?: () => void
  readonly className?: string
}

type Removable =
  | { readonly onRemove: () => void; readonly removeLabel: string }
  | { readonly onRemove?: undefined; readonly removeLabel?: undefined }

export function EntityChip({
  kind,
  label,
  meta,
  navigates = false,
  href,
  onClick,
  onRemove,
  removeLabel,
  className,
}: EntityChipBase & Removable): React.JSX.Element {
  const Icon = KIND_ICON[kind]
  const bodyClassName = 'flex min-w-0 items-center gap-1 rounded-chip'
  const body = (
    <>
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-ink-faint" />
      <span className="truncate">{label}</span>
      {meta !== undefined && (
        <span className="shrink-0 font-mono text-xs text-ink-faint">{meta}</span>
      )}
      {navigates && (
        <DisclosureIcon aria-hidden="true" className="-mr-0.5 size-3.5 shrink-0 text-ink-faint" />
      )}
    </>
  )

  return (
    <span
      data-entity-chip=""
      data-kind={kind}
      className={cn(
        'inline-flex h-(--omne-chip-height) max-w-full items-center gap-1 rounded-chip bg-surface-field pl-1.5 align-middle text-xs font-medium text-ink-muted shadow-hairline',
        onRemove === undefined ? 'pr-1.5' : 'pr-0.5',
        className,
      )}
    >
      {href !== undefined ? (
        <a href={href} data-control="link" className={bodyClassName}>
          {body}
        </a>
      ) : onClick !== undefined ? (
        <button type="button" onClick={onClick} data-control="link" className={bodyClassName}>
          {body}
        </button>
      ) : (
        <span className={bodyClassName}>{body}</span>
      )}
      {onRemove !== undefined && (
        <IconButton
          label={removeLabel}
          size="icon-compact"
          variant="ghost"
          className="relative size-5 rounded-chip after:absolute after:-inset-1 after:content-['']"
          onClick={onRemove}
        >
          <CloseIcon aria-hidden="true" />
        </IconButton>
      )}
    </span>
  )
}
