/**
 * Legacy Pixi renderer compatibility export.
 *
 * The retired Pixi path has no remaining runtime consumer.
 * Create, Camera, and Record all use the Three renderer, so this module now
 * exposes that renderer for the few remaining compatibility call sites.
 */
export { ThreeRenderer as Renderer, threeRenderer as renderer } from './ThreeRenderer'
export { isBlackKey, getWhiteKeyIndex, pitchToKeyX, getKeyAtScreenX } from './pianoMath'
