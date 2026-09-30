/**
 * POST /api/extract core: course → ExtractResponse.
 * With ANTHROPIC_API_KEY: Claude two-stage pipeline (ai.ts) + strict post-validation and repair.
 * Without a key, or when the AI fails: the offline heuristic splitter (offline.ts) + offline scene composer.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { ExtractResponse, Lang, Notion } from '../src/core/types';
import { MAX_NOTIONS } from '../src/core/types';
import { newId } from './ids';
import type { ExtractRequestIn } from './api-types';
import { LIMITS } from './api-types';
import { aiConfigFromEnv, Pipeline, runMnemonist, runTeacher, type AiConfig, type TeacherOut } from './ai';
import { makeDistractors } from './distractors';
import { cap, detectLang, fold, trimAnswer } from './nlp';
import { splitCourse } from './offline';
import { repairScene, safeCompose } from './scenes';

export interface ExtractDeps {
  /** Injected client (tests). `null` forces offline. Default: created from ANTHROPIC_API_KEY. */
  client?: Anthropic | null;
  env?: Record<string, string | undefined>;
  config?: Partial<AiConfig>;
  now?: () => number;
}

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '');
const DEFAULT_TITLE: Record<Lang, string> = { en: 'My course', fr: 'Mon cours' };

function defaultClient(env: Record<string, string | undefined>): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0 });
}

/** Text available to the offline path for this request. */
function offlineText(req: ExtractRequestIn): string {
  if (req.kind === 'text') return req.data;
  return req.textHint ?? '';
}

// ─── offline ─────────────────────────────────────────────────────────────────

export function extractOffline(req: ExtractRequestIn, warnings: string[] = []): ExtractResponse {
  const text = offlineText(req);
  if (req.kind === 'image' && !text.trim()) {
    return {
      title: req.title || DEFAULT_TITLE.en,
      subject: 'Course',
      lang: 'en',
      notions: [],
      engine: 'offline',
      warnings: [...warnings, 'Photos need the AI service — paste the text instead.'],
    };
  }
  if (req.kind === 'pdf' && !text.trim()) {
    return {
      title: req.title || DEFAULT_TITLE.en,
      subject: 'Course',
      lang: 'en',
      notions: [],
      engine: 'offline',
      warnings: [...warnings, 'This PDF has no readable text layer and needs the AI service — paste the text instead.'],
    };
  }
  const split = splitCourse(text, { title: req.title });
  const answers = split.candidates.map((c) => c.answer);
  const heroes: string[] = [];
  const notions: Notion[] = split.candidates.map((c) => {
    const scene = safeCompose(c.question, c.answer, heroes);
    heroes.push(scene.actors[0].model);
    return {
      id: newId('n'),
      question: c.question.slice(0, LIMITS.questionChars),
      answer: c.answer.slice(0, LIMITS.answerChars),
      ...(c.accept.length ? { accept: c.accept } : {}),
      distractors: makeDistractors(c.answer, { lang: split.lang, pool: answers, extra: split.terms }),
      scene,
    };
  });
  const w = [...warnings];
  if (!notions.length) w.push('No clear facts found. Try one fact per line, e.g. "1914: start of World War I" or "term: definition".');
  else if (split.found > notions.length) w.push(`Found ${split.found} facts — kept the ${notions.length} most exam-relevant.`);
  if (req.kind !== 'text') w.push('Built from the text layer of your PDF, without AI — check each notion.');
  return {
    title: clean(split.title, LIMITS.titleChars) || DEFAULT_TITLE[split.lang],
    subject: split.subject,
    lang: split.lang,
    notions,
    engine: 'offline',
    ...(w.length ? { warnings: w } : {}),
  };
}

// ─── AI ──────────────────────────────────────────────────────────────────────

/** Post-validate the teacher output: lengths, duplicates, accept variants, exactly two distinct distractors. */
export function cleanTeacher(out: TeacherOut, req: ExtractRequestIn): { title: string; subject: string; lang: Lang; items: Omit<Notion, 'id' | 'scene'>[]; warnings: string[] } {
  const lang: Lang = out.lang === 'fr' || out.lang === 'en' ? out.lang : detectLang(offlineText(req) || JSON.stringify(out.notions ?? []));
  const seen = new Set<string>();
  const raw = Array.isArray(out.notions) ? out.notions : [];
  const picked: { question: string; answer: string; accept: string[]; given: unknown }[] = [];
  for (const n of raw) {
    if (picked.length >= MAX_NOTIONS) break;
    const question = clean(n?.question, LIMITS.questionChars);
    const answer = trimAnswer(clean(n?.answer, LIMITS.answerChars));
    if (question.length < 3 || !answer) continue;
    const key = fold(question);
    if (seen.has(key)) continue;
    seen.add(key);
    const accept = [...new Set((Array.isArray(n.accept) ? n.accept : []).map((a) => clean(a, LIMITS.answerChars)).filter((a) => a && fold(a) !== fold(answer)))].slice(0, 8);
    picked.push({ question, answer, accept, given: n.distractors });
  }
  const answers = picked.map((i) => i.answer);
  const items = picked.map(({ question, answer, accept, given }) => {
    const bad = (d: string) => !d || fold(d) === fold(answer) || accept.some((a) => fold(a) === fold(d));
    const ds: string[] = [];
    for (const d of Array.isArray(given) ? given : []) {
      const c = clean(d, LIMITS.answerChars);
      if (!bad(c) && !ds.some((x) => fold(x) === fold(c)) && ds.length < 2) ds.push(c);
    }
    if (ds.length < 2) {
      const extra = makeDistractors(answer, { lang, pool: answers.filter((a) => !ds.some((g) => fold(g) === fold(a))) });
      for (const e of extra) if (ds.length < 2 && !bad(e) && !ds.some((g) => fold(g) === fold(e))) ds.push(e);
    }
    const generic = lang === 'fr' ? ['Aucune de ces réponses', 'Autre chose'] : ['None of these', 'Something else'];
    for (const g of generic) if (ds.length < 2 && !ds.includes(g)) ds.push(g);
    const item: Omit<Notion, 'id' | 'scene'> = { question, answer, distractors: [ds[0], ds[1]] };
    if (accept.length) item.accept = accept;
    return item;
  });
  return {
    title: clean(out.title, LIMITS.titleChars) || req.title || DEFAULT_TITLE[lang],
    subject: cap(clean(out.subject, LIMITS.subjectChars)) || 'Course',
    lang,
    items,
    warnings: (Array.isArray(out.warnings) ? out.warnings : []).map((w) => clean(w, 200)).filter(Boolean).slice(0, 4),
  };
}

export async function extractWithAI(req: ExtractRequestIn, client: Anthropic, cfg: AiConfig, now: () => number = Date.now): Promise<ExtractResponse> {
  const p = new Pipeline(client, cfg, now);
  const teacher = cleanTeacher(await runTeacher(p, req, cfg), req);
  const warnings = [...teacher.warnings];
  if (!teacher.items.length) {
    return { title: teacher.title, subject: teacher.subject, lang: teacher.lang, notions: [], engine: 'ai', warnings: warnings.length ? warnings : ['No clear facts found in this course.'] };
  }
  const items = teacher.items.map((n, index) => ({ index, question: n.question, answer: n.answer }));
  let scenes = new Map<number, unknown>();
  let failed = 0;
  try {
    const r = await runMnemonist(p, items, teacher, cfg);
    scenes = r.scenes;
    failed = r.failedBatches;
  } catch (e) {
    console.warn('[loci] mnemonist failed', e);
    failed = 1;
  }
  let composed = 0;
  const heroes = [...scenes.values()].map((sc) => (sc as { actors?: { model?: string }[] }).actors?.[0]?.model).filter((m): m is string => typeof m === 'string');
  const notions: Notion[] = teacher.items.map((n, i) => {
    const rep = repairScene(scenes.get(i), n.question, n.answer, heroes);
    if (rep.status === 'composed') {
      composed++;
      heroes.push(rep.scene.actors[0].model);
    }
    return { id: newId('n'), ...n, scene: rep.scene };
  });
  if (failed || composed) warnings.push(`${composed} scene${composed > 1 ? 's were' : ' was'} composed offline — they may be less inventive.`);
  return { title: teacher.title, subject: teacher.subject, lang: teacher.lang, notions, engine: 'ai', ...(warnings.length ? { warnings } : {}) };
}

// ─── entry ───────────────────────────────────────────────────────────────────

export async function extract(req: ExtractRequestIn, deps: ExtractDeps = {}): Promise<ExtractResponse> {
  const env = deps.env ?? process.env;
  const client = req.offline ? null : deps.client === undefined ? defaultClient(env) : deps.client;
  if (client) {
    const cfg = { ...aiConfigFromEnv(env), ...deps.config };
    try {
      return await extractWithAI(req, client, cfg, deps.now);
    } catch (e) {
      console.warn('[loci] AI extraction failed, falling back to offline:', e instanceof Error ? e.message : e);
      return extractOffline(req, ['The AI service is unavailable right now — your palace was built offline. Check each notion.']);
    }
  }
  return extractOffline(req);
}

export const aiEnabled = (env: Record<string, string | undefined> = process.env) => !!env.ANTHROPIC_API_KEY;
