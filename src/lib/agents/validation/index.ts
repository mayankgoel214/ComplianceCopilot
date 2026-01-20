export { ValidationAgent } from './validation-agent';
export type {
  ValidationInput,
  ValidationOutput,
  ValidationIssue
} from './validation-agent';

import { ValidationAgent } from './validation-agent';
import { getAgentFactory } from '../registry';
import { AgentConfig } from '../registry/agent-factory';

// Register the Validation Agent template with the factory
const registerValidationAgentTemplate = () => {
  const factory = getAgentFactory();

  factory.registerTemplate({
    type: 'validation',
    defaultMetadata: {
      name: 'Multi-Agent Validation Agent',
      description: 'Validates and cross-checks outputs from other agents for consistency and accuracy',
      version: '1.0.0',
      capabilities: [],
      dependencies: ['vector-retrieval', 'document-analysis'],
      tags: ['validation', 'quality-assurance', 'cross-checking']
    },
    factory: async (config: AgentConfig) => {
      const projectId = config.customConfig?.projectId || 'default';
      return new ValidationAgent(projectId);
    },
    requiredCapabilities: ['cross_validation', 'quality_assurance', 'consistency_checking'],
    supportedTags: ['validation', 'quality-assurance', 'cross-checking']
  });
};

// Auto-register when module is imported
registerValidationAgentTemplate();