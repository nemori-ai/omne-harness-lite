// The category port `EndpointInspection`: the contract's body contract for category `mcp`, plus
// `inspect` and `launchesLocalCommand` on any JSON tree. All three read the body with the one
// parser of the contract; no rule is repeated here.
import { succeed, type Outcome } from '@omne-harness/operation-result'
import {
  launchesLocalCommand,
  mcpEndpointBodyContract,
  parseEndpointBody,
  type EndpointBodyRejection,
  type EndpointInspection,
} from '@omne-harness/mcp-contract'

export function createInspection(): EndpointInspection {
  return {
    ...mcpEndpointBodyContract(),
    inspect: body => parseEndpointBody(body),
    launchesLocalCommand(body): Outcome<boolean, EndpointBodyRejection> {
      const parsed = parseEndpointBody(body)
      return 'failure' in parsed ? parsed : succeed(launchesLocalCommand(parsed.ok))
    },
  }
}
