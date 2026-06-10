// ---------------------------------------------------------------------------
// Byte-aware message trimming for OpenCode Go proxy payload limits
// ---------------------------------------------------------------------------
// The OpenCode Go API proxy returns HTTP 500 when the JSON request body
// exceeds ~400 KB.  In long chat sessions the accumulated message history
// plus tool definitions can push past that limit even though the model's
// token context window (e.g. 1M tokens for deepseek-v4-pro) is far from
// full.
//
// This module provides `trimApiMessages()` which prunes older conversation
// turns while preserving:
//   - The system prompt (first message)
//   - Full conversation turns (user → assistant → tool results)
//   - Tool-call / tool-result atomicity
//
// The caller specifies a byte budget for the *messages* portion of the
// payload (excluding tools, model name, temperature, etc.).  A safe
// per-endpoint budget is exported as constants.
// ---------------------------------------------------------------------------

import type { OpenCodeEndpointKind } from "./openCodeAuth";

// ---------------------------------------------------------------------------
// Byte budgets
// ---------------------------------------------------------------------------

/**
 * Hard uncompressed payload limit enforced by the safety net in
 * streaming.ts.  The OpenCode Go proxy returns HTTP 500 when the raw
 * request body exceeds ~400 KB.
 *
 * **This limit is no longer the primary constraint** — streaming.ts
 * applies gzip compression before sending, which reduces JSON payloads
 * 5-10x.  This value is only used as a last-resort safety net for the
 * (compressed) payload.
 */
export const MAX_PAYLOAD_BYTES = 350_000;

/**
 * Generous message byte budgets for the trimmer.
 *
 * With gzip compression in streaming.ts, the proxy byte limit is no
 * longer the bottleneck.  We set budgets high enough that trimming
 * almost never triggers in normal use (~800 KB — roughly 200K tokens of
 * conversation history).  This is a "soft" budget; the hard safety net
 * is the (compressed) MAX_PAYLOAD_BYTES check in streaming.ts.
 *
 * The model's actual token context window (e.g. 1M for deepseek-v4-pro)
 * remains the ultimate ceiling, enforced by VS Code via
 * `advertisedMaxInputTokens`.
 */
const MESSAGE_BUDGET_CHAT_COMPLETIONS = 800_000;
const MESSAGE_BUDGET_MESSAGES = 800_000;
const MESSAGE_BUDGET_RESPONSES = 800_000;
const MESSAGE_BUDGET_GOOGLE = 800_000;

/**
 * Map endpoint kind → byte budget for the messages array (pre-compression).
 */
export const MESSAGE_BYTE_BUDGET: Record<OpenCodeEndpointKind, number> = {
  "chat-completions": MESSAGE_BUDGET_CHAT_COMPLETIONS,
  messages: MESSAGE_BUDGET_MESSAGES,
  responses: MESSAGE_BUDGET_RESPONSES,
  google: MESSAGE_BUDGET_GOOGLE,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimum structural contract that a chat message must satisfy for the
 * trimmer to operate.  The caller's concrete message type (e.g.
 * extension.ts's `ApiMessage`) typically carries extra fields — those are
 * preserved because we return the original objects, not clones.
 */
interface TrimmableMessage {
  role: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Trim `messages` so the JSON-serialized size of the messages array stays
 * within `maxMessageBytes`.  Always preserves the first message (system
 * prompt).  Drops the oldest complete conversation turns first — a turn is
 * everything from a user message up to (but not including) the next user
 * message.  This guarantees tool-call / tool-result pairs are never broken.
 *
 * The function is generic: it accepts and returns the caller's own message
 * type `T` as long as it has at least `role`, `tool_call_id`, and
 * `tool_calls`.
 *
 * @returns A new array with the same message objects (not cloned).
 *          If no trimming is needed the original array is returned.
 */
export function trimApiMessages<T extends TrimmableMessage>(
  messages: T[],
  maxMessageBytes: number,
): T[] {
  // ------------------------------------------------------------------
  // Fast path — short conversations don't need trimming.
  // ------------------------------------------------------------------
  if (messages.length <= 2) {
    return messages;
  }

  const sizes = messages.map((m) => JSON.stringify(m).length);
  const totalSize = sizes.reduce((a, b) => a + b, 0);

  if (totalSize <= maxMessageBytes) {
    return messages;
  }

  // ------------------------------------------------------------------
  // Find user-message boundaries.  The first message is always a user
  // message (the system prompt).  Subsequent user messages mark the
  // start of new conversation turns.
  // ------------------------------------------------------------------
  const userIndices: number[] = [0]; // system prompt
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === "user") {
      userIndices.push(i);
    }
  }

  // ------------------------------------------------------------------
  // Always keep the system prompt.
  // ------------------------------------------------------------------
  const keep = new Set<number>([0]);
  let usedBytes = sizes[0];

  // ------------------------------------------------------------------
  // Phase 1 — Guaranteed minimum context.
  // Always keep the last MIN_TURNS conversation turns, even if they
  // exceed the byte budget.  This ensures the model always has enough
  // recent context to give coherent answers.  The hard byte limit is
  // enforced by the safety net in streaming.ts.
  // ------------------------------------------------------------------
  const MIN_TURNS = 2;
  const totalTurns = userIndices.length - 1; // excluding system prompt
  const guaranteedTurns = Math.min(MIN_TURNS, totalTurns);

  for (let ui = userIndices.length - 1; ui >= userIndices.length - guaranteedTurns; ui--) {
    const turnStart = userIndices[ui];
    const turnEnd =
      ui + 1 < userIndices.length ? userIndices[ui + 1] : messages.length;

    let turnSize = 0;
    for (let i = turnStart; i < turnEnd; i++) {
      turnSize += sizes[i];
    }

    for (let i = turnStart; i < turnEnd; i++) {
      keep.add(i);
    }
    usedBytes += turnSize;
  }

  // ------------------------------------------------------------------
  // Phase 2 — Fill remaining budget with older turns (newest first).
  // Walk backwards from the oldest guaranteed turn, adding additional
  // turns as long as they fit within the byte budget.
  // ------------------------------------------------------------------
  const startUi = userIndices.length - 1 - guaranteedTurns;
  for (let ui = startUi; ui >= 1; ui--) {
    const turnStart = userIndices[ui];
    const turnEnd =
      ui + 1 < userIndices.length ? userIndices[ui + 1] : messages.length;

    let turnSize = 0;
    for (let i = turnStart; i < turnEnd; i++) {
      turnSize += sizes[i];
    }

    if (usedBytes + turnSize <= maxMessageBytes) {
      for (let i = turnStart; i < turnEnd; i++) {
        keep.add(i);
      }
      usedBytes += turnSize;
    } else {
      // This turn doesn't fit — and all older turns are even less
      // recent, so they don't fit either.
      break;
    }
  }

  // ------------------------------------------------------------------
  // Reconstruct in original order.
  // ------------------------------------------------------------------
  const kept: T[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (keep.has(i)) {
      kept.push(messages[i]);
    }
  }

  return kept;
}
