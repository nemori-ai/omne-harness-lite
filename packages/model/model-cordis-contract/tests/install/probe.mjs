const specifiers = JSON.parse(process.argv[2])
const entries = []
for (const specifier of specifiers) {
  const resolved = import.meta.resolve(specifier)
  const namespace = await import(specifier)
  entries.push({ specifier, resolved, exports: Object.keys(namespace).sort() })
}
console.log(JSON.stringify(entries))
