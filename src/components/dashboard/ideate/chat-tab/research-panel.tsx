'use client';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, ExternalLink, Globe } from 'lucide-react';
import { ResearchResult } from '../types';
import { useState } from 'react';

interface ResearchPanelProps {
  results: ResearchResult[];
  isVisible: boolean;
}

export function ResearchPanel({ results, isVisible }: ResearchPanelProps) {
  const [openPanels, setOpenPanels] = useState<Set<string>>(new Set());

  const togglePanel = (resultId: string) => {
    const newOpenPanels = new Set(openPanels);
    if (newOpenPanels.has(resultId)) {
      newOpenPanels.delete(resultId);
    } else {
      newOpenPanels.add(resultId);
    }
    setOpenPanels(newOpenPanels);
  };

  if (!isVisible || results.length === 0) {
    return null;
  }

  return (
    <div className="ideate-research-panel space-y-3 mb-4">
      {results.map((result) => (
        <Collapsible
          key={result.id}
          open={openPanels.has(result.id)}
          onOpenChange={() => togglePanel(result.id)}
        >
          <Card className="border border-blue-200 bg-blue-50/50">
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-3 cursor-pointer hover:bg-blue-50/70 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe size={16} className="text-blue-600" />
                    <CardTitle className="text-sm font-medium">
                      Research: &ldquo;{result.query}&rdquo;
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {result.results.length} results
                    </Badge>
                    {openPanels.has(result.id) ? (
                      <ChevronUp size={16} className="text-gray-500" />
                    ) : (
                      <ChevronDown size={16} className="text-gray-500" />
                    )}
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {result.results.map((item, index) => (
                    <div
                      key={index}
                      className="research-item p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm text-gray-900 line-clamp-2">
                            {item.title}
                          </h4>
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                            {item.snippet}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="secondary" className="text-xs">
                              {item.source}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          asChild
                          className="shrink-0"
                        >
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ))}
    </div>
  );
}