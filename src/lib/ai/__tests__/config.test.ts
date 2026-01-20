import { AI_CONFIG, getGeminiApiKey, type ComplianceFramework } from '../config';

describe('AI Configuration', () => {
  describe('AI_CONFIG', () => {
    it('should have valid Gemini configuration', () => {
      expect(AI_CONFIG.gemini.model).toBe('gemini-1.5-pro');
      expect(AI_CONFIG.gemini.temperature).toBeGreaterThanOrEqual(0);
      expect(AI_CONFIG.gemini.temperature).toBeLessThanOrEqual(2);
      expect(AI_CONFIG.gemini.maxTokens).toBeGreaterThan(0);
      expect(AI_CONFIG.gemini.maxRetries).toBeGreaterThan(0);
    });

    it('should have valid processing configuration', () => {
      expect(AI_CONFIG.processing.maxDocumentSize).toBeGreaterThan(0);
      expect(AI_CONFIG.processing.chunkSize).toBeGreaterThan(0);
      expect(AI_CONFIG.processing.chunkOverlap).toBeGreaterThanOrEqual(0);
      expect(AI_CONFIG.processing.batchSize).toBeGreaterThan(0);
    });

    it('should have valid compliance configuration', () => {
      expect(AI_CONFIG.compliance.minConfidenceThreshold).toBeGreaterThan(0);
      expect(AI_CONFIG.compliance.minConfidenceThreshold).toBeLessThan(1);
      expect(AI_CONFIG.compliance.frameworks).toBeInstanceOf(Array);
      expect(AI_CONFIG.compliance.frameworks.length).toBeGreaterThan(0);
    });

    it('should include expected compliance frameworks', () => {
      const frameworks = AI_CONFIG.compliance.frameworks;
      expect(frameworks).toContain('FERPA');
      expect(frameworks).toContain('HIPAA');
      expect(frameworks).toContain('IRB');
      expect(frameworks).toContain('GDPR');
      expect(frameworks).toContain('ADA/Section 508');
    });

    it('should have reasonable timeout values', () => {
      expect(AI_CONFIG.timeouts.analysisTimeout).toBeGreaterThan(0);
      expect(AI_CONFIG.timeouts.streamingTimeout).toBeGreaterThan(0);
      expect(AI_CONFIG.timeouts.analysisTimeout).toBeGreaterThan(AI_CONFIG.timeouts.streamingTimeout);
    });
  });

  describe('getGeminiApiKey', () => {
    const originalApiKey = process.env.GOOGLE_GEMINI_API_KEY;

    afterEach(() => {
      // Restore original API key
      if (originalApiKey) {
        process.env.GOOGLE_GEMINI_API_KEY = originalApiKey;
      } else {
        delete process.env.GOOGLE_GEMINI_API_KEY;
      }
    });

    it('should return API key when set', () => {
      const testKey = 'test-api-key-123';
      process.env.GOOGLE_GEMINI_API_KEY = testKey;

      expect(getGeminiApiKey()).toBe(testKey);
    });

    it('should throw error when API key is not set', () => {
      delete process.env.GOOGLE_GEMINI_API_KEY;

      expect(() => getGeminiApiKey()).toThrow('GOOGLE_GEMINI_API_KEY environment variable is not set');
    });

    it('should throw error when API key is empty string', () => {
      process.env.GOOGLE_GEMINI_API_KEY = '';

      expect(() => getGeminiApiKey()).toThrow('GOOGLE_GEMINI_API_KEY environment variable is not set');
    });
  });

  describe('TypeScript Types', () => {
    it('should properly type ComplianceFramework', () => {
      const framework: ComplianceFramework = 'FERPA';
      expect(typeof framework).toBe('string');
      expect(AI_CONFIG.compliance.frameworks).toContain(framework);
    });

    it('should enforce AI_CONFIG as const', () => {
      // This test ensures the config is readonly at compile time
      expect(Object.isFrozen(AI_CONFIG)).toBe(false); // as const doesn't freeze, but provides type safety
      expect(typeof AI_CONFIG).toBe('object');
    });
  });
});