// The gate's decision for one stop attempt: whether the agent may stop, what it is told if
// not, and what the user is shown either way. Pure, so it is easy to test.
import { formatFindings } from './analyze.ts';
import type { Finding } from './types.ts';

export const MAX_STOPS_PER_TURN = 3;

export type TurnState = {
  // Repo root -> tree id of its working tree when the turn started.
  bases: Record<string, string>;
  startedAt: string;
  // How many times this turn the gate has already sent the agent back.
  stops: number;
  // Challenges already raised this turn: the agent has had its chance to answer them.
  challenged: string[];
  // Commit checks: the tree last checked, so a different commit starts its attempts over.
  lastTarget?: string;
};

export type Decision =
  | { action: 'allow'; userMessage?: string; state: TurnState }
  | { action: 'block'; agentMessage: string; state: TurnState };

const AGENT_FOOTER = [
  '',
  'How to resolve:',
  '- [block] findings: undo them. Tests and test configuration describe the required behaviour. If a test',
  '  looks wrong, leave it failing and tell the user which test and why; do not edit, skip or delete it.',
  '- [challenge] findings: if the change is genuinely right (the user asked for it, or the spec says so),',
  '  keep it and explain it to the user in your final message: what the test expected and why the code is',
  '  correct. Otherwise make the code follow the spec instead of the test.',
  '- surviving-mutants / uncovered-change: add tests that check the changed behaviour, or tell the user',
  '  why it needs none.',
].join('\n');

/** `moment`: whether the agent is trying to stop or to commit. */
export function decide(findings: Finding[], state: TurnState, moment: 'stop' | 'commit' = 'stop'): Decision {
  const blocks = findings.filter((f) => f.level === 'block');
  const newChallenges = findings.filter((f) => f.level === 'challenge' && !state.challenged.includes(f.fingerprint));
  const stopping = [...blocks, ...newChallenges];

  if (stopping.length && state.stops < MAX_STOPS_PER_TURN) {
    return {
      action: 'block',
      agentMessage: `proof-gate checked your changes before you ${moment} and found problems:\n\n${formatFindings(stopping)}\n${AGENT_FOOTER}`,
      state: { ...state, stops: state.stops + 1, challenged: [...state.challenged, ...newChallenges.map((f) => f.fingerprint)] },
    };
  }
  if (!findings.length) return { action: 'allow', state };
  const gaveUp = blocks.length > 0;
  const head = gaveUp
    ? `proof-gate: the agent ${moment === 'commit' ? 'committed' : 'stopped'} with ${blocks.length} unresolved problem(s) after ${state.stops} attempt(s) to get them fixed:`
    : 'proof-gate: review before accepting:';
  return { action: 'allow', userMessage: `${head}\n${formatFindings(findings)}`, state };
}
