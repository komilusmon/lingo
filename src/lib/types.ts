export type Level = 'A2' | 'B1' | 'B2';
export type ReviewStatus = 'new' | 'learning' | 'mistake' | 'review' | 'mastered';
export type ReviewResult = 'again' | 'hard' | 'good' | 'easy';

export interface DrillInput {
  id: string;
  term: string;
  level: Level;
  type: 'word' | 'phrase';
  translation?: string;
}

export interface GeneratedItem {
  id: string;
  term: string;
  translation?: string;
  definitionEn?: string;
  clueSynonyms?: string[];
  level: Level;
  type: 'word' | 'phrase';
  sentence: string;
  blankedSentence: string;
  sentenceUz?: string;
  answer: string;
  hint: string;
  explanation?: string;
}

export interface StudyCard extends GeneratedItem {
  status: ReviewStatus;
  nextReviewAt: string;
  lastReviewedAt?: string;
  attempts: number;
  correctStreak: number;
  intervalDays: number;
  mastery: number;
  lastResult?: ReviewResult;
  isSolved?: boolean;
  translationRevealCount?: number;
}

export interface DrillSession {
  id: string;
  createdAt: string;
  level: Level;
  status: 'draft' | 'generated' | 'completed';
  items: StudyCard[];
  correctCount: number;
  totalCount: number;
  xpBalance: number;
}
