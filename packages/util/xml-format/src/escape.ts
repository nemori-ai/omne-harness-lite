/**
 * XML escaping and name validation.
 *
 * Content escaping replaces `&`, `<` and `>`; attribute escaping additionally
 * replaces both quote characters. Names are restricted to a conservative
 * subset of the XML Name production so that no schema, option or data key can
 * break out of the markup.
 */

const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.\-]*$/

/** Escape text for use as element content. */
export function escapeXmlContent(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** Escape text for use inside a double- or single-quoted attribute value. */
export function escapeXmlAttribute(text: string): string {
  return escapeXmlContent(text).replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

/** Whether `name` is accepted as an element or attribute name by this package. */
export function isXmlName(name: string): boolean {
  return XML_NAME.test(name)
}

/** Return `name` when it is a valid XML name; otherwise throw naming its role. */
export function assertXmlName(name: string, role: string): string {
  if (!isXmlName(name)) {
    throw new Error(`invalid XML ${role} name: ${JSON.stringify(name)}`)
  }
  return name
}
