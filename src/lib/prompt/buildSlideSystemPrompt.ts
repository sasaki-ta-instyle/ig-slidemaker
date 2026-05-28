import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { Template } from "../templates/registry";
import type { ImageBankEntry } from "../media/imageBank";
import { SLIDE_OUTPUT_CONTRACT } from "./slide-output-contract";

export type SystemBlock = Anthropic.Messages.TextBlockParam;

export interface BuildSlideSystemPromptArgs {
  template: Template;
  designMd: string;
  imageBank: ImageBankEntry[];
  slideCountHint: number;
  userInstruction?: string;
}

/**
 * Assemble the system prompt blocks for a slide-generation call.
 *
 * Order matters: large, stable inputs come first so prompt caching can hit
 * (template shell + design.md), and volatile / per-request inputs (image bank,
 * user instruction) come last.
 */
export function buildSlideSystemPrompt(
  args: BuildSlideSystemPromptArgs,
): SystemBlock[] {
  const { template, designMd, imageBank, slideCountHint, userInstruction } = args;

  const slideSamples = Object.entries(template.slides)
    .map(([k, v]) => `<!-- SAMPLE:${k} -->\n${v}`)
    .join("\n\n");

  const imageBankPayload = imageBank.map((e) => ({
    id: e.id,
    width: e.width,
    height: e.height,
    sourceType: e.sourceType,
    sourcePage: e.sourcePage,
    contentDescription: e.contentDescription,
  }));

  const blocks: SystemBlock[] = [
    {
      type: "text",
      text: SLIDE_OUTPUT_CONTRACT,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: "TEMPLATE_META\n\n" + JSON.stringify(template.meta, null, 2),
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text:
        "SHELL_HEAD (provided by server, do not reproduce)\n\n" +
        template.shellHead,
    },
    {
      type: "text",
      text:
        "SHELL_TAIL (provided by server, do not reproduce)\n\n" +
        template.shellTail,
    },
    {
      type: "text",
      text: "SLIDE TEMPLATES (mimic structure exactly)\n\n" + slideSamples,
    },
    {
      type: "text",
      text: "DESIGN SYSTEM (Liquid Glass)\n\n" + designMd,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text:
        "IMAGE BANK\n\n" +
        JSON.stringify(imageBankPayload, null, 2) +
        "\n\nUse these images by writing <img data-bank-id=\"<id>\">. Do not invent IDs not in this list.",
    },
  ];

  if (userInstruction && userInstruction.trim().length > 0) {
    blocks.push({
      type: "text",
      text: "ADDITIONAL INSTRUCTIONS\n\n" + userInstruction.trim(),
    });
  }

  blocks.push({
    type: "text",
    text: `SLIDE COUNT HINT: aim for ${slideCountHint} slides (±20%).`,
  });

  return blocks;
}
