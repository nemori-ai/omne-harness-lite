import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { CommandTable } from '@omne-harness/tool-contract'
import {
  commandGuide,
  defineCommandTool,
  defineToolOperation,
  describedAdoption,
  type ToolExecutionContext,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
  type ToolOperation,
  type ToolOperationParameters,
} from '@omne-harness/tool-contract/provider'
import { resultMaximumField } from './files.ts'
import { parseConstruction } from './protocol.ts'
import { textReturns } from './returns.ts'
import {
  skillsAccessOf,
  type SkillsEntry,
  type SkillsFailure,
  type SkillsListing,
  type SkillsPage,
  type SkillsText,
} from './skills-port.ts'
import {
  skillsAdoption,
  skillsCommands,
  skillsContract,
  skillsParameterCodec,
  type SkillsArguments,
} from './skills-protocol.ts'
import { bounded } from './text.ts'

const ENCODING = 'wrapped' as const
const returns = textReturns(skillsAdoption)
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50
const DESCRIPTION_SHOWN = 1024
const HEAD_RESERVE = 8192

const guide = `Skills finds and reads Skills: folders with a SKILL.md entry file and optional scripts, references and templates for one kind of task. search ranks the Skills you may use now by keywords, Chinese and English alike, best match first; an empty query lists every Skill by name; a disabled Skill is listed with its reason. A Skill installed while this session runs appears in the next search. read gives the SKILL.md body; list and read_file give the other files. read, list and read_file show directory=<absolute path> when the files of the Skill are on this machine: to run a script, call Shell with that absolute path, for example node <directory>/scripts/run.mjs. Skills itself never runs anything. A result that does not fit is cut and ends with [more: ...], which gives the offset or cursor to go on with. A name you may not use answers not-found, the same as a name that does not exist. Failures are one line, ERROR: <kind> (<why>): not-found, disabled, file-not-found, not-text, changed, invalid, invalid-cursor, unavailable.`
function skillsMenu(): CommandTable {
  return {
    name: 'Skills',
    encoding: ENCODING,
    guide,
    commands: skillsCommands.map(command => ({
      name: command.name,
      summary: command.summary,
      parameters: { kind: 'declared', value: skillsContract(command.name) },
      returns,
    })),
  }
}

function failureLine(failure: SkillsFailure): string {
  switch (failure.kind) {
    case 'not-found':
      return 'ERROR: not-found (no Skill with this name is available to you)'
    case 'disabled':
      return `ERROR: disabled (${failure.reason})`
    case 'file-not-found':
      return 'ERROR: file-not-found (the Skill has no file at this path; list shows its files)'
    case 'not-text':
      return 'ERROR: not-text (the file is binary; run or copy it with Shell from the Skill directory)'
    case 'changed':
      return 'ERROR: changed (the Skill changed while it was read; read it again from offset 0)'
    case 'invalid':
      return `ERROR: invalid (${failure.field}: ${failure.reason})`
    case 'invalid-cursor':
      return 'ERROR: invalid-cursor (the cursor is not from this search or the results changed; search again without after)'
    case 'unavailable':
      return `ERROR: unavailable (${failure.reason})`
  }
}

function shown(description: string): string {
  const characters = Array.from(description.replace(/\s*[\r\n]+\s*/gu, ' '))
  return characters.length <= DESCRIPTION_SHOWN
    ? characters.join('')
    : `${characters.slice(0, DESCRIPTION_SHOWN).join('')}… (read the Skill for the rest)`
}
function entryLine(entry: SkillsEntry, index: number): string {
  const disabled = entry.kind === 'disabled' ? ` [disabled: ${entry.reason}]` : ''
  const description = entry.description === undefined ? '' : ` - ${shown(entry.description)}`
  return `${String(index + 1)}. ${entry.name}${disabled}${description}`
}
function searchText(query: string, page: SkillsPage): string {
  const next = page.next === null ? '' : ` next=${JSON.stringify(page.next)}`
  const head = `done Skills search query=${JSON.stringify(query)} results=${String(page.entries.length)}${next}`
  if (page.entries.length === 0)
    return `${head}\nno Skill matches; try other words, or an empty query to list every Skill`
  const more =
    page.next === null
      ? ''
      : `\n[more: Skills search with the same query and after=${JSON.stringify(page.next)}]`
  return `${head}\n${page.entries.map(entryLine).join('\n')}${more}`
}
function directoryLine(directory: string | undefined): string {
  return directory === undefined ? '' : `directory=${directory}\n`
}
function textResult(call: string, read: SkillsText): string {
  const more = read.end < read.total ? `\n[more: Skills ${call} offset=${String(read.end)}]` : ''
  return `done Skills ${call} bytes=${String(read.start)}-${String(read.end)} total=${String(read.total)}\n${directoryLine(read.directory)}${read.text}${more}`
}
function listText(skill: string, listing: SkillsListing): string {
  const files = listing.files.map(
    file =>
      `${file.path} ${String(file.size)} bytes${file.mediaType === undefined ? '' : ` ${file.mediaType}`}`,
  )
  return [
    `done Skills list skill=${skill} files=${String(listing.files.length)}`,
    ...(listing.directory === undefined ? [] : [`directory=${listing.directory}`]),
    ...files,
  ].join('\n')
}

function rendered<T>(answer: Outcome<T, SkillsFailure>, render: (value: T) => string): string {
  return 'failure' in answer ? failureLine(answer.failure) : render(answer.ok)
}

async function execute(
  args: SkillsArguments,
  execution: ToolExecutionContext,
  maximum: number,
  menu: CommandTable,
): Promise<string> {
  if (args.kind === 'help')
    return `done Skills help${args.name === undefined ? '' : ` ${args.name}`}\n${commandGuide(menu, args.name)}`
  const access = skillsAccessOf(execution)
  if (access === undefined)
    return failureLine({
      kind: 'unavailable',
      reason: 'Skills access is not attached to this call',
    })
  const maxBytes = Math.max(1, maximum - Math.min(Math.floor(maximum / 2), HEAD_RESERVE))
  const { signal } = execution
  switch (args.kind) {
    case 'search': {
      const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
      return rendered(
        await access.search({ query: args.query, after: args.after, limit }, signal),
        page => searchText(args.query, page),
      )
    }
    case 'read':
      return rendered(
        await access.read({ skill: args.skill, offset: args.offset, maxBytes }, signal),
        read => textResult(`read skill=${args.skill}`, read),
      )
    case 'list':
      return rendered(await access.list({ skill: args.skill }, signal), listing =>
        listText(args.skill, listing),
      )
    case 'read_file':
      return rendered(
        await access.readFile(
          { skill: args.skill, path: args.path, offset: args.offset, maxBytes },
          signal,
        ),
        read => textResult(`read_file skill=${args.skill} path=${args.path}`, read),
      )
  }
}

export function createSkillsAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<null, ToolMessageContentBlock>['createAuthor']> {
  const parsed = parseConstruction(construction, [resultMaximumField])
  if ('failure' in parsed) return fail({ field: 'construction', reason: parsed.failure.reason })
  const maximum = parsed.ok.number('resultMaxBytes', 0)
  const menu = skillsMenu()
  const operations: Record<
    string,
    { summary: string; operation: ToolOperation<null, ToolMessageContentBlock> }
  > = {}
  for (const command of skillsCommands) {
    const { name } = command
    const operation = defineToolOperation<
      SkillsArguments,
      string,
      null,
      ToolMessageContentBlock,
      Extract<ToolOperationParameters, { kind: 'declared' }>
    >({
      parameters: { kind: 'declared', value: skillsContract(name) },
      returns,
      author: {
        kind: 'ordinary',
        parameters: skillsParameterCodec(name),
        waits: [],
        executor: {
          async execute(args, _environment, execution) {
            return bounded(await execute(args, execution, maximum, menu), maximum)
          },
        },
        codec: {
          adoption: skillsAdoption,
          encode(value: unknown) {
            return typeof value === 'string'
              ? succeed(new TextEncoder().encode(value))
              : fail({ reason: 'text-required' })
          },
          decode(bytes) {
            try {
              return succeed(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
            } catch {
              return fail({ reason: 'invalid-utf8' })
            }
          },
        },
        output: {
          adoption: skillsAdoption,
          check: ({ value }: { value: unknown }) =>
            typeof value === 'string' && new TextEncoder().encode(value).byteLength <= maximum
              ? succeed(value)
              : fail({ reason: 'bounded-text-required' }),
        },
        renderer: { render: (value: string) => succeed(value) },
        program: { kind: 'none' },
      },
    })
    if ('failure' in operation)
      return fail({ field: 'commands', reason: JSON.stringify(operation.failure) })
    operations[name] = { summary: command.summary, operation: operation.ok }
  }
  const author = defineCommandTool({
    implementation: {
      description:
        "Find and read Skills: folders of instructions, references and scripts for kinds of tasks. Read-only; run a Skill's scripts with Shell by the absolute directory that read gives.",
      backgroundAllowed: false,
      declarations: {
        adoption: skillsAdoption,
        environment: null,
        attachments: [],
        inputModalities: ['text'],
        outputModalities: ['text'],
        settings: null,
      },
    },
    encoding: ENCODING,
    guide,
    commands: operations,
  })
  return 'failure' in author
    ? fail({ field: 'commands', reason: JSON.stringify(author.failure) })
    : author
}

export const skillsToolModule: ToolImplementationModule<null, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: '@omne-harness/tool-definitions',
    name: 'Skills',
    revision: '1',
    changes:
      'help, search, read, list and read_file over an attached SkillsAccess port; plain text results and one-line failures.',
  }),
  createAuthor: createSkillsAuthor,
}
