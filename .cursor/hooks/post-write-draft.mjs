#!/usr/bin/env node
/**
 * Cursor Post Write / afterFileEdit — ADR draft (approach 1) + optional nudge (approach 2).
 *
 * Product flow (Post-only, Cloud):
 *   Post(research) → suggest inject
 *   Post(Write/edit) → approach 1: enqueue only (sqlew save + pending.json; NO DB/MCP set)
 *                    → approach 2: short additional_context when no draft yet
 *   stop             → flush-queue / on-stop (upsert)
 *
 * Event routing:
 *   - afterFileEdit → side-effect enqueue only (stdout cannot inject on this event)
 *   - postToolUse matcher Write → enqueue + optional additional_context
 *
 * Gates: noise paths, path dedupe (afterFileEdit+Write double-fire), once-per-conversation.
 * Fail-open everywhere.
 *
 * Marker mode: SQLEW_HOOK_TEST_MARKER=1
 *   postToolUse → SQLEW_HOOK_MARKER_WRITE_<id>
 *   afterFileEdit → {} (no inject)
 */

import {
  readStdinJson,
  emptyPostToolUse,
  postToolUseContext,
} from './lib/io.mjs';
import { extractFilePath, toRelativePath, isNoisePath } from './lib/paths.mjs';
import {
  hasConversationDraft,
  hasPathDraft,
  markConversationDraft,
  markPathDraft,
} from './lib/draft-gate.mjs';
import {
  runApproach1Draft,
  approach2Prompt,
} from './lib/save-draft.mjs';
import { buildTestMarker } from './lib/suggest.mjs';

/**
 * @param {Record<string, unknown>} input
 * @returns {'afterFileEdit' | 'postToolUse'}
 */
function detectEvent(input) {
  const named = String(
    input.hook_event_name || input.hookEventName || input.cursor_hook_event || '',
  );
  if (/afterFileEdit/i.test(named)) return 'afterFileEdit';
  if (/postToolUse/i.test(named)) return 'postToolUse';

  // Heuristic: afterFileEdit payloads expose file_path + edits without tool_name
  if (
    (typeof input.file_path === 'string' || typeof input.filePath === 'string') &&
    Array.isArray(input.edits) &&
    !input.tool_name
  ) {
    return 'afterFileEdit';
  }
  return 'postToolUse';
}

async function main() {
  try {
    const input = await readStdinJson();
    const event = detectEvent(input);
    const toolName = String(input.tool_name || '');

    // postToolUse: only Write (matcher should already filter)
    if (event === 'postToolUse' && toolName && !/^Write$/i.test(toolName)) {
      emptyPostToolUse();
      return;
    }

    // Marker mode — prove Write inject path without DB
    if (process.env.SQLEW_HOOK_TEST_MARKER === '1') {
      if (event === 'postToolUse') {
        const id = process.env.SQLEW_HOOK_MARKER_ID || 'write';
        postToolUseContext(
          process.env.SQLEW_HOOK_MARKER_ID
            ? `SQLEW_HOOK_MARKER_WRITE_${id}`
            : buildTestMarker().replace('SQLEW_HOOK_MARKER_', 'SQLEW_HOOK_MARKER_WRITE_'),
        );
        return;
      }
      emptyPostToolUse();
      return;
    }

    const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
    const conversationId = String(
      input.conversation_id || input.session_id || '',
    );
    const filePath = extractFilePath(input);
    const relPath = toRelativePath(filePath, cwd) || filePath;

    if (!filePath || isNoisePath(relPath || filePath)) {
      emptyPostToolUse();
      return;
    }

    // Once-per-conversation first-write gate (drafted or already nudged)
    if (conversationId && hasConversationDraft(cwd, conversationId)) {
      emptyPostToolUse();
      return;
    }

    // Path dedupe after a prior attempt on this path (afterFileEdit + Write double-fire)
    if (conversationId && hasPathDraft(cwd, conversationId, relPath)) {
      // Sibling event already handled this path; if still no conversation draft,
      // allow postToolUse approach-2 only (skip re-running save/enqueue).
      const approach2Enabled = process.env.SQLEW_HOOK_APPROACH2 !== '0';
      if (event === 'postToolUse' && approach2Enabled) {
        if (conversationId) {
          markConversationDraft(cwd, conversationId, {
            file: relPath,
            via: 'approach2',
          });
        }
        postToolUseContext(approach2Prompt(relPath));
        return;
      }
      emptyPostToolUse();
      return;
    }

    if (conversationId) {
      markPathDraft(cwd, conversationId, relPath);
    }

    const result = await runApproach1Draft(input, { filePath, relPath });

    if (result.drafted) {
      if (conversationId) {
        markConversationDraft(cwd, conversationId, {
          key: result.draft.key,
          file: relPath,
          via: result.save.acted ? 'save' : 'enqueue-draft',
        });
      }
      emptyPostToolUse();
      return;
    }

    // Approach 2 — postToolUse only, when enqueue did not act
    const approach2Enabled = process.env.SQLEW_HOOK_APPROACH2 !== '0';
    if (event === 'postToolUse' && approach2Enabled) {
      if (conversationId) {
        markConversationDraft(cwd, conversationId, {
          file: relPath,
          via: 'approach2',
        });
      }
      postToolUseContext(approach2Prompt(relPath));
      return;
    }

    emptyPostToolUse();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sqlew cursor post-write-draft] ${message}`);
    emptyPostToolUse();
  }
}

await main();
