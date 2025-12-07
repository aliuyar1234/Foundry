/**
 * AI Assistant Page
 * T087 - Create AI assistant page
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ChatWindow } from '../../components/assistant/ChatWindow';
import { QuickQuestions } from '../../components/assistant/SuggestedQuestions';
import {
  createSession,
  getSessions,
  deleteSession,
  type ChatSession,
} from '../../services/assistantApi';

export function AssistantPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [language, setLanguage] = useState<'en' | 'de'>('en');

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      setLoading(true);
      const { sessions: loadedSessions } = await getSessions();
      setSessions(loadedSessions);

      // Auto-select most recent session if exists
      if (loadedSessions.length > 0 && !activeSession) {
        setActiveSession(loadedSessions[0]);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleNewSession() {
    try {
      setCreating(true);
      const session = await createSession({ language });
      setSessions((prev) => [session, ...prev]);
      setActiveSession(session);
    } catch (err) {
      console.error('Failed to create session:', err);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteSession(sessionId: string) {
    if (!confirm('Delete this conversation?')) return;

    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));

      if (activeSession?.id === sessionId) {
        const remaining = sessions.filter((s) => s.id !== sessionId);
        setActiveSession(remaining[0] || null);
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }

  function handleQuickQuestion(question: string) {
    // Create new session and send question
    handleNewSession();
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {/* Sidebar */}
      <div className="w-72 border-r bg-gray-50 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b bg-white">
          <h1 className="text-lg font-semibold">AI Assistant</h1>
          <p className="text-sm text-gray-500">
            Ask questions about your organization
          </p>
        </div>

        {/* Language selector */}
        <div className="p-4 border-b bg-white">
          <label className="text-xs text-gray-500 block mb-2">Language</label>
          <div className="flex gap-2">
            <button
              onClick={() => setLanguage('en')}
              className={`flex-1 py-1 px-3 rounded text-sm ${
                language === 'en'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              English
            </button>
            <button
              onClick={() => setLanguage('de')}
              className={`flex-1 py-1 px-3 rounded text-sm ${
                language === 'de'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Deutsch
            </button>
          </div>
        </div>

        {/* New chat button */}
        <div className="p-4 border-b">
          <Button
            onClick={handleNewSession}
            disabled={creating}
            className="w-full"
          >
            {creating ? 'Creating...' : '+ New Conversation'}
          </Button>
        </div>

        {/* Quick questions */}
        <div className="p-4 border-b">
          <QuickQuestions language={language} onSelect={handleQuickQuestion} />
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              No conversations yet
            </div>
          ) : (
            <div className="divide-y">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => setActiveSession(session)}
                  className={`p-3 cursor-pointer hover:bg-gray-100 ${
                    activeSession?.id === session.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">
                        {session.title || 'Untitled'}
                      </h4>
                      <p className="text-xs text-gray-500">
                        {formatDate(session.updatedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-xs">
                        {session.language === 'de' ? 'DE' : 'EN'}
                      </Badge>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(session.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-white text-xs text-gray-500">
          Powered by Claude AI
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 bg-white">
        {activeSession ? (
          <ChatWindow
            session={activeSession}
            onSessionUpdate={(updated) => {
              setSessions((prev) =>
                prev.map((s) => (s.id === updated.id ? updated : s))
              );
              setActiveSession(updated);
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle>
                  {language === 'de'
                    ? 'Willkommen beim AI-Assistenten'
                    : 'Welcome to AI Assistant'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-500">
                  {language === 'de'
                    ? 'Starten Sie eine neue Unterhaltung, um Fragen zu Ihrer Organisation zu stellen.'
                    : 'Start a new conversation to ask questions about your organization.'}
                </p>
                <Button onClick={handleNewSession} disabled={creating}>
                  {creating
                    ? 'Creating...'
                    : language === 'de'
                    ? 'Neue Unterhaltung starten'
                    : 'Start New Conversation'}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export default AssistantPage;
