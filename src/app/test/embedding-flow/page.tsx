"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileText,
  Search,
  CheckCircle,
  XCircle,
  Loader2,
  Database,
  Brain,
  Upload,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store/auth-store";

interface TestResult {
  step: string;
  status: "pending" | "running" | "completed" | "failed";
  message: string;
  data?: any;
  error?: string;
}

export default function EmbeddingFlowTestPage() {
  const { user } = useAuthStore();
  const [projectId, setProjectId] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addResult = (
    step: string,
    status: TestResult["status"],
    message: string,
    data?: any,
    error?: string
  ) => {
    setResults((prev) => [...prev, { step, status, message, data, error }]);
  };

  const updateResult = (
    step: string,
    status: TestResult["status"],
    message: string,
    data?: any,
    error?: string
  ) => {
    setResults((prev) =>
      prev.map((r) =>
        r.step === step ? { step, status, message, data, error } : r
      )
    );
  };

  const runEndToEndTest = async () => {
    if (!user || !projectId) {
      addResult(
        "validation",
        "failed",
        "User not authenticated or project ID missing"
      );
      return;
    }

    setIsRunning(true);
    setResults([]);

    try {
      const token = await user.getIdToken();
      if (!token) {
        addResult(
          "authentication",
          "failed",
          "Failed to get authentication token"
        );
        return;
      }

      // Step 1: Check project exists
      addResult("project_check", "running", "Checking if project exists...");
      const projectResponse = await fetch(`/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!projectResponse.ok) {
        updateResult(
          "project_check",
          "failed",
          "Project not found or access denied"
        );
        return;
      }

      const projectData = await projectResponse.json();
      updateResult(
        "project_check",
        "completed",
        `Project found: ${projectData.project.name}`,
        projectData
      );

      // Step 2: Check documents in project
      addResult("documents_check", "running", "Checking project documents...");
      const documentsResponse = await fetch(
        `/api/projects/${projectId}/documents`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!documentsResponse.ok) {
        updateResult("documents_check", "failed", "Failed to fetch documents");
        return;
      }

      const documentsData = await documentsResponse.json();
      updateResult(
        "documents_check",
        "completed",
        `Found ${documentsData.documents.length} documents`,
        documentsData
      );

      if (documentsData.documents.length === 0) {
        addResult(
          "test_complete",
          "failed",
          "No documents found. Please upload documents first."
        );
        return;
      }

      // Step 3: Check processing status
      addResult(
        "processing_status",
        "running",
        "Checking document processing status..."
      );
      const statusResponse = await fetch(
        `/api/projects/${projectId}/processing-status`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!statusResponse.ok) {
        updateResult(
          "processing_status",
          "failed",
          "Failed to fetch processing status"
        );
        return;
      }

      const statusData = await statusResponse.json();
      updateResult(
        "processing_status",
        "completed",
        `Processing status: ${statusData.is_processing ? "Active" : "Idle"}`,
        statusData
      );

      // Step 4: Test vector search
      if (query) {
        addResult("vector_search", "running", "Testing vector search...");

        const searchResponse = await fetch("/api/test/embed", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            query,
            project_id: projectId,
            max_results: 5,
          }),
        });

        if (!searchResponse.ok) {
          updateResult("vector_search", "failed", "Vector search failed");
          return;
        }

        const searchData = await searchResponse.json();
        updateResult(
          "vector_search",
          "completed",
          `Found ${searchData.chunks.length} relevant chunks`,
          searchData
        );
      }

      // Step 5: Test AI agent access
      addResult(
        "ai_agent_test",
        "running",
        "Testing AI agent access to embeddings..."
      );

      const agentResponse = await fetch("/api/agents/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          project_id: projectId,
          message: query || "What documents are available in this project?",
          context: {
            use_vector_search: true,
            max_results: 3,
          },
        }),
      });

      if (!agentResponse.ok) {
        updateResult("ai_agent_test", "failed", "AI agent test failed");
        return;
      }

      const agentData = await agentResponse.json();
      updateResult(
        "ai_agent_test",
        "completed",
        "AI agent successfully accessed embeddings",
        agentData
      );

      addResult(
        "test_complete",
        "completed",
        "End-to-end test completed successfully!"
      );
    } catch (error) {
      console.error("Test failed:", error);
      addResult(
        "test_complete",
        "failed",
        "Test failed with error",
        null,
        error instanceof Error ? error.message : "Unknown error"
      );
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: TestResult["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "running":
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      default:
        return (
          <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
        );
    }
  };

  const getStatusBadgeVariant = (status: TestResult["status"]) => {
    switch (status) {
      case "completed":
        return "default";
      case "failed":
        return "destructive";
      case "running":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Embedding Flow Test
        </h1>
        <p className="text-gray-600">
          Test the complete flow from document upload to AI agent usage
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Test Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Test Configuration
            </CardTitle>
            <CardDescription>Configure the test parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="projectId">Project ID</Label>
              <Input
                id="projectId"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="Enter project ID"
                disabled={isRunning}
              />
            </div>

            <div>
              <Label htmlFor="query">Test Query (Optional)</Label>
              <Textarea
                id="query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter a query to test vector search"
                disabled={isRunning}
                rows={3}
              />
            </div>

            <Button
              onClick={runEndToEndTest}
              disabled={isRunning || !user || !projectId}
              className="w-full"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running Test...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Run End-to-End Test
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Test Results */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Test Results
            </CardTitle>
            <CardDescription>Real-time test execution results</CardDescription>
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No test results yet</p>
                <p className="text-sm">
                  Configure and run a test to see results
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((result, index) => (
                  <div key={index} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(result.status)}
                        <span className="font-medium">{result.step}</span>
                      </div>
                      <Badge variant={getStatusBadgeVariant(result.status)}>
                        {result.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      {result.message}
                    </p>
                    {result.error && (
                      <Alert variant="destructive" className="mt-2">
                        <AlertDescription>{result.error}</AlertDescription>
                      </Alert>
                    )}
                    {result.data && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-500 cursor-pointer">
                          View Data
                        </summary>
                        <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-auto">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Test Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Prerequisites:</h4>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>You must be authenticated</li>
                <li>Project must exist and you must have access</li>
                <li>Project should have documents uploaded</li>
                <li>Documents should be processed (have embeddings)</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">Test Steps:</h4>
              <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
                <li>Verify project exists and is accessible</li>
                <li>Check documents in the project</li>
                <li>Verify processing status</li>
                <li>Test vector search (if query provided)</li>
                <li>Test AI agent access to embeddings</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
