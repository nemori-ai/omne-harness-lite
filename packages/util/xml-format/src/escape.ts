/**
 * XML escaping and name validation.
 *
 * Content escaping replaces `&`, `<` and `>`; attribute escaping additionally
 * replaces both quote characters. Names are restricted to a conservative
 * subset of the XML Name production so that no schema, option or data key can
 * break out of the markup.
 */

const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/

/** Escape text for use as element content. */
export function escapeXmlContent(text: string): string {
  assertXmlCharacters(text)
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** XML 1.0 fifth edition Char; supplementary noncharacters remain legal. */
function assertXmlCharacters(text: string): void {
  for (const char of text) {
    const point = char.codePointAt(0)
    if (
      point === undefined ||
      !(
        point === 0x09 ||
        point === 0x0a ||
        point === 0x0d ||
        (point >= 0x20 && point <= 0xd7ff) ||
        (point >= 0xe000 && point <= 0xfffd) ||
        (point >= 0x10000 && point <= 0x10ffff)
      )
    ) {
      throw new TypeError(`illegal XML 1.0 character: ${JSON.stringify(char)}`)
    }
  }
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
