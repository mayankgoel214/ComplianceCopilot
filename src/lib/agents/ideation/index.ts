export { IdeationAgent } from './ideation-agent';
export type { IdeationInput, IdeationOutput, QuestionOutput, ChatOutput } from './ideation-agent';

import { IdeationAgent } from './ideation-agent';
import { getAgentFactory } from '../registry';
import { AgentConfig } from '../registry/agent-factory';

// Register the Ideation Agent template with the factory
const registerIdeationAgentTemplate = () => {
  const factory = getAgentFactory();

  factory.registerTemplate({
    type: 'ideation',
    defaultMetadata: {
      name: 'Compliance Ideation Agent',
      description: 'Generates clarifying questions and provides interactive compliance knowledge chat',
      version: '1.0.0',
      capabilities: [],
      dependencies: ['chromadb', 'gemini-embeddings', 'web-search'],
      tags: ['ideation', 'questions', 'knowledge', 'interactive']
    },
    factory: async (config: AgentConfig) => {
      const projectId = config.customConfig?.projectId || 'default';
      return new IdeationAgent(projectId);
    },
    requiredCapabilities: ['question_generation', 'knowledge_retrieval', 'conversation'],
    supportedTags: ['ideation', 'questions', 'knowledge', 'interactive']
  });
};

// Auto-register when module is imported
registerIdeationAgentTemplate();