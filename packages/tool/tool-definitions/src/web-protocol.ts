// The command table of Web: the same table supplies the declared parameters, the validation and the
// help text, through the shared Files and Shell protocol helpers.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ParameterContract } from '@omne-harness/tool-contract'
import { describedAdoption, type ParameterCodec } from '@omne-harness/tool-contract/provider'
import { contract, parameterCodec, type Arguments, type Command } from './protocol.ts'

export const webAdoption = describedAdoption({
  owner: '@omne-harness/tool-definitions',
  name: 'web-protocol',
  revision: '1',
  changes: 'Web search and fetch with the command named in the call and help by command name.',
})
export const webCommandNames = ['help', 'search', 'fetch'] as const
export type WebCommandName = (typeof webCommandNames)[number]
export type WebArguments =
  | Readonly<{ kind: 'help'; name?: string }>
  | Readonly<{ kind: 'search'; query: string; limit: number | null }>
  | Readonly<{ kind: 'fetch'; url: string }>

export const webCommands: readonly Command[] = [
  {
    name: 'help',
    summary: 'Read command usage.',
    fields: [
      {
        name: 'name',
        kind: 'string',
        choices: webCommandNames,
        description: 'Command name. Omit for the complete menu.',
      },
    ],
  },
  {
    name: 'search',
    summary:
      'Search the web for one natural-language query. Returns titles, urls and short excerpts, not whole pages. Needs the Web setting exa.apiKey.',
    fields: [
      {
        name: 'query',
        kind: 'string',
        required: true,
        description: 'One natural-language query. Nonblank.',
      },
      {
        name: 'limit',
        kind: 'positive',
        description:
          'Maximum number of results. Omit for the default. A value above the configured maximum is reduced to that maximum.',
      },
    ],
  },
  {
    name: 'fetch',
    summary:
      'Read one http or https page with GET and return it as Markdown. Does not run scripts, send cookies or submit forms.',
    fields: [
      {
        name: 'url',
        kind: 'string',
        required: true,
        description: 'An absolute http or https URL without a user name or password.',
      },
    ],
  },
]

export function webCommand(name: WebCommandName): Command {
  const command = webCommands.find(candidate => candidate.name === name)
  if (command === undefined) throw new TypeError(`Web has no command ${name}`)
  return command
}
export const webContract = (name: WebCommandName): ParameterContract => contract(webCommand(name))

const invalid = (field: string) =>
  fail({ kind: 'invalid', reason: `invalid-field:${field}` } as const)
type Parsed = Outcome<WebArguments, Readonly<{ kind: 'incomplete' | 'invalid'; reason: string }>>

function typed(name: WebCommandName, args: Arguments): Parsed {
  switch (name) {
    case 'help':
      return succeed({
        kind: 'help',
        ...(args.has('name') ? { name: args.text('name') } : {}),
      })
    case 'search': {
      const query = args.text('query')
      if (query.trim().length === 0) return invalid('query')
      return succeed({
        kind: 'search',
        query,
        limit: args.has('limit') ? args.number('limit', 1) : null,
      })
    }
    case 'fetch':
      return succeed({ kind: 'fetch', url: args.text('url') })
  }
}

/** The codec of one Web command: the shared field validation, then the typed arguments. */
export function webParameterCodec(name: WebCommandName): ParameterCodec<WebArguments> {
  const base = parameterCodec(webCommand(name))
  return {
    adoption: webAdoption,
    parse(input) {
      const answer = base.parse(input)
      return 'failure' in answer ? answer : typed(name, answer.ok)
    },
  }
}
