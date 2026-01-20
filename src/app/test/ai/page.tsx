'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
// Using HTML select instead of custom Select component
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, CheckCircle, XCircle, AlertCircle, Play, Eye, Settings } from 'lucide-react';

interface SystemStatus {
  success: boolean;
  systemStatus: {
    initialized: boolean;
    totalAgents: number;
    readyAgents: number;
    busyAgents: number;
    errorAgents: number;
  };
  agentTemplates: {
    supportedTypes: string[];
  };
}

interface TestResult {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: string;
  duration?: number;
}

export default function AITestInterface() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  // Form states
  const [projectId, setProjectId] = useState('test-compliance-project-' + Date.now());
  const [projectDescription, setProjectDescription] = useState('');
  const [analysisType, setAnalysisType] = useState('classification');
  const [documentContent, setDocumentContent] = useState('');

  // Dependency input states
  const [classificationData, setClassificationData] = useState('');
  const [frameworkData, setFrameworkData] = useState('');
  const [gradingData, setGradingData] = useState('');

  // Sample data for testing
  const sampleClassificationData = {
    detectedFrameworks: [
      { name: "FERPA", confidence: 0.9, relevanceScore: 0.85, priority: "high" },
      { name: "GDPR", confidence: 0.7, relevanceScore: 0.75, priority: "medium" },
      { name: "IRB", confidence: 0.8, relevanceScore: 0.80, priority: "high" }
    ],
    data: {
      detectedFrameworks: [
        { name: "FERPA", confidence: 0.9, relevanceScore: 0.85, priority: "high" },
        { name: "GDPR", confidence: 0.7, relevanceScore: 0.75, priority: "medium" }
      ]
    }
  };

  const sampleFrameworkData = [
    { name: "FERPA", confidence: 0.9, priority: "high" },
    { name: "HIPAA", confidence: 0.8, priority: "medium" },
    { name: "GDPR", confidence: 0.7, priority: "medium" }
  ];

  const sampleGradingData = {
    frameworkScores: [
      {
        framework: "FERPA",
        overallScore: 65,
        maxScore: 100,
        percentage: 65,
        categoryScores: {
          "Data Protection": { score: 60, maxScore: 100 },
          "Privacy Rights": { score: 70, maxScore: 100 }
        }
      },
      {
        framework: "HIPAA",
        overallScore: 45,
        maxScore: 100,
        percentage: 45,
        categoryScores: {
          "Security": { score: 40, maxScore: 100 },
          "Access Controls": { score: 50, maxScore: 100 }
        }
      }
    ],
    prioritizedGaps: [
      {
        framework: "FERPA",
        category: "Data Protection",
        description: "Missing data encryption policies for student records",
        severity: "high" as const,
        currentScore: 60,
        maxScore: 100,
        impact: 40
      },
      {
        framework: "HIPAA",
        category: "Security",
        description: "Insufficient access controls for health information",
        severity: "high" as const,
        currentScore: 40,
        maxScore: 100,
        impact: 60
      }
    ],
    data: {
      frameworkScores: [
        {
          framework: "FERPA",
          overallScore: 65,
          maxScore: 100,
          percentage: 65
        }
      ],
      prioritizedGaps: [
        {
          framework: "FERPA",
          category: "Data Protection",
          description: "Missing encryption",
          severity: "high" as const
        }
      ]
    }
  };

  // Load sample data functions
  const loadSampleClassificationData = () => {
    setClassificationData(JSON.stringify(sampleClassificationData, null, 2));
  };

  const loadSampleFrameworkData = () => {
    setFrameworkData(JSON.stringify(sampleFrameworkData, null, 2));
  };

  const loadSampleGradingData = () => {
    setGradingData(JSON.stringify(sampleGradingData, null, 2));
  };

  useEffect(() => {
    loadSystemStatus();
  }, []);

  const loadSystemStatus = async () => {
    try {
      const response = await fetch('/api/agents/test');
      const data = await response.json();
      setSystemStatus(data);
    } catch (error) {
      console.error('Failed to load system status:', error);
    }
  };

  const runTest = async (testName: string, endpoint: string, payload?: any) => {
    setLoading(true);
    const startTime = Date.now();

    try {
      // Enhanced payload with dependency data if available
      let enhancedPayload = payload;
      if (payload && payload.analysisType) {
        enhancedPayload = { ...payload };

        // Parse and include dependency data based on analysis type
        try {
          if (classificationData && (payload.analysisType === 'ideation' || payload.analysisType === 'grading')) {
            enhancedPayload.classificationData = JSON.parse(classificationData);
          }
          if (frameworkData && payload.analysisType === 'grading') {
            enhancedPayload.frameworkData = JSON.parse(frameworkData);
          }
          if (gradingData && payload.analysisType === 'improvement') {
            enhancedPayload.gradingData = JSON.parse(gradingData);
          }
        } catch (parseError) {
          console.warn('Failed to parse dependency data:', parseError);
        }
      }

      console.log('Sending payload:', enhancedPayload); // Debug logging

      const response = await fetch(endpoint, {
        method: enhancedPayload ? 'POST' : 'GET',
        headers: enhancedPayload ? { 'Content-Type': 'application/json' } : {},
        body: enhancedPayload ? JSON.stringify(enhancedPayload) : undefined,
      });

      const data = await response.json();
      const duration = Date.now() - startTime;

      console.log('Received response:', data); // Debug logging

      setTestResults(prev => ({
        ...prev,
        [testName]: {
          success: response.ok,
          data,
          timestamp: new Date().toISOString(),
          duration,
        }
      }));
    } catch (error) {
      console.error('Test failed:', error); // Debug logging
      setTestResults(prev => ({
        ...prev,
        [testName]: {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        }
      }));
    } finally {
      setLoading(false);
    }
  };

  const TestResultDisplay = ({ result }: { result: TestResult }) => {
    const hasResults = result.data && Object.keys(result.data).length > 0;
    const hasEmptyResults = result.success && result.data?.results && Object.values(result.data.results).every((r: any) => !r || Object.keys(r).length === 0);

    return (
      <div className="mt-4 p-4 border rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          {result.success ? (
            hasEmptyResults ? (
              <AlertCircle className="h-5 w-5 text-yellow-500" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-500" />
            )
          ) : (
            <XCircle className="h-5 w-5 text-red-500" />
          )}
          <span className="font-medium">
            {result.success ? (hasEmptyResults ? 'Empty Results' : 'Success') : 'Failed'}
          </span>
          {result.duration && (
            <Badge variant="secondary">{result.duration}ms</Badge>
          )}
          <Badge variant="outline">{new Date(result.timestamp).toLocaleTimeString()}</Badge>
        </div>

        {/* Error Display */}
        {result.error && (
          <Alert className="mb-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        )}

        {/* Empty Results Warning */}
        {hasEmptyResults && (
          <Alert className="mb-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              API call succeeded but agents returned empty results. Check console for AI response details.
            </AlertDescription>
          </Alert>
        )}

        {/* API Error Detection */}
        {result.data?.error && (
          <Alert className="mb-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>API Error:</strong> {result.data.error}
              {result.data.details && <div className="mt-1 text-sm">Details: {result.data.details}</div>}
            </AlertDescription>
          </Alert>
        )}

        {/* Agent Errors Display */}
        {result.data?.results && Object.entries(result.data.results).map(([agentType, agentResult]: [string, any]) => {
          if (agentResult?.errors && agentResult.errors.length > 0) {
            return (
              <Alert key={agentType} className="mb-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{agentType} Agent Errors:</strong>
                  {agentResult.errors.map((error: any, index: number) => (
                    <div key={index} className="mt-1 text-sm">
                      • {error.message} ({error.code})
                    </div>
                  ))}
                </AlertDescription>
              </Alert>
            );
          }
          return null;
        })}

        {/* Success Stats */}
        {result.success && result.data?.results && (
          <div className="mb-2 text-sm text-gray-600">
            <div className="flex gap-4">
              <span>Agents Used: {result.data.agentTeamIds?.length || 0}</span>
              <span>Analysis Type: {result.data.analysisType || 'Unknown'}</span>
              {result.data.metadata?.agentsUsed && (
                <span>Processing Time: {result.data.metadata.processingTime || 'N/A'}ms</span>
              )}
            </div>
          </div>
        )}

        {/* Data Display */}
        {result.data && (
          <div>
            <details className="cursor-pointer">
              <summary className="font-medium mb-2">Raw Response Data</summary>
              <pre className="text-sm bg-gray-50 p-3 rounded overflow-auto max-h-96 whitespace-pre-wrap">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    );
  };

  const sampleProjects = {
    university: {
      description: "University research project studying student learning patterns and academic performance using educational data. We collect anonymized student grades, attendance records, and demographic information including age, disability status, and socioeconomic background. The study involves international students and will be published in academic journals.",
      document: "Research Protocol: This study examines the correlation between student attendance patterns and academic success across diverse student populations. We will collect data from 500+ students including: grade transcripts, attendance logs, disability accommodation records, international student status, and survey responses about family income and educational background."
    },
    healthcare: {
      description: "Healthcare analytics platform for a hospital system that processes patient data including medical records, treatment outcomes, and billing information. The system handles protected health information (PHI) and integrates with multiple external healthcare providers.",
      document: "System Architecture: Our platform ingests patient data from EHR systems, processes clinical notes using NLP, stores treatment histories, and generates predictive analytics for patient outcomes. Data includes diagnoses, medications, lab results, imaging reports, and demographic information."
    },
    fintech: {
      description: "Financial technology startup developing a personal finance app that aggregates bank account data, credit card transactions, and investment portfolios. The app provides budgeting tools and financial advice to consumers across multiple countries.",
      document: "Data Processing Overview: We collect financial transaction data via bank APIs, categorize spending patterns, analyze credit scores, and provide personalized financial recommendations. Users can link multiple financial institutions and share data with financial advisors."
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Multi-Agent AI System Test Interface</h1>
        <p className="text-gray-600">Interactive testing and debugging environment for compliance analysis agents</p>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {systemStatus ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {systemStatus.systemStatus.initialized ? '✓' : '✗'}
                </div>
                <div className="text-sm text-gray-600">Initialized</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {systemStatus.systemStatus.totalAgents}
                </div>
                <div className="text-sm text-gray-600">Total Agents</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {systemStatus.systemStatus.readyAgents}
                </div>
                <div className="text-sm text-gray-600">Ready Agents</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {systemStatus.agentTemplates.supportedTypes.length}
                </div>
                <div className="text-sm text-gray-600">Agent Types</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p>Loading system status...</p>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Button onClick={loadSystemStatus} variant="outline" size="sm">
              Refresh Status
            </Button>
            <Button
              onClick={() => runTest('system-health', '/api/agents/test')}
              variant="outline"
              size="sm"
            >
              Run Health Check
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="individual" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="individual">Individual Agents</TabsTrigger>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="samples">Sample Projects</TabsTrigger>
        </TabsList>

        {/* Individual Agent Testing */}
        <TabsContent value="individual" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Individual Agent Testing</CardTitle>
              <CardDescription>Test each agent type independently</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="projectId">Project ID</Label>
                  <Input
                    id="projectId"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    placeholder="test-project-123"
                  />
                </div>
                <div>
                  <Label htmlFor="analysisType">Analysis Type</Label>
                  <select
                    id="analysisType"
                    value={analysisType}
                    onChange={(e) => setAnalysisType(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="classification">Classification</option>
                    <option value="ideation">Ideation</option>
                    <option value="grading">Grading</option>
                    <option value="improvement">Improvement</option>
                    <option value="full">Full Analysis</option>
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="projectDescription">Project Description</Label>
                <Textarea
                  id="projectDescription"
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder="Describe your project, data types, and use cases..."
                  rows={4}
                />
              </div>

              <div>
                <Label htmlFor="documentContent">Document Content (Optional)</Label>
                <Textarea
                  id="documentContent"
                  value={documentContent}
                  onChange={(e) => setDocumentContent(e.target.value)}
                  placeholder="Additional documentation, policies, or implementation details..."
                  rows={3}
                />
              </div>

              {/* Dependency Input Fields */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="text-lg font-semibold">Agent Dependencies (Optional)</h3>
                <p className="text-sm text-gray-600">
                  For testing agents that depend on outputs from other agents, provide the required data below.
                </p>

                {/* Classification Data for Ideation/Grading */}
                {(analysisType === 'ideation' || analysisType === 'grading' || analysisType === 'full') && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Label htmlFor="classificationData">Classification Data (for Ideation/Grading)</Label>
                      <Button
                        type="button"
                        onClick={loadSampleClassificationData}
                        variant="outline"
                        size="sm"
                      >
                        Load Sample
                      </Button>
                    </div>
                    <Textarea
                      id="classificationData"
                      value={classificationData}
                      onChange={(e) => setClassificationData(e.target.value)}
                      placeholder='{"detectedFrameworks": [{"name": "FERPA", "confidence": 0.9}]}'
                      rows={4}
                      className="font-mono text-sm"
                    />
                  </div>
                )}

                {/* Framework Data for Grading */}
                {(analysisType === 'grading' || analysisType === 'full') && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Label htmlFor="frameworkData">Framework Data (for Grading)</Label>
                      <Button
                        type="button"
                        onClick={loadSampleFrameworkData}
                        variant="outline"
                        size="sm"
                      >
                        Load Sample
                      </Button>
                    </div>
                    <Textarea
                      id="frameworkData"
                      value={frameworkData}
                      onChange={(e) => setFrameworkData(e.target.value)}
                      placeholder='[{"name": "FERPA", "confidence": 0.9, "priority": "high"}]'
                      rows={3}
                      className="font-mono text-sm"
                    />
                  </div>
                )}

                {/* Grading Data for Improvement */}
                {(analysisType === 'improvement' || analysisType === 'full') && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Label htmlFor="gradingData">Grading Data (for Improvement)</Label>
                      <Button
                        type="button"
                        onClick={loadSampleGradingData}
                        variant="outline"
                        size="sm"
                      >
                        Load Sample
                      </Button>
                    </div>
                    <Textarea
                      id="gradingData"
                      value={gradingData}
                      onChange={(e) => setGradingData(e.target.value)}
                      placeholder='{"frameworkScores": [{"framework": "FERPA", "overallScore": 65}]}'
                      rows={4}
                      className="font-mono text-sm"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => runTest('agent-analysis', '/api/agents/analyze', {
                    projectId,
                    projectDescription,
                    documentContent,
                    analysisType,
                    context: { projectType: 'test', projectSize: 'medium' }
                  })}
                  disabled={!projectDescription || loading}
                  className="flex items-center gap-2"
                >
                  <Play className="h-4 w-4" />
                  Run Analysis
                </Button>
                <Button
                  onClick={() => runTest('agent-status', `/api/agents/analyze?projectId=${projectId}`)}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Eye className="h-4 w-4" />
                  Check Status
                </Button>
              </div>

              {/* Quick Test Buttons */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Quick Tests with Sample Data</h4>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      setProjectDescription('University research project studying student learning patterns using educational data and international student information.');
                      setAnalysisType('classification');
                      runTest('quick-classification', '/api/agents/analyze', {
                        projectId: `quick-classification-${Date.now()}`,
                        projectDescription: 'University research project studying student learning patterns using educational data and international student information.',
                        analysisType: 'classification',
                        context: { projectType: 'academic', projectSize: 'medium' }
                      });
                    }}
                    disabled={loading}
                    variant="secondary"
                    size="sm"
                  >
                    Quick Classification Test
                  </Button>

                  <Button
                    onClick={() => {
                      setProjectDescription('University research project studying student learning patterns.');
                      setAnalysisType('ideation');
                      loadSampleClassificationData();
                      setTimeout(() => {
                        runTest('quick-ideation', '/api/agents/analyze', {
                          projectId: `quick-ideation-${Date.now()}`,
                          projectDescription: 'University research project studying student learning patterns.',
                          analysisType: 'ideation',
                          context: { projectType: 'academic', projectSize: 'medium' }
                        });
                      }, 100);
                    }}
                    disabled={loading}
                    variant="secondary"
                    size="sm"
                  >
                    Quick Ideation Test
                  </Button>

                  <Button
                    onClick={() => {
                      setProjectDescription('University compliance assessment project.');
                      setAnalysisType('grading');
                      loadSampleFrameworkData();
                      setTimeout(() => {
                        runTest('quick-grading', '/api/agents/analyze', {
                          projectId: `quick-grading-${Date.now()}`,
                          projectDescription: 'University compliance assessment project.',
                          analysisType: 'grading',
                          context: { projectType: 'academic', projectSize: 'medium' }
                        });
                      }, 100);
                    }}
                    disabled={loading}
                    variant="secondary"
                    size="sm"
                  >
                    Quick Grading Test
                  </Button>

                  <Button
                    onClick={() => {
                      setProjectDescription('University improvement recommendations project.');
                      setAnalysisType('improvement');
                      loadSampleGradingData();
                      setTimeout(() => {
                        runTest('quick-improvement', '/api/agents/analyze', {
                          projectId: `quick-improvement-${Date.now()}`,
                          projectDescription: 'University improvement recommendations project.',
                          analysisType: 'improvement',
                          context: { projectType: 'academic', projectSize: 'medium' }
                        });
                      }, 100);
                    }}
                    disabled={loading}
                    variant="secondary"
                    size="sm"
                  >
                    Quick Improvement Test
                  </Button>

                  <Button
                    onClick={() => {
                      setProjectDescription('Comprehensive university research project with student data, health information, and international participants.');
                      setAnalysisType('full');
                      runTest('quick-full-pipeline', '/api/agents/analyze', {
                        projectId: `quick-full-${Date.now()}`,
                        projectDescription: 'Comprehensive university research project with student data, health information, and international participants.',
                        analysisType: 'full',
                        context: { projectType: 'academic', projectSize: 'large' }
                      });
                    }}
                    disabled={loading}
                    variant="secondary"
                    size="sm"
                  >
                    Quick Full Pipeline Test
                  </Button>
                </div>
              </div>

              {/* Test Results Display */}
              {testResults['agent-analysis'] && (
                <div>
                  <h4 className="font-medium mb-2">Regular Analysis Results</h4>
                  <TestResultDisplay result={testResults['agent-analysis']} />
                </div>
              )}
              {testResults['agent-status'] && (
                <div>
                  <h4 className="font-medium mb-2">Agent Status Results</h4>
                  <TestResultDisplay result={testResults['agent-status']} />
                </div>
              )}

              {/* Quick Test Results */}
              {Object.entries(testResults).filter(([key]) => key.startsWith('quick-')).map(([key, result]) => (
                <div key={key}>
                  <h4 className="font-medium mb-2 capitalize">{key.replace('quick-', '').replace('-', ' ')} Results</h4>
                  <TestResultDisplay result={result} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workflow Testing */}
        <TabsContent value="workflows" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Workflow Testing</CardTitle>
              <CardDescription>Test multi-agent orchestration workflows</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  onClick={() => runTest('workflow-list', '/api/agents/workflow?list=true')}
                  variant="outline"
                >
                  List Workflows
                </Button>
                <Button
                  onClick={() => runTest('workflow-full', '/api/agents/workflow', {
                    projectId,
                    projectDescription: projectDescription || "Test project for workflow execution",
                    workflowId: 'full_compliance_analysis',
                    context: { projectType: 'test' }
                  })}
                  disabled={loading}
                >
                  Run Full Workflow
                </Button>
              </div>

              {testResults['workflow-list'] && (
                <TestResultDisplay result={testResults['workflow-list']} />
              )}
              {testResults['workflow-full'] && (
                <TestResultDisplay result={testResults['workflow-full']} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tools Testing */}
        <TabsContent value="tools" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tool Testing</CardTitle>
              <CardDescription>Test individual tools and services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <Button
                  onClick={() => runTest('embedding-health', '/api/test/embedding-health', { testQuery: 'compliance test' })}
                  variant="outline"
                  size="sm"
                >
                  Embedding Service
                </Button>
                <Button
                  onClick={() => runTest('chunk-test', '/api/test/chunk', {
                    text: 'This is a test document for semantic chunking and analysis.',
                    chunkSize: 1000
                  })}
                  variant="outline"
                  size="sm"
                >
                  Document Chunking
                </Button>
                <Button
                  onClick={() => runTest('team-create', '/api/agents/team', {
                    action: 'create',
                    projectId: `test-team-${Date.now()}`
                  })}
                  variant="outline"
                  size="sm"
                >
                  Create Team
                </Button>
              </div>

              {Object.entries(testResults).filter(([key]) =>
                ['embedding-health', 'chunk-test', 'team-create'].includes(key)
              ).map(([key, result]) => (
                <div key={key}>
                  <h4 className="font-medium mb-2">{key.replace('-', ' ').toUpperCase()}</h4>
                  <TestResultDisplay result={result} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sample Projects */}
        <TabsContent value="samples" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sample Projects</CardTitle>
              <CardDescription>Pre-configured test scenarios for different compliance contexts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {Object.entries(sampleProjects).map(([key, project]) => (
                <div key={key} className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-2 capitalize">{key} Project</h3>
                  <p className="text-sm text-gray-600 mb-3">{project.description.slice(0, 150)}...</p>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setProjectDescription(project.description);
                        setDocumentContent(project.document);
                        setProjectId(`sample-${key}-${Date.now()}`);
                      }}
                      variant="outline"
                      size="sm"
                    >
                      Load Sample
                    </Button>
                    <Button
                      onClick={() => runTest(`sample-${key}`, '/api/agents/analyze', {
                        projectId: `sample-${key}-${Date.now()}`,
                        projectDescription: project.description,
                        documentContent: project.document,
                        analysisType: 'full',
                        context: { projectType: key, projectSize: 'medium' }
                      })}
                      size="sm"
                    >
                      Run Analysis
                    </Button>
                  </div>

                  {testResults[`sample-${key}`] && (
                    <TestResultDisplay result={testResults[`sample-${key}`]} />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* System Health Check Results */}
      {testResults['system-health'] && (
        <Card>
          <CardHeader>
            <CardTitle>System Health Check</CardTitle>
          </CardHeader>
          <CardContent>
            <TestResultDisplay result={testResults['system-health']} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}