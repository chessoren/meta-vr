import type * as THREE from 'three';
import type { SceneRecipe, Tier } from '../../core/types';

/**
 * The app talks to visuals only through these interfaces (implemented by src/lib3d/*),
 * so art can evolve without touching flow logic.
 */
export type FlameMood = 'idle' | 'happy' | 'wave' | 'point' | 'beckon' | 'sleepy' | 'celebrate' | 'think' | 'surprised' | 'listen';

export interface IFlame {
  root: THREE.Object3D;
  update(dt: number, t: number, lookTarget?: THREE.Vector3): void;
  setMood(m: FlameMood): void;
  pointAt(p: THREE.Vector3 | null): void;
  say(text: string | null, seconds?: number): void;
  bounce(): void;
  glideTo(p: THREE.Vector3, seconds: number, onDone?: () => void): void;
  readonly isGliding: boolean;
  setScale(s: number): void;
  dispose(): void;
}

export type HaloState = 'off' | 'scan' | 'glow' | 'due' | 'active' | 'ember';
export interface IHalo {
  root: THREE.Object3D;
  setState(s: HaloState): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

export interface ITrophy {
  root: THREE.Object3D;
  setTier(t: Tier, animate: boolean): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

export type Appearance = 'full' | 'pale' | 'gold' | 'hidden';
export interface IScene {
  root: THREE.Object3D;
  update(dt: number, t: number): void;
  setIntensity(k: number): void;
  setAppearance(mode: Appearance): void;
  dispose(): void;
}

export interface ISparkles {
  root: THREE.Object3D;
  emit(pos: THREE.Vector3, color: THREE.ColorRepresentation, n: number, speed?: number): void;
  trail(pos: THREE.Vector3): void;
  update(dt: number, t: number): void;
}

export interface IPanel {
  root: THREE.Object3D;
  setVisible(v: boolean, animate?: boolean): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

export interface IQuestionCard extends IPanel {
  setQuestion(text: string, sub?: string): void;
  /** Show the answer on the card (reveal / after answering). */
  setAnswer(text: string | null, correct?: boolean): void;
}

export type BubbleState = 'idle' | 'hover' | 'pressed' | 'correct' | 'wrong' | 'dim';
export interface IBubble extends IPanel {
  readonly radius: number;
  setText(text: string): void;
  setState(s: BubbleState): void;
  containsPoint(p: THREE.Vector3): boolean;
}

export interface ICaption extends IPanel {
  setText(text: string, hooks?: string[]): void;
}

export interface IProofCard extends IPanel {
  setContent(big: string, line: string, sub?: string): void;
}

export interface IQRPanel extends IPanel {
  setSlot(url: string, code: string): void;
  setState(s: 'waiting' | 'receiving' | 'ready' | 'error'): void;
}

export interface IMenuButton {
  id: string;
  center(out: THREE.Vector3): THREE.Vector3;
  radius: number;
}
export interface IPalmMenu extends IPanel {
  readonly buttons: IMenuButton[];
  setHover(id: string | null): void;
  setToggle(id: string, on: boolean): void;
}

export interface ShelfBook {
  id: string;
  title: string;
  subject: string;
  solid: number;
  total: number;
  examLine?: string;
  isNew?: boolean;
}
export interface IPalaceShelf extends IPanel {
  setBooks(books: ShelfBook[]): void;
  readonly buttons: IMenuButton[];
  setHover(id: string | null): void;
}

export type HintKind = 'pinch' | 'palmUp' | 'fist' | 'look';
export interface IHandHint extends IPanel {
  setKind(k: HintKind): void;
}

export interface IReticle {
  root: THREE.Object3D;
  /** 0–1 dwell progress, or null to hide the ring. */
  setProgress(p: number | null): void;
  setActive(a: boolean): void;
  update(dt: number, t: number): void;
}

export interface VisualFactory {
  flame(): IFlame;
  halo(size: THREE.Vector3): IHalo;
  trophy(seed: number): ITrophy;
  scene(recipe: SceneRecipe): IScene;
  sparkles(): ISparkles;
  questionCard(): IQuestionCard;
  bubble(): IBubble;
  caption(): ICaption;
  proofCard(): IProofCard;
  qrPanel(): IQRPanel;
  palmMenu(): IPalmMenu;
  palaceShelf(): IPalaceShelf;
  handHint(): IHandHint;
  reticle(): IReticle;
  toast(): ICaption;
}
