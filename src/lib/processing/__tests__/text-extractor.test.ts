import { TextExtractor } from "../text-extractor";

describe("TextExtractor", () => {
  let extractor: TextExtractor;

  beforeEach(() => {
    extractor = new TextExtractor();
  });

  describe("isSupportedMimeType", () => {
    it("should support DOCX MIME type", () => {
      expect(
        extractor.isSupportedMimeType(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
      ).toBe(true);
    });

    it("should support PDF MIME type", () => {
      expect(extractor.isSupportedMimeType("application/pdf")).toBe(true);
    });

    it("should not support unsupported MIME types", () => {
      expect(extractor.isSupportedMimeType("text/plain")).toBe(false);
      expect(extractor.isSupportedMimeType("image/jpeg")).toBe(false);
    });
  });

  describe("getExtractionMethod", () => {
    it("should return correct method for DOCX", () => {
      expect(
        extractor.getExtractionMethod(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
      ).toBe("DOCX extraction");
    });

    it("should return correct method for PDF", () => {
      expect(extractor.getExtractionMethod("application/pdf")).toBe(
        "PDF extraction"
      );
    });

    it("should return unknown for unsupported types", () => {
      expect(extractor.getExtractionMethod("text/plain")).toBe(
        "Unknown extraction"
      );
    });
  });

  describe("extractFromBuffer", () => {
    it("should throw error for unsupported MIME type", async () => {
      const buffer = Buffer.from("test content");
      await expect(
        extractor.extractFromBuffer(buffer, "text/plain")
      ).rejects.toThrow("Unsupported file type: text/plain");
    });

    // Note: Testing actual DOCX/PDF extraction would require real file buffers
    // which are complex to generate in unit tests. Integration tests would be better.
  });
});
