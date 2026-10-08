import type { z } from 'zod'
import { LosslessNumber, type JsonValue } from '@omne-harness-lite/content-blocks'
import type { ToolExecutor } from '@omne-harness-lite/tool-execution-runtime'
import type { MultiCommandTool, ParameterJudge } from '@omne-harness-lite/tool-definition'
import type { FilesOptions, FilesSupport } from './types.ts'
import { currentFiles } from './values.ts'
import { rejected } from './result.ts'
import { openImage } from './open.ts'
import { editFile, patchFiles, writeFile, type FileCall } from './mutations.ts'
import {
  readFile,
  listFiles,
  findFiles,
  fileInfo,
  transferFile,
  deleteFile,
  mkdir,
} from './queries.ts'
import { argumentSchemas } from './arguments.ts'
import { formatSection } from '@omne-harness-lite/unix-format'
/** Only schema-validated safe integers cross the native facility boundary. */
function nativeNumbers(value: JsonValue): unknown {
  if (LosslessNumber.is(value)) return Number(value.source)
  if (Array.isArray(value)) return value.map(nativeNumbers)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, nativeNumbers(item)]),
    )
  return value
}
function shapeArguments(command: string | undefined, value: unknown) {
  const schemas: Readonly<Record<string, z.ZodType>> = argumentSchemas
  if (command === undefined || !Object.hasOwn(schemas, command)) return undefined
  const checked = schemas[command]!.safeParse(value)
  return checked.success
    ? { command: command as keyof typeof argumentSchemas, data: checked.data }
    : undefined
}
function commandHelp(definition: MultiCommandTool, args: unknown): string {
  const name = argumentSchemas.help.parse(args).command
  if (!name) return definition.help!
  const selected = definition.commands[name]!
  return [
    selected.help!,
    formatSection('ARGUMENTS', JSON.stringify(nativeNumbers(selected.input), null, 2), {
      markdownCompatible: false,
      maxWidth: 0,
    }),
  ].join('\n\n')
}
export function filesExecutor(
  definition: MultiCommandTool,
  parameters: ParameterJudge,
  options: FilesOptions,
  support: FilesSupport,
): ToolExecutor {
  const routes: Readonly<
    Record<string, (input: unknown, call: FileCall) => ReturnType<ToolExecutor>>
  > = {
    read: readFile,
    open: (input, call) => openImage(input, call, support),
    write: writeFile,
    edit: editFile,
    patch: patchFiles,
    list: listFiles,
    find: findFiles,
    info: fileInfo,
    move: (input, call) => transferFile('move', input, call),
    copy: (input, call) => transferFile('copy', input, call),
    delete: deleteFile,
    mkdir,
  }
  return async (input, deps) => {
    const judgment = parameters.judgeCallArguments(definition, input)
    if (!('ok' in judgment))
      return rejected('invalid' in judgment ? 'arguments:invalid' : 'arguments:unsupported')
    const shaped = shapeArguments(judgment.ok.command, nativeNumbers(judgment.ok.args))
    if (shaped === undefined) return rejected('arguments:invalid')
    const { command, data: args } = shaped
    if (command === 'help') return commandHelp(definition, args)
    if (deps.signal.aborted) return rejected('interrupted')
    const selected = await currentFiles(deps, options)
    if ('error' in selected) return selected.error
    if (deps.signal.aborted) return rejected('interrupted')
    const route = routes[command]
    if (!route) throw new TypeError('Validated Files command has no executor')
    return route(args, { ...selected, deps, options })
  }
}
