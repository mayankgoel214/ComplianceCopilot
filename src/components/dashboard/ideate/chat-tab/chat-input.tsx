'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { Globe, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSendMessage: (message: string, isOnlineLookup: boolean) => void;
  isLoading?: boolean;
  placeholder?: string;
  onlineLookupEnabled: boolean;
  onToggleOnlineLookup: (enabled: boolean) => void;
}

export function ChatInput({
  onSendMessage,
  isLoading = false,
  placeholder = "Type your message or ask a question...",
  onlineLookupEnabled,
  onToggleOnlineLookup
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (message.trim() && !isLoading) {
      onSendMessage(message.trim(), onlineLookupEnabled);
      setMessage('');

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

  return (
    <div className="space-y-3">
      {/* Online Lookup Toggle */}
      <div className="flex items-center gap-2">
        <Toggle
          pressed={onlineLookupEnabled}
          onPressedChange={onToggleOnlineLookup}
          size="sm"
          className="data-[state=on]:bg-blue-600 data-[state=on]:text-white"
        >
          <Globe size={14} className="mr-1" />
          Look up online
        </Toggle>
        {onlineLookupEnabled && (
          <span className="text-xs text-blue-600">
            External research enabled
          </span>
        )}
      </div>

      {/* Input Area */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            className={cn(
              "ideate-chat-input resize-none min-h-[44px] max-h-[120px]",
              "focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            )}
            rows={1}
          />
        </div>
        <Button
          onClick={handleSend}
          disabled={!message.trim() || isLoading}
          size="sm"
          className="h-11 px-3"
        >
          <Send size={16} />
        </Button>
      </div>

      {/* Helper Text */}
      <p className="text-xs text-gray-500">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}