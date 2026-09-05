// AI Abuse & Toxicity Detection Service

const ABUSIVE_PATTERNS: { type: 'profanity' | 'harassment' | 'hate_speech' | 'disruption'; regex: RegExp; weight: number }[] = [
  // Profanity / Slurs / Explicit abuse
  { type: 'profanity', regex: /\b(f+u+c+k+|s+h+i+t+|b+i+t+c+h+|a+s+s+h+o+l+e+|b+a+s+t+a+r+d+|d+i+c+k+|p+u+s+s+y+|c+u+n+t+)\b/i, weight: 0.95 },
  { type: 'profanity', regex: /\b(f\*+k|s\*+t|b\*+h|a\*+le|stfu|wtf)\b/i, weight: 0.85 },
  // Harassment / Personal attacks & insults
  { type: 'harassment', regex: /\b(stupid|idiot|loser|ugly|trash|worthless|dumb|shut\s*up)\b/i, weight: 0.90 },
  { type: 'harassment', regex: /\b(get\s+out|nobody\s+likes\s+you|kill\s+yourself|die)\b/i, weight: 0.98 },
  // Hate speech / Discrimination
  { type: 'hate_speech', regex: /\b(n+i+g+g+[ae]r|f+a+g+g+o+t+|r+e+t+a+r+d+|terrorist)\b/i, weight: 0.99 },
  // Meeting disruption / Trolling
  { type: 'disruption', regex: /\b(hack(ed|ing)?\s+this\s+meeting|raid(ing)?|zoom\s*bomb(ing)?)\b/i, weight: 0.92 }
];

export interface ToxicityResult {
  isAbusive: boolean;
  violationType?: 'profanity' | 'harassment' | 'hate_speech' | 'disruption';
  confidence: number;
  matchedText?: string;
  cleanedText: string;
}

export function analyzeToxicity(text: string): ToxicityResult {
  if (!text || text.trim().length === 0) {
    return { isAbusive: false, confidence: 0, cleanedText: text };
  }

  const normalized = text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/([a-z])\1{2,}/g, '$1$1')
    .trim();
  const compact = normalized.replace(/[\s._-]+/g, '');

  for (const item of ABUSIVE_PATTERNS) {
    const match = normalized.match(item.regex) || compact.match(item.regex);
    if (match) {
      // Censor the matched pattern in the cleaned text
      const cleaned = text.replace(item.regex, (m) => '*'.repeat(m.length));
      return {
        isAbusive: true,
        violationType: item.type,
        confidence: item.weight,
        matchedText: match[0],
        cleanedText: cleaned,
      };
    }
  }

  return {
    isAbusive: false,
    confidence: 0.05,
    cleanedText: text,
  };
}
