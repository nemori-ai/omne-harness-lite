// The two policy tables are generated against the type enumerations: the keys of each table are
// exactly the access operations of its contract. One row more or less fails here and in `tsc`.
import { expectTypeOf, test } from 'vitest'
import type { AgentAccessOperation } from '@omne-harness/agent-contract'
import type { SessionAccessOperation } from '@omne-harness/session-contract'
import {
  AGENT_POLICY,
  SESSION_POLICY,
  type PolicyCell,
  type PolicyRow,
} from '../../../src/rows/authorization/index.ts'

test('the Session table has one row per SessionAccessOperation', () => {
  expectTypeOf<keyof typeof SESSION_POLICY>().toEqualTypeOf<SessionAccessOperation>()
  expectTypeOf<(typeof SESSION_POLICY)[SessionAccessOperation]>().toExtend<PolicyRow>()
})

test('the Agent table has one row per AgentAccessOperation', () => {
  expectTypeOf<keyof typeof AGENT_POLICY>().toEqualTypeOf<AgentAccessOperation>()
  expectTypeOf<(typeof AGENT_POLICY)[AgentAccessOperation]>().toExtend<PolicyRow>()
})

test('an allowing cell cannot be written without a source', () => {
  // @ts-expect-error a member cell needs a source
  const member: PolicyCell = { verdict: 'member' }
  // @ts-expect-error a matrix cell needs a source and a purpose
  const matrix: PolicyCell = { verdict: 'matrix' }
  // @ts-expect-error a plain string is not a citation
  const plain: PolicyCell = { verdict: 'member', source: 'SS:551' }
  void member
  void matrix
  void plain
})
