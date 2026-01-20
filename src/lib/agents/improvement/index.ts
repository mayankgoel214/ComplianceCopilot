export { ImprovementAgent } from './improvement-agent';
export type {
  ImprovementInput,
  ImprovementOutput,
  ImprovementRecommendation
} from './improvement-agent';

import { ImprovementAgent } from './improvement-agent';
import { getAgentFactory } from '../registry';
import { AgentConfig } from '../registry/agent-factory';

// Register the Improvement Agent template with the factory
const registerImprovementAgentTemplate = () => {
  const factory = getAgentFactory();

  factory.registerTemplate({
    type: 'improvement',
    defaultMetadata: {
      name: 'Compliance Improvement Agent',
      description: 'Generates actionable improvement recommendations and remediation strategies',
      version: '1.0.0',
      capabilities: [],
      dependencies: ['web-search', 'vector-retrieval'],
      tags: ['improvement', 'recommendations', 'remediation']
    },
    factory: async (config: AgentConfig) => {
      const projectId = config.customConfig?.projectId || 'default';
      return new ImprovementAgent(projectId);
    },
    requiredCapabilities: ['remediation_planning', 'best_practices', 'prioritization'],
    supportedTags: ['improvement', 'recommendations', 'remediation']
  });
};

// Auto-register when module is imported
registerImprovementAgentTemplate();