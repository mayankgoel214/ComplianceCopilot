"use client";

import { useEffect, useState, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";

interface ProcessingJob {
  job_id: string;
  document_id?: string;
  job_type: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: {
    documents: {
      total: number;
      processed: number;
    };
    chunks: {
      total: number;
      processed: number;
    };
  };
  timing: {
    started_at?: string;
    completed_at?: string;
    duration_seconds?: number;
  };
  error?: {
    message: string;
  };
  created_at: string;
}

interface ProcessingStatus {
  project_id: string;
  processing_status: {
    is_processing: boolean;
    active_jobs: number;
    progress_percentage: number;
    last_processing_date?: string;
  };
  statistics: {
    total_documents: number;
    processed_documents: number;
    total_chunks: number;
    total_tokens: number;
    average_chunk_size: number;
  };
  recent_jobs: ProcessingJob[];
}

interface ProcessingStatusProps {
  projectId: string;
  authToken: string;
  className?: string;
}

export function ProcessingStatus({
  projectId,
  authToken,
  className = "",
}: ProcessingStatusProps) {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("disconnected");
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connectToSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionStatus("connecting");
    setIsLoading(true);
    setError(null);

    // Note: EventSource doesn't support custom headers in the browser
    // We'll need to pass the token as a query parameter for SSE
    const eventSource = new EventSource(
      `/api/projects/${projectId}/processing-status/stream?token=${encodeURIComponent(
        authToken
      )}`
    );

    eventSource.onopen = () => {
      console.log("SSE connection opened");
      setConnectionStatus("connected");
      setIsConnected(true);
      setIsLoading(false);
      reconnectAttempts.current = 0;
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setStatus(data);
        setIsLoading(false);
      } catch (error) {
        console.error("Error parsing SSE message:", error);
      }
    };

    eventSource.addEventListener("initial", (event) => {
      try {
        const data = JSON.parse(event.data);
        setStatus(data);
        setIsLoading(false);
      } catch (error) {
        console.error("Error parsing initial SSE message:", error);
      }
    });

    eventSource.addEventListener("update", (event) => {
      try {
        const data = JSON.parse(event.data);
        setStatus(data);
      } catch (error) {
        console.error("Error parsing update SSE message:", error);
      }
    });

    eventSource.addEventListener("heartbeat", (event) => {
      // Heartbeat received, connection is alive
      console.log("SSE heartbeat received");
    });

    eventSource.addEventListener("error", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          setError(data.error);
        }
      } catch (error) {
        console.error("Error parsing error SSE message:", error);
      }
    });

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      setConnectionStatus("error");
      setIsConnected(false);

      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttempts.current),
          30000
        );

        console.log(
          `Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`
        );

        reconnectTimeoutRef.current = setTimeout(() => {
          connectToSSE();
        }, delay);
      } else {
        setError(
          "Failed to establish real-time connection. Falling back to manual refresh."
        );
        setIsLoading(false);
      }
    };

    eventSourceRef.current = eventSource;
  };

  const disconnectSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setConnectionStatus("disconnected");
    setIsConnected(false);
  };

  const fetchStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `/api/projects/${projectId}/processing-status`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch processing status");
      }

      const data = await response.json().catch(() => {
        throw new Error("Invalid response format from server");
      });
      setStatus(data);
    } catch (error) {
      console.error("Error fetching processing status:", error);
      setError(
        error instanceof Error ? error.message : "Failed to fetch status"
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Try to connect to SSE first
    connectToSSE();

    // Cleanup on unmount
    return () => {
      disconnectSSE();
    };
  }, [projectId, authToken]);

  // Fallback to polling if SSE fails
  useEffect(() => {
    if (connectionStatus === "error" && !isConnected) {
      const interval = setInterval(() => {
        if (status?.processing_status.is_processing) {
          fetchStatus();
        }
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [connectionStatus, isConnected, status?.processing_status.is_processing]);

  const getStatusIcon = (jobStatus: string) => {
    switch (jobStatus) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "running":
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadgeVariant = (jobStatus: string) => {
    switch (jobStatus) {
      case "completed":
        return "default";
      case "failed":
        return "destructive";
      case "running":
        return "secondary";
      case "pending":
        return "outline";
      default:
        return "outline";
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Processing Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Processing Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={fetchStatus} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Processing Status
              {status.processing_status.is_processing && (
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              )}
              {/* Connection status indicator */}
              <div className="flex items-center gap-1 ml-2">
                {connectionStatus === "connected" && (
                  <Wifi
                    className="h-4 w-4 text-green-600"
                    title="Real-time connection active"
                  />
                )}
                {connectionStatus === "connecting" && (
                  <Loader2
                    className="h-4 w-4 animate-spin text-yellow-600"
                    title="Connecting..."
                  />
                )}
                {connectionStatus === "error" && (
                  <WifiOff
                    className="h-4 w-4 text-red-600"
                    title="Connection failed, using fallback"
                  />
                )}
                {connectionStatus === "disconnected" && (
                  <WifiOff
                    className="h-4 w-4 text-gray-400"
                    title="Disconnected"
                  />
                )}
              </div>
            </CardTitle>
            <CardDescription>
              Document processing and embedding status
              {isConnected && (
                <span className="text-green-600 ml-2">• Live updates</span>
              )}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {!isConnected && (
              <Button
                onClick={connectToSSE}
                variant="outline"
                size="sm"
                title="Reconnect to live updates"
              >
                <Wifi className="h-4 w-4" />
              </Button>
            )}
            <Button
              onClick={fetchStatus}
              variant="outline"
              size="sm"
              title="Manual refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Overall Progress</span>
            <span>{status.processing_status.progress_percentage}%</span>
          </div>
          <Progress
            value={status.processing_status.progress_percentage}
            className="h-2"
          />
          <div className="text-xs text-gray-600">
            {status.statistics.processed_documents} of{" "}
            {status.statistics.total_documents} documents processed
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-600">Total Chunks</div>
            <div className="font-semibold">
              {status.statistics.total_chunks.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-gray-600">Total Tokens</div>
            <div className="font-semibold">
              {status.statistics.total_tokens?.toLocaleString() || "N/A"}
            </div>
          </div>
          <div>
            <div className="text-gray-600">Avg Chunk Size</div>
            <div className="font-semibold">
              {status.statistics.average_chunk_size} tokens
            </div>
          </div>
          <div>
            <div className="text-gray-600">Last Processed</div>
            <div className="font-semibold">
              {status.processing_status.last_processing_date
                ? new Date(
                    status.processing_status.last_processing_date
                  ).toLocaleDateString()
                : "Never"}
            </div>
          </div>
        </div>

        {/* Active Jobs */}
        {status.recent_jobs.filter(
          (job) => job.status === "pending" || job.status === "running"
        ).length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Active Processing</h4>
            {status.recent_jobs
              .filter(
                (job) => job.status === "pending" || job.status === "running"
              )
              .map((job) => (
                <div
                  key={job.job_id}
                  className="border rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(job.status)}
                      <span className="text-sm font-medium">
                        {job.job_type === "full_pipeline"
                          ? "Document Processing"
                          : job.job_type}
                      </span>
                    </div>
                    <Badge variant={getStatusBadgeVariant(job.status)}>
                      {job.status}
                    </Badge>
                  </div>
                  {job.progress.chunks.total > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>Chunks</span>
                        <span>
                          {job.progress.chunks.processed} /{" "}
                          {job.progress.chunks.total}
                        </span>
                      </div>
                      <Progress
                        value={
                          (job.progress.chunks.processed /
                            job.progress.chunks.total) *
                          100
                        }
                        className="h-1"
                      />
                    </div>
                  )}
                  {job.error && (
                    <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                      {job.error.message}
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}

        {/* Recent Jobs */}
        {status.recent_jobs.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Recent Activity</h4>
            <div className="space-y-2">
              {status.recent_jobs.slice(0, 3).map((job) => (
                <div
                  key={job.job_id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    {getStatusIcon(job.status)}
                    <span className="text-gray-700">
                      {job.job_type === "full_pipeline"
                        ? "Document Processing"
                        : job.job_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={getStatusBadgeVariant(job.status)}
                      size="sm"
                    >
                      {job.status}
                    </Badge>
                    {job.timing.duration_seconds && (
                      <span className="text-xs text-gray-500">
                        {Math.round(job.timing.duration_seconds)}s
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Processing Message */}
        {!status.processing_status.is_processing &&
          status.recent_jobs.filter(
            (job) => job.status === "pending" || job.status === "running"
          ).length === 0 &&
          status.recent_jobs.length === 0 && (
            <div className="text-center py-4 text-gray-500">
              <p className="text-sm">No processing activity yet</p>
              <p className="text-xs">Upload documents to start processing</p>
            </div>
          )}
      </CardContent>
    </Card>
  );
}
