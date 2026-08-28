#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(join(root, "supabase/migrations/20260830120000_unified_notifications.sql"), "utf8");
const retiredReminder = readFileSync(join(root, "supabase/migrations/20260828170000_retire_rfq_ops_reply_reminders.sql"), "utf8");
const config = readFileSync(join(root, "supabase/config.toml"), "utf8");
const client = readFileSync(join(root, "src/supabase.ts"), "utf8");
const bell = readFileSync(join(root, "src/notification-bell.tsx"), "utf8");
const server = readFileSync(join(root, "server/index.mjs"), "utf8");
const check = (condition, message) => assert.ok(condition, message);

check(!/c\.case_no/.test(migration), "notification migration must not read case_no from rfq_ops_conversations");
check(/ADD COLUMN IF NOT EXISTS entity_type text[\s\S]{0,90}entity_id uuid/.test(migration), "notifications must retain durable entity routing context");
check(/CREATE OR REPLACE FUNCTION public\.notification_emit\b/.test(migration), "guarded notification emitter is required");
check(/CREATE OR REPLACE FUNCTION public\.notification_emit_to_admins\b[\s\S]{0,900}p\.role = 'admin'/.test(migration), "Ops notifications must be emitted per administrator");
check(/CREATE TRIGGER notification_emit_rfq_ops_message_after_insert/.test(migration), "RFQ Ops messages must emit durable notifications");
check(/CREATE TRIGGER notification_emit_invoice_status_after_update/.test(migration), "invoice state changes must notify through the durable ledger");
check(/realtime\.send\([\s\S]{0,300}'notification_changed'[\s\S]{0,200}'user:' \|\| NEW\.profile_id::text \|\| ':notifications', true/.test(migration), "database Broadcast must use a private recipient topic");
check(/CREATE POLICY notification_broadcast_receive_self ON realtime\.messages FOR SELECT TO authenticated[\s\S]{0,220}realtime\.topic\(\) = 'user:' \|\| auth\.uid\(\)::text \|\| ':notifications'/.test(migration), "Realtime RLS must restrict a user to their own topic");
check(/CREATE OR REPLACE FUNCTION public\.intools_mark_notifications_read\b/.test(migration), "Intools must have a guarded read mutation RPC");
check(/export async function subscribeToNotifications\b[\s\S]{0,1000}config: \{ private: true \}/.test(client), "React must subscribe on a private notification channel");
check(/realtime\.setAuth\(accessToken\)/.test(client), "Realtime channel must receive the current access token");
check(!/postgres_changes/.test(bell), "notification bell must not use Postgres Changes");
check(/Mark all as read/.test(bell) && /markAllIntoolsNotificationsRead/.test(bell), "bell must support recipient-scoped mark all read");
check(/"intools_mark_notifications_read"/.test(server), "local Intools seam must allow the guarded read RPC");
check(/UPDATE public\.rfq_ops_reply_reminders[\s\S]{0,500}resolved_at = COALESCE\(resolved_at, now\(\)\)/.test(retiredReminder), "outstanding reply reminders must be made inert");
check(/REVOKE EXECUTE ON FUNCTION public\.rfq_ops_claim_due_reply_reminders/.test(retiredReminder), "reminder dispatcher must lose database access");
check(/deployed dispatcher is deleted during release/.test(retiredReminder), "legacy reminder scheduler must be retired through dispatcher deletion");
check(!/rfq-ops-reminder-dispatch/.test(config), "retired reminder function must not remain in local function config");

console.log("ok - unified notification ledger, private Broadcast, routing, and per-recipient read contracts");
