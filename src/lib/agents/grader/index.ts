export { GraderAgent } from './grader-agent';
export type {
  GraderInput,
  GraderOutput,
  ComplianceGap,
  FrameworkScore
} from './grader-agent';

import { GraderAgent } from './grader-agent';
import { getAgentFactory } from '../registry';
import { AgentConfig } from '../registry/agent-factory';

// Register the Grader Agent template with the factory
const registerGraderAgentTemplate = () => {
  const factory = getAgentFactory();

  factory.registerTemplate({
    type: 'grader',
    defaultMetadata: {
      name: 'Compliance Grader Agent',
      description: 'Analyzes compliance gaps and assigns detailed scores across multiple frameworks',
      version: '1.0.0',
      capabilities: [],
      dependencies: ['document-analysis', 'vector-retrieval'],
      tags: ['grading', 'compliance', 'scoring', 'analysis']
    },
    factory: async (config: AgentConfig) => {
      const projectId = config.customConfig?.projectId || 'default';
      return new GraderAgent(projectId);
    },
    requiredCapabilities: ['compliance_analysis', 'gap_detection', 'scoring'],
    supportedTags: ['grading', 'compliance', 'scoring', 'analysis']
  });
};

// Auto-register when module is imported
registerGraderAgentTemplate();