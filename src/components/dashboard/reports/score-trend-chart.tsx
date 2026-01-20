'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScoreTrend } from '@/lib/types/report-types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ScoreTrendChartProps {
  trends: ScoreTrend[];
  title?: string;
  height?: number;
  showOverallOnly?: boolean;
  targetScore?: number;
  frameworks?: string[];
  colors?: string[];
}

const DEFAULT_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#06B6D4', // Cyan
];

export function ScoreTrendChart({
  trends,
  title = "Score Trends",
  height = 350,
  showOverallOnly = false,
  targetScore = 80,
  frameworks,
  colors = DEFAULT_COLORS
}: ScoreTrendChartProps) {
  const { chartData, availableFrameworks, latestTrend, trendDirection } = useMemo(() => {
    if (!trends || trends.length === 0) {
      return { chartData: [], availableFrameworks: [], latestTrend: null, trendDirection: 'stable' as const };
    }

    // Extract available frameworks
    const allFrameworks = new Set<string>();
    trends.forEach(trend => {
      trend.frameworkScores.forEach(fs => allFrameworks.add(fs.framework));
    });

    const availableFrameworks = frameworks || Array.from(allFrameworks).sort();

    // Transform data for chart
    const chartData = trends.map(trend => {
      const dataPoint: any = {
        date: new Date(trend.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: new Date(trend.date),
        overall: trend.overallScore,
      };

      if (!showOverallOnly) {
        trend.frameworkScores.forEach(fs => {
          dataPoint[fs.framework] = fs.score;
        });
      }

      return dataPoint;
    });

    const latestTrend = trends[trends.length - 1];
    const trendDirection = latestTrend?.changeType || 'stable';

    return { chartData, availableFrameworks, latestTrend, trendDirection };
  }, [trends, showOverallOnly, frameworks]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const dataPoint = payload[0]?.payload;
    const fullDate = dataPoint?.fullDate ? new Date(dataPoint.fullDate).toLocaleDateString() : label;

    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-semibold text-gray-900 mb-2">{fullDate}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-gray-700">{entry.dataKey}:</span>
            </div>
            <span className="text-sm font-medium">{entry.value}%</span>
          </div>
        ))}
      </div>
    );
  };

  const getTrendIcon = () => {
    switch (trendDirection) {
      case 'improvement':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'decline':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      default:
        return <Minus className="w-4 h-4 text-gray-600" />;
    }
  };

  const getTrendText = () => {
    if (!latestTrend) return 'No data';

    const change = Math.abs(latestTrend.changeFromPrevious);
    const direction = latestTrend.changeType;

    if (direction === 'stable') return 'Stable (no change)';
    if (direction === 'improvement') return `+${change}% improvement`;
    if (direction === 'decline') return `-${change}% decline`;

    return 'No change';
  };

  if (!trends || trends.length === 0) {
    return (
      <Card className="enterprise-card">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-enterprise-text-primary">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-enterprise-text-secondary">No trend data available</div>
            <div className="text-sm text-enterprise-text-tertiary mt-1">
              Generate more reports to see progress over time
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (trends.length === 1) {
    return (
      <Card className="enterprise-card">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-enterprise-text-primary">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-enterprise-text-secondary">Only one data point available</div>
            <div className="text-sm text-enterprise-text-tertiary mt-1">
              Current overall score: {latestTrend?.overallScore}%
            </div>
            <div className="text-sm text-enterprise-text-tertiary">
              Generate more reports to see trends
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="enterprise-card">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-enterprise-text-primary">
          {title}
        </CardTitle>
        <div className="flex items-center gap-2 text-sm text-enterprise-text-secondary">
          {getTrendIcon()}
          {getTrendText()}
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />

              <XAxis
                dataKey="date"
                tick={{ fill: '#6B7280', fontSize: 12 }}
                axisLine={{ stroke: '#D1D5DB' }}
              />

              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#6B7280', fontSize: 12 }}
                axisLine={{ stroke: '#D1D5DB' }}
                label={{ value: 'Score (%)', angle: -90, position: 'insideLeft' }}
              />

              {/* Target line */}
              {targetScore && (
                <ReferenceLine
                  y={targetScore}
                  stroke="#10B981"
                  strokeDasharray="5 5"
                  label={{ value: `Target: ${targetScore}%`, position: 'topRight' }}
                />
              )}

              <Tooltip content={<CustomTooltip />} />

              <Legend
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="line"
              />

              {/* Overall score line */}
              <Line
                type="monotone"
                dataKey="overall"
                stroke="#1F2937"
                strokeWidth={3}
                dot={{ fill: '#1F2937', strokeWidth: 2, r: 5 }}
                activeDot={{ r: 7, stroke: '#1F2937', strokeWidth: 2 }}
                name="Overall Score"
              />

              {/* Framework-specific lines */}
              {!showOverallOnly && availableFrameworks.map((framework, index) => (
                <Line
                  key={framework}
                  type="monotone"
                  dataKey={framework}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2}
                  dot={{ fill: colors[index % colors.length], strokeWidth: 1, r: 4 }}
                  activeDot={{ r: 6, stroke: colors[index % colors.length], strokeWidth: 2 }}
                  name={framework}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Trend summary */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-enterprise-surface-elevated rounded-lg">
            <div className="text-xs text-enterprise-text-secondary font-medium">Current Score</div>
            <div className="text-lg font-semibold text-enterprise-text-primary">
              {latestTrend?.overallScore}%
            </div>
          </div>

          <div className="text-center p-3 bg-enterprise-surface-elevated rounded-lg">
            <div className="text-xs text-enterprise-text-secondary font-medium">Peak Score</div>
            <div className="text-lg font-semibold text-green-600">
              {Math.max(...chartData.map(d => d.overall))}%
            </div>
          </div>

          <div className="text-center p-3 bg-enterprise-surface-elevated rounded-lg">
            <div className="text-xs text-enterprise-text-secondary font-medium">Data Points</div>
            <div className="text-lg font-semibold text-enterprise-text-primary">
              {trends.length}
            </div>
          </div>

          <div className="text-center p-3 bg-enterprise-surface-elevated rounded-lg">
            <div className="text-xs text-enterprise-text-secondary font-medium">Time Span</div>
            <div className="text-lg font-semibold text-enterprise-text-primary">
              {trends.length > 1
                ? Math.ceil((new Date(trends[trends.length - 1].date).getTime() - new Date(trends[0].date).getTime()) / (1000 * 60 * 60 * 24))
                : 0} days
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}