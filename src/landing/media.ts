/**
 * Real in-headset captures for the landing page.
 *
 * Every slot has a drawn CSS/SVG fallback in index.html, so the page looks finished without media.
 * To use a real capture:
 *   1. export it from the headset (see docs/VIDEO_SCRIPT.md → Capture checklist),
 *   2. drop it in `public/media/` with the file name below,
 *   3. flip `ready: true`.
 * Nothing is requested while `ready` is false (no 404s). Preview all slots with `/?media=all`,
 * and see where each slot sits with `/?media=debug`.
 *
 * Rule of the competition and of this project: in-headset footage must be REAL captures. Never AI-generated.
 */
export interface MediaSlot {
  /** Image (jpg/webp/png) or video (mp4/webm). */
  src: string;
  /** Poster image for a video. */
  poster?: string;
  alt: string;
  ready: boolean;
}

export const MEDIA: Record<string, MediaSlot> = {
  hero: {
    src: '/media/hero-loop.mp4',
    poster: '/media/hero-poster.jpg',
    alt: 'Mixed-reality capture: the Loci flame floats in a real bedroom while a question hovers over a glowing desk lamp.',
    ready: false,
  },
  import: {
    src: '/media/step-import.jpg',
    alt: 'A phone showing an imported history course next to the pairing QR code floating in the headset.',
    ready: false,
  },
  place: {
    src: '/media/step-place.jpg',
    alt: 'A hand pinching a small kangaroo scene and setting it on a real lamp.',
    ready: false,
  },
  recall: {
    src: '/media/step-recall.jpg',
    alt: 'A question and three answer bubbles floating over a glowing object in a dark room.',
    ready: false,
  },
  room: {
    src: '/media/room-filled.jpg',
    alt: 'A real bedroom after a chapter: plants, crystals and golden objects on the furniture.',
    ready: false,
  },
};
