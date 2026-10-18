// What the agent told the user about its own work.
import type { Finding, Rule } from '../types.ts';

const ADMITS = /\bspecial[- ]?cas(e|ed|ing)\b|\bhard-?cod(e|ed|ing)\b|\bI (changed|edited|updated|modified|rewrote|relaxed|loosened|weakened|removed|deleted|skipped|disabled) (one|the|that|a|two|some|those|this)? ?(failing |broken |contract )?tests?\b|\bchanged (the|its|that) (test'?s? )?expect\w*|\bjudge?ment call\b|\bwork(ed)? around (the|a|that) test\b/gi;

// Words just before a match that turn it into a denial or a hypothetical:
// "I didn't special-case it", "the only way would be a special case".
const NEGATED = /\b(didn't|did not|not|never|no|rather than|instead of|without|would|could|means|meaning|only way|require[sd]?|need(s|ed)? to|won't|haven't|wasn't|avoid(ed)?|refuse[sd]?)\b/i;

export const transcript: Rule = (ctx) => {
  const msg = ctx.finalMessage;
  if (!msg || !ctx.changes.length) return [];
  for (const m of msg.matchAll(ADMITS)) {
    const sentenceStart = Math.max(msg.lastIndexOf('.', m.index), msg.lastIndexOf('\n', m.index), -1) + 1;
    const lead = msg.slice(Math.max(sentenceStart, m.index - 80), m.index);
    if (NEGATED.test(lead)) continue;
    const end = msg.indexOf('\n', m.index);
    const sentence = msg.slice(Math.max(0, msg.lastIndexOf('\n', m.index) + 1), end === -1 ? undefined : end).trim().slice(0, 300);
    return [{
      rule: 'agent-admits-shortcut', level: 'info',
      message: 'The agent says it special-cased, hard-coded or changed a test. Read its explanation before accepting.',
      evidence: [sentence],
      fingerprint: `agent-admits-shortcut:${m[0].toLowerCase()}`,
    }];
  }
  return [];
};
