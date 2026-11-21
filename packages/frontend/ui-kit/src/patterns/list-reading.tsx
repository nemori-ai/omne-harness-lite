import { useRef } from 'react'

import { Input } from '../controls/input.tsx'
import { CloseIcon, SearchIcon } from '../icons/index.ts'
import { cn } from '../lib/utils.ts'
import { GlideMenu } from './ai/glide-menu.tsx'
import { IconButton } from './icon-button.tsx'
import { PageHeader } from './page-header.tsx'

export function ListReadingPage({
  title,
  titleId,
  description,
  actions,
  detail,
  className,
  children,
}: {
  readonly title: React.ReactNode
  readonly titleId?: string
  readonly description?: React.ReactNode
  readonly actions?: React.ReactNode
  readonly detail: boolean
  readonly className?: string
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={cn('list-reading', className)} data-detail={detail}>
      <PageHeader
        title={title}
        {...(titleId !== undefined && { titleId })}
        description={description}
        actions={actions}
      />
      {children}
    </div>
  )
}

export function ListReadingWorkspace({
  detail,
  empty = false,
  className,
  children,
}: {
  readonly detail: boolean
  readonly empty?: boolean
  readonly className?: string
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className={cn('list-reading-workspace', className)}
      data-detail={detail}
      data-empty={empty}
    >
      {children}
    </div>
  )
}

export function ListReadingDirectory({
  search,
  filters,
  className,
  children,
}: {
  readonly search?: React.ReactNode
  readonly filters?: React.ReactNode
  readonly className?: string
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={cn('list-reading-directory', className)}>
      {search}
      {filters !== undefined && <div className="list-reading-filters">{filters}</div>}
      <GlideMenu className="list-reading-list">{children}</GlideMenu>
    </div>
  )
}

export function DirectorySearch({
  value,
  onChange,
  label,
  clearLabel,
  maxLength,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly label: string
  readonly clearLabel: string
  readonly maxLength?: number
}): React.JSX.Element {
  const field = useRef<HTMLInputElement>(null)
  return (
    <div className="list-reading-search">
      <SearchIcon aria-hidden="true" />
      <Input
        ref={field}
        data-keyboard-search=""
        aria-label={label}
        placeholder={label}
        value={value}
        {...(maxLength !== undefined && { maxLength })}
        onChange={event => onChange(event.target.value)}
      />
      {value !== '' && (
        <IconButton
          className="list-reading-search-clear"
          size="icon-compact"
          type="button"
          label={clearLabel}
          onClick={() => {
            onChange('')
            field.current?.focus()
          }}
        >
          <CloseIcon aria-hidden="true" />
        </IconButton>
      )}
    </div>
  )
}

export function ListReadingRow({
  title,
  mark,
  facts,
  time,
  selected = false,
  onSelect,
  id,
  className,
}: {
  readonly title: React.ReactNode
  readonly mark?: React.ReactNode
  readonly facts?: React.ReactNode
  readonly time?: React.ReactNode
  readonly selected?: boolean
  readonly onSelect: () => void
  readonly id?: string
  readonly className?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      id={id}
      data-control="row"
      data-glide-row=""
      aria-current={selected ? 'true' : undefined}
      className={cn('list-reading-row', className)}
      onClick={onSelect}
    >
      <span className="list-reading-row-mark" aria-hidden="true">
        {mark}
      </span>
      <span className="list-reading-row-body">
        <span className="list-reading-row-title">{title}</span>
        {facts !== undefined && <span className="list-reading-row-facts">{facts}</span>}
      </span>
      {time !== undefined && <span className="list-reading-row-time">{time}</span>}
    </button>
  )
}

export function ListReadingMain({
  className,
  children,
}: {
  readonly className?: string
  readonly children: React.ReactNode
}): React.JSX.Element {
  return <div className={cn('list-reading-main', className)}>{children}</div>
}

export function ReadingToolbar({
  name,
  back,
  origin,
  children,
}: {
  readonly name: React.ReactNode
  readonly back?: React.ReactNode
  readonly origin?: React.ReactNode
  readonly children?: React.ReactNode
}): React.JSX.Element {
  return (
    <header className="list-reading-toolbar">
      {back}
      <div className="list-reading-toolbar-heading">
        <span className="list-reading-toolbar-name">{name}</span>
        {origin !== undefined && <p className="list-reading-origin">{origin}</p>}
      </div>
      {children !== undefined && <div className="list-reading-toolbar-actions">{children}</div>}
    </header>
  )
}

export function ReadingDocument({
  children,
}: {
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="list-reading-scroll">
      <div className="list-reading-document">{children}</div>
    </div>
  )
}

export function ReadingState({
  children,
}: {
  readonly children: React.ReactNode
}): React.JSX.Element {
  return <div className="list-reading-state">{children}</div>
}
