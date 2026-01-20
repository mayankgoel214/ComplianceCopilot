export { ClassificationAgent } from './classification-agent';
export type { ClassificationInput, ClassificationOutput } from './classification-agent';

import { ClassificationAgent } from './classification-agent';
import { getAgentFactory } from '../registry';
import { AgentConfig } from '../registry/agent-factory';

// Register the Classification Agent template with the factory
const registerClassificationAgentTemplate = () => {
  const factory = getAgentFactory();

  factory.registerTemplate({
    type: 'classification',
    defaultMetadata: {
      name: 'Compliance Framework Classification Agent',
      description: 'Determines applicable compliance frameworks using vector similarity and AI analysis',
      version: '1.0.0',
      capabilities: [],
      dependencies: ['chromadb', 'gemini-embeddings'],
      tags: ['classification', 'compliance', 'framework-detection']
    },
    factory: async (config: AgentConfig) => {
      const projectId = config.customConfig?.projectId || 'default';
      return new ClassificationAgent(projectId);
    },
    requiredCapabilities: ['vector_search', 'framework_analysis', 'confidence_scoring'],
    supportedTags: ['classification', 'compliance', 'framework-detection']
  });
};

// Auto-register when module is imported
registerClassificationAgentTemplate();