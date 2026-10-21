#!/usr/bin/env node
/**
 * Optional beforeSubmitPrompt fallback for Cursor — NOT for Cloud.
 *
 * Product lock (2026-10-21): Post-only inject. Cloud verifier: additional_context
 * from this hook does NOT reach the model (BSP_SEEN=no). Kept only as an IDE
 * leftover; do not rely on it for Cloud Agents.
 *
 * Gating (avoid spamming every message):
 * - Only inject when `.sqlew/cursor-pending-inject.json` exists (written by
 *   post-research-suggest), OR SQLEW_HOOK_BSP_PENDING=1 / test marker mode
 * - At most once per conversation_id (marker file under .sqlew/cursor-bsp-injected/)
 *
 * Always returns { continue: true } (fail-open; never block prompts).
 */

import {
  readStdinJson,
  beforeSubmitContinue,
  readPendingInject,
  clearPendingInject,
  hasInjectedConversation,
  markInjectedConversation,
} from './lib/io.mjs';
import { buildTestMarker } from './lib/suggest.mjs';

async function main() {
  try {
    const input = await readStdinJson();
    const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
    const conversationId = String(
      input.conversation_id || input.session_id || '',
    );

    // Explicit env gate for forced BSP inject (rare; e.g. local IDE experiments)
    const envPending = process.env.SQLEW_HOOK_BSP_PENDING === '1';
    const testMarker = process.env.SQLEW_HOOK_TEST_MARKER === '1';

    if (conversationId && hasInjectedConversation(cwd, conversationId)) {
      beforeSubmitContinue();
      return;
    }

    let context = '';

    if (testMarker && envPending) {
      context = buildTestMarker();
    } else {
      const pending = readPendingInject(cwd);
      if (pending?.additional_context) {
        context = String(pending.additional_context);
        clearPendingInject(cwd);
      } else if (envPending && testMarker) {
        context = buildTestMarker();
      }
    }

    if (!context) {
      beforeSubmitContinue();
      return;
    }

    if (conversationId) {
      markInjectedConversation(cwd, conversationId);
    }

    beforeSubmitContinue(context);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sqlew cursor before-submit-fallback] ${message}`);
    beforeSubmitContinue();
  }
}

await main();
