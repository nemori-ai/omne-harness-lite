#!/usr/bin/env node
import { resolve } from 'node:path'
import { createPackage } from './create.ts'
import { readTemplate } from './template.ts'
import { variant } from './model.ts'
import { createDomain, scanDomains } from './domain.ts'
import { scanPackages, scanExitCode } from './scan.ts'

const HELP = `Usage:
  package-template create --name <leaf> --group <group> --variant <variant> [--root <repo>] [--write]
  package-template create-domain --group <group> [--root <repo>] [--write]
  package-template scan [--root <repo>] [--group <group> | --member packages/<group>/<name>...] [--check] [--json]
Creation previews by default. --write creates a draft without replacing files.
Inventory scan is read-only. Package --check requires current markers, complete structure and no known static integration deviations.
Explicit --group --check asserts current group structure and completed drafts without certifying adoption. Unknowns still require manual review.
Variants: module, cordis-module, service-contract, service-provider.`

function options(args: readonly string[], command: string) {
  const values = new Map<string, string>()
  const flags = new Set<string>()
  const members: string[] = []
  const allowed =
    command === 'create'
      ? ['--root', '--name', '--group', '--variant', '--write']
      : command === 'create-domain'
        ? ['--root', '--group', '--write']
        : ['--root', '--member', '--group', '--check', '--json']
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i]
    if (key === undefined || !allowed.includes(key)) throw new Error(HELP)
    if (['--write', '--check', '--json'].includes(key)) {
      if (flags.has(key)) throw new Error(`Repeated option: ${key}`)
      flags.add(key)
      continue
    }
    const value = args[i + 1]
    if (value === undefined || value === '' || value.startsWith('--')) throw new Error(HELP)
    if (key === '--member') {
      if (members.includes(value)) throw new Error(`Repeated member: ${value}`)
      members.push(value)
    } else {
      if (values.has(key)) throw new Error(`Repeated option: ${key}`)
      values.set(key, value)
    }
    i += 1
  }
  if (values.has('--group') && members.length > 0)
    throw new Error('--group and --member are mutually exclusive')
  return { values, flags, members }
}
try {
  const [command, ...args] = process.argv.slice(2)
  if (command === '--help') process.stdout.write(`${HELP}\n`)
  else if (command === 'create' || command === 'create-domain' || command === 'scan') {
    const { values, flags, members } = options(args, command)
    const root = resolve(values.get('--root') ?? '.')
    if (command === 'create-domain') {
      const group = values.get('--group')
      if (group === undefined) throw new Error(HELP)
      process.stdout.write(
        `${JSON.stringify(createDomain({ root, group, write: flags.has('--write') }), null, 2)}\n`,
      )
    } else if (command === 'create') {
      const name = values.get('--name'),
        group = values.get('--group'),
        selected = values.get('--variant')
      if (name === undefined || group === undefined || !variant(selected)) throw new Error(HELP)
      process.stdout.write(
        `${JSON.stringify(createPackage({ root, name, group, variant: selected, write: flags.has('--write') }), null, 2)}\n`,
      )
    } else {
      const template = readTemplate()
      const group = values.get('--group')
      const results =
        group === undefined ? scanPackages(root, members.length === 0 ? undefined : members) : []
      const domains =
        group !== undefined
          ? scanDomains(root, [group])
          : members.length === 0
            ? scanDomains(root)
            : []
      if (flags.has('--json'))
        process.stdout.write(
          `${JSON.stringify({ template: `${template.id}@${template.version}`, packages: results, domains, limits: 'Complete declared package tree comparison; integration facts remain a static subset and require manual qualification before adoption. No business or lifecycle proof.' }, null, 2)}\n`,
        )
      else {
        for (const item of domains) {
          process.stdout.write(
            `${item.path}: ${item.template.id}@${item.template.version} / structure=${item.structure}; coverage=${item.coverage}\n`,
          )
          for (const finding of item.findings)
            process.stdout.write(`  ${finding.code}: ${finding.path}: ${finding.reason}\n`)
        }
        for (const item of results) {
          process.stdout.write(
            `${item.path}: ${item.adoption} / ${item.variant} / structure=${item.structure} / integration=${item.integration}; acceptance=${item.acceptance === 'executable' ? 'executable scenarios' : 'no executable scenarios'}; owned nodes=${item.tree.length}; architecture unknowns=${item.architectureUnknowns}; binding unknowns=${item.bindingUnknowns.length}\n`,
          )
          for (const finding of item.findings)
            process.stdout.write(`  ${finding.code}: ${finding.path}: ${finding.reason}\n`)
        }
        process.stdout.write(
          `Packages: ${results.length}. Static structure is not business or lifecycle acceptance.\n`,
        )
      }
      process.exitCode =
        group === undefined
          ? scanExitCode(results, flags.has('--check'))
          : flags.has('--check') && domains.some(item => item.structure === 'fail')
            ? 1
            : 0
    }
  } else throw new Error(HELP)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}
