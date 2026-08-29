import { z } from "zod";

import { zodToGeminiSchema } from "../zod-to-gemini";
import { ClassificationSchema, AssessmentSchema } from "@/lib/pipeline/schema";

describe("zodToGeminiSchema", () => {
  it("maps the primitives", () => {
    expect(zodToGeminiSchema(z.string())).toEqual({ type: "string" });
    expect(zodToGeminiSchema(z.boolean())).toEqual({ type: "boolean" });
    expect(zodToGeminiSchema(z.number())).toEqual({ type: "number" });
    expect(zodToGeminiSchema(z.number().int())).toEqual({ type: "integer" });
  });

  it("keeps min and max off the output, since Gemini's subset has no place for them", () => {
    expect(zodToGeminiSchema(z.number().min(0).max(1))).toEqual({ type: "number" });
  });

  it("maps an enum to a constrained string", () => {
    expect(zodToGeminiSchema(z.enum(["met", "missing"]))).toEqual({
      type: "string",
      enum: ["met", "missing"],
    });
  });

  it("maps arrays through to their element type", () => {
    expect(zodToGeminiSchema(z.array(z.string()))).toEqual({
      type: "array",
      items: { type: "string" },
    });
  });

  it("marks non-optional object fields as required", () => {
    const schema = zodToGeminiSchema(z.object({ a: z.string(), b: z.number().optional() }));
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["a"]);
    expect(schema.properties).toEqual({ a: { type: "string" }, b: { type: "number" } });
  });

  it("omits `required` entirely when nothing is required", () => {
    const schema = zodToGeminiSchema(z.object({ a: z.string().optional() }));
    expect(schema.required).toBeUndefined();
  });

  it("unwraps optional, nullable and default", () => {
    expect(zodToGeminiSchema(z.string().optional())).toEqual({ type: "string" });
    expect(zodToGeminiSchema(z.string().nullable())).toEqual({ type: "string" });
    expect(zodToGeminiSchema(z.string().default("x"))).toEqual({ type: "string" });
  });

  it("carries a description through", () => {
    expect(zodToGeminiSchema(z.string().describe("a citation"))).toEqual({
      type: "string",
      description: "a citation",
    });
  });

  it("handles nesting", () => {
    const schema = zodToGeminiSchema(
      z.object({ items: z.array(z.object({ name: z.string(), score: z.number() })) })
    );
    expect(schema.properties?.items.items?.properties?.name).toEqual({ type: "string" });
    expect(schema.properties?.items.items?.required).toEqual(["name", "score"]);
  });

  it("refuses a construct Gemini cannot express, rather than emitting one it will reject", () => {
    expect(() => zodToGeminiSchema(z.union([z.string(), z.number()]))).toThrow(/does not support/);
    expect(() => zodToGeminiSchema(z.record(z.string()))).toThrow(/does not support/);
  });

  it("converts the schemas the pipeline actually sends", () => {
    // The value of this test is that it fails at build time rather than as a
    // 400 from the API the first time somebody adds a union to a prompt schema.
    const classification = zodToGeminiSchema(ClassificationSchema);
    expect(classification.required).toEqual(expect.arrayContaining(["frameworks", "documentSummary"]));

    const assessment = zodToGeminiSchema(AssessmentSchema);
    const finding = assessment.properties?.findings.items;
    expect(finding?.required).toEqual(
      expect.arrayContaining([
        "requirement",
        "status",
        "severity",
        "explanation",
        "documentQuote",
        "regulationQuote",
        "citation",
      ])
    );
    expect(finding?.properties?.status.enum).toEqual(["met", "partial", "missing", "unclear"]);
  });
});
