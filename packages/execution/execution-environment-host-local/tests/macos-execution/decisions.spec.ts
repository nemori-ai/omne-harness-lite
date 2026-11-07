// Fast: the decisions of the macOS command backend that need no process: the residue and its
// reason in the contract's order, and the request checks. Runs everywhere.
import { describe, expect, it } from 'vitest'
import { originRef } from '@omne-harness/execution-environment-contract'
import {
  gateEnvironment,
  macosRequestIssue,
  readerMissing,
} from '../../src/macos-execution/commands.ts'
import { macosResidue, type MacosResidueInput } from '../../src/macos-execution/residue.ts'
import { tenant, type StartRequest } from './fixture.ts'

const permitted: MacosResidueInput = {
  members: 2,
  policy: 'retain',
  bound: true,
  sameScope: true,
  closed: false,
}

describe('residue', () => {
  it('is none only for a reading of zero members', () => {
    expect(macosResidue({ ...permitted, members: 0 })).toEqual({ kind: 'none' })
    expect(macosResidue({ ...permitted, members: 0, policy: 'stop', bound: false })).toEqual({
      kind: 'none',
    })
  })

  it('reads an unknown count as leftovers, never as empty', () => {
    expect(macosResidue({ ...permitted, members: null })).toEqual({
      kind: 'stopping',
      reason: 'uncontained',
    })
  })

  it.each<[string, Partial<MacosResidueInput>, string]>([
    [
      'the policy forbids',
      { policy: 'stop', bound: false, sameScope: false, closed: true },
      'policy',
    ],
    ['there is no ledger view', { bound: false, sameScope: false, closed: true }, 'unbound'],
    ['the retention scope is another', { sameScope: false, closed: true }, 'policy'],
    ['the scope closed or the domain was released', { closed: true }, 'closed'],
    ['everything else holds', {}, 'uncontained'],
  ])('answers stopping with the first unmet reason when %s', (_, patch, reason) => {
    expect(macosResidue({ ...permitted, ...patch })).toEqual({ kind: 'stopping', reason })
  })
})

describe('the start request', () => {
  const start: StartRequest = {
    requestId: 'r',
    access: { principal: 'subject-a', tenant },
    origin: originRef('call-1'),
    binding: { kind: 'host_machine' },
    executable: '/bin/sh',
    args: ['-c', 'true'],
    cwd: '/tmp',
    env: { PATH: '/usr/bin' },
    outputMode: 'separate',
  }

  it('passes a whole request', () => {
    expect(macosRequestIssue(start)).toBeUndefined()
  })

  it.each<[string, Partial<StartRequest>, string]>([
    ['another binding', { binding: { kind: 'container' } as never }, 'unsupported'],
    ['a terminal output mode', { outputMode: 'terminal' as never }, 'unsupported'],
    ['a geometry', { geometry: { columns: 80, rows: 24 } as never }, 'unsupported'],
    ['a relative executable', { executable: 'sh' }, 'invalidInput'],
    ['a relative cwd', { cwd: 'tmp' }, 'invalidInput'],
    ['a NUL in the executable', { executable: '/bin/s\u0000h' }, 'invalidInput'],
    ['a NUL in an argument', { args: ['a\u0000'] }, 'invalidInput'],
    ['an empty variable name', { env: { '': 'x' } }, 'invalidInput'],
    ['a variable name with =', { env: { 'A=B': 'x' } }, 'invalidInput'],
    ['a NUL in a variable name', { env: { 'A\u0000': 'x' } }, 'invalidInput'],
    ['a NUL in a value', { env: { A: 'x\u0000' } }, 'invalidInput'],
    ['a value of another kind', { env: { A: 1 } as never }, 'invalidInput'],
  ])('refuses %s', (_, patch, reason) => {
    expect(macosRequestIssue({ ...start, ...patch })).toBe(reason)
  })
})

describe('prerequisites and the gate environment', () => {
  it('names the missing tools or the failed compile', () => {
    expect(readerMissing({ kind: 'missing', missing: 'commandLineTools' })).toBe(
      'command-line-tools',
    )
    expect(readerMissing({ kind: 'missing', missing: 'compile' })).toBe('session-reader')
  })

  it('gives the gate a fixed search path and nothing else', () => {
    expect(gateEnvironment).toEqual({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' })
  })
})
