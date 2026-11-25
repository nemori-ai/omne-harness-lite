import type { LoginStateId } from '@omne-harness/legal-identity'
import type { IdentityGovernance } from '../governance.ts'

type Login = Readonly<{ login: LoginStateId }>
type Person = Readonly<{ login: Login }>
type Context = Readonly<{
  providers(): Readonly<{ governance: IdentityGovernance }>
  person(name: string): Promise<Person>
  another(person: Person): Promise<Login>
  restart(): Promise<void>
  fixture: Readonly<{ restart?: unknown }>
}>
type Tools = Readonly<{
  check(condition: boolean, message: string): asserts condition
  kindIs<O extends { kind: string }, K extends O['kind']>(
    outcome: O,
    kind: K,
    what: string,
  ): Extract<O, { kind: K }>
}>
type PreferenceCase = Readonly<{
  id: string
  rule: string
  run(context: Context): Promise<'passed' | 'not-applicable'>
}>

const NAME = 'keys.mac'

/** IDP: an account's preferences are its own, read the same from every login, and a stale write is refused. */
export function preferenceCases(tools: Tools): readonly PreferenceCase[] {
  const check: Tools['check'] = tools.check
  const kindIs: Tools['kindIs'] = tools.kindIs
  const read = async (context: Context, login: Login, name = NAME) =>
    kindIs(
      await context.providers().governance.readAccountPreference({ login: login.login, name }),
      'succeeded',
      'reading a preference',
    )
  const write = (context: Context, login: Login, value: string | null, expected: string) =>
    context.providers().governance.writeAccountPreference({
      login: login.login,
      name: NAME,
      value,
      expected,
    })
  return [
    {
      id: 'preference-read-write',
      rule: 'IDP: an unwritten preference reads as no value; a write naming the revision read replaces it',
      async run(context) {
        const ada = await context.person('ada')
        const first = await read(context, ada.login)
        check(first.value === null, 'an unwritten preference has a value')
        const written = kindIs(
          await write(context, ada.login, 'A', first.revision),
          'succeeded',
          'writing',
        )
        check(written.revision !== first.revision, 'the revision did not move')
        const again = await read(context, ada.login)
        check(
          again.value === 'A' && again.revision === written.revision,
          'the write is not read back',
        )
        kindIs(await write(context, ada.login, null, written.revision), 'succeeded', 'clearing')
        check((await read(context, ada.login)).value === null, 'a cleared preference has a value')
        return 'passed'
      },
    },
    {
      id: 'preference-stale-write-conflict',
      rule: 'IDP: two writes from one revision: the later is a conflict with the revision now, and the first stays',
      async run(context) {
        const ada = await context.person('ada')
        const other = await context.another(ada)
        const seen = await read(context, ada.login)
        const first = kindIs(
          await write(context, ada.login, 'first', seen.revision),
          'succeeded',
          'the first write',
        )
        const late = kindIs(
          await write(context, other, 'second', seen.revision),
          'conflict',
          'the late write',
        )
        check(late.revision === first.revision, 'the conflict names another revision')
        check((await read(context, other)).value === 'first', 'the late write replaced the first')
        return 'passed'
      },
    },
    {
      id: 'preference-per-account',
      rule: 'IDP: another login of the account reads the same value; another account reads its own',
      async run(context) {
        const ada = await context.person('ada')
        const bob = await context.person('bob')
        const seen = await read(context, ada.login)
        kindIs(await write(context, ada.login, 'ada', seen.revision), 'succeeded', 'writing')
        check(
          (await read(context, await context.another(ada))).value === 'ada',
          'another login reads another value',
        )
        check((await read(context, bob.login)).value === null, 'another account reads this value')
        return 'passed'
      },
    },
    {
      id: 'preference-after-restart',
      rule: 'IDP: a written preference outlives a restart',
      async run(context) {
        if (context.fixture.restart === undefined) return 'not-applicable'
        const ada = await context.person('ada')
        const seen = await read(context, ada.login)
        kindIs(await write(context, ada.login, 'kept', seen.revision), 'succeeded', 'writing')
        await context.restart()
        check((await read(context, ada.login)).value === 'kept', 'a restart lost the value')
        return 'passed'
      },
    },
    {
      id: 'preference-bounds-denied',
      rule: 'IDP: an empty or overlong name and an overlong value are denied and write nothing',
      async run(context) {
        const ada = await context.person('ada')
        const { governance } = context.providers()
        const long = 'x'.repeat(65)
        kindIs(
          await governance.readAccountPreference({ login: ada.login.login, name: '' }),
          'denied',
          'an empty name',
        )
        kindIs(
          await governance.readAccountPreference({ login: ada.login.login, name: long }),
          'denied',
          'a long name',
        )
        const seen = await read(context, ada.login)
        kindIs(
          await write(context, ada.login, 'v'.repeat(16_385), seen.revision),
          'denied',
          'a long value',
        )
        check(
          (await read(context, ada.login)).revision === seen.revision,
          'a denied write moved the revision',
        )
        return 'passed'
      },
    },
  ]
}

/** The cases above after the given ones. */
export function withPreferenceCases<C>(tools: Tools, cases: readonly C[]): readonly C[] {
  return [...cases, ...(preferenceCases(tools) as readonly C[])]
}
