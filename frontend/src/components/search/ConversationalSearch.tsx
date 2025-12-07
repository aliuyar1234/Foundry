/**
 * ConversationalSearch Component (T041)
 * AI-powered conversational search with follow-up support
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Bot,
  User,
  Loader2,
  AlertCircle,
  RefreshCw,
  X,
  MessageSquare,
  FileText,
  ExternalLink,
} from 'lucide-react';
import {
  searchApi,
  ConversationalResponse,
  SearchResult,
  ConversationMessage,
} from '../../services/search.api';

interface ConversationalSearchProps {
  onSourceClick?: (result: SearchResult) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
  confidence?: number;
  followUpQuestions?: string[];
  timestamp: Date;
  isLoading?: boolean;
  error?: string;
}

export const ConversationalSearch: React.FC<ConversationalSearchProps> = ({
  onSourceClick,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Generate unique message ID
  const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Handle sending a message
  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Add loading message
    const loadingId = generateId();
    setMessages((prev) => [
      ...prev,
      {
        id: loadingId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isLoading: true,
      },
    ]);

    try {
      let response: ConversationalResponse['data'];

      if (conversationId) {
        // Continue existing conversation
        const result = await searchApi.continueConversation(
          conversationId,
          userMessage.content
        );
        response = result.data;
      } else {
        // Start new conversation
        const result = await searchApi.startConversation(userMessage.content);
        response = result.data;
        if (response?.conversationId) {
          setConversationId(response.conversationId);
        }
      }

      // Replace loading message with response
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === loadingId
            ? {
                ...msg,
                content: response?.answer || 'Sorry, I could not generate a response.',
                sources: response?.sources,
                confidence: response?.confidence,
                followUpQuestions: response?.followUpQuestions,
                isLoading: false,
              }
            : msg
        )
      );
    } catch (error) {
      // Replace loading message with error
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === loadingId
            ? {
                ...msg,
                content: 'Sorry, something went wrong. Please try again.',
                isLoading: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  // Handle follow-up question click
  const handleFollowUpClick = (question: string) => {
    setInputValue(question);
    inputRef.current?.focus();
  };

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Start new conversation
  const handleNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setInputValue('');
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-2">
          <MessageSquare className="text-blue-600" size={20} />
          <h3 className="font-medium text-gray-800">AI Assistant</h3>
        </div>
        {conversationId && (
          <button
            onClick={handleNewConversation}
            className="flex items-center space-x-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <RefreshCw size={14} />
            <span>New chat</span>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <Bot className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h4 className="text-lg font-medium text-gray-700 mb-2">
              Ask me anything
            </h4>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              I can search through your organization's documents, emails, and
              messages to find relevant information and answer your questions.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {[
                'What decisions were made about project X?',
                'Who is responsible for customer support?',
                'Find recent documents about budgeting',
              ].map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => handleFollowUpClick(suggestion)}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full
                           hover:bg-gray-200 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-3'
                    : 'bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3'
                }`}
              >
                {/* Avatar */}
                <div className="flex items-center space-x-2 mb-2">
                  {message.role === 'assistant' ? (
                    <Bot size={16} className="text-blue-600" />
                  ) : (
                    <User size={16} />
                  )}
                  <span className="text-xs opacity-70">
                    {message.role === 'assistant' ? 'AI Assistant' : 'You'}
                  </span>
                </div>

                {/* Loading state */}
                {message.isLoading ? (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="animate-spin" size={16} />
                    <span>Thinking...</span>
                  </div>
                ) : message.error ? (
                  <div className="flex items-center space-x-2 text-red-600">
                    <AlertCircle size={16} />
                    <span>{message.content}</span>
                  </div>
                ) : (
                  <>
                    {/* Content */}
                    <div
                      className={`prose prose-sm max-w-none ${
                        message.role === 'user'
                          ? 'prose-invert'
                          : 'prose-gray'
                      }`}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>

                    {/* Confidence */}
                    {message.confidence !== undefined && (
                      <div className="mt-2 text-xs opacity-60">
                        Confidence: {Math.round(message.confidence * 100)}%
                      </div>
                    )}

                    {/* Sources */}
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-500 mb-2">Sources:</p>
                        <div className="space-y-1">
                          {message.sources.slice(0, 3).map((source, i) => (
                            <button
                              key={source.id}
                              onClick={() => onSourceClick?.(source)}
                              className="flex items-center space-x-2 text-xs text-blue-600
                                       hover:text-blue-800 w-full text-left"
                            >
                              <FileText size={12} />
                              <span className="truncate flex-1">
                                {source.metadata.title || `Source ${i + 1}`}
                              </span>
                              <ExternalLink size={12} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Follow-up questions */}
                    {message.followUpQuestions &&
                      message.followUpQuestions.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs text-gray-500 mb-2">
                            Suggested follow-ups:
                          </p>
                          <div className="space-y-1">
                            {message.followUpQuestions.map((question, i) => (
                              <button
                                key={i}
                                onClick={() => handleFollowUpClick(question)}
                                className="block text-xs text-blue-600 hover:text-blue-800
                                         text-left hover:underline"
                              >
                                → {question}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center space-x-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-xl
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
            className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <Send size={20} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConversationalSearch;
