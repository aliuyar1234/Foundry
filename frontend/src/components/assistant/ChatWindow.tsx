/**
 * Chat Window Component
 * T088 - Create chat window component
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { CitationList } from './CitationList';
import { SuggestedQuestions } from './SuggestedQuestions';
import {
  getMessages,
  sendMessage,
  sendMessageStream,
  type ChatMessage,
  type ChatSession,
} from '../../services/assistantApi';

interface ChatWindowProps {
  session: ChatSession;
  onSessionUpdate?: (session: ChatSession) => void;
}

export function ChatWindow({ session, onSessionUpdate }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedCitations, setSelectedCitations] = useState<ChatMessage['citations']>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();
  }, [session.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  async function loadMessages() {
    try {
      setLoading(true);
      const { messages: loadedMessages } = await getMessages(session.id);
      setMessages(loadedMessages);
      setError(null);
    } catch (err) {
      setError('Failed to load messages');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function handleSendMessage(content: string, useStreaming: boolean = false) {
    if (!content.trim() || sending) return;

    // Add user message immediately
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      sessionId: session.id,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setSending(true);
    setError(null);

    try {
      if (useStreaming) {
        setStreamingContent('');
        let fullContent = '';
        let finalMessage: ChatMessage | undefined;

        for await (const chunk of sendMessageStream(session.id, content)) {
          if (chunk.type === 'chunk' && chunk.content) {
            fullContent += chunk.content;
            setStreamingContent(fullContent);
          } else if (chunk.type === 'done' && chunk.message) {
            finalMessage = chunk.message;
          } else if (chunk.type === 'error') {
            throw new Error(chunk.content || 'Streaming failed');
          }
        }

        setStreamingContent('');
        if (finalMessage) {
          setMessages((prev) => [...prev, finalMessage!]);
        }
      } else {
        const response = await sendMessage(session.id, content);
        setMessages((prev) => [...prev, response]);
      }
    } catch (err) {
      setError('Failed to send message');
      console.error(err);
      // Remove the temporary user message on error
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setSending(false);
    }
  }

  function handleSelectMessage(message: ChatMessage) {
    if (message.citations && message.citations.length > 0) {
      setSelectedCitations(message.citations);
    }
  }

  function handleSuggestedQuestion(question: string) {
    handleSendMessage(question);
  }

  if (loading) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader>
          <CardTitle>{session.title || 'Chat'}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-gray-500">Loading messages...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full flex gap-4">
      {/* Main Chat Area */}
      <Card className="flex-1 flex flex-col">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center justify-between">
            <span>{session.title || 'AI Assistant'}</span>
            <span className="text-sm font-normal text-gray-500">
              {session.language === 'de' ? 'Deutsch' : 'English'}
            </span>
          </CardTitle>
        </CardHeader>

        {/* Messages */}
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !sending && (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">
                {session.language === 'de'
                  ? 'Stellen Sie eine Frage über Ihre Organisation'
                  : 'Ask a question about your organization'}
              </p>
              <SuggestedQuestions
                language={session.language}
                onSelect={handleSuggestedQuestion}
              />
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onClick={() => handleSelectMessage(message)}
              isSelected={
                message.citations &&
                message.citations === selectedCitations
              }
            />
          ))}

          {streamingContent && (
            <MessageBubble
              message={{
                id: 'streaming',
                sessionId: session.id,
                role: 'assistant',
                content: streamingContent,
                createdAt: new Date().toISOString(),
              }}
              isStreaming
            />
          )}

          {sending && !streamingContent && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg p-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
              <Button
                size="sm"
                variant="outline"
                className="ml-2"
                onClick={() => setError(null)}
              >
                Dismiss
              </Button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </CardContent>

        {/* Input */}
        <div className="border-t p-4">
          <MessageInput
            onSend={handleSendMessage}
            disabled={sending}
            language={session.language}
            placeholder={
              session.language === 'de'
                ? 'Fragen Sie etwas...'
                : 'Ask something...'
            }
          />
        </div>
      </Card>

      {/* Citations Sidebar */}
      {selectedCitations && selectedCitations.length > 0 && (
        <Card className="w-80 flex-shrink-0">
          <CardHeader>
            <CardTitle className="text-sm">
              {session.language === 'de' ? 'Quellen' : 'Sources'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CitationList
              citations={selectedCitations}
              language={session.language}
            />
            <Button
              variant="ghost"
              size="sm"
              className="mt-4 w-full"
              onClick={() => setSelectedCitations([])}
            >
              Close
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ChatWindow;
