'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FrameworkScore } from '@/lib/types/report-types';

interface HeatmapCell {
  framework: string;
  category: string;
  score: number;
  color: string;
  percentage: number;
}

interface ComplianceHeatmapProps {
  frameworkScores: FrameworkScore[];
  title?: string;
  onCellClick?: (framework: string, category: string, score: number) => void;
  showPercentages?: boolean;
  colorScheme?: 'default' | 'redgreen' | 'blues';
}

export function ComplianceHeatmap({
  frameworkScores,
  title = "Compliance Heatmap",
  onCellClick,
  showPercentages = true,
  colorScheme = 'default'
}: ComplianceHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{ framework: string; category: string } | null>(null);

  const { heatmapData, frameworks, categories, maxScore } = useMemo(() => {
    if (!frameworkScores || frameworkScores.length === 0) {
      return { heatmapData: [], frameworks: [], categories: [], maxScore: 100 };
    }

    // Extract all unique categories
    const allCategories = new Set<string>();
    frameworkScores.forEach(fs => {
      Object.keys(fs.categoryScores).forEach(cat => allCategories.add(cat));
    });

    const categories = Array.from(allCategories).sort();
    const frameworks = frameworkScores.map(fs => fs.framework).sort();

    // Find max score for normalization
    const maxScore = Math.max(
      ...frameworkScores.flatMap(fs =>
        Object.values(fs.categoryScores).map(cs => cs.maxScore)
      ),
      100
    );

    // Create heatmap data
    const heatmapData: HeatmapCell[] = [];
    frameworks.forEach(framework => {
      const frameworkData = frameworkScores.find(fs => fs.framework === framework);
      categories.forEach(category => {
        const categoryScore = frameworkData?.categoryScores[category];
        const score = categoryScore?.score || 0;
        const percentage = categoryScore?.percentage || Math.round((score / maxScore) * 100);

        heatmapData.push({
          framework,
          category,
          score,
          percentage,
          color: getHeatmapColor(percentage, colorScheme)
        });
      });
    });

    return { heatmapData, frameworks, categories, maxScore };
  }, [frameworkScores, colorScheme]);

  const handleCellClick = (cell: HeatmapCell) => {
    if (onCellClick) {
      onCellClick(cell.framework, cell.category, cell.score);
    }
  };

  if (!frameworkScores || frameworkScores.length === 0) {
    return (
      <Card className="enterprise-card">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-enterprise-text-primary">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-enterprise-text-secondary">No compliance data available</div>
            <div className="text-sm text-enterprise-text-tertiary mt-1">
              Run analysis to see compliance heatmap
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
        <div className="text-sm text-enterprise-text-secondary">
          Compliance scores across {frameworks.length} framework{frameworks.length !== 1 ? 's' : ''} and {categories.length} categories
        </div>
      </CardHeader>
      <CardContent>
        {/* Color scale legend */}
        <div className="mb-4">
          <div className="text-sm font-medium text-enterprise-text-primary mb-2">Score Scale</div>
          <div className="flex items-center gap-1">
            {[0, 25, 50, 75, 100].map((value, index) => (
              <div key={value} className="flex flex-col items-center">
                <div
                  className="w-6 h-4 border border-gray-300"
                  style={{ backgroundColor: getHeatmapColor(value, colorScheme) }}
                />
                {index === 0 || index === 4 ? (
                  <div className="text-xs text-enterprise-text-secondary mt-1">{value}%</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Heatmap grid */}
        <div className="overflow-x-auto">
          <div className="min-w-fit">
            {/* Header row with category names */}
            <div className="grid grid-cols-1 gap-1 mb-1" style={{ gridTemplateColumns: `200px repeat(${categories.length}, 1fr)` }}>
              <div className="h-12"></div> {/* Empty corner cell */}
              {categories.map(category => (
                <div
                  key={category}
                  className="h-12 flex items-center justify-center text-xs font-medium text-enterprise-text-primary bg-enterprise-surface-elevated rounded p-2 text-center"
                  title={category}
                >
                  {truncateText(category.replace(/([A-Z])/g, ' $1').trim(), 12)}
                </div>
              ))}
            </div>

            {/* Data rows */}
            {frameworks.map(framework => (
              <div
                key={framework}
                className="grid gap-1 mb-1"
                style={{ gridTemplateColumns: `200px repeat(${categories.length}, 1fr)` }}
              >
                {/* Framework name */}
                <div className="h-12 flex items-center justify-start text-sm font-medium text-enterprise-text-primary bg-enterprise-surface-elevated rounded px-3">
                  {truncateText(framework, 25)}
                </div>

                {/* Score cells */}
                {categories.map(category => {
                  const cell = heatmapData.find(c => c.framework === framework && c.category === category);
                  const isHovered = hoveredCell?.framework === framework && hoveredCell?.category === category;

                  return (
                    <div
                      key={`${framework}-${category}`}
                      className={`h-12 flex items-center justify-center text-sm font-medium rounded border-2 transition-all duration-200 ${
                        onCellClick ? 'cursor-pointer' : ''
                      } ${
                        isHovered ? 'border-blue-500 scale-105 z-10 shadow-lg' : 'border-transparent'
                      }`}
                      style={{
                        backgroundColor: cell?.color || '#F3F4F6',
                        color: getTextColor(cell?.percentage || 0)
                      }}
                      onClick={() => cell && handleCellClick(cell)}
                      onMouseEnter={() => setHoveredCell({ framework, category })}
                      onMouseLeave={() => setHoveredCell(null)}
                      title={`${framework} - ${category}: ${cell?.percentage || 0}% (${cell?.score || 0}/${maxScore})`}
                    >
                      {showPercentages ? `${cell?.percentage || 0}%` : (cell?.score || 0)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Summary stats */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-enterprise-surface-elevated rounded-lg">
            <div className="text-xs text-enterprise-text-secondary font-medium">Average Score</div>
            <div className="text-lg font-semibold text-enterprise-text-primary">
              {Math.round(
                heatmapData.reduce((sum, cell) => sum + cell.percentage, 0) / heatmapData.length
              )}%
            </div>
          </div>

          <div className="text-center p-3 bg-enterprise-surface-elevated rounded-lg">
            <div className="text-xs text-enterprise-text-secondary font-medium">Highest Score</div>
            <div className="text-lg font-semibold text-green-600">
              {Math.max(...heatmapData.map(cell => cell.percentage))}%
            </div>
          </div>

          <div className="text-center p-3 bg-enterprise-surface-elevated rounded-lg">
            <div className="text-xs text-enterprise-text-secondary font-medium">Lowest Score</div>
            <div className="text-lg font-semibold text-red-600">
              {Math.min(...heatmapData.map(cell => cell.percentage))}%
            </div>
          </div>

          <div className="text-center p-3 bg-enterprise-surface-elevated rounded-lg">
            <div className="text-xs text-enterprise-text-secondary font-medium">Coverage</div>
            <div className="text-lg font-semibold text-enterprise-text-primary">
              {Math.round((heatmapData.filter(cell => cell.score > 0).length / heatmapData.length) * 100)}%
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper functions
function getHeatmapColor(percentage: number, scheme: string): string {
  const normalizedValue = Math.max(0, Math.min(100, percentage)) / 100;

  switch (scheme) {
    case 'redgreen':
      if (normalizedValue < 0.5) {
        // Red to Yellow
        const ratio = normalizedValue * 2;
        return `rgb(${255}, ${Math.round(255 * ratio)}, 0)`;
      } else {
        // Yellow to Green
        const ratio = (normalizedValue - 0.5) * 2;
        return `rgb(${Math.round(255 * (1 - ratio))}, 255, 0)`;
      }

    case 'blues':
      return `rgb(${Math.round(240 - normalizedValue * 180)}, ${Math.round(248 - normalizedValue * 98)}, 255)`;

    default: // 'default'
      // Red to Yellow to Green
      if (percentage >= 80) return `rgb(${Math.round(22 + (percentage - 80) * 2)}, ${Math.round(163 + (percentage - 80) * 0.4)}, 74)`; // Green range
      if (percentage >= 60) return `rgb(${Math.round(202 + (percentage - 60) * 2.65)}, ${Math.round(138 + (percentage - 60) * 1.25)}, 4)`; // Yellow range
      if (percentage >= 40) return `rgb(${Math.round(234 + (percentage - 40) * 1.1)}, ${Math.round(88 + (percentage - 40) * 2.5)}, 12)`; // Orange range
      return `rgb(${Math.round(220 + percentage * 0.7)}, ${Math.round(38 + percentage * 1.25)}, ${Math.round(38 + percentage * 0.9)})`; // Red range
  }
}

function getTextColor(percentage: number): string {
  // Use white text for dark backgrounds, black for light backgrounds
  return percentage > 40 ? '#FFFFFF' : '#1F2937';
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}