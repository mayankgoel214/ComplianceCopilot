"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store/auth-store";
import { useProjectStore } from "@/stores/project-store/project-store";
import { EnterpriseLayout } from "@/components/enterprise/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Lock, TrendingUp, Shield, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { Project, Document } from "@/lib/db/types";
import { ComplianceDonutChart } from "@/components/dashboard/improve/compliance-donut-chart";
import { RiskPriorityChart } from "@/components/dashboard/improve/risk-priority-chart";
import { StatusIconsGrid } from "@/components/dashboard/improve/status-icons-grid";

interface ProjectData {
  project: Project;
  documents: Document[];
  stats: {
    documentCount: number;
    frameworkCount: number;
    lastAssessmentDate?: Date;
    latestScore?: number;
  };
}

export default function ProjectImprovePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading, isInitialized } = useAuthStore();
  const { setCurrentProject, fetchProjectById } = useProjectStore();
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasUploadedSources, setHasUploadedSources] = useState(false);

  useEffect(() => {
    if (isInitialized && !loading && !user) {
      router.push("/login");
      return;
    }

    if (user && isInitialized) {
      fetchProjectData();
      user.getIdToken().then(token => {
        fetchProjectById(id, token);
      });
    }
  }, [user, loading, isInitialized, router, id, fetchProjectById]);

  const fetchProjectData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const token = await user?.getIdToken();
      if (!token) {
        throw new Error("No authentication token");
      }

      const response = await fetch(`/api/projects/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Project not found");
        }
        throw new Error(`Failed to fetch project: ${response.statusText}`);
      }

      const data = await response.json().catch(() => {
        throw new Error("Invalid response format from server");
      });
      setProjectData(data);
      setHasUploadedSources(data.documents && data.documents.length > 0);
    } catch (error) {
      console.error("Error fetching project:", error);
      setError(
        error instanceof Error ? error.message : "Failed to load project"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Sample data for visualizations (using Project AETHER WATCH compliance data)
  const complianceData = [
    { framework: "ITAR", percentage: 65, color: "#ef4444" },
    { framework: "CMMC L2", percentage: 45, color: "#f59e0b" },
    { framework: "NIST 800-171", percentage: 78, color: "#10b981" },
    { framework: "DFARS", percentage: 82, color: "#3b82f6" }
  ];

  const riskData = [
    {
      category: "Export Control",
      highRisk: 8,
      mediumRisk: 5,
      lowRisk: 2,
      totalRisks: 15
    },
    {
      category: "Data Management",
      highRisk: 3,
      mediumRisk: 7,
      lowRisk: 8,
      totalRisks: 18
    },
    {
      category: "Access Control",
      highRisk: 5,
      mediumRisk: 4,
      lowRisk: 6,
      totalRisks: 15
    },
    {
      category: "Audit & Logging",
      highRisk: 2,
      mediumRisk: 6,
      lowRisk: 12,
      totalRisks: 20
    },
    {
      category: "Incident Response",
      highRisk: 4,
      mediumRisk: 3,
      lowRisk: 5,
      totalRisks: 12
    }
  ];

  const statusData = [
    {
      id: "1",
      title: "Export License Documentation",
      status: "warning" as const,
      category: "document" as const,
      description: "ITAR export license requirements not fully documented"
    },
    {
      id: "2",
      title: "CMMC Assessment",
      status: "pending" as const,
      category: "compliance" as const,
      description: "Level 2 certification assessment scheduled"
    },
    {
      id: "3",
      title: "MFA Implementation",
      status: "completed" as const,
      category: "system" as const,
      description: "Multi-factor authentication deployed across all systems"
    },
    {
      id: "4",
      title: "Data Classification",
      status: "failed" as const,
      category: "process" as const,
      description: "CUI marking procedures need revision"
    },
    {
      id: "5",
      title: "Audit Log Retention",
      status: "completed" as const,
      category: "system" as const,
      description: "Log retention policies implemented per NIST guidelines"
    },
    {
      id: "6",
      title: "IR Plan Review",
      status: "warning" as const,
      category: "process" as const,
      description: "Incident response plan needs DIBNet reporting updates"
    }
  ];

  if (loading || !isInitialized || isLoading) {
    return (
      <EnterpriseLayout>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="enterprise-shimmer h-8 w-64 rounded mb-2" />
              <div className="enterprise-shimmer h-4 w-96 rounded" />
            </div>
          </div>
          <div className="enterprise-shimmer h-96 rounded" />
        </div>
      </EnterpriseLayout>
    );
  }

  if (error) {
    return (
      <EnterpriseLayout>
        <div className="text-center py-16">
          <AlertTriangle className="h-16 w-16 text-enterprise-error mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-enterprise-text-primary mb-4">
            Something went wrong
          </h1>
          <p className="text-enterprise-text-secondary mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => router.push("/projects")} className="enterprise-button-secondary">
              Back to Projects
            </Button>
            <Button onClick={fetchProjectData} className="enterprise-button-primary">
              Try Again
            </Button>
          </div>
        </div>
      </EnterpriseLayout>
    );
  }

  if (!projectData) {
    return <EnterpriseLayout><div>Project not found</div></EnterpriseLayout>;
  }

  const { project } = projectData;

  if (!hasUploadedSources) {
    return (
      <EnterpriseLayout>
        <div className="space-y-6">
          <div className="enterprise-fade-in">
            <h1 className="text-3xl font-bold text-enterprise-text-primary">
              Roadmap
            </h1>
            <p className="text-enterprise-text-secondary mt-2">
              Compliance improvement roadmap for {project.name}
            </p>
          </div>

          <div className="enterprise-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="enterprise-card p-12 text-center">
              <div className="w-16 h-16 bg-enterprise-surface-elevated rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock className="h-8 w-8 text-enterprise-text-tertiary" />
              </div>
              <h3 className="text-xl font-semibold text-enterprise-text-primary mb-2">
                Upload Sources First
              </h3>
              <p className="text-enterprise-text-secondary mb-6 max-w-md mx-auto">
                To generate improvement recommendations, you need to upload documents or connect Google Drive folders to your project first.
              </p>
              <Button
                onClick={() => router.push(`/projects/${id}/sources`)}
                className="enterprise-button-primary"
              >
                Go to Sources
              </Button>
            </div>
          </div>
        </div>
      </EnterpriseLayout>
    );
  }

  return (
    <EnterpriseLayout>
      <div className="space-y-6">
        <div className="enterprise-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-8 w-8 text-enterprise-primary" />
            <h1 className="text-3xl font-bold text-enterprise-text-primary">
              Roadmap
            </h1>
          </div>
          <p className="text-enterprise-text-secondary">
            Compliance improvement roadmap for {project.name}
          </p>
        </div>

        {/* Compliance Analysis Document */}
        <div className="enterprise-fade-in" style={{ animationDelay: '0.1s' }}>
          <Card className="enterprise-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-enterprise-text-primary">
                <FileText className="h-5 w-5" />
                Compliance Improvement Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <div className="text-enterprise-text-secondary space-y-4">
                <p>
                  Based on the analysis of Project AETHER WATCH, several critical compliance gaps have been identified across multiple frameworks.
                  The project involves processing Controlled Unclassified Information (CUI) and ITAR-controlled technical data, requiring adherence
                  to stringent regulatory requirements.
                </p>

                <div className="grid md:grid-cols-2 gap-4 my-6">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <h4 className="font-semibold text-red-800">Critical Issues</h4>
                    </div>
                    <ul className="text-sm text-red-700 space-y-1">
                      <li>• Non-U.S. person access to ITAR data</li>
                      <li>• Incomplete CMMC Level 2 implementation</li>
                      <li>• Missing export license documentation</li>
                    </ul>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <h4 className="font-semibold text-green-800">Improvement Areas</h4>
                    </div>
                    <ul className="text-sm text-green-700 space-y-1">
                      <li>• Enhanced access control implementation</li>
                      <li>• Automated audit logging systems</li>
                      <li>• Improved data classification processes</li>
                    </ul>
                  </div>
                </div>

                <h4 className="font-semibold text-enterprise-text-primary">Key Recommendations:</h4>
                <ul className="list-disc list-inside space-y-2 text-sm">
                  <li><strong>Immediate:</strong> Implement attribute-based access control to prevent non-U.S. persons from accessing ITAR-controlled repositories</li>
                  <li><strong>Short-term:</strong> Complete CMMC Level 2 certification by addressing the 47 outstanding control requirements</li>
                  <li><strong>Medium-term:</strong> Establish automated compliance monitoring and reporting systems for continuous assessment</li>
                  <li><strong>Long-term:</strong> Develop comprehensive data governance framework with integrated risk management capabilities</li>
                </ul>

                <p className="text-xs text-enterprise-text-tertiary italic">
                  This analysis is based on example data from Project AETHER WATCH compliance documentation and should be customized for your specific project requirements.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Visualizations Grid */}
        <div className="grid lg:grid-cols-2 gap-6 enterprise-fade-in" style={{ animationDelay: '0.2s' }}>
          <ComplianceDonutChart
            data={complianceData}
            title="Framework Compliance Progress"
            centerText="Overall"
          />

          <RiskPriorityChart
            data={riskData}
            title="Risk Distribution by Category"
          />
        </div>

        {/* Status Grid */}
        <div className="enterprise-fade-in" style={{ animationDelay: '0.3s' }}>
          <StatusIconsGrid
            data={statusData}
            title="Implementation Status Overview"
            columns={3}
          />
        </div>
      </div>
    </EnterpriseLayout>
  );
}