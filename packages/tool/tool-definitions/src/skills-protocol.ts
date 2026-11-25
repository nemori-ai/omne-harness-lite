import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { ParameterContract } from '@omne-harness/tool-contract'
import { describedAdoption, type ParameterCodec } from '@omne-harness/tool-contract/provider'
import { contract, parameterCodec, type Arguments, type Command } from './protocol.ts'
import type { ProgramSide } from './program-side.ts'

export const skillsAdoption = describedAdoption({
  owner: '@omne-harness/tool-definitions',
  name: 'skills-protocol',
  revision: '1',
  changes: 'Skills search, read, list and read_file with the command named in the call.',
})
export const skillsCommandNames = ['help', 'search', 'read', 'list', 'read_file'] as const
export type SkillsCommandName = (typeof skillsCommandNames)[number]
export type SkillsArguments =
  | Readonly<{ kind: 'help'; name?: string }>
  | Readonly<{ kind: 'search'; query: string; after: string | null; limit: number | null }>
  | Readonly<{ kind: 'read'; skill: string; offset: number }>
  | Readonly<{ kind: 'list'; skill: string }>
  | Readonly<{ kind: 'read_file'; skill: string; path: string; offset: number }>

type SkillsCommand = Command & Readonly<{ name: SkillsCommandName }>

const skillField = {
  name: 'skill',
  kind: 'string',
  required: true,
  description: 'The Skill name, as search shows it.',
} as const
const offsetField = {
  name: 'offset',
  kind: 'offset',
  description:
    'Byte offset to start from. Omit for 0; to read on, copy the offset a cut result gives.',
} as const

const text = { type: 'string' }
const whole = { type: 'integer' }
const maybe = { type: ['string', 'null'] }
const value = (required: readonly string[], properties: object): ProgramSide => ({
  kind: 'data',
  external: false,
  schema: { type: 'object', required, properties },
})
const TEXT_PAGE = value(['text', 'start', 'end', 'total', 'directory'], {
  text,
  start: whole,
  end: whole,
  total: whole,
  directory: maybe,
})

const commandBodies: Readonly<Record<SkillsCommandName, Omit<Command, 'name'>>> = {
  help: {
    summary: 'Read command usage.',
    program: { kind: 'closed' },
    fields: [
      {
        name: 'name',
        kind: 'string',
        choices: skillsCommandNames,
        description: 'Command name. Omit for the complete menu.',
      },
    ],
  },
  search: {
    summary:
      'Find the Skills you may use by keywords, best match first; an empty query lists every Skill. Returns names and descriptions.',
    program: value(['entries', 'next'], {
      entries: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'description', 'disabled'],
          properties: { name: text, description: maybe, disabled: maybe },
        },
      },
      next: maybe,
    }),
    fields: [
      {
        name: 'query',
        kind: 'text',
        description: 'Keywords in any language. Omit or leave empty to list every Skill by name.',
      },
      {
        name: 'after',
        kind: 'string',
        description:
          'The next cursor of the previous page of the same search. Omit for the first page.',
      },
      {
        name: 'limit',
        kind: 'positive',
        description:
          'Maximum number of Skills on one page. Omit for 10; a value above 50 is reduced to 50.',
      },
    ],
  },
  read: {
    summary: 'Read the SKILL.md body of one Skill, with the local directory that holds its files.',
    program: TEXT_PAGE,
    fields: [skillField, offsetField],
  },
  list: {
    summary: 'List the files in the directory of one Skill, with their sizes.',
    program: value(['files', 'directory'], {
      files: {
        type: 'array',
        items: {
          type: 'object',
          required: ['path', 'size', 'media_type'],
          properties: { path: text, size: whole, media_type: maybe },
        },
      },
      directory: maybe,
    }),
    fields: [skillField],
  },
  read_file: {
    summary: 'Read one text file of a Skill by its path inside the Skill directory.',
    program: TEXT_PAGE,
    fields: [
      skillField,
      {
        name: 'path',
        kind: 'string',
        required: true,
        description: 'Path inside the Skill directory, as list shows it, such as scripts/run.mjs.',
      },
      offsetField,
    ],
  },
}

function skillsCommand(name: SkillsCommandName): SkillsCommand {
  return { name, ...commandBodies[name] }
}
export const skillsCommands: readonly SkillsCommand[] = skillsCommandNames.map(skillsCommand)
export const skillsContract = (name: SkillsCommandName): ParameterContract =>
  contract(skillsCommand(name))

type Parsed = Outcome<SkillsArguments, Readonly<{ kind: 'incomplete' | 'invalid'; reason: string }>>

function typed(name: SkillsCommandName, args: Arguments): Parsed {
  switch (name) {
    case 'help':
      return succeed({ kind: 'help', ...(args.has('name') ? { name: args.text('name') } : {}) })
    case 'search':
      return succeed({
        kind: 'search',
        query: args.text('query'),
        after: args.optionalText('after') ?? null,
        limit: args.has('limit') ? args.number('limit', 1) : null,
      })
    case 'read':
      return succeed({ kind: 'read', skill: args.text('skill'), offset: args.number('offset', 0) })
    case 'list':
      return succeed({ kind: 'list', skill: args.text('skill') })
    case 'read_file':
      return succeed({
        kind: 'read_file',
        skill: args.text('skill'),
        path: args.text('path'),
        offset: args.number('offset', 0),
      })
  }
}

export function skillsParameterCodec(name: SkillsCommandName): ParameterCodec<SkillsArguments> {
  const base = parameterCodec(skillsCommand(name))
  return {
    adoption: skillsAdoption,
    parse(input) {
      const answer = base.parse(input)
      return 'failure' in answer ? answer : typed(name, answer.ok)
    },
  }
}
