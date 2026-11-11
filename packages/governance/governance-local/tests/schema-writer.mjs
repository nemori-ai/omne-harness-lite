export default {
  participant: 'governance.activation',
  protocol: 'fixture-governance-schema/1',
  execute(_facts, port) {
    const rows = port.execute('SELECT scope_key FROM gc_scope LIMIT 1', []).rows
    if (rows.length === 0) {
      port.execute(
        "INSERT INTO gc_scope VALUES ('scope','tenant-a','deployment','service','tenant','tenant-a','epoch','open',0,0,'empty',NULL)",
        [],
      )
    }
    const pending = port.execute(
      "SELECT operation_id FROM gc_operation INDEXED BY gc_operation_pending WHERE scope_key = ? AND state IN ('accepted','submitted') AND (command_owner,principal_ref,operation_id) > (?,?,?) ORDER BY command_owner,principal_ref,operation_id LIMIT 100",
      ['scope', '', '', ''],
    ).rows
    return {
      kind: 'participated',
      response: { existing: rows.length === 1, pending: pending.length },
    }
  },
}
