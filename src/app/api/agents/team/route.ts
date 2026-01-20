import { NextRequest, NextResponse } from 'next/server';
import {
  initializeAgentSystem,
  createProjectAgentTeam,
  destroyProjectAgentTeam,
  getAgentRegistry,
  getAgentFactory
} from '@/lib/agents';

// Initialize the agent system on first load
let systemInitialized = false;

async function ensureSystemInitialized() {
  if (!systemInitialized) {
    await initializeAgentSystem();
    systemInitialized = true;
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureSystemInitialized();

    const body = await request.json();
    const { action, projectId, agentTypes } = body;

    if (!action || !projectId) {
      return NextResponse.json(
        { error: 'Action and project ID are required' },
        { status: 400 }
      );
    }

    const registry = getAgentRegistry();
    const factory = getAgentFactory();

    switch (action) {
      case 'create':
        try {
          // Check if agents already exist for this project
          const existingAgents = registry.discover({ tags: [projectId] });

          if (existingAgents.length > 0) {
            return NextResponse.json({
              success: true,
              message: 'Agent team already exists',
              projectId,
              agentIds: existingAgents.map(agent => agent.metadata.id),
              agents: existingAgents.map(agent => ({
                id: agent.metadata.id,
                name: agent.metadata.name,
                type: agent.metadata.tags.find(tag =>
                  ['classification', 'ideation', 'grader', 'improvement'].includes(tag)
                ),
                status: agent.status,
                capabilities: agent.metadata.capabilities.map(cap => cap.name)
              }))
            });
          }

          // Create new agent team
          const agentIds = await createProjectAgentTeam(projectId);
          const createdAgents = agentIds.map(id => registry.get(id)).filter(Boolean);

          return NextResponse.json({
            success: true,
            message: 'Agent team created successfully',
            projectId,
            agentIds,
            agents: createdAgents.map(agent => ({
              id: agent!.metadata.id,
              name: agent!.metadata.name,
              type: agent!.metadata.tags.find(tag =>
                ['classification', 'ideation', 'grader', 'improvement'].includes(tag)
              ),
              status: agent!.status,
              capabilities: agent!.metadata.capabilities.map(cap => cap.name)
            }))
          });

        } catch (error) {
          console.error('Error creating agent team:', error);
          return NextResponse.json(
            {
              error: 'Failed to create agent team',
              details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
          );
        }

      case 'destroy':
        try {
          await destroyProjectAgentTeam(projectId);

          return NextResponse.json({
            success: true,
            message: 'Agent team destroyed successfully',
            projectId
          });

        } catch (error) {
          console.error('Error destroying agent team:', error);
          return NextResponse.json(
            {
              error: 'Failed to destroy agent team',
              details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
          );
        }

      case 'create_custom':
        try {
          if (!agentTypes || !Array.isArray(agentTypes)) {
            return NextResponse.json(
              { error: 'Agent types array is required for custom team creation' },
              { status: 400 }
            );
          }

          const agentIds: string[] = [];
          const supportedTypes = factory.getSupportedTypes();

          for (const agentType of agentTypes) {
            if (!supportedTypes.includes(agentType)) {
              return NextResponse.json(
                { error: `Unsupported agent type: ${agentType}` },
                { status: 400 }
              );
            }

            const config = {
              type: agentType,
              name: `${agentType.charAt(0).toUpperCase() + agentType.slice(1)} Agent - ${projectId}`,
              tags: [agentType, projectId],
              customConfig: { projectId }
            };

            const agentId = await factory.createAndRegisterAgent(config);
            agentIds.push(agentId);
          }

          const createdAgents = agentIds.map(id => registry.get(id)).filter(Boolean);

          return NextResponse.json({
            success: true,
            message: 'Custom agent team created successfully',
            projectId,
            agentIds,
            agents: createdAgents.map(agent => ({
              id: agent!.metadata.id,
              name: agent!.metadata.name,
              type: agent!.metadata.tags.find(tag =>
                ['classification', 'ideation', 'grader', 'improvement'].includes(tag)
              ),
              status: agent!.status,
              capabilities: agent!.metadata.capabilities.map(cap => cap.name)
            }))
          });

        } catch (error) {
          console.error('Error creating custom agent team:', error);
          return NextResponse.json(
            {
              error: 'Failed to create custom agent team',
              details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
          );
        }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: create, destroy, create_custom' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Agent team endpoint error:', error);
    return NextResponse.json(
      {
        error: 'Agent team operation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureSystemInitialized();

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const registry = getAgentRegistry();

    // Get all agents for the project
    const projectAgents = registry.discover({ tags: [projectId] });

    // Get health status for all project agents
    const healthStatus = await registry.healthCheck();
    const projectHealth = Object.fromEntries(
      Object.entries(healthStatus).filter(([agentId]) =>
        projectAgents.some(agent => agent.metadata.id === agentId)
      )
    );

    // Get system-wide statistics
    const systemStatus = registry.getSystemStatus();

    return NextResponse.json({
      success: true,
      projectId,
      teamSize: projectAgents.length,
      agents: projectAgents.map(agent => ({
        id: agent.metadata.id,
        name: agent.metadata.name,
        type: agent.metadata.tags.find(tag =>
          ['classification', 'ideation', 'grader', 'improvement'].includes(tag)
        ),
        status: agent.status,
        health: projectHealth[agent.metadata.id],
        capabilities: agent.metadata.capabilities.map(cap => cap.name),
        usageStats: agent.usageStats,
        lastHealthCheck: agent.lastHealthCheck,
        createdAt: agent.createdAt
      })),
      teamStatistics: {
        totalExecutions: projectAgents.reduce((sum, agent) =>
          sum + agent.usageStats.totalExecutions, 0),
        successfulExecutions: projectAgents.reduce((sum, agent) =>
          sum + agent.usageStats.successfulExecutions, 0),
        averageExecutionTime: projectAgents.reduce((sum, agent) =>
          sum + agent.usageStats.averageExecutionTime, 0) / projectAgents.length || 0,
        readyAgents: projectAgents.filter(agent => agent.status === 'ready').length,
        busyAgents: projectAgents.filter(agent => agent.status === 'busy').length,
        errorAgents: projectAgents.filter(agent => agent.status === 'error').length
      },
      systemStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Agent team status endpoint error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get agent team status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await ensureSystemInitialized();

    const body = await request.json();
    const { projectId, agentId, action } = body;

    if (!projectId || !agentId || !action) {
      return NextResponse.json(
        { error: 'Project ID, agent ID, and action are required' },
        { status: 400 }
      );
    }

    const registry = getAgentRegistry();

    // Verify the agent belongs to the project
    const agent = registry.get(agentId);
    if (!agent || !agent.metadata.tags.includes(projectId)) {
      return NextResponse.json(
        { error: 'Agent not found or does not belong to this project' },
        { status: 404 }
      );
    }

    try {
      switch (action) {
        case 'restart':
          await registry.restartAgent(agentId);
          break;
        case 'pause':
          await registry.pauseAgent(agentId);
          break;
        case 'resume':
          await registry.resumeAgent(agentId);
          break;
        default:
          return NextResponse.json(
            { error: 'Invalid action. Supported actions: restart, pause, resume' },
            { status: 400 }
          );
      }

      const updatedAgent = registry.get(agentId);

      return NextResponse.json({
        success: true,
        message: `Agent ${action} successful`,
        agent: {
          id: updatedAgent!.metadata.id,
          name: updatedAgent!.metadata.name,
          status: updatedAgent!.status,
          lastHealthCheck: updatedAgent!.lastHealthCheck
        }
      });

    } catch (operationError) {
      console.error(`Error performing ${action} on agent ${agentId}:`, operationError);
      return NextResponse.json(
        {
          error: `Failed to ${action} agent`,
          details: operationError instanceof Error ? operationError.message : 'Unknown error'
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Agent management endpoint error:', error);
    return NextResponse.json(
      {
        error: 'Agent management operation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}