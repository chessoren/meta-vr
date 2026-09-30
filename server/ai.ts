/**
 * The agentic core: Claude turns a raw course into a palace, in two stages.
 *
 *   1. TEACHER   (1 call, reads the text / photos / PDF)  → ≤ 20 atomic notions with accept variants + 2 distractors
 *   2. MNEMONIST (≤ 4 parallel calls, ≤ 5 notions each)   → one scene per notion, assembled ONLY from the model catalog
 *
 * Both stages use JSON-schema structured outputs (`output_config.format`), so the reply is guaranteed to parse and
 * every model id / animation is constrained to the catalog enum. (Forced `tool_choice` is rejected by current
 * models; structured outputs are the supported way to force a schema.) Each call has its own timeout and one retry,
 * inside a global deadline that keeps the whole import under the Vercel function limit. Anything that fails
 * degrades gracefully: stage 1 → offline splitter (in extract.ts), stage 2 → offline composer per notion.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Lang } from '../src/core/types';
import { MAX_NOTIONS } from '../src/core/types';
import type { ExtractRequestIn } from './api-types';
import { ANIMS, compactCatalog, MODEL_IDS } from './catalog';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

export interface AiConfig {
  model: string;
  effort: 'low' | 'medium' | 'high';
  /** Per-call timeout for the teacher stage, ms. */
  timeoutMs: number;
  /** Per-call timeout for a mnemonist batch, ms. */
  sceneTimeoutMs: number;
  /** Whole pipeline deadline, ms (the Vercel function allows 60 s). */
  budgetMs: number;
  /** Server-side refusal fallback (beta). */
  fallbacks: boolean;
}

export function aiConfigFromEnv(env: Record<string, string | undefined> = process.env): AiConfig {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(+v) && +v > 0 ? +v : d);
  const effort = env.LOCI_EFFORT === 'medium' || env.LOCI_EFFORT === 'high' ? env.LOCI_EFFORT : 'low';
  return {
    model: env.LOCI_MODEL || DEFAULT_MODEL,
    effort,
    timeoutMs: num(env.LOCI_AI_TIMEOUT_MS, 25_000),
    sceneTimeoutMs: num(env.LOCI_SCENE_TIMEOUT_MS, 20_000),
    budgetMs: num(env.LOCI_AI_BUDGET_MS, 52_000),
    fallbacks: env.LOCI_FALLBACKS !== 'off',
  };
}

// ─── schemas (strict JSON schema subset: every object closed, every property required) ─────────────

const str = { type: 'string' } as const;
const strArr = { type: 'array', items: str } as const;

export const TEACHER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'subject', 'lang', 'notions', 'warnings'],
  properties: {
    title: str,
    subject: str,
    lang: { type: 'string', enum: ['en', 'fr'] },
    notions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'answer', 'accept', 'distractors', 'type'],
        properties: {
          question: str,
          answer: str,
          accept: strArr,
          distractors: strArr,
          type: { type: 'string', enum: ['date', 'number', 'formula', 'definition', 'vocabulary', 'person', 'place', 'event', 'concept', 'other'] },
        },
      },
    },
    warnings: strArr,
  },
} as const;

export function mnemonistSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['scenes'],
    properties: {
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['index', 'actors', 'caption', 'hooks', 'accent'],
          properties: {
            index: { type: 'integer' },
            actors: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['model', 'role', 'anim', 'count', 'scale', 'label'],
                properties: {
                  model: { type: 'string', enum: [...MODEL_IDS].sort() },
                  role: { type: 'string', enum: ['hero', 'prop', 'count'] },
                  anim: { type: 'string', enum: [...ANIMS] },
                  count: { type: 'integer' },
                  scale: { type: 'number' },
                  label: str,
                },
              },
            },
            caption: str,
            hooks: strArr,
            accent: str,
          },
        },
      },
    },
  };
}

// ─── prompts ─────────────────────────────────────────────────────────────────

export const TEACHER_SYSTEM = `You are the course analyst of Loci, a mixed-reality memory palace: an expert teacher who is also a memory champion.
A student sends their course (photos of notes, a PDF or pasted text). Each notion you extract will be anchored on a real object in their bedroom; they will later recall it by looking at the object, hearing the question, and answering aloud or by pinching one of three answer bubbles.

Extract the most exam-relevant ATOMIC facts, at most ${MAX_NOTIONS}, in the order they appear in the course.
Priorities: dates and periods, numbers, constants and formulas, definitions and key vocabulary, people, places and works, cause → consequence facts. Skip headings, filler, anecdotes and anything a teacher would not examine. Use only what the material says; never invent or "complete" facts. Fewer, excellent notions beat many weak ones.

For each notion:
- question: one short, unambiguous question (at most ~15 words) that makes sense on its own, with its context named ("the Battle of Verdun", not "this battle"). It must have exactly one right answer.
- answer: the thing to recall, as short as possible (ideally ≤ 5 words, never a sentence): a year, a number with its unit, a name, a term.
- accept: other correct forms a student might say (without article, the year alone for a full date, digits vs words, abbreviation, common spelling variants). Can be empty.
- distractors: exactly 2 plausible WRONG answers of the same type and format: nearby years, the same number slightly perturbed with the same unit, other names or terms from the same course or domain. Never a correct answer, never a joke, never "none of these".
- type: the kind of fact.

Language: write questions, answers, accept and distractors in the language of the course (a French course gives French notions, keep accents). Set lang to the course language ("fr" or "en").
title: a short palace title (≤ 6 words) in the course language, taken from the course heading when there is one. subject: one or two English words for the palace shelf (History, Chemistry, Biology, Geography, Physics, Maths, Literature, Vocabulary, …).
warnings: only when something prevents a good result (illegible photo, not a course, too little content), one short English sentence each; otherwise an empty array.`;

export const MNEMONIST_SYSTEM = `You are the mnemonist of Loci, a memory champion who turns facts into vivid 3D mini-scenes. Each scene floats on a piece of the student's real furniture in mixed reality and fits in a 30 cm cube.
Scenes are assembled ONLY from the procedural model library below: no other object exists, and nothing is generated.

What makes an image unforgettable (method of loci):
1. Link the image to the ANSWER, cued by the question. Best: a sound-alike ("Avogadro" → AVOCADO, "Canberra" → a KANGAROO "can-berra"); else a meaning link (armistice → DOVE, Verdun → SOLDIERS); else a strong symbol of the domain.
2. Exaggerate and animate: giant, tiny, swarming, absurd, funny, in motion. Choose the animation that tells the story (juggle, rain, march, stack, orbit, spin, shake, fly, dance, flip, grow, bounce, wobble, float, idle).
3. Numbers: small counts (≤ 12) use an actor with role "count" and count = the number (six balls for 6.02 × 10²³). Years, big numbers, formulas and short words go on a label painted on a label-capable model (marked T: sign, plaque, flag, scroll, book…), max 24 characters, e.g. a plaque labelled "1916".
4. 1 to 3 actors; actors[0] is the hero (role "hero"). Usually hero + one prop or count group. For roles other than "count" set count to 1. scale 0.5–2 (1 = normal). label "" when none (and only on T models).
5. caption: ONE vivid English line (≤ 14 words), even for a French course, describing exactly what the student sees, with the 1–3 hook words in CAPS (the words that carry the memory link), e.g. "A giant AVOCADO juggling SIX glowing balls". hooks: those CAPS words, exactly as written in the caption.
6. accent: a #rrggbb halo colour that fits the mood (warm gold for glory, red for war, blue for water…).
7. Give each notion of the batch a different hero model when possible.

Return one scene per notion, with the notion's index.

Catalog — one model per line: id | tags | sounds-like | T = label-capable | natural animations
`;

// ─── calls ───────────────────────────────────────────────────────────────────

export class AiError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
  ) {
    super(message);
  }
}

function isRetryable(e: unknown): boolean {
  if (e instanceof AiError) return e.retryable;
  if (e instanceof Anthropic.APIConnectionError) return true; // includes timeouts
  if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError) return true;
  if (e instanceof Anthropic.APIError) return typeof e.status === 'number' && (e.status === 408 || e.status === 409 || e.status >= 500);
  return e instanceof SyntaxError;
}

type Content = Anthropic.Beta.BetaContentBlockParam[];

interface CallOpts {
  system: string;
  content: Content;
  schema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
}

export type Clock = () => number;

export class Pipeline {
  private deadline: number;
  constructor(
    private client: Anthropic,
    private cfg: AiConfig,
    private now: Clock = Date.now,
  ) {
    this.deadline = now() + cfg.budgetMs;
  }

  remaining() {
    return this.deadline - this.now();
  }

  /** One structured-output call, parsed. */
  private async callOnce<T>(o: CallOpts, timeoutMs: number): Promise<T> {
    const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
      model: this.cfg.model,
      max_tokens: o.maxTokens,
      system: [{ type: 'text', text: o.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: o.content }],
      output_config: { effort: this.cfg.effort, format: { type: 'json_schema', schema: o.schema } },
    };
    if (this.cfg.fallbacks) {
      params.betas = ['server-side-fallback-2026-07-01'];
      params.fallbacks = 'default';
    }
    const msg = await this.client.beta.messages.create(params, { timeout: timeoutMs, maxRetries: 0 });
    if (msg.stop_reason === 'refusal') throw new AiError('The AI declined this course', false);
    if (msg.stop_reason === 'max_tokens') throw new AiError('The AI answer was cut off', true);
    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (!text) throw new AiError('Empty AI answer', true);
    return JSON.parse(text) as T;
  }

  /** Call with one retry, both bounded by the global deadline. */
  async call<T>(o: CallOpts): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const t = Math.min(o.timeoutMs, this.remaining() - 1500);
      if (t < 4000) break;
      try {
        return await this.callOnce<T>(o, t);
      } catch (e) {
        last = e;
        if (!isRetryable(e)) throw e;
        console.warn(`[loci] AI call failed (attempt ${attempt + 1}):`, e instanceof Error ? e.message : e);
      }
    }
    throw last instanceof Error ? last : new AiError('AI deadline reached', false);
  }
}

// ─── stage 1: teacher ────────────────────────────────────────────────────────

export interface TeacherNotion {
  question: string;
  answer: string;
  accept: string[];
  distractors: string[];
  type: string;
}
export interface TeacherOut {
  title: string;
  subject: string;
  lang: Lang;
  notions: TeacherNotion[];
  warnings: string[];
}

export function teacherContent(req: ExtractRequestIn): Content {
  const content: Content = [];
  const titleLine = req.title ? `The student titled this course: "${req.title}".\n` : '';
  if (req.kind === 'text') {
    content.push({ type: 'text', text: `${titleLine}Here is the course:\n<course>\n${req.data}\n</course>` });
  } else if (req.kind === 'pdf') {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: req.data } });
    content.push({ type: 'text', text: `${titleLine}The course is the PDF above.` });
  } else {
    const imgs = [req.data, ...(req.more ?? [])];
    const mime = (req.mime ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
    imgs.forEach((data, i) => {
      if (imgs.length > 1) content.push({ type: 'text', text: `Page ${i + 1} of ${imgs.length}:` });
      content.push({ type: 'image', source: { type: 'base64', media_type: mime, data } });
    });
    content.push({
      type: 'text',
      text: `${titleLine}The course is the photo${imgs.length > 1 ? 's' : ''} of notes above (handwriting possible; read carefully, ignore what is not course content).`,
    });
  }
  return content;
}

export function runTeacher(p: Pipeline, req: ExtractRequestIn, cfg: AiConfig): Promise<TeacherOut> {
  return p.call<TeacherOut>({
    system: TEACHER_SYSTEM,
    content: teacherContent(req),
    schema: TEACHER_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 8000,
    timeoutMs: cfg.timeoutMs,
  });
}

// ─── stage 2: mnemonist ──────────────────────────────────────────────────────

export interface RawScene {
  index: number;
  actors: unknown[];
  caption: string;
  hooks: string[];
  accent: string;
}

let mnemonistSystemCache: string | undefined;
export function mnemonistSystem(): string {
  return (mnemonistSystemCache ??= MNEMONIST_SYSTEM + compactCatalog());
}

export async function runMnemonist(
  p: Pipeline,
  items: { index: number; question: string; answer: string }[],
  ctx: { title: string; subject: string; lang: Lang },
  cfg: AiConfig,
  batchSize = 5,
): Promise<{ scenes: Map<number, RawScene>; failedBatches: number }> {
  const batches: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += batchSize) batches.push(items.slice(i, i + batchSize));
  const schema = mnemonistSchema();
  const results = await Promise.allSettled(
    batches.map((batch) =>
      p.call<{ scenes: RawScene[] }>({
        system: mnemonistSystem(),
        content: [
          {
            type: 'text',
            text:
              `Palace: "${ctx.title}" (${ctx.subject}, course language: ${ctx.lang}).\n` +
              `Compose one scene for each notion:\n` +
              JSON.stringify(batch.map((n) => ({ index: n.index, question: n.question, answer: n.answer }))),
          },
        ],
        schema,
        maxTokens: 4000,
        timeoutMs: cfg.sceneTimeoutMs,
      }),
    ),
  );
  const scenes = new Map<number, RawScene>();
  let failedBatches = 0;
  results.forEach((r) => {
    if (r.status === 'fulfilled' && Array.isArray(r.value?.scenes)) {
      for (const s of r.value.scenes) if (s && Number.isInteger(s.index) && !scenes.has(s.index)) scenes.set(s.index, s);
    } else {
      failedBatches++;
      if (r.status === 'rejected') console.warn('[loci] mnemonist batch failed:', r.reason instanceof Error ? r.reason.message : r.reason);
    }
  });
  return { scenes, failedBatches };
}
