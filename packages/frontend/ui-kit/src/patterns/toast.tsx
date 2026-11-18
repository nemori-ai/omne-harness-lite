import { Children, type ReactNode } from 'react'

import { InlineNotice, type NoticeAction } from './inline-notice.tsx'

export type ToastTone = 'info' | 'attention'

export interface ToastItemProps {
  readonly tone: ToastTone
  readonly title: ReactNode
  readonly body?: ReactNode
  readonly action?: NoticeAction
  readonly onDismiss: () => void
  readonly dismissLabel?: string
}

/** One toast: a notice that floats, with a way to close it and at most one action. */
export function ToastItem({
  tone,
  title,
  body,
  action,
  onDismiss,
  dismissLabel,
}: ToastItemProps): React.JSX.Element {
  return (
    <div data-toast={tone} className="omne-toast">
      <InlineNotice
        tone={tone === 'attention' ? 'caution' : 'info'}
        role={tone === 'attention' ? 'alert' : 'status'}
        title={<span data-toast-title="">{title}</span>}
        onDismiss={onDismiss}
        {...(action !== undefined && { action })}
        {...(dismissLabel !== undefined && { dismissLabel })}
      >
        {body === undefined ? null : <p>{body}</p>}
      </InlineNotice>
    </div>
  )
}

export interface ToastStackProps {
  readonly label: string
  readonly children: ReactNode
}

/** The corner the toasts float in, oldest on top. Empty, it draws nothing. */
export function ToastStack({ label, children }: ToastStackProps): React.JSX.Element | null {
  if (Children.count(children) === 0) return null
  return (
    <section aria-label={label} className="omne-toast-stack">
      {children}
    </section>
  )
}
