#!/usr/bin/env node

/**
 * Offline RFQ Ops chat contract checks.
 *
 * This is intentionally static: it does not need Supabase credentials and it
 * does not mutate a local or remote database.  The migration is discovered by
 * its contract rather than a timestamp so the check remains useful when the
 * migration is rebased.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const SOURCE = readFileSync(join(ROOT, "src", "supabase.ts"), "utf8");
const WORKSPACE_SOURCE = readFileSync(join(ROOT, "src", "rfq-ops-messages.tsx"), "utf8");
const sqlFiles = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql"));

const sqlByFile = sqlFiles.map((name) => ({
  name,
  sql: readFileSync(join(MIGRATIONS, name), "utf8"),
}));

// A new migration must mention the RFQ Ops namespace, both message and
// conversation storage, and the admin/realtime contract.  Older AI and
// supplier-chat migrations consequently cannot accidentally satisfy this test.
const candidates = sqlByFile.filter(({ sql }) =>
  /rfq.{0,40}ops|ops.{0,40}rfq/i.test(sql) &&
  /CREATE\s+TABLE[\s\S]{0,160}message/i.test(sql) &&
  /CREATE\s+TABLE[\s\S]{0,160}conversation/i.test(sql) &&
  /ALTER\s+PUBLICATION\s+supabase_realtime/i.test(sql),
);
assert.equal(candidates.length, 1, `expected exactly one RFQ Ops chat migration, found ${candidates.length}`);
const { name: migrationName, sql } = candidates[0];
const executableSql = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const check = (condition, message) => assert.ok(condition, `${migrationName}: ${message}`);

const tables = [...sql.matchAll(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+public\.([a-z0-9_]+)/gi)].map((match) => match[1]);
const opsTables = tables.filter((table) => /rfq.*ops|ops.*rfq/i.test(table));
const messageTable = opsTables.find((table) => /message/i.test(table));
const conversationTable = opsTables.find((table) => /conversation/i.test(table));
const attachmentTable = opsTables.find((table) => /attachment/i.test(table));
const reservationTable = opsTables.find((table) => /reservation/i.test(table));
check(Boolean(messageTable), "must create a dedicated RFQ Ops message table");
check(Boolean(conversationTable), "must create a dedicated RFQ Ops conversation table");
check(messageTable !== "messages" && messageTable !== "athelia_thread_messages", "Ops messages must be separate from legacy/sourcing AI chat");
check(conversationTable !== "conversations" && conversationTable !== "athelia_threads", "Ops conversations must be separate from legacy/sourcing AI chat");
check(Boolean(attachmentTable), "must create a dedicated immutable attachment relation");
check(Boolean(reservationTable), "must create an upload reservation table");
check(new RegExp(`CREATE\\s+TABLE[\\s\\S]{0,1200}public\\.${reservationTable}[^;]*client_message_id[\\s\\S]{0,500}consumed_at[\\s\\S]{0,500}expires_at`, "i").test(sql), "upload reservations must bind message UUIDs and track consumed/expiry state");

// Append-only means no SQL API grant can update or delete these records.  A
// migration may use one combined REVOKE or one statement per operation.
for (const table of [conversationTable, messageTable, attachmentTable]) {
  const tableRe = new RegExp(`public\\.${table}\\b`, "i");
  check(new RegExp(`ALTER\\s+TABLE\\s+${tableRe.source}[\\s\\S]{0,240}ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i").test(sql), `${table} must have RLS enabled`);
  check(new RegExp(`REVOKE\\s+(?:ALL|UPDATE|DELETE|UPDATE\\s*,\\s*DELETE|DELETE\\s*,\\s*UPDATE)[^;]*ON\\s+(?:TABLE\\s+)?[^;]*${tableRe.source}`, "i").test(sql), `${table} must revoke mutation privileges`);
  check(!new RegExp(`GRANT[^;]*(?:ALL|UPDATE|DELETE)[^;]*ON\\s+(?:TABLE\\s+)?${tableRe.source}`, "i").test(sql), `${table} must not grant update/delete privileges`);
}
check(!/DELETE\s+FROM\s+public\.(?:rfq_ops_(?:messages|conversations|message_attachments)|messages|conversations)\b|\b(?:purge|retention)\b/i.test(executableSql), "chat history must not have purge/expiry behavior");
check(/buyer_profile_id\s*=\s*auth\.uid\(\)|auth\.uid\(\)[^;]{0,180}buyer_profile_id/i.test(sql), "buyer RLS must isolate rows by authenticated buyer");
check(/intools_require_admin\s*\(\s*\)/i.test(sql), "Intools RPCs must invoke intools_require_admin()");

for (const rpc of ["workspace_reserve_ops_upload", "intools_reserve_buyer_upload"]) {
  check(new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${rpc}\\b`, "i").test(sql), `upload reservation RPC ${rpc} must exist`);
}

// Private storage is part of the same contract.  25 MiB is checked in bytes
// because that is what Supabase storage enforces.
check(/INSERT\s+INTO\s+storage\.buckets[\s\S]{0,700}(?:false|public\s*[:=]\s*false)/i.test(sql), "attachment bucket must be private");
check(/26214400|25\s*\*\s*1024\s*\*\s*1024/i.test(sql), "attachment bucket/RPC must enforce a 25 MiB limit");
for (const mime of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) check(new RegExp(mime.replace("/", "\\/"), "i").test(sql), `attachment MIME allowlist must include ${mime}`);
check(/byte_size|file_size_limit/i.test(sql), "attachment byte size must be recorded and bounded");
check(/char_length\s*\(|length\s*\(/i.test(sql), "message body length must be validated");
check(/CREATE\s+POLICY\s+rfq_ops_storage_insert[\s\S]{0,1800}rfq_ops_can_insert_reserved_object/i.test(sql), "Storage INSERT must require a live, unconsumed upload reservation");
check(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.rfq_ops_can_insert_reserved_object[\s\S]{0,900}rfq_ops_upload_reservations[\s\S]{0,500}consumed_at\s+IS\s+NULL[\s\S]{0,250}expires_at\s*>\s*now\s*\(\s*\)/i.test(sql), "reservation guard must verify unconsumed, unexpired state");
check(/CREATE\s+POLICY\s+rfq_ops_storage_delete[\s\S]{0,1400}FOR\s+DELETE[\s\S]{0,1000}rfq_ops_can_delete_reserved_object/i.test(sql), "Storage DELETE must be cancellation-only for unconsumed reservations");
check(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.rfq_ops_can_delete_reserved_object[\s\S]{0,900}rfq_ops_upload_reservations[\s\S]{0,500}consumed_at\s+IS\s+NULL/i.test(sql), "Storage cancellation guard must reject consumed reservations");
check(!/CREATE\s+POLICY\s+rfq_ops_storage_update/i.test(sql), "sent attachment objects must not have a Storage UPDATE policy");
check(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.rfq_ops_prevent_attachment_mutation\b/i.test(sql) && /CREATE\s+TRIGGER\s+rfq_ops_attachments_immutable[\s\S]{0,260}BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+public\.rfq_ops_message_attachments/i.test(sql), "sent attachment rows must be immutable after send");

// Sending must validate content, accept a client UUID, and be replay-safe.
const sendFunctions = [...sql.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.([a-z0-9_]*(?:send|add)[a-z0-9_]*(?:message|chat)[a-z0-9_]*)[\s\S]{0,12000}?\$\$/gi)].map((match) => match[1]);
check(sendFunctions.length > 0, "must expose an RFQ Ops send-message RPC");
check(/client_message_id\s+uuid|p_client_message_id\s+uuid/i.test(sql), "send RPC must accept an idempotency UUID");
check(/ON\s+CONFLICT[\s\S]{0,180}(?:client_message_id|idempotency)/i.test(sql) || /UNIQUE\s*\([^)]*(?:client_message_id|idempotency)/i.test(sql), "send RPC must be idempotent on client UUID");
check(/attachment[s]?[^;]{0,500}(?:count|array_length|jsonb_array_length|25|10)/i.test(sql), "send/attachment RPC must enforce attachment count/size limits");

check(new RegExp(`ALTER\\s+PUBLICATION\\s+supabase_realtime\\s+ADD\\s+TABLE\\s+public\\.${messageTable}`, "i").test(sql), "Ops messages must be in the Supabase Realtime publication");
check(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.[a-z0-9_]*(?:list|get)[a-z0-9_]*(?:message|chat|conversation)/i.test(sql), "must provide paginated message/conversation read RPC");
check(/p_(?:before|cursor|limit)|(?:before|cursor|limit)\s+(?:timestamptz|integer|int)/i.test(sql), "message reads must expose cursor/limit pagination");
check(/\(\s*m\.created_at\s*,\s*m\.id\s*\)\s*<\s*\(/i.test(sql), "message pagination must use a created_at,id tuple cursor");
check(/\(\s*m\.created_at\s*,\s*m\.id\s*\)\s*>\s*\(/i.test(sql), "unread logic must use a created_at,id tuple boundary");
check(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.[a-z0-9_]*(?:unread|read)[a-z0-9_]*/i.test(sql), "must provide unread/read-state RPCs");

// Typed wrappers and the live subscription helper are intentionally checked in
// source too; a sound database contract without a callable client contract is
// not a shipped messaging feature.
for (const typeName of ["RfqOpsConversation", "RfqOpsMessage", "RfqOpsMessageAttachment", "RfqOpsSendMessageInput"]) check(new RegExp(`(?:export\\s+)?type\\s+${typeName}\\b`).test(SOURCE), `src/supabase.ts must export ${typeName}`);
check(/export\s+async\s+function\s+\w*(?:Ops|RfqOps|BuyerMessage|OpsMessage)\w*/.test(SOURCE), "src/supabase.ts must expose typed RFQ Ops API wrappers");
const broadcastMigration = sqlByFile.find(({ sql: candidate }) =>
  /rfq_ops_broadcast_insert/i.test(candidate)
  && /realtime\.broadcast_changes/i.test(candidate)
  && /rfq_ops_can_access_realtime_topic/i.test(candidate),
);
assert.ok(broadcastMigration, "must add a private RFQ Ops Broadcast migration");
assert.ok(/CREATE\s+POLICY\s+rfq_ops_receive_private_broadcast[\s\S]{0,900}realtime\.topic\s*\(\s*\)/i.test(broadcastMigration.sql), "Broadcast receive policy must authorize the RFQ-scoped topic");
check(/config:\s*\{\s*private:\s*true\s*\}/i.test(SOURCE) && /\.on\(\s*["']broadcast["']\s*,\s*\{\s*event:\s*["']INSERT["']/i.test(SOURCE) && /export\s+async\s+function\s+subscribeTo(?:RfqOps|OpsRfq|Ops)Messages/.test(SOURCE), "src/supabase.ts must expose an authorized private Broadcast subscription helper");
check(/subscribeToRfqOpsMessages\s*\([\s\S]{0,1500}mergeMessage[\s\S]{0,900}getRfqOpsMessage/i.test(WORKSPACE_SOURCE), "Messages workspace must render a Broadcast row immediately and enrich it without refresh");
check(!/setInterval\s*\(/.test(WORKSPACE_SOURCE), "Messages workspace must not poll or replace live threads");
check(/sender_role:\s*["']buyer["']\s*\|\s*["']ops["']/.test(SOURCE) && /sender_role:\s*incoming\.sender_kind/.test(WORKSPACE_SOURCE) && /item\.sender_role\s*===\s*["']buyer["']/.test(WORKSPACE_SOURCE), "stored and Realtime message roles must share one buyer-versus-Operations display mapping");
check(/export\s+type\s+RfqOpsCursor\s*=\s*Readonly<\{\s*created_at:\s*string;\s*id:\s*string\s*\}>/.test(SOURCE), "typed cursor must include created_at and id");
const rfqOpsWrapperRpcNames = [...SOURCE.matchAll(/(?:rpc|intoolsRpc)(?:<[^>]+>)?\(\s*\"([a-z0-9_]+)\"/g)]
  .map((match) => match[1])
  .filter((rpc) => /(?:ops|buyer_(?:conversation|message)|buyer_read|buyer_unread)/i.test(rpc));
for (const rpc of new Set(rfqOpsWrapperRpcNames)) {
  assert.ok(sqlByFile.some(({ sql: migrationSql }) => new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${rpc}\\b`, "i").test(migrationSql)), `typed wrapper RPC ${rpc} must exist in an additive migration`);
}

const serverSource = readFileSync(join(ROOT, "server", "index.mjs"), "utf8");
for (const rpc of [
  "intools_reserve_buyer_upload",
  "intools_get_buyer_conversation",
  "intools_list_buyer_conversations",
  "intools_list_buyer_messages",
  "intools_send_buyer_message",
  "intools_mark_buyer_conversation_read",
  "intools_get_buyer_unread_count",
]) {
  check(new RegExp(`\\\"${rpc}\\\"`).test(serverSource), `server local Intools allowlist must include ${rpc}`);
}

console.log(`ok - ${migrationName}: RFQ Ops append-only, private-attachment, RLS, pagination, unread, idempotency, Realtime, and typed-client contracts`);
