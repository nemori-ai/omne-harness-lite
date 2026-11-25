import { useEffect, useRef } from 'react'
import { readConversationSubject } from '../model/conversation-subject.ts'
import type { EntryFocus } from '../model/entry-focus.ts'
import type { SessionWorkspaces } from '../model/session-workspaces.ts'
import { useSession } from './use-session.ts'

// A subject is taken once, when it arrives; after that the page follows the person. A run is
// asked for before the session opens, so the transcript finds it once the history is read.
export function SubjectOpener({
  workspaces,
  scope,
  subject,
  focus,
}: {
  readonly workspaces: SessionWorkspaces
  readonly scope: string | undefined
  readonly subject: string | undefined
  readonly focus: EntryFocus
}) {
  const handle = useSession(workspaces, scope)
  const driver = handle.kind === 'ready' ? handle.driver : null
  const taken = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (subject === undefined) taken.current = undefined
    if (driver === null || subject === undefined || subject === taken.current) return
    taken.current = subject
    const target = readConversationSubject(subject)
    if (target === null) return
    if (target.run !== undefined) focus.set({ session: target.session, run: target.run })
    driver.openSession(target.session)
  }, [driver, subject, focus])
  return null
}
