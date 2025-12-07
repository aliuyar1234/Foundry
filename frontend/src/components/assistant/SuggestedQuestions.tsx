/**
 * Suggested Questions Component
 * T092 - Create suggested questions component
 */

import React from 'react';
import { Button } from '../ui/button';
import { getSuggestedQuestions } from '../../services/assistantApi';

interface SuggestedQuestionsProps {
  language?: 'en' | 'de';
  onSelect: (question: string) => void;
  category?: 'general' | 'process' | 'people' | 'operations';
}

// Category-specific suggestions
const CATEGORY_QUESTIONS = {
  general: {
    en: [
      'Who is responsible for invoice processing?',
      'What is the approval workflow for purchase orders?',
      'Show me employees with expertise in sales',
      'What are the main bottlenecks in our operations?',
      'Who should I contact about compliance questions?',
    ],
    de: [
      'Wer ist für die Rechnungsverarbeitung zuständig?',
      'Wie ist der Genehmigungsworkflow für Bestellungen?',
      'Zeige mir Mitarbeiter mit Expertise im Vertrieb',
      'Was sind die Hauptengpässe in unserem Betrieb?',
      'An wen wende ich mich bei Compliance-Fragen?',
    ],
  },
  process: {
    en: [
      'What are the steps in the onboarding process?',
      'How long does the approval process typically take?',
      'Who are the key people involved in order fulfillment?',
      'What happens if an invoice is rejected?',
      'Show me the workflow for handling customer complaints',
    ],
    de: [
      'Welche Schritte gibt es im Onboarding-Prozess?',
      'Wie lange dauert der Genehmigungsprozess normalerweise?',
      'Wer sind die Schlüsselpersonen in der Auftragsabwicklung?',
      'Was passiert, wenn eine Rechnung abgelehnt wird?',
      'Zeige mir den Workflow für Kundenbeschwerden',
    ],
  },
  people: {
    en: [
      'Who has expertise in SAP?',
      'Who is the team lead for customer support?',
      'Show me people in the finance department',
      'Who can help with technical issues?',
      'Who are the experts in data analysis?',
    ],
    de: [
      'Wer hat Expertise in SAP?',
      'Wer ist Teamleiter im Kundensupport?',
      'Zeige mir Mitarbeiter in der Finanzabteilung',
      'Wer kann bei technischen Problemen helfen?',
      'Wer sind die Experten für Datenanalyse?',
    ],
  },
  operations: {
    en: [
      'What is the current workload distribution?',
      'Are there any process bottlenecks right now?',
      'Show me today\'s pending approvals',
      'What\'s the average response time for support tickets?',
      'Are there any compliance issues to address?',
    ],
    de: [
      'Wie ist die aktuelle Arbeitslastverteilung?',
      'Gibt es gerade Prozessengpässe?',
      'Zeige mir die ausstehenden Genehmigungen von heute',
      'Wie ist die durchschnittliche Reaktionszeit bei Support-Tickets?',
      'Gibt es Compliance-Themen, die bearbeitet werden müssen?',
    ],
  },
};

export function SuggestedQuestions({
  language = 'en',
  onSelect,
  category = 'general',
}: SuggestedQuestionsProps) {
  const questions = CATEGORY_QUESTIONS[category][language];

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-gray-600">
        {language === 'de' ? 'Vorgeschlagene Fragen' : 'Suggested Questions'}
      </h4>
      <div className="flex flex-wrap gap-2">
        {questions.map((question, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            onClick={() => onSelect(question)}
            className="text-left h-auto py-2 px-3 whitespace-normal"
          >
            {question}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * Compact suggested questions for sidebar
 */
export function QuickQuestions({
  language = 'en',
  onSelect,
}: {
  language?: 'en' | 'de';
  onSelect: (question: string) => void;
}) {
  const quickQuestions = {
    en: [
      'Who can help me?',
      'Show processes',
      'Find experts',
      'What\'s pending?',
    ],
    de: [
      'Wer kann mir helfen?',
      'Zeige Prozesse',
      'Finde Experten',
      'Was ist offen?',
    ],
  };

  return (
    <div className="flex flex-wrap gap-1">
      {quickQuestions[language].map((question, index) => (
        <button
          key={index}
          onClick={() => onSelect(question)}
          className="text-xs px-2 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600"
        >
          {question}
        </button>
      ))}
    </div>
  );
}

/**
 * Follow-up suggestions based on current conversation
 */
export function FollowUpSuggestions({
  previousQuestion,
  previousAnswer,
  language = 'en',
  onSelect,
}: {
  previousQuestion: string;
  previousAnswer: string;
  language?: 'en' | 'de';
  onSelect: (question: string) => void;
}) {
  // Generate follow-up suggestions based on context
  const suggestions = generateFollowUps(previousQuestion, previousAnswer, language);

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t">
      <p className="text-xs text-gray-500 mb-2">
        {language === 'de' ? 'Weiterfragen:' : 'Follow-up questions:'}
      </p>
      <div className="flex flex-wrap gap-1">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSelect(suggestion)}
            className="text-xs px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Generate follow-up suggestions based on context
 */
function generateFollowUps(
  question: string,
  answer: string,
  language: 'en' | 'de'
): string[] {
  const suggestions: string[] = [];
  const lowerQuestion = question.toLowerCase();
  const lowerAnswer = answer.toLowerCase();

  // If discussing a person
  if (lowerAnswer.includes('person') || lowerAnswer.includes('employee') ||
      lowerAnswer.includes('mitarbeiter')) {
    suggestions.push(
      language === 'de'
        ? 'Welche anderen Experten gibt es?'
        : 'Who else has similar expertise?'
    );
    suggestions.push(
      language === 'de'
        ? 'Wie kann ich Kontakt aufnehmen?'
        : 'How can I contact them?'
    );
  }

  // If discussing a process
  if (lowerAnswer.includes('process') || lowerAnswer.includes('workflow') ||
      lowerAnswer.includes('prozess')) {
    suggestions.push(
      language === 'de'
        ? 'Wie lange dauert das normalerweise?'
        : 'How long does this typically take?'
    );
    suggestions.push(
      language === 'de'
        ? 'Wer ist für die Genehmigung zuständig?'
        : 'Who approves this?'
    );
  }

  // If discussing approval
  if (lowerQuestion.includes('approval') || lowerQuestion.includes('genehmigung')) {
    suggestions.push(
      language === 'de'
        ? 'Was sind die Genehmigungskriterien?'
        : 'What are the approval criteria?'
    );
  }

  // Generic follow-ups
  if (suggestions.length === 0) {
    suggestions.push(
      language === 'de'
        ? 'Kannst du das genauer erklären?'
        : 'Can you explain more?'
    );
    suggestions.push(
      language === 'de'
        ? 'Gibt es Alternativen?'
        : 'Are there alternatives?'
    );
  }

  return suggestions.slice(0, 3);
}

export default SuggestedQuestions;
