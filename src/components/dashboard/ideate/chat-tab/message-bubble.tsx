'use client';

import { cn } from '@/lib/utils';
import { ChatMessage } from '../types';
import { Bot, User, Globe } from 'lucide-react';

interface MessageBubbleProps {
  message: ChatMessage;
  showTimestamp?: boolean;
}

export function MessageBubble({ message, showTimestamp = false }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  return (
    <div className={cn(
      'flex gap-3 mb-4',
      isUser ? 'justify-end' : 'justify-start'
    )}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-1">
          <Bot size={16} className="text-blue-600" />
        </div>
      )}

      <div className={cn(
        'ideate-message-bubble',
        isUser ? 'order-1' : 'order-2'
      )}>
        <div className={cn(
          'rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-blue-600 text-white rounded-br-md'
            : 'bg-gray-100 text-gray-900 rounded-bl-md'
        )}>
          <div className="whitespace-pre-wrap">
            {message.content}
          </div>

          {message.isOnlineLookup && (
            <div className="flex items-center gap-1 mt-2 opacity-75">
              <Globe size={12} />
              <span className="text-xs">Online research</span>
            </div>
          )}
        </div>

        {showTimestamp && (
          <div className={cn(
            'mt-1 text-xs text-gray-500',
            isUser ? 'text-right' : 'text-left'
          )}>
            {formatTime(message.timestamp)}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-1 order-2">
          <User size={16} className="text-gray-600" />
        </div>
      )}
    </div>
  );
}