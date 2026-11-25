import { savedLoginProof, savedTenant } from '../../r9/support.ts'

export type CanvasReply = Readonly<{
  status: number
  text: string
  outcome: string
  body: Record<string, any>
}>

/** One call of `canvas/v1/<operation>` as the login a client state saved, for its own tenant unless told. */
export async function canvasCall(
  port: number,
  home: string,
  operation: string,
  body: Record<string, unknown>,
  tenant = savedTenant(home),
): Promise<CanvasReply> {
  const response = await fetch(`http://127.0.0.1:${String(port)}/api/canvas/v1/${operation}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${savedLoginProof(home)}`,
      'omne-message-id': `m-${operation}`,
    },
    body: JSON.stringify({ tenant, ...body }),
  })
  const text = await response.text()
  const json = JSON.parse(text) as { outcome: string; body?: Record<string, any> }
  return { status: response.status, text, outcome: json.outcome, body: json.body ?? {} }
}

/** The names of the kinds canvas/v1 lists, each with how its reference is written. */
export async function kindsOf(port: number, home: string): Promise<Record<string, string>> {
  const read = await canvasCall(port, home, 'kinds', {})
  if (read.outcome !== 'succeeded') throw new Error(read.text)
  const kinds = read.body['kinds'] as { kind: string; name: string; reference?: string }[]
  return Object.fromEntries(kinds.map(kind => [kind.name, kind.reference ?? kind.kind]))
}
