/**
 * Message Input Component
 * T090 - Create message input with autocomplete
 */

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/button';

interface MessageInputProps {
  onSend: (message: string, useStreaming?: boolean) => void;
  disabled?: boolean;
  language?: 'en' | 'de';
  placeholder?: string;
}

// Common question starters for autocomplete
const QUESTION_STARTERS = {
  en: [
    'Who is responsible for',
    'What is the process for',
    'How do I',
    'Where can I find',
    'When should I',
    'Who should I contact about',
    'Show me',
    'What are the',
    'List all',
    'Explain',
  ],
  de: [
    'Wer ist zuständig für',
    'Wie ist der Prozess für',
    'Wie kann ich',
    'Wo finde ich',
    'Wann sollte ich',
    'An wen wende ich mich bei',
    'Zeige mir',
    'Was sind die',
    'Liste alle',
    'Erkläre',
  ],
};

export function MessageInput({
  onSend,
  disabled,
  language = 'en',
  placeholder,
}: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [useStreaming, setUseStreaming] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Update suggestions based on input
    if (message.length > 0 && message.length < 30) {
      const starters = QUESTION_STARTERS[language];
      const matching = starters.filter((s) =>
        s.toLowerCase().startsWith(message.toLowerCase())
      );
      setSuggestions(matching);
      setShowSuggestions(matching.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [message, language]);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim(), useStreaming);
      setMessage('');
      setShowSuggestions(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === 'Tab' || (e.key === 'Enter' && selectedIndex >= 0)) {
        e.preventDefault();
        if (selectedIndex >= 0) {
          setMessage(suggestions[selectedIndex] + ' ');
          setShowSuggestions(false);
          setSelectedIndex(-1);
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSuggestionClick(suggestion: string) {
    setMessage(suggestion + ' ');
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  function adjustTextareaHeight() {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute bottom-full left-0 right-0 mb-1 bg-white border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto"
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              onClick={() => handleSuggestionClick(suggestion)}
              className={`px-4 py-2 cursor-pointer ${
                index === selectedIndex
                  ? 'bg-blue-50 text-blue-700'
                  : 'hover:bg-gray-50'
              }`}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex gap-2 items-end">
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="w-full p-3 pr-10 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
          <span className="absolute right-3 bottom-3 text-xs text-gray-400">
            {message.length > 0 && `${message.length}/10000`}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          {/* Streaming toggle */}
          <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={useStreaming}
              onChange={(e) => setUseStreaming(e.target.checked)}
              className="w-3 h-3"
            />
            Stream
          </label>

          {/* Send button */}
          <Button
            type="submit"
            disabled={disabled || !message.trim()}
            className="px-4"
          >
            {disabled ? (
              <span className="animate-pulse">...</span>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            )}
          </Button>
        </div>
      </div>

      {/* Keyboard hint */}
      <div className="text-xs text-gray-400 mt-1">
        {language === 'de' ? (
          <>Enter zum Senden, Shift+Enter für neue Zeile</>
        ) : (
          <>Press Enter to send, Shift+Enter for new line</>
        )}
      </div>
    </form>
  );
}

export default MessageInput;
