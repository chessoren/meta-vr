/**
 * Build-time stub for @pmndrs/uikit-lucide (4.6 MB of icon components). IWSDK's UIKitML kit
 * imports the whole namespace, but Loci draws its own UI and never instantiates these icons.
 * Aliased in vite.config.ts; keeps the headset bundle small for a fast cold start.
 */
class StubIcon {
  constructor() {
    throw new Error('uikit-lucide icons are stubbed out in Loci');
  }
}
export const CheckIcon = StubIcon;
export const ChevronDownIcon = StubIcon;
export default {};
