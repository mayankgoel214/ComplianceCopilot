import { getGeminiService, GeminiService } from '../gemini-service';
import { AI_CONFIG } from '../config';

// Mock the environment variable
const mockApiKey = 'test-api-key-123';
process.env.GOOGLE_GEMINI_API_KEY = mockApiKey;

// Mock the ChatGoogleGenerativeAI class
jest.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    // Mock implementation for testing
    invoke: jest.fn().mockResolvedValue({ content: 'Mock response' }),
  })),
}));

describe('GeminiService', () => {
  let geminiService: GeminiService;

  beforeEach(() => {
    // Reset any existing singleton instance
    jest.clearAllMocks();
    geminiService = getGeminiService();
  });

  describe('Configuration', () => {
    it('should have valid AI configuration', () => {
      expect(AI_CONFIG.gemini.model).toBe('gemini-1.5-pro');
      expect(AI_CONFIG.gemini.temperature).toBe(0.1);
      expect(AI_CONFIG.gemini.maxTokens).toBe(8192);
      expect(AI_CONFIG.compliance.frameworks).toContain('FERPA');
      expect(AI_CONFIG.compliance.frameworks).toContain('GDPR');
    });

    it('should have reasonable processing limits', () => {
      expect(AI_CONFIG.processing.maxDocumentSize).toBeGreaterThan(0);
      expect(AI_CONFIG.processing.chunkSize).toBeGreaterThan(0);
      expect(AI_CONFIG.processing.batchSize).toBeGreaterThan(0);
    });
  });

  describe('Service Initialization', () => {
    it('should create a service instance', () => {
      expect(geminiService).toBeInstanceOf(GeminiService);
    });

    it('should return the same singleton instance', () => {
      const service1 = getGeminiService();
      const service2 = getGeminiService();
      expect(service1).toBe(service2);
    });

    it('should check health status', async () => {
      const isHealthy = await geminiService.isHealthy();
      expect(typeof isHealthy).toBe('boolean');
    });
  });

  describe('Placeholder Methods', () => {
    it('should have analyzeContent method', async () => {
      const result = await geminiService.analyzeContent('test content');
      expect(typeof result).toBe('string');
      expect(result).toContain('not yet implemented');
    });

    it('should have detectComplianceFrameworks method', async () => {
      const result = await geminiService.detectComplianceFrameworks('test content', 'test description');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0); // Should be empty until implemented
    });

    it('should have generateRemediation method', async () => {
      const result = await geminiService.generateRemediation([], []);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0); // Should be empty until implemented
    });
  });

  describe('Error Handling', () => {
    it('should handle missing API key gracefully', async () => {
      // Temporarily remove the API key
      const originalApiKey = process.env.GOOGLE_GEMINI_API_KEY;
      delete process.env.GOOGLE_GEMINI_API_KEY;

      // Create a new service instance
      const serviceWithoutKey = new GeminiService();

      // Test that health check returns false when API key is missing
      const isHealthy = await serviceWithoutKey.isHealthy();
      expect(isHealthy).toBe(false);

      // Restore the API key
      process.env.GOOGLE_GEMINI_API_KEY = originalApiKey;
    });
  });
});