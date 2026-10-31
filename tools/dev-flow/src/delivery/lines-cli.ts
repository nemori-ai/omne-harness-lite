#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileTree, listWorkspaceMembers } from '@omne-harness/repo-toolchain/core/workspace'
import { json, IntegrationError } from '../integration/parse.ts'
import { POLICY_PATH, parsePolicy } from '../integration/policy.ts'
import { LINES_PATH, parseDeliveryLines, validateDeliveryLines } from './lines.ts'

const usage = 'Usage: lines-cli.ts [--root PATH]'

/** Validates the working tree's line table; exits 1 on any table error, 2 on unusable input. */
function main(args: string[]): number {
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--root'))
    throw new IntegrationError('input-error', usage)
  const root = resolve(args[1] ?? process.cwd())
  const read = (path: string) => json(readFileSync(join(root, path), 'utf8'), path)
  const table = parseDeliveryLines(read(LINES_PATH)),
    registry = parsePolicy(read(POLICY_PATH)),
    members = listWorkspaceMembers(fileTree(root), [])
  const errors = validateDeliveryLines(table, members, registry)
  for (const error of errors)
    process.stderr.write(`${LINES_PATH}: ${error.at}: ${error.code}: ${error.message}\n`)
  if (errors.length > 0) return 1
  process.stdout.write(
    `${LINES_PATH}: ok (${table.lines.length} lines, ${members.length} workspace members)\n`,
  )
  return 0
}
try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  process.stderr.write(
    `${LINES_PATH}: ${error instanceof IntegrationError ? error.message : 'cannot read the line table, registry or workspace members'}\n`,
  )
  process.exitCode = 2
}
