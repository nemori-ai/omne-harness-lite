import {
  sessionBeforeIntakeKey,
  sessionBeforeIntakePlugin,
  sessionUtteranceResolverKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { defineRow } from '../../row.ts'

export const sessionBeforeIntakeRow = defineRow({
  row: 'session-before-intake',
  implementation: 'real',
  manifest: {
    provides: [sessionBeforeIntakeKey, sessionUtteranceResolverKey],
    injects: [],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: sessionBeforeIntakePlugin,
})
