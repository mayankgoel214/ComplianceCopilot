'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ComplianceScoreGaugeProps {
  score: number;
  maxScore?: number;
  title?: string;
  size?: 'sm' | 'md' | 'lg';
  showPercentage?: boolean;
  target?: number;
  riskLevel?: 'critical' | 'high' | 'medium' | 'low';
}

export function ComplianceScoreGauge({
  score,
  maxScore = 100,
  title = "Compliance Score",
  size = 'md',
  showPercentage = true,
  target,
  riskLevel
}: ComplianceScoreGaugeProps) {
  const { percentage, color, gaugeData, sizeConfig } = useMemo(() => {
    const percentage = Math.round((score / maxScore) * 100);

    const color = riskLevel ? getRiskColor(riskLevel) : getScoreColor(percentage);

    const remaining = 100 - percentage;
    const gaugeData = [
      { name: 'Score', value: percentage, fill: color },
      { name: 'Remaining', value: remaining, fill: '#E5E7EB' }
    ];

    const sizeConfigs = {
      sm: { width: 120, height: 120, innerRadius: 35, outerRadius: 50, fontSize: 'text-lg' },
      md: { width: 160, height: 160, innerRadius: 50, outerRadius: 70, fontSize: 'text-2xl' },
      lg: { width: 200, height: 200, innerRadius: 65, outerRadius: 90, fontSize: 'text-3xl' }
    };

    return {
      percentage,
      color,
      gaugeData,
      sizeConfig: sizeConfigs[size]
    };
  }, [score, maxScore, riskLevel, size]);

  const renderCustomLabel = () => {
    return (
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        className={`fill-enterprise-text-primary font-bold ${sizeConfig.fontSize}`}
      >
        {showPercentage ? `${percentage}%` : score}
      </text>
    );
  };

  return (
    <Card className="enterprise-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-enterprise-text-primary text-center">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        <div style={{ width: sizeConfig.width, height: sizeConfig.height }} className="relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={gaugeData}
                startAngle={180}
                endAngle={0}
                innerRadius={sizeConfig.innerRadius}
                outerRadius={sizeConfig.outerRadius}
                paddingAngle={2}
                dataKey="value"
              >
                {gaugeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {/* Center label */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className={`font-bold text-enterprise-text-primary ${sizeConfig.fontSize}`}>
                {showPercentage ? `${percentage}%` : score}
              </div>
              {showPercentage && (
                <div className="text-xs text-enterprise-text-secondary mt-1">
                  {score}/{maxScore}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Score interpretation */}
        <div className="mt-4 text-center">
          <div className={`text-sm font-medium ${getScoreTextClass(percentage)}`}>
            {getScoreLabel(percentage)}
          </div>

          {target && (
            <div className="text-xs text-enterprise-text-secondary mt-1">
              Target: {target}%
              {percentage >= target ? (
                <span className="text-green-600 ml-1">✓</span>
              ) : (
                <span className="text-orange-600 ml-1">
                  ({target - percentage}% to go)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Risk level indicator */}
        {riskLevel && (
          <div className="mt-2 flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: getRiskColor(riskLevel) }}
            />
            <span className="text-sm font-medium text-enterprise-text-secondary capitalize">
              {riskLevel} Risk
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Helper functions
function getScoreColor(percentage: number): string {
  if (percentage >= 80) return '#16A34A'; // Green
  if (percentage >= 60) return '#CA8A04'; // Yellow
  if (percentage >= 40) return '#EA580C'; // Orange
  return '#DC2626'; // Red
}

function getRiskColor(riskLevel: string): string {
  switch (riskLevel) {
    case 'low': return '#16A34A';    // Green
    case 'medium': return '#CA8A04'; // Yellow
    case 'high': return '#EA580C';   // Orange
    case 'critical': return '#DC2626'; // Red
    default: return '#6B7280';       // Gray
  }
}

function getScoreLabel(percentage: number): string {
  if (percentage >= 85) return 'Excellent';
  if (percentage >= 70) return 'Good';
  if (percentage >= 50) return 'Fair';
  if (percentage >= 30) return 'Poor';
  return 'Critical';
}

function getScoreTextClass(percentage: number): string {
  if (percentage >= 70) return 'text-green-600';
  if (percentage >= 50) return 'text-yellow-600';
  if (percentage >= 30) return 'text-orange-600';
  return 'text-red-600';
}