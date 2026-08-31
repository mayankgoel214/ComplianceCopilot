import { z } from "zod";
import { getModelBaseUrl } from "./endpoint";

import { AI_CONFIG, getGeminiApiKey } from "./config";
import type { Trace } from "../telemetry/trace";
import { zodToGeminiSchema, type GeminiSchema } from "./zod-to-gemini";

/**
 * One place where text generation happens.
 *
 * Everything that asks the model for structured output goes through
 * `generateStructured`, which validates the reply against a zod schema before
 * any caller sees it. An LLM that returns almost-valid JSON is the normal case,
 * not the exceptional one, and a pipeline that spreads `JSON.parse` and
 * optional chaining across five agents ends up with each of them coping
 * differently and none of them reporting the failure rate. Here there is one
 * parse, one repair attempt, and a hard failure after that.
 */

export interface GenerateOptions {
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Recorded against this trace, if given. */
  trace?: Trace;
  /** Span name in the trace. */
  label?: string;
}

interface RawGeneration {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** Counts of schema outcomes, for the parse-failure rate the demo reports. */
export const structuredOutputStats = {
  attempts: 0,
  firstPassValid: 0,
  repaired: 0,
  failed: 0,
};

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();

  // Models sometimes prefix a sentence before the object. Take the span from
  // the first brace or bracket to its matching close.
  const start = body.search(/[[{]/);
  if (start === -1) return body;
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return body.slice(start);
}

async function callGemini(
  prompt: string,
  options: GenerateOptions & { json?: boolean; responseSchema?: GeminiSchema }
): Promise<RawGeneration> {
  const model = AI_CONFIG.gemini.model;
  const endpoint = `${getModelBaseUrl()}/models/${model}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-goog-api-key": getGeminiApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
      generationConfig: {
        temperature: options.temperature ?? 0,
        maxOutputTokens: options.maxOutputTokens ?? 8192,
        ...(options.json ? { responseMimeType: "application/json" } : {}),
        ...(options.responseSchema ? { responseSchema: options.responseSchema } : {}),
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini generateContent failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  // Truncation is the failure that costs the most time to diagnose, because it
  // surfaces downstream as an incomprehensible JSON parse error at whatever
  // character the output happened to stop at. Named here instead.
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new Error(
      `Gemini hit the output token limit (${options.maxOutputTokens ?? 8192}) and returned truncated output. Raise maxOutputTokens or ask for less.`
    );
  }

  if (!text) {
    // An empty candidate is usually a safety block or a token-limit stop. It is
    // reported rather than returned as an empty string, which downstream code
    // would happily treat as a valid answer.
    throw new Error(
      `Gemini returned no text (finishReason: ${candidate?.finishReason ?? "unknown"})`
    );
  }

  return {
    text,
    inputTokens: body.usageMetadata?.promptTokenCount ?? null,
    outputTokens: body.usageMetadata?.candidatesTokenCount ?? null,
  };
}

export async function generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
  const model = AI_CONFIG.gemini.model;
  const run = async () => {
    const raw = await callGemini(prompt, options);
    return {
      value: raw.text,
      inputTokens: raw.inputTokens,
      outputTokens: raw.outputTokens,
      model,
    };
  };

  if (!options.trace) return (await run()).value;
  return options.trace.record(options.label ?? "generate", "generate", run);
}

/**
 * Asks the model for JSON and returns it parsed and validated.
 *
 * On a schema failure the model is shown its own output and the validation
 * errors, and asked once for a correction. A second failure throws — silently
 * returning a partial object is how a compliance finding ends up with a
 * confident severity and no evidence behind it.
 */
export async function generateStructured<T extends z.ZodTypeAny>(
  prompt: string,
  schema: T,
  options: GenerateOptions = {}
): Promise<z.infer<T>> {
  structuredOutputStats.attempts++;
  const model = AI_CONFIG.gemini.model;

  // Constrained decoding first, zod validation second. The schema stops the
  // model inventing key names; the zod parse still runs, because a response
  // that satisfies the OpenAPI subset can still violate constraints the subset
  // cannot express — a confidence outside [0, 1], an explanation of two words.
  const responseSchema = zodToGeminiSchema(schema);
  const withSchema = { ...options, json: true, responseSchema };

  const attempt = async (text: string) => schema.safeParse(JSON.parse(extractJson(text)));

  const first = await (options.trace
    ? options.trace.record(options.label ?? "generate", "generate", async () => {
        const raw = await callGemini(prompt, withSchema);
        return { value: raw, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, model };
      })
    : callGemini(prompt, withSchema));

  let parsed: ReturnType<typeof schema.safeParse>;
  try {
    parsed = await attempt(first.text);
  } catch (error) {
    parsed = {
      success: false,
      error: new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: [],
          message: `Response was not JSON: ${error instanceof Error ? error.message : String(error)}`,
        },
      ]),
    } as ReturnType<typeof schema.safeParse>;
  }

  if (parsed.success) {
    structuredOutputStats.firstPassValid++;
    return parsed.data;
  }

  const issues = parsed.error.issues
    .slice(0, 12)
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");

  const repairPrompt = [
    "Your previous reply did not satisfy the required schema.",
    "",
    "Your reply was:",
    first.text.slice(0, 4000),
    "",
    "The validation errors were:",
    issues,
    "",
    "Return corrected JSON only. Do not explain the correction.",
  ].join("\n");

  const second = await (options.trace
    ? options.trace.record(`${options.label ?? "generate"}:repair`, "generate", async () => {
        const raw = await callGemini(`${prompt}\n\n${repairPrompt}`, withSchema);
        return { value: raw, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, model };
      })
    : callGemini(`${prompt}\n\n${repairPrompt}`, withSchema));

  let repaired: ReturnType<typeof schema.safeParse>;
  try {
    repaired = await attempt(second.text);
  } catch (error) {
    structuredOutputStats.failed++;
    throw new Error(
      `Model output was not valid JSON after one repair attempt: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!repaired.success) {
    structuredOutputStats.failed++;
    throw new Error(
      `Model output failed schema validation after one repair attempt:\n${repaired.error.issues
        .slice(0, 6)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`
    );
  }

  structuredOutputStats.repaired++;
  return repaired.data;
}
