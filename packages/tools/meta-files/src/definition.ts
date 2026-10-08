import { jsonObject } from './values.ts'
import { z } from 'zod'
import { readJsonStrict, type JsonObject } from '@omne-harness-lite/content-blocks'
import {
  judgeToolDefinition,
  type MultiCommandTool,
  type ParameterJudge,
} from '@omne-harness-lite/tool-definition'
import { argumentSchemas } from './arguments.ts'
import { COMMAND_HELP, FILES_HELP, descriptions } from './help.ts'
import type { FilesOptions } from './types.ts'
function schema(input: z.ZodType): JsonObject {
  // The tool parameter contract fixes its dialect and excludes minItems.
  // Nonempty arrays remain author checks before context or effects.
  const exchange = z.toJSONSchema(input, {
    target: 'draft-2020-12',
    override: ctx => {
      delete ctx.jsonSchema.minItems
    },
  })
  delete exchange.$schema
  const parsed = readJsonStrict(JSON.stringify(exchange))
  if (!('ok' in parsed) || !jsonObject(parsed.ok))
    throw new TypeError('Invalid Files parameter schema')
  return parsed.ok
}
export function filesDefinition(
  options: FilesOptions,
  parameters: ParameterJudge,
): MultiCommandTool {
  const commands = Object.fromEntries(
    Object.keys(argumentSchemas).map(name => {
      const key = name as keyof typeof argumentSchemas
      return [
        key,
        {
          description: descriptions[key],
          input:
            key === 'patch'
              ? {
                  ...schema(argumentSchemas[key]),
                  oneOf: [{ required: ['files'] }, { required: ['recovery'] }],
                }
              : schema(argumentSchemas[key]),
          help: COMMAND_HELP[key]!,
        },
      ]
    }),
  )
  const definition: MultiCommandTool = {
    name: 'Files',
    paradigm: 'multi',
    origin: { kind: 'authored' },
    description:
      'Read and change files in the selected execution environment. Use help for command parameters. Text results use Unix format. Edits return unified diffs. Open returns a confirmed image attachment.',
    help: FILES_HELP,
    needs: { attachmentStorage: options.attachmentStorage },
    settings: {
      targetEnvironment: {
        category: 'placement_identity',
        default: { bindingLayer: 'host_machine', facilities: ['files'] },
      },
    },
    permissions: { execute: { default: options.executePermission ?? 'ask' } },
    commands,
  }
  const judgment = judgeToolDefinition(definition, parameters)
  if ('rejected' in judgment)
    throw new TypeError(`Invalid Files definition: ${JSON.stringify(judgment)}`)
  return definition
}
