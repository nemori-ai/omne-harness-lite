// The `gh` stand-in for running dispatch-cli end to end against one card. It answers the reads of
// an admission capture of `owner/repo#7` (Issue, comments, dependencies, parent and the Project
// GraphQL queries), `gh api user`, and the writes of `post` and `bind`. The card lives in a JSON
// state file, so writes stay visible across runs; every call is appended to `state.calls`. Any
// other call exits 94, so a test sees an unexpected request as a failed command.
import { readFileSync, writeFileSync } from 'node:fs'

export type DispatchGhComment = {
  id: number
  html_url: string
  body: string
  user: { login: string }
  updated_at: string
}
export type DispatchGhState = {
  login: string
  body: string
  labels: string[]
  milestone: string
  comments: DispatchGhComment[]
  calls: string[][]
}

export function writeDispatchGhState(path: string, state: DispatchGhState): void {
  writeFileSync(path, JSON.stringify(state))
}
export function readDispatchGhState(path: string): DispatchGhState {
  return JSON.parse(readFileSync(path, 'utf8')) as DispatchGhState
}

/** The stand-in script; pass it to `writeGh`. `statePath` is the state file it reads and writes. */
export function dispatchGhScript(statePath: string): string {
  return String.raw`#!/usr/bin/env node
import { readFileSync, writeFileSync, writeSync } from 'node:fs'
const STATE = ${JSON.stringify(statePath)}
const URL = 'https://github.com/owner/repo/issues/7'
const state = JSON.parse(readFileSync(STATE, 'utf8'))
const args = process.argv.slice(2)
state.calls.push(args)
function answer(value, code = 0) {
  writeFileSync(STATE, JSON.stringify(state))
  writeSync(1, JSON.stringify(value))
  process.exitCode = code
}
const page = nodes => ({ nodes, pageInfo: { hasNextPage: false, endCursor: null } })
function main() {
  if (args[1] === 'graphql') {
    const query = (args.find(a => a.startsWith('query=')) || '').slice(6)
    const id = (args.find(a => a.startsWith('id=')) || '').slice(3)
    if (query.includes('projectItems('))
      return answer({ data: { node: { id, url: URL, projectItems: page([{ id: 'ITEM_7', project: { id: 'P_1' } }]) } } })
    if (query.includes('... on ProjectV2Item{'))
      return answer({ data: { node: { id, project: { id: 'P_1' }, fieldValues: page([{ __typename: 'ProjectV2ItemFieldSingleSelectValue', name: 'Ready', field: { id: 'F_stage' } }]) } } })
    if (query.includes(' fields('))
      return answer({ data: { node: { id, fields: page([{ __typename: 'ProjectV2SingleSelectField', id: 'F_stage' }]) } } })
    return answer({ unexpected: args }, 94)
  }
  const method = args[2]
  const path = args.find(a => a === 'user' || a.startsWith('repos/')) || ''
  const input = args.indexOf('--input')
  const body = input >= 0
    ? JSON.parse(readFileSync(args[input + 1], 'utf8')).body
    : (args.find(a => a.startsWith('body=')) || '').slice(5)
  const issue = () => ({
    number: 7, node_id: 'I_7', html_url: URL, state: 'open', updated_at: '2026-10-26T00:00:00Z',
    body: state.body, labels: state.labels.map(name => ({ name })), milestone: { title: state.milestone },
  })
  if (method === 'GET' && path === 'user') return answer({ login: state.login })
  if (method === 'GET' && path === 'repos/owner/repo/issues/7') return answer(issue())
  if (method === 'PATCH' && path === 'repos/owner/repo/issues/7') {
    state.body = body
    return answer(issue())
  }
  if (method === 'GET' && path.startsWith('repos/owner/repo/issues/7/comments?'))
    return answer(new URLSearchParams(path.split('?')[1]).get('page') === '1' ? state.comments : [])
  if (method === 'GET' && path.startsWith('repos/owner/repo/issues/7/dependencies/blocked_by?'))
    return answer([])
  if (method === 'GET' && path === 'repos/owner/repo/issues/7/parent')
    return answer({ status: '404', message: 'No parent issue found' }, 1)
  if (method === 'POST' && path === 'repos/owner/repo/issues/7/comments') {
    const id = 100 + state.comments.length
    const comment = { id, html_url: URL + '#issuecomment-' + id, body, user: { login: state.login }, updated_at: '2026-10-27T00:00:00Z' }
    state.comments.push(comment)
    return answer(comment)
  }
  const edited = /^repos\/owner\/repo\/issues\/comments\/(\d+)$/.exec(path)
  const comment = edited && state.comments.find(item => item.id === Number(edited[1]))
  if (comment && method === 'PATCH') {
    comment.body = body
    return answer(comment)
  }
  if (comment && method === 'GET') return answer(comment)
  return answer({ unexpected: args }, 94)
}
main()
`
}
