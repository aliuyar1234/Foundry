/**
 * SOP Prompt Templates
 * Templates for generating Standard Operating Procedures using LLM
 */

export interface ProcessInput {
  id: string;
  name: string;
  description?: string;
  steps: ProcessStepInput[];
  variants?: ProcessVariantInput[];
  metrics?: ProcessMetrics;
  participants?: string[];
  systems?: string[];
  documents?: string[];
}

export interface ProcessStepInput {
  id: string;
  name: string;
  description?: string;
  type: 'start' | 'end' | 'task' | 'decision' | 'subprocess';
  performer?: string;
  system?: string;
  avgDuration?: number;
  frequency?: number;
  nextSteps?: string[];
  conditions?: string[];
}

export interface ProcessVariantInput {
  id: string;
  name: string;
  frequency: number;
  stepSequence: string[];
  avgDuration?: number;
}

export interface ProcessMetrics {
  avgCycleTime?: number;
  minCycleTime?: number;
  maxCycleTime?: number;
  avgSteps?: number;
  completionRate?: number;
  bottlenecks?: string[];
}

export interface SOPGenerationOptions {
  language: 'en' | 'de';
  style: 'formal' | 'conversational';
  detailLevel: 'brief' | 'standard' | 'detailed';
  includeFlowchart?: boolean;
  includeCheckboxes?: boolean;
  includeTimelines?: boolean;
  targetAudience?: string;
  companyName?: string;
  department?: string;
}

const SYSTEM_PROMPT_EN = `You are an expert technical writer specializing in creating clear, comprehensive Standard Operating Procedures (SOPs) for business processes. You transform process mining data and workflow analysis into professional documentation that employees can follow.

Your SOPs should:
- Be clear and unambiguous
- Follow a logical step-by-step structure
- Include all necessary details without being verbose
- Anticipate common questions and edge cases
- Include appropriate warnings and notes
- Be formatted in clean Markdown`;

const SYSTEM_PROMPT_DE = `Sie sind ein erfahrener technischer Redakteur, der sich auf die Erstellung klarer, umfassender Standardarbeitsanweisungen (SOPs) für Geschäftsprozesse spezialisiert hat. Sie verwandeln Process-Mining-Daten und Workflow-Analysen in professionelle Dokumentation, der Mitarbeiter folgen können.

Ihre SOPs sollten:
- Klar und eindeutig sein
- Einer logischen Schritt-für-Schritt-Struktur folgen
- Alle notwendigen Details enthalten, ohne weitschweifig zu sein
- Häufige Fragen und Grenzfälle vorwegnehmen
- Angemessene Warnungen und Hinweise enthalten
- In sauberem Markdown formatiert sein`;

export function getSystemPrompt(language: 'en' | 'de'): string {
  return language === 'de' ? SYSTEM_PROMPT_DE : SYSTEM_PROMPT_EN;
}

export function generateSOPPrompt(
  process: ProcessInput,
  options: SOPGenerationOptions
): string {
  const { language, style, detailLevel, targetAudience, companyName, department } = options;

  if (language === 'de') {
    return generateSOPPromptDE(process, options);
  }

  return `Generate a Standard Operating Procedure (SOP) document for the following business process.

## Process Information

**Process Name:** ${process.name}
${process.description ? `**Description:** ${process.description}` : ''}
${companyName ? `**Company:** ${companyName}` : ''}
${department ? `**Department:** ${department}` : ''}
${targetAudience ? `**Target Audience:** ${targetAudience}` : ''}

## Process Steps

${formatProcessSteps(process.steps, language)}

${process.variants && process.variants.length > 0 ? `
## Process Variants

${formatVariants(process.variants, language)}
` : ''}

${process.metrics ? `
## Process Metrics

${formatMetrics(process.metrics, language)}
` : ''}

${process.participants && process.participants.length > 0 ? `
## Participants/Roles

${process.participants.map(p => `- ${p}`).join('\n')}
` : ''}

${process.systems && process.systems.length > 0 ? `
## Systems Used

${process.systems.map(s => `- ${s}`).join('\n')}
` : ''}

## Generation Requirements

- **Style:** ${style === 'formal' ? 'Formal/Professional' : 'Conversational/Friendly'}
- **Detail Level:** ${detailLevel === 'brief' ? 'Brief overview' : detailLevel === 'detailed' ? 'Comprehensive with all details' : 'Standard detail level'}
${options.includeCheckboxes ? '- Include checkboxes for each step' : ''}
${options.includeTimelines ? '- Include estimated time for each step' : ''}
${options.includeFlowchart ? '- Include a text-based flowchart representation' : ''}

## Required SOP Sections

Generate the SOP with the following sections:

1. **Document Header**
   - Title, Version, Effective Date, Document Owner
   - Revision History table

2. **Purpose**
   - Clear statement of the procedure's objective

3. **Scope**
   - What this procedure covers and doesn't cover

4. **Definitions**
   - Key terms and acronyms used

5. **Responsibilities**
   - Who is responsible for what

6. **Procedure**
   - Numbered step-by-step instructions
   - Include decision points and alternative paths
   - Add notes, warnings, and tips where appropriate

7. **Related Documents**
   - References to other procedures or documents

8. **Appendices** (if needed)
   - Forms, checklists, reference tables

Please generate the complete SOP document in Markdown format.`;
}

function generateSOPPromptDE(
  process: ProcessInput,
  options: SOPGenerationOptions
): string {
  const { style, detailLevel, targetAudience, companyName, department } = options;

  return `Erstellen Sie ein Standardarbeitsanweisungs-Dokument (SOP) für den folgenden Geschäftsprozess.

## Prozessinformationen

**Prozessname:** ${process.name}
${process.description ? `**Beschreibung:** ${process.description}` : ''}
${companyName ? `**Unternehmen:** ${companyName}` : ''}
${department ? `**Abteilung:** ${department}` : ''}
${targetAudience ? `**Zielgruppe:** ${targetAudience}` : ''}

## Prozessschritte

${formatProcessSteps(process.steps, 'de')}

${process.variants && process.variants.length > 0 ? `
## Prozessvarianten

${formatVariants(process.variants, 'de')}
` : ''}

${process.metrics ? `
## Prozesskennzahlen

${formatMetrics(process.metrics, 'de')}
` : ''}

${process.participants && process.participants.length > 0 ? `
## Beteiligte/Rollen

${process.participants.map(p => `- ${p}`).join('\n')}
` : ''}

${process.systems && process.systems.length > 0 ? `
## Verwendete Systeme

${process.systems.map(s => `- ${s}`).join('\n')}
` : ''}

## Generierungsanforderungen

- **Stil:** ${style === 'formal' ? 'Formell/Professionell' : 'Umgangssprachlich/Freundlich'}
- **Detailgrad:** ${detailLevel === 'brief' ? 'Kurze Übersicht' : detailLevel === 'detailed' ? 'Umfassend mit allen Details' : 'Standarddetailgrad'}
${options.includeCheckboxes ? '- Kontrollkästchen für jeden Schritt einfügen' : ''}
${options.includeTimelines ? '- Geschätzte Zeit für jeden Schritt angeben' : ''}
${options.includeFlowchart ? '- Textbasierte Flussdiagrammdarstellung einfügen' : ''}

## Erforderliche SOP-Abschnitte

Erstellen Sie die SOP mit folgenden Abschnitten:

1. **Dokumentkopf**
   - Titel, Version, Gültigkeitsdatum, Dokumentverantwortlicher
   - Revisionsverlauf-Tabelle

2. **Zweck**
   - Klare Aussage über das Ziel des Verfahrens

3. **Geltungsbereich**
   - Was dieses Verfahren abdeckt und was nicht

4. **Definitionen**
   - Wichtige Begriffe und Abkürzungen

5. **Verantwortlichkeiten**
   - Wer ist wofür verantwortlich

6. **Verfahren**
   - Nummerierte Schritt-für-Schritt-Anweisungen
   - Entscheidungspunkte und alternative Pfade einbeziehen
   - Hinweise, Warnungen und Tipps wo angemessen hinzufügen

7. **Verwandte Dokumente**
   - Verweise auf andere Verfahren oder Dokumente

8. **Anhänge** (falls erforderlich)
   - Formulare, Checklisten, Referenztabellen

Bitte erstellen Sie das vollständige SOP-Dokument im Markdown-Format.`;
}

function formatProcessSteps(steps: ProcessStepInput[], language: 'en' | 'de'): string {
  return steps.map((step, index) => {
    const typeLabel = language === 'de'
      ? { start: 'Start', end: 'Ende', task: 'Aufgabe', decision: 'Entscheidung', subprocess: 'Unterprozess' }
      : { start: 'Start', end: 'End', task: 'Task', decision: 'Decision', subprocess: 'Subprocess' };

    const lines = [
      `### ${index + 1}. ${step.name}`,
      `- **${language === 'de' ? 'Typ' : 'Type'}:** ${typeLabel[step.type]}`,
    ];

    if (step.description) {
      lines.push(`- **${language === 'de' ? 'Beschreibung' : 'Description'}:** ${step.description}`);
    }
    if (step.performer) {
      lines.push(`- **${language === 'de' ? 'Ausführender' : 'Performer'}:** ${step.performer}`);
    }
    if (step.system) {
      lines.push(`- **${language === 'de' ? 'System' : 'System'}:** ${step.system}`);
    }
    if (step.avgDuration) {
      const durationLabel = language === 'de' ? 'Durchschnittliche Dauer' : 'Average Duration';
      lines.push(`- **${durationLabel}:** ${formatDuration(step.avgDuration, language)}`);
    }
    if (step.frequency) {
      lines.push(`- **${language === 'de' ? 'Häufigkeit' : 'Frequency'}:** ${step.frequency}%`);
    }
    if (step.nextSteps && step.nextSteps.length > 0) {
      const nextLabel = language === 'de' ? 'Nächste Schritte' : 'Next Steps';
      lines.push(`- **${nextLabel}:** ${step.nextSteps.join(', ')}`);
    }
    if (step.conditions && step.conditions.length > 0) {
      const condLabel = language === 'de' ? 'Bedingungen' : 'Conditions';
      lines.push(`- **${condLabel}:** ${step.conditions.join('; ')}`);
    }

    return lines.join('\n');
  }).join('\n\n');
}

function formatVariants(variants: ProcessVariantInput[], language: 'en' | 'de'): string {
  return variants.map((variant, index) => {
    const lines = [
      `### ${language === 'de' ? 'Variante' : 'Variant'} ${index + 1}: ${variant.name}`,
      `- **${language === 'de' ? 'Häufigkeit' : 'Frequency'}:** ${variant.frequency}%`,
      `- **${language === 'de' ? 'Schrittfolge' : 'Step Sequence'}:** ${variant.stepSequence.join(' → ')}`,
    ];

    if (variant.avgDuration) {
      const durationLabel = language === 'de' ? 'Durchschnittliche Dauer' : 'Average Duration';
      lines.push(`- **${durationLabel}:** ${formatDuration(variant.avgDuration, language)}`);
    }

    return lines.join('\n');
  }).join('\n\n');
}

function formatMetrics(metrics: ProcessMetrics, language: 'en' | 'de'): string {
  const lines: string[] = [];

  if (metrics.avgCycleTime) {
    const label = language === 'de' ? 'Durchschnittliche Zykluszeit' : 'Average Cycle Time';
    lines.push(`- **${label}:** ${formatDuration(metrics.avgCycleTime, language)}`);
  }
  if (metrics.minCycleTime && metrics.maxCycleTime) {
    const label = language === 'de' ? 'Zykluszeit-Bereich' : 'Cycle Time Range';
    lines.push(`- **${label}:** ${formatDuration(metrics.minCycleTime, language)} - ${formatDuration(metrics.maxCycleTime, language)}`);
  }
  if (metrics.avgSteps) {
    const label = language === 'de' ? 'Durchschnittliche Schritte' : 'Average Steps';
    lines.push(`- **${label}:** ${metrics.avgSteps}`);
  }
  if (metrics.completionRate) {
    const label = language === 'de' ? 'Abschlussrate' : 'Completion Rate';
    lines.push(`- **${label}:** ${metrics.completionRate}%`);
  }
  if (metrics.bottlenecks && metrics.bottlenecks.length > 0) {
    const label = language === 'de' ? 'Identifizierte Engpässe' : 'Identified Bottlenecks';
    lines.push(`- **${label}:** ${metrics.bottlenecks.join(', ')}`);
  }

  return lines.join('\n');
}

function formatDuration(minutes: number, language: 'en' | 'de'): string {
  if (minutes < 60) {
    return language === 'de' ? `${minutes} Minuten` : `${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (language === 'de') {
    return remainingMinutes > 0
      ? `${hours} Stunden ${remainingMinutes} Minuten`
      : `${hours} Stunden`;
  }
  return remainingMinutes > 0
    ? `${hours} hours ${remainingMinutes} minutes`
    : `${hours} hours`;
}

export const REVIEW_PROMPT_EN = `Review the following SOP for completeness, clarity, and accuracy. Identify any:
1. Missing steps or information
2. Unclear instructions
3. Potential safety or compliance issues
4. Inconsistencies with the process data provided

Provide specific suggestions for improvement.`;

export const REVIEW_PROMPT_DE = `Überprüfen Sie die folgende SOP auf Vollständigkeit, Klarheit und Genauigkeit. Identifizieren Sie:
1. Fehlende Schritte oder Informationen
2. Unklare Anweisungen
3. Potenzielle Sicherheits- oder Compliance-Probleme
4. Inkonsistenzen mit den bereitgestellten Prozessdaten

Geben Sie konkrete Verbesserungsvorschläge.`;

export function getReviewPrompt(language: 'en' | 'de'): string {
  return language === 'de' ? REVIEW_PROMPT_DE : REVIEW_PROMPT_EN;
}
