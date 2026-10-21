#!/usr/bin/env node
/**
 * Cursor postToolUse hook — Grep / WebSearch / WebFetch
 *
 * Primary Cloud Agent path: return { additional_context } with a compact
 * Related Context block from sqlew suggest (CLI + MCP by_context).
 *
 * Fail-open: CLI/MCP errors → empty object (never block the agent).
 *
 * Marker mode (no DB): SQLEW_HOOK_TEST_MARKER=1
 *   → injects SQLEW_HOOK_MARKER_<uuid>
 *
 * Cloud notes:
 * - Command hooks only (no prompt-based hooks).
 * - beforeMCPExecution is not available on Cloud — do not depend on it.
 * - Validated: postToolUse additional_context delivers on Cloud Agents.
 */

import {
  readStdinJson,
  emptyPostToolUse,
  postToolUseContext,
  writePendingInject,
} from './lib/io.mjs';
import { buildAdditionalContext } from './lib/suggest.mjs';

async function main() {
  try {
    const input = await readStdinJson();
    const toolName = String(input.tool_name || '');

    // Matcher should already filter, but defend in-script for direct runs.
    if (toolName && !/^(Grep|WebSearch|WebFetch)$/i.test(toolName)) {
      emptyPostToolUse();
      return;
    }

    const additional = await buildAdditionalContext(input);
    if (!additional) {
      emptyPostToolUse();
      return;
    }

    // Best-effort pending file for optional beforeSubmitPrompt fallback (IDE).
    // Cloud: beforeSubmitPrompt additional_context does NOT deliver (2026-10-21).
    const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
    const conversationId = String(
      input.conversation_id || input.session_id || '',
    );
    writePendingInject(cwd, {
      conversation_id: conversationId || undefined,
      additional_context: additional,
      written_at: new Date().toISOString(),
    });

    postToolUseContext(additional);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sqlew cursor post-research-suggest] ${message}`);
    emptyPostToolUse();
  }
}

await main();
