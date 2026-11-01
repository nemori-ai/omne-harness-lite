import { describe, expect, it } from 'vitest'
import { SYSTEM_ACTION_MATRIX, effectiveArgumentsOf } from '@omne-harness/authorization'
import { ROWS, grantOf, installed, requestFor, row } from './system-support.ts'

describe('the system purpose matrix', () => {
  it('has exactly the seven rows of the specification', () => {
    const table = SYSTEM_ACTION_MATRIX.map(entry => ({
      purpose: entry.purpose,
      owner: entry.operation.owner,
      name: entry.operation.name,
      branch: entry.target,
      resourceOwner: entry.resource.owner,
      resourceKind: entry.resource.kind,
      fixedArguments: entry.arguments === 'none',
    }))
    expect(table).toEqual(
      ROWS.map(value => ({
        purpose: value.purpose,
        owner: value.owner,
        name: value.name,
        branch: value.branch,
        resourceOwner: value.resourceOwner,
        resourceKind: value.resourceKind,
        fixedArguments: value.fixedArguments,
      })),
    )
  })

  it('binds the arguments of each row as the specification table says', () => {
    expect(SYSTEM_ACTION_MATRIX.map(entry => [entry.purpose, entry.arguments])).toEqual([
      ['resident-references', 'none'],
      ['released-scopes', 'none'],
      ['enumerate-tenants', 'none'],
      ['pending-sessions', 'none'],
      ['scope-release-receive', 'request'],
      ['scope-release-load', 'none'],
      ['scope-release-query', 'request'],
    ])
  })

  it.each(ROWS.map(value => [value.name, value] as const))(
    'allows %s with a grant of its own purpose',
    async (_name, value) => {
      const { scanner, grants, authorization } = installed()
      grants.script({ kind: 'found', grant: grantOf([value.purpose]) })
      const decision = await authorization.check(requestFor(scanner, value))
      expect(decision.kind).toBe('allowed')
    },
  )

  it.each(ROWS.filter(value => value.fixedArguments).map(value => [value.name, value] as const))(
    'denies %s for arguments other than none, after the grant was read',
    async (_name, value) => {
      const { scanner, grants, authorization } = installed()
      grants.script({ kind: 'found', grant: grantOf([value.purpose]) })
      const decision = await authorization.check(
        requestFor(scanner, value, { arguments: effectiveArgumentsOf('other') }),
      )
      expect(decision).toMatchObject({ kind: 'denied', reason: 'binding-mismatch' })
    },
  )

  it.each(ROWS.map(value => [value.name, value] as const))(
    'does not let the grants of the other six rows allow %s',
    async (_name, value) => {
      const { scanner, grants, authorization } = installed()
      const others = ROWS.filter(other => other.name !== value.name).map(other => other.purpose)
      grants.script({ kind: 'found', grant: grantOf(others) })
      const decision = await authorization.check(requestFor(scanner, value))
      expect(decision).toMatchObject({ kind: 'denied', reason: 'grant-missing' })
    },
  )

  it('keeps the two scope release reads apart from receive, pending and releasedScopes', async () => {
    const { scanner, grants, authorization } = installed()
    const lent = ['scope-release-receive', 'pending-sessions', 'released-scopes']
    grants.script({ kind: 'found', grant: grantOf(lent) }, { kind: 'found', grant: grantOf(lent) })
    for (const name of ['loadScopeRelease', 'queryScopeReleaseOperation']) {
      const decision = await authorization.check(requestFor(scanner, row(name)))
      expect(decision).toMatchObject({ kind: 'denied', reason: 'grant-missing' })
    }
    const reverse = grantOf(['scope-release-load', 'scope-release-query'])
    grants.script(
      { kind: 'found', grant: reverse },
      { kind: 'found', grant: reverse },
      { kind: 'found', grant: reverse },
    )
    for (const name of ['receive', 'pending', 'releasedScopes']) {
      const decision = await authorization.check(requestFor(scanner, row(name)))
      expect(decision).toMatchObject({ kind: 'denied', reason: 'grant-missing' })
    }
  })

  it('reads a wildcard purpose as no purpose at all', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'found', grant: grantOf(['*']) })
    const decision = await authorization.check(requestFor(scanner, row('pending')))
    expect(decision).toMatchObject({ kind: 'denied', reason: 'grant-missing' })
  })

  it('derives no wildcard: an operation outside the seven rows is forbidden whatever is granted', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'found', grant: grantOf([...ROWS.map(value => value.purpose), '*']) })
    const decision = await authorization.check(
      requestFor(scanner, row('pending'), {
        operation: { owner: 'session', name: 'loadRecovery' },
      }),
    )
    expect(decision).toMatchObject({ kind: 'denied', reason: 'operation-forbidden' })
    expect(grants.calls()).toBe(0)
  })
})
