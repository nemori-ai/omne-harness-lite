import { fail } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { LocalToolRuntimeInput } from '@omne-harness/tool-host-local/cordis'
import {
  filesToolModule,
  shellToolModule,
  type FilesAuthorEnvironment,
  type ShellAuthorEnvironment,
} from '@omne-harness/tool-definitions'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import {
  defineCommandTool,
  defineToolOperation,
  describedAdoption,
  type ToolAuthority,
  type ToolExecutionContext,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
  type ToolOperation,
} from '@omne-harness/tool-contract/provider'
import { evidence, tree, value } from './helpers.ts'

type Bindings = NonNullable<ReturnType<LocalToolRuntimeInput['bindings']>>
type Binding = Extract<Awaited<ReturnType<Bindings['resolve']>>, { ok: unknown }>['ok']
export type Environment = Parameters<Binding['start']>[1]
type Block = ToolMessageContentBlock

/** Project real leased capabilities into each real author's declared E; execute stays the original function. */
function bindEnvironment<E>(
  module: ToolImplementationModule<E, Block>,
  project: (env: Environment) => E,
  invoked: (command: string, context: ToolExecutionContext) => void,
): ToolImplementationModule<Environment, Block> {
  return {
    executor: module.executor,
    createAuthor(construction) {
      const created = module.createAuthor(construction)
      if ('failure' in created) return created
      const registration = readToolRegistration(created.ok)
      if (registration?.kind !== 'commands' || created.ok.facts.implements.kind !== 'commands')
        return fail({ field: 'module', reason: 'command-author-required' })
      const commands: Record<
        string,
        { summary: string; operation: ToolOperation<Environment, Block> }
      > = {}
      for (const [name, slot] of registration.operations) {
        const author = slot.author
        const declaration = created.ok.facts.implements.commands.find(item => item.name === name)
        if (
          author.kind !== 'ordinary' ||
          slot.returns.kind !== 'ordinary' ||
          slot.parameters.kind !== 'declared' ||
          !declaration
        )
          return fail({ field: 'module', reason: 'ordinary-declared-command-required' })
        const operation = defineToolOperation<
          unknown,
          unknown,
          Environment,
          Block,
          typeof slot.parameters
        >({
          parameters: slot.parameters,
          returns: slot.returns,
          author: {
            ...author,
            executor: {
              execute(args, environment, context) {
                invoked(name, context)
                return author.executor.execute(args, project(environment), context)
              },
            },
          },
        })
        if ('failure' in operation) return operation
        commands[name] = { summary: declaration.summary, operation: operation.ok }
      }
      const { description, declarations, backgroundAllowed } = created.ok.facts
      return defineCommandTool({
        implementation: { description, declarations, backgroundAllowed },
        commands,
      })
    },
  }
}

export function createAuthors(
  workspace: string,
  executable: string,
  env: Readonly<Record<string, string>>,
  maximum: number,
) {
  const contexts = new WeakMap<ToolExecutionContext, string>()
  const counts = new Map<string, number>()
  const executed = (tool: string) => (command: string, context: ToolExecutionContext) => {
    const reference = contexts.get(context)
    if (!reference) throw new Error('The real author did not receive the production scope')
    counts.set(`${tool}.${command}`, (counts.get(`${tool}.${command}`) ?? 0) + 1)
  }
  const modules = {
    Files: bindEnvironment<FilesAuthorEnvironment>(
      filesToolModule,
      environment => ({ files: environment.files }),
      executed('Files'),
    ),
    Shell: bindEnvironment<ShellAuthorEnvironment>(
      shellToolModule,
      environment => ({
        command: environment.command,
        terminal: environment.terminal,
        facts: environment.facts,
      }),
      executed('Shell'),
    ),
  }
  const construction = {
    Files: tree({ resultMaxBytes: maximum }),
    Shell: tree({
      resultMaxBytes: maximum,
      executable,
      argsPrefix: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'],
      cwd: workspace,
      env,
    }),
  }
  const authorities: Record<'Files' | 'Shell', ToolAuthority> = {
    Files: {
      layer: { kind: 'official' },
      asset: {
        name: 'Files',
        adoption: describedAdoption({
          owner: 'windows-e2-assets',
          name: 'Files',
          revision: '1',
          module: filesToolModule.executor,
        }),
      },
      holding: evidence('files-holding'),
      publication: evidence('files-publication'),
    },
    Shell: {
      layer: { kind: 'official' },
      asset: {
        name: 'Shell',
        adoption: describedAdoption({
          owner: 'windows-e2-assets',
          name: 'Shell',
          revision: '1',
          module: shellToolModule.executor,
        }),
      },
      holding: evidence('shell-holding'),
      publication: evidence('shell-publication'),
    },
  }
  const settings = {
    Files: describedAdoption({
      owner: 'windows-e2-settings',
      name: 'Files',
      revision: '1',
      construction: construction.Files,
    }),
    Shell: describedAdoption({
      owner: 'windows-e2-settings',
      name: 'Shell',
      revision: '1',
      construction: construction.Shell,
    }),
  }
  const implementations = {
    Files: value(modules.Files.createAuthor(construction.Files)),
    Shell: value(modules.Shell.createAuthor(construction.Shell)),
  }
  function tool(authority: ToolAuthority): 'Files' | 'Shell' | null {
    if (canonicalDigest(authority) === canonicalDigest(authorities.Files)) return 'Files'
    if (canonicalDigest(authority) === canonicalDigest(authorities.Shell)) return 'Shell'
    return null
  }
  return {
    modules,
    authorities,
    construction,
    settings,
    implementations,
    tool,
    bind(context: ToolExecutionContext, call: string) {
      contexts.set(context, call)
    },
    executions: () => Object.fromEntries(counts),
  }
}
