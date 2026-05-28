import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { SlideSplitter, type SplitEvent } from "./slideSplitter";

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
export const MAX_OUTPUT_TOKENS = Number(process.env.ANTHROPIC_MAX_OUTPUT_TOKENS) || 32000;

export type UsageEvent = {
  type: "usage";
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  stop_reason: string;
};

export type SlideStreamEvent = SplitEvent | UsageEvent;

export type SystemTextBlock = Anthropic.Messages.TextBlockParam;
export type UserContentBlock = Anthropic.Messages.ContentBlockParam;

export interface StreamSlidesArgs {
  client?: Anthropic;
  model?: string;
  system: SystemTextBlock[];
  userContent: UserContentBlock[];
  abortSignal?: AbortSignal;
  maxTokens?: number;
}

function ensureClient(client?: Anthropic): Anthropic {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY が環境変数に設定されていません");
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/**
 * Streams Claude's response through a marker-driven slide splitter.
 *
 * Yields:
 *   - slide_start / slide_delta / slide_done / between (from SlideSplitter)
 *   - usage (one final event with token counts and stop_reason)
 */
export async function* streamSlides(
  args: StreamSlidesArgs,
): AsyncGenerator<SlideStreamEvent, void, void> {
  const client = ensureClient(args.client);
  const model = args.model || DEFAULT_MODEL;
  const maxTokens = args.maxTokens ?? MAX_OUTPUT_TOKENS;

  const stream = client.messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system: args.system,
      messages: [{ role: "user", content: args.userContent }],
    },
    { signal: args.abortSignal },
  );

  const splitter = new SlideSplitter();

  for await (const evt of stream) {
    if (evt.type === "content_block_delta" && evt.delta.type === "text_delta") {
      const events = splitter.feed(evt.delta.text);
      for (const e of events) yield e;
    }
  }

  for (const e of splitter.flush()) yield e;

  const final = await stream.finalMessage();
  yield {
    type: "usage",
    input_tokens: final.usage?.input_tokens ?? 0,
    output_tokens: final.usage?.output_tokens ?? 0,
    cache_read_input_tokens: final.usage?.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: final.usage?.cache_creation_input_tokens ?? 0,
    stop_reason: final.stop_reason ?? "end_turn",
  };
}
