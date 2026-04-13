import type {RizzPeerRelationship} from './peerRelationship';

export type PersonaPack = {
  friendlinessThem: number;
  friendlinessLabel: string;
  flirtScore: number;
  flirtLabel: string;
  flirtHowTheyReply: string;
  topEmojis: {emoji: string, count: number}[];
  oneLiner: string;
};

const POS_RE = /\b(love|thanks|thank you|thank|lol|lmao|rofl|haha|hahaha|hehe|aww|aw|cute|nice|great|yes|yep|yay|appreciate|sweet|funny|hype|good|amazing|perfect|exactly|same|facts|bet|goat|slay|queen|king|best|miss you|proud|happy|glad|wonderful|adorable|wholesome|whoa|omg|omfg)\b/gi;

const FLIRT_RE = /\b(babe|baby|babygirl|handsome|pretty|beautiful|hot|cutie|date|crush|kiss|flirt|xoxo|thinking of you|miss you|ily|love you|good night|good morning|dream|snuggle|cuddle|heart)\b/gi;

const COLD_RE = /^(ok|k|kk|cool|nice|sure|yep|yeah|yup|mhm|hm|nah|no|idk|maybe|\.|…)$/i;

function hashStr(s: string): number {
  let h = 0;
  for(let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function extractEmojisFromText(text: string): string[] {
  const out: string[] = [];
  const re = /\p{Extended_Pictographic}/gu;
  let m: RegExpExecArray | null;
  while((m = re.exec(text)) !== null) {
    out.push(m[0]);
  }
  return out;
}

function topEmojisFromTexts(texts: string[], limit: number): {emoji: string, count: number}[] {
  const counts = new Map<string, number>();
  for(const t of texts) {
    for(const e of extractEmojisFromText(t)) {
      counts.set(e, (counts.get(e) || 0) + 1);
    }
  }
  return [...counts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, limit)
  .map(([emoji, count]) => ({emoji, count}));
}

export function friendlinessScoreForIncoming(incoming: string[]): number {
  return friendlinessFromIncoming(incoming).score;
}

function friendlinessFromIncoming(incoming: string[]): {score: number, label: string} {
  if(!incoming.length) {
    return {score: 0, label: 'No text from them yet'};
  }

  let posHits = 0;
  for(const t of incoming) {
    const m = t.match(POS_RE);
    if(m) posHits += m.length;
  }

  let cold = 0;
  for(const t of incoming) {
    const s = t.trim();
    if(!s) continue;
    if(s.length <= 3 || COLD_RE.test(s)) cold++;
  }
  const coldRatio = cold / incoming.length;

  let emojiMass = 0;
  for(const t of incoming) {
    emojiMass += extractEmojisFromText(t).length;
  }
  const emojiPerMsg = emojiMass / incoming.length;

  let qMass = 0;
  for(const t of incoming) {
    for(let i = 0; i < t.length; i++) {
      if(t[i] === '?') qMass++;
    }
  }
  const qPerMsg = qMass / incoming.length;

  let score = 38;
  score += Math.min(28, posHits * 1.1);
  score += Math.min(14, emojiPerMsg * 7);
  score += Math.min(10, qPerMsg * 12);
  score -= Math.min(28, coldRatio * 55);
  score = Math.max(0, Math.min(100, Math.round(score)));

  let label = 'Balanced energy';
  if(score >= 82) label = 'Certified sunshine';
  else if(score >= 65) label = 'Warm & engaged';
  else if(score >= 48) label = 'Friendly enough';
  else if(score >= 30) label = 'Low-key dry';
  else label = 'Ice age correspondent';

  return {score, label};
}

function flirtFromIncoming(incoming: string[]): {score: number, label: string, how: string} {
  if(!incoming.length) {
    return {score: 0, label: 'No data', how: 'They have not sent text in this window.'};
  }

  let hits = 0;
  for(const t of incoming) {
    const m = t.match(FLIRT_RE);
    if(m) hits += m.length;
    for(const e of extractEmojisFromText(t)) {
      if('😘💕❤😍🥰💋🔥😏💖'.includes(e)) hits += 1.2;
    }
  }

  const perMsg = hits / incoming.length;
  const score = Math.min(100, Math.round(18 + perMsg * 42 + Math.min(22, hits * 1.5)));

  let label = 'Friendly Wi-Fi';
  let how = 'Replies read like polite small talk with good manners.';
  if(score <= 18) {
    label = 'NPC energy';
    how = 'Replies are short and mission-focused. Romance not detected.';
  } else if(score <= 38) {
    label = 'Professional green bubble';
    how = 'Warmth shows up, but flirting is on mute.';
  } else if(score <= 58) {
    label = 'Warm undertones';
    how = 'There is occasional sparkle—could be friendly, could be more.';
  } else if(score <= 78) {
    label = 'Main-character flirt';
    how = 'Compliments and emoji show up like they mean it.';
  } else {
    label = 'Chaos goblin with heart eyes';
    how = 'Their keyboard is in full rizz mode.';
  }

  return {score, label, how};
}

function oneLiner(
  peerKey: string,
  rel: RizzPeerRelationship,
  friendliness: number,
  flirt: number,
  topEmoji: string | undefined
): string {
  const h = hashStr(peerKey + '|' + rel + '|' + friendliness + '|' + flirt);
  const emojiBit = topEmoji ? `Favors ${topEmoji}. ` : '';

  const romantic: string[] = [
    `${emojiBit}If this chat were a movie, the trailer would spoil the ending.`,
    `${emojiBit}Your notifications are doing cardio without a warm-up.`,
    `${emojiBit}Romantic subplot loading… please stand by for butterflies.`
  ];
  const situationshipLines: string[] = [
    `${emojiBit}Status: complicated—in the fun way, maybe.`,
    `${emojiBit}It's giving "read receipts with feelings."`,
    `${emojiBit}Plot armor on, labels still loading.`
  ];
  const friendLines: string[] = [
    `${emojiBit}Certified hype human—would share fries and honest opinions.`,
    `${emojiBit}Emotionally available in the group-chat sense, but nicer.`,
    `${emojiBit}Friend-tier energy: supportive, chaotic, occasionally unhinged.`
  ];
  const coworkerLines: string[] = [
    `${emojiBit}Strictly professional—more calendar invites than heart emojis.`,
    `${emojiBit}Slack energy in a Telegram trench coat.`,
    `${emojiBit}Could negotiate a raise and a lunch in the same breath.`
  ];
  const familyLines: string[] = [
    `${emojiBit}Would roast you lovingly and then ask if you ate.`,
    `${emojiBit}Family-texting: loud, loyal, slightly unhinged.`,
    `${emojiBit}Emotionally invested like a group chat with history.`
  ];
  const rivalLines: string[] = [
    `${emojiBit}Competitive typing detected—this is a respectful arms race.`,
    `${emojiBit}They reply like every message is a ranked match.`,
    `${emojiBit}Banter turned up; feelings TBD.`
  ];
  const acquaintanceLines: string[] = [
    `${emojiBit}Polite orbit: close enough to wave, far enough to be mysterious.`,
    `${emojiBit}Small talk MVP with occasional plot twists.`,
    `${emojiBit}Acquaintance mode: cordial, curious, not yet unhinged.`
  ];
  const neutral: string[] = [
    `${emojiBit}Schrodinger's texter: friendly until proven otherwise.`,
    `${emojiBit}Emoji usage suggests a personality; message length suggests sleep.`,
    `${emojiBit}A delightful enigma wrapped in push notifications.`
  ];

  let pool = neutral;
  if(rel === 'romantic' || rel === 'significant_other') pool = romantic;
  else if(rel === 'friend' || rel === 'longtime_friend') pool = friendLines;
  else if(rel === 'coworker') pool = coworkerLines;
  else if(rel === 'family') pool = familyLines;
  else if(rel === 'rival') pool = rivalLines;
  else if(rel === 'acquaintance') pool = acquaintanceLines;
  else if(rel === 'situationship') pool = situationshipLines;

  if(flirt >= 70 && rel !== 'coworker') {
    pool = pool.concat(romantic.slice(0, 1));
  }
  if(friendliness >= 80) {
    pool = pool.concat(friendLines.slice(0, 1));
  }

  return pool[h % pool.length];
}

export function computePersonaPack(
  peerKey: string,
  incomingTexts: string[],
  relationship: RizzPeerRelationship
): PersonaPack {
  const {score: friendlinessThem, label: friendlinessLabel} = friendlinessFromIncoming(incomingTexts);
  const {score: flirtScore, label: flirtLabel, how: flirtHowTheyReply} = flirtFromIncoming(incomingTexts);
  const topEmojis = topEmojisFromTexts(incomingTexts, 8);
  const topEmoji = topEmojis[0]?.emoji;
  const oneLinerStr = oneLiner(peerKey, relationship, friendlinessThem, flirtScore, topEmoji);

  return {
    friendlinessThem,
    friendlinessLabel,
    flirtScore,
    flirtLabel,
    flirtHowTheyReply,
    topEmojis,
    oneLiner: oneLinerStr
  };
}
