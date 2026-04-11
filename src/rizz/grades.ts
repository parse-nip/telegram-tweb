/** Parity with tdesktop `rizz_common.*` */

export enum Grade {
  Unknown,
  Brilliant,
  Good,
  Inaccuracy,
  Mistake,
  Blunder,
  Resignation,
  Book,
  Excellent,
  FreePiece,
  GreatFind,
  MissedWin,
  TakeBack,
  Checkmate
}

export function gradeToString(grade: Grade): string {
  switch(grade) {
    case Grade.Brilliant: return 'brilliant';
    case Grade.Good: return 'good';
    case Grade.Inaccuracy: return 'inaccuracy';
    case Grade.Mistake: return 'mistake';
    case Grade.Blunder: return 'blunder';
    case Grade.Resignation: return 'resignation';
    case Grade.Book: return 'book';
    case Grade.Excellent: return 'excellent';
    case Grade.FreePiece: return 'free_piece';
    case Grade.GreatFind: return 'great_find';
    case Grade.MissedWin: return 'missed_win';
    case Grade.TakeBack: return 'take_back';
    case Grade.Checkmate: return 'checkmate';
    default: return '';
  }
}

export function gradeFromString(s: string): Grade {
  let lower = s.trim().toLowerCase();
  if(!lower.length) return Grade.Unknown;
  lower = lower.replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if(!lower.length) return Grade.Unknown;

  if(lower.includes('checkmate') || lower.includes('date confirmed') || lower.includes('agreed to date') || lower.includes('yes to date')) {
    return Grade.Checkmate;
  }
  if(lower.includes('free piece') || lower.includes('obvious opening') || lower.includes('window') || lower.includes('green light')) {
    return Grade.FreePiece;
  }
  if(lower.includes('great find') || lower.includes('save the convo') || lower.includes('saved it') || lower.includes('recovery')) {
    return Grade.GreatFind;
  }
  if(lower.includes('missed win') || lower.includes('missed chance') || lower.includes('didnt ask') || lower.includes('hesitated')) {
    return Grade.MissedWin;
  }
  if(lower.includes('take back') || lower.includes('defuse') || lower.includes('walk back') || lower.includes('repair')) {
    return Grade.TakeBack;
  }
  if(lower.includes('book') || lower.includes('opening') || lower.includes('standard line')) {
    return Grade.Book;
  }
  if(lower.includes('excellent') || lower.includes('very good')) {
    return Grade.Excellent;
  }
  if(lower.includes('brilliant') || lower.includes('amazing') || lower.includes('great') || lower.includes('elite')) {
    return Grade.Brilliant;
  }
  if(lower.includes('good') || lower.includes('solid') || lower.includes('nice') || lower.includes('decent')) {
    return Grade.Good;
  }
  if(lower.includes('inaccuracy') || lower.includes('inaccurate') || lower.includes('alternative') || lower.includes('unclear') || lower.includes('mixed')) {
    return Grade.Inaccuracy;
  }
  if(lower.includes('mistake') || lower.includes('awkward') || lower.includes('weak') || lower.includes('off tone') || lower.includes('try hard')) {
    return Grade.Mistake;
  }
  if(lower.includes('blunder') || lower.includes('cringe') || lower.includes('terrible') || lower.includes('bad') || lower.includes('disaster')) {
    return Grade.Blunder;
  }
  if(lower.includes('resignation') || lower.includes('forfeit') || lower.includes('game over') || lower.includes('unsalvageable') || lower.includes('trainwreck')) {
    return Grade.Resignation;
  }
  return Grade.Unknown;
}

const GRADE_ICON: Partial<Record<Grade, string>> = {
  [Grade.Brilliant]: 'brilliant',
  [Grade.Good]: 'good',
  [Grade.Inaccuracy]: 'inaccuracy',
  [Grade.Mistake]: 'mistake',
  [Grade.Blunder]: 'blunder',
  [Grade.Resignation]: 'resignation',
  [Grade.Book]: 'book',
  [Grade.Excellent]: 'excellent',
  [Grade.FreePiece]: 'free_piece',
  [Grade.GreatFind]: 'great_find',
  [Grade.MissedWin]: 'missed_win',
  [Grade.TakeBack]: 'take_back',
  [Grade.Checkmate]: 'checkmate_black'
};

export function gradeIconBasename(grade: Grade): string | undefined {
  return GRADE_ICON[grade];
}

export function formatGradeTitle(grade: Grade): string {
  const s = gradeToString(grade);
  if(!s) return 'Unknown';
  return s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
