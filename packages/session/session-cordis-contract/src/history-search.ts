import { type Context, Service } from '@deepseek-ai/cordis'
import type {
  HistoryIndex,
  HistoryLogReader,
  HistorySearch,
  SearchCursorSeal,
} from '@omne-harness/session-search'

/** The history index: a projection of the session logs. Intake and Runs never take it. */
export abstract class SessionHistoryIndexService extends Service {
  static readonly provide = 'sessionHistoryIndex'
  constructor(ctx: Context) {
    super(ctx, SessionHistoryIndexService.provide)
  }
  abstract readonly index: HistoryIndex
}
export const sessionHistoryIndexKey = SessionHistoryIndexService.provide

/** How the history search reads the session logs; the session storage provides it. */
export abstract class SessionHistoryLogService extends Service {
  static readonly provide = 'sessionHistoryLog'
  constructor(ctx: Context) {
    super(ctx, SessionHistoryLogService.provide)
  }
  abstract readonly log: HistoryLogReader
}
export const sessionHistoryLogKey = SessionHistoryLogService.provide

/** Seals and opens the cursors of the history search with the session's cursor signing. */
export abstract class SessionSearchCursorsService extends Service {
  static readonly provide = 'sessionSearchCursors'
  constructor(ctx: Context) {
    super(ctx, SessionSearchCursorsService.provide)
  }
  abstract readonly seal: SearchCursorSeal
}
export const sessionSearchCursorsKey = SessionSearchCursorsService.provide

/** The history search of a tenant: every page asks the access check anew. */
export abstract class SessionSearchService<P = unknown>
  extends Service
  implements HistorySearch<P>
{
  static readonly provide = 'sessionSearch'
  constructor(ctx: Context) {
    super(ctx, SessionSearchService.provide)
  }
  abstract readonly search: HistorySearch<P>['search']
}
export const sessionSearchKey = SessionSearchService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionHistoryIndex: SessionHistoryIndexService
    sessionHistoryLog: SessionHistoryLogService
    sessionSearchCursors: SessionSearchCursorsService
    sessionSearch: SessionSearchService<unknown>
  }
}
