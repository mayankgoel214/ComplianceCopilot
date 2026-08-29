import { z } from "zod";

/**
 * Converts a zod schema into the OpenAPI subset Gemini accepts as
 * `generationConfig.responseSchema`.
 *
 * Asking for `responseMimeType: "application/json"` alone gets JSON, but JSON
 * whose key names the model invents — `framework` where the schema said `name`,
 * a nested object where it said a string. Supplying the schema constrains
 * decoding, so the shape is right by construction and the zod parse downstream
 * becomes a check rather than a gamble.
 *
 * Deliberately a small converter rather than a dependency. Gemini's subset is
 * narrow — no unions, no `additionalProperties`, no `$ref` — so a general
 * JSON-Schema library would produce documents the API rejects, and the failure
 * would arrive as an opaque 400.
 */

export interface GeminiSchema {
  type: string;
  description?: string;
  format?: string;
  nullable?: boolean;
  enum?: string[];
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
}

function unwrap(schema: z.ZodTypeAny): { inner: z.ZodTypeAny; optional: boolean } {
  let inner = schema;
  let optional = false;

  // Optional, nullable and default all wrap the schema that matters. Peeling
  // them here keeps the type switch below a flat list of real types.
  for (;;) {
    if (inner instanceof z.ZodOptional) {
      optional = true;
      inner = inner.unwrap();
    } else if (inner instanceof z.ZodNullable) {
      optional = true;
      inner = inner.unwrap();
    } else if (inner instanceof z.ZodDefault) {
      optional = true;
      inner = inner.removeDefault();
    } else if (inner instanceof z.ZodEffects) {
      inner = inner.innerType();
    } else {
      return { inner, optional };
    }
  }
}

export function zodToGeminiSchema(schema: z.ZodTypeAny): GeminiSchema {
  const { inner } = unwrap(schema);
  const description = inner.description;
  const withDescription = (s: GeminiSchema): GeminiSchema =>
    description ? { ...s, description } : s;

  if (inner instanceof z.ZodString) return withDescription({ type: "string" });
  if (inner instanceof z.ZodBoolean) return withDescription({ type: "boolean" });

  if (inner instanceof z.ZodNumber) {
    return withDescription({ type: inner.isInt ? "integer" : "number" });
  }

  if (inner instanceof z.ZodEnum) {
    return withDescription({ type: "string", enum: inner.options as string[] });
  }

  if (inner instanceof z.ZodLiteral) {
    return withDescription({ type: "string", enum: [String(inner.value)] });
  }

  if (inner instanceof z.ZodArray) {
    return withDescription({ type: "array", items: zodToGeminiSchema(inner.element) });
  }

  if (inner instanceof z.ZodObject) {
    const shape = inner.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, GeminiSchema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToGeminiSchema(value);
      if (!unwrap(value).optional) required.push(key);
    }

    return withDescription({
      type: "object",
      properties,
      // An empty `required` is omitted rather than sent as `[]`, which Gemini
      // treats as a validation error rather than as "nothing is required".
      ...(required.length > 0 ? { required } : {}),
    });
  }

  // Anything else — unions, records, tuples — has no representation in Gemini's
  // subset. Failing here is better than sending a schema the API will reject
  // with a message that does not name the offending field.
  throw new Error(
    `zodToGeminiSchema does not support ${inner.constructor.name}. Express the field as an object, array, string, number, boolean or enum.`
  );
}
