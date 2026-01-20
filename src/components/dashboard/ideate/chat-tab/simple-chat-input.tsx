'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SimpleChatInputProps {
  placeholder?: string;
  disabled?: boolean;
}

export function SimpleChatInput({
  placeholder = "Type your message or ask a question...",
  disabled = false
}: SimpleChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      // For now, just clear the input - no backend functionality
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
      {/* Input Area */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              "ideate-chat-input resize-none min-h-[44px] max-h-[120px]",
              "focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            )}
            rows={1}
          />
        </div>
        <Button
          onClick={handleSend}
          disabled={!message.trim() || disabled}
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