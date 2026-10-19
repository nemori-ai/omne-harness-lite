// Runs every role fixture of a member, each in a consumer directory of its own, and sums the
// results up in one report that names the paths of each fixture. A role that the member requires
// and that has no fixture fails the set, so a fixture cannot be dropped to make the set pass.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readManifest } from './closure.ts'
import { runConsumerInstall, type Options, type Report } from './consumer.ts'
import type { PathResult } from '../fixture-runner.ts'
import type { MemberOptions } from './options.ts'

/** The file in the consumers directory that lists the roles the member must have a fixture for. */
export const ROLES_FILE = 'roles.json'

export type FixtureSummary = Readonly<{
  /** The name of the fixture directory, which is also the role. */
  role: string
  directory: string
  ok: boolean
  paths: readonly PathResult[]
  /** The checks of the run that did not pass, with what they found. */
  failedChecks: readonly Readonly<{ id: string; detail: string }>[]
}>

export type FixtureSetReport = Readonly<{
  member: string
  ok: boolean
  /** Problems of the set itself: an unreadable roles file, a required role without a fixture. */
  problems: readonly string[]
  fixtures: readonly FixtureSummary[]
}>

export type ConsumerRun = (options: Options) => Report

function isTextList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

/** The required roles, or the reason that the roles file cannot be used. */
export function readRoles(
  consumers: string,
): Readonly<{ roles: readonly string[] }> | Readonly<{ problem: string }> {
  const path = join(consumers, ROLES_FILE)
  if (!existsSync(path)) return { problem: `${path} does not exist` }
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) return { problem: `${path} is not JSON` }
    throw error
  }
  const roles =
    typeof value === 'object' && value !== null && 'roles' in value ? value.roles : undefined
  if (!isTextList(roles) || roles.length === 0)
    return { problem: `${path} must hold {"roles": [...]} with at least one role` }
  return { roles }
}

/** The names of the fixture directories below the consumers directory. */
export function fixtureNames(consumers: string): string[] {
  if (!existsSync(consumers)) return []
  return readdirSync(consumers, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
}

function summarise(name: string, directory: string, report: Report): FixtureSummary {
  const failedChecks = report.checks
    .filter(check => !check.ok)
    .map(check => ({ id: check.id, detail: check.detail }))
  return {
    role: name,
    directory,
    ok: report.ok,
    paths: report.fixture?.paths ?? [],
    failedChecks,
  }
}

/** The problems of the set itself: an unusable roles file, a required role without a fixture. */
function setProblems(consumers: string, names: readonly string[]): string[] {
  const wanted = readRoles(consumers)
  if ('problem' in wanted) return [wanted.problem]
  return wanted.roles
    .filter(role => !names.includes(role))
    .map(role => `fixture ${role}: required role has no fixture`)
}

export function runFixtureSet(
  input: MemberOptions &
    Readonly<{
      consumersDirectory: string
      /** The directory below which each fixture gets a consumer directory named after its role. */
      workDirectory: string
    }>,
  run: ConsumerRun = runConsumerInstall,
): FixtureSetReport {
  const { consumersDirectory, workDirectory, ...member } = input
  const names = fixtureNames(consumersDirectory)
  const runs = names.map(name => ({
    name,
    directory: join(consumersDirectory, name),
    report: run({
      ...member,
      fixtureDirectory: join(consumersDirectory, name),
      consumerDirectory: join(workDirectory, name),
    }),
  }))
  const problems = [
    ...setProblems(consumersDirectory, names),
    ...runs.flatMap(({ name, report }) =>
      report.fixture !== undefined && report.fixture.role !== name
        ? [`fixture ${name}: its manifest names the role ${report.fixture.role}`]
        : [],
    ),
  ]
  const fixtures = runs.map(({ name, directory, report }) => summarise(name, directory, report))
  return {
    member: readManifest(member.memberDirectory).name,
    ok: problems.length === 0 && fixtures.every(item => item.ok),
    problems,
    fixtures,
  }
}
