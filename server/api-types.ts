/**
 * Wire types of the import API that go beyond src/core/types.ts.
 * Type-only; safe to `import type` from the phone companion.
 */
import type { ExtractRequest, Palace, PairStatus } from '../src/core/types';

/** ExtractRequest + extra photos (several pages of notes in one go). */
export interface ExtractRequestIn extends ExtractRequest {
  /** Additional base64 images (same `mime` as `data`), for multi-page photo imports. */
  more?: string[];
  /** Skip the AI and use the offline splitter (tests, or a learner's "quick build"). */
  offline?: boolean;
}

export interface PairCreated {
  code: string;
  secret: string;
  /** Epoch ms after which the code stops working. */
  expiresAt: number;
  /** Path the phone opens, e.g. "/import/?c=ABCD" (prefix with the site origin for the QR code). */
  importPath: string;
}

export interface PairStatusResponse {
  status: PairStatus;
  expiresAt: number;
}

export interface PalaceStatusResponse {
  status: PairStatus;
  expiresAt: number;
  palace?: Palace;
}

export const LIMITS = {
  /** Pasted text / PDF text layer, characters. */
  textChars: 60_000,
  /** One image, base64 characters (≈ 4.5 MB binary). */
  imageB64: 6 * 1024 * 1024,
  /** One PDF, base64 characters (≈ 9 MB binary). */
  pdfB64: 12 * 1024 * 1024,
  /** Photos per import. */
  images: 6,
  /** Sum of all base64 payloads in one extract request. */
  totalB64: 14 * 1024 * 1024,
  titleChars: 80,
  subjectChars: 40,
  questionChars: 220,
  answerChars: 80,
  captionChars: 160,
  labelChars: 24,
  maxNotions: 20,
} as const;
