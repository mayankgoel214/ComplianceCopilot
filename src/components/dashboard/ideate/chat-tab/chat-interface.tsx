'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { SimpleChatInput } from './simple-chat-input';
import { ResearchPanel } from './research-panel';
import { ChatMessage, ResearchResult } from '../types';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  researchResults: ResearchResult[];
  onSendMessage: (message: string, isOnlineLookup: boolean) => void;
  isLoading?: boolean;
  onlineLookupEnabled: boolean;
  onToggleOnlineLookup: (enabled: boolean) => void;
  hasSourcesUploaded: boolean;
}

export function ChatInterface({
  messages,
  researchResults,
  onSendMessage,
  isLoading = false,
  onlineLookupEnabled,
  onToggleOnlineLookup,
  hasSourcesUploaded
}: ChatInterfaceProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages.length]);

  return (
    <div className="flex flex-col h-[600px]">
      {/* Messages Area */}
      <div className="flex-1 mb-4">
        <ScrollArea className="h-full w-full pr-4" ref={scrollAreaRef}>
          <div className="space-y-0">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-center">
                <div className="max-w-md">
                  {!hasSourcesUploaded ? (
                    <>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        Chat with AI
                      </h3>
                      <p className="text-gray-600 text-sm">
                        You can chat with the AI using the input below. For document-specific insights, upload sources in the Sources tab first.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        Start a Conversation
                      </h3>
                      <p className="text-gray-600 text-sm">
                        Ask questions, share thoughts, or request research about your compliance documents. Toggle &ldquo;Look up online&rdquo; for external information.
                      </p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Research Results Panel */}
                <ResearchPanel
                  results={researchResults}
                  isVisible={researchResults.length > 0}
                />

                {/* Messages */}
                {messages.map((message, index) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    showTimestamp={
                      index === 0 ||
                      index === messages.length - 1 ||
                      (index > 0 &&
                        message.timestamp.getTime() - messages[index - 1].timestamp.getTime() > 300000) // 5 minutes
                    }
                  />
                ))}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="flex gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-1">
                      <div className="w-4 h-4 bg-blue-600 rounded-full animate-pulse"></div>
                    </div>
                    <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 pt-4">
        {hasSourcesUploaded ? (
          <ChatInput
            onSendMessage={onSendMessage}
            isLoading={isLoading}
            onlineLookupEnabled={onlineLookupEnabled}
            onToggleOnlineLookup={onToggleOnlineLookup}
          />
        ) : (
          <SimpleChatInput
            placeholder="Type your message here (upload sources for full functionality)..."
          />
        )}
      </div>
    </div>
  );
}