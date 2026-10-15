import { expect, it } from "vitest"

it("exports the accepted schema provider entry points", async () => {
  const root = (await import("@omne-harness/schema-provider")) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(
    [
      "close",
      "createSchemaProvider",
      "defineSchema",
      "jsonSchemaDefinition",
      "lease",
      "refresh",
      "validate",
      "zodDefinition",
    ].sort(),
  )
})
