import { describe, expect, it } from 'vitest'

import {
  getFeedOrientationTransform,
  clampCameraCropValue,
  getCameraCropEdgeMaximum,
  resolveCameraCropForOrientation,
  resolveCameraOrientationGeometry,
  resolveCameraPreviewFrameRect,
  resolveCameraPreviewFrameTransform,
  resolveCameraSetupSafeFrame,
} from './cameraOrientation'

const crop = { cropBottom: 3, cropLeft: 4, cropRight: 2, cropTop: 1 }

describe('resolveCameraCropForOrientation', () => {
  it.each([
    [0, false, false, { bottom: 3, left: 4, right: 2, top: 1 }],
    [90, false, false, { bottom: 4, left: 1, right: 3, top: 2 }],
    [180, false, false, { bottom: 1, left: 2, right: 4, top: 3 }],
    [270, false, false, { bottom: 2, left: 3, right: 1, top: 4 }],
    [0, true, false, { bottom: 3, left: 2, right: 4, top: 1 }],
    [90, true, false, { bottom: 4, left: 3, right: 1, top: 2 }],
    [180, true, false, { bottom: 1, left: 4, right: 2, top: 3 }],
    [270, true, false, { bottom: 2, left: 1, right: 3, top: 4 }],
    [0, false, true, { bottom: 1, left: 4, right: 2, top: 3 }],
    [90, false, true, { bottom: 2, left: 1, right: 3, top: 4 }],
    [180, false, true, { bottom: 3, left: 2, right: 4, top: 1 }],
    [270, false, true, { bottom: 4, left: 3, right: 1, top: 2 }],
    [0, true, true, { bottom: 1, left: 2, right: 4, top: 3 }],
    [90, true, true, { bottom: 2, left: 3, right: 1, top: 4 }],
    [180, true, true, { bottom: 3, left: 4, right: 2, top: 1 }],
    [270, true, true, { bottom: 4, left: 1, right: 3, top: 2 }],
  ] as const)('maps visible crop edges at %s° (horizontal=%s, vertical=%s)', (rotation, flipHorizontal, flipVertical, expected) => {
    expect(resolveCameraCropForOrientation({ ...crop, flipHorizontal, flipVertical, rotation })).toEqual(expected)
  })
})

describe('resolveCameraOrientationGeometry', () => {
  it('converts intrinsic crop pixels to preview CSS percentages', () => {
    expect(resolveCameraOrientationGeometry({
      cropBottom: 72,
      cropLeft: 128,
      cropRight: 64,
      cropTop: 36,
      flipHorizontal: false,
      flipVertical: false,
      rotation: 0,
    }, 1280, 720)).toMatchObject({
      sourceCrop: { height: 612, left: 128, top: 36, width: 1088 },
      previewCrop: {
        heightPercent: 85,
        leftPercent: 10,
        topPercent: 5,
        widthPercent: 85,
      },
    })
  })

  it('keeps the source crop and export transform aligned for a flipped quarter-turn', () => {
    expect(resolveCameraOrientationGeometry({
      ...crop,
      flipHorizontal: true,
      flipVertical: false,
      rotation: 90,
    }, 1280, 720)).toMatchObject({
      sourceCrop: { height: 714, left: 3, top: 2, width: 1276 },
      orientedSource: { height: 1280, width: 720 },
      exportTransform: { flipX: -1, flipY: 1, rotationDegrees: 90 },
    })
  })

  it('uses the same cover fit in the preview viewport as export', () => {
    const geometry = resolveCameraOrientationGeometry({
      cropBottom: 0,
      cropLeft: 0,
      cropRight: 0,
      cropTop: 0,
      flipHorizontal: false,
      flipVertical: false,
      rotation: 0,
    }, 1280, 720)

    expect(resolveCameraPreviewFrameRect(geometry!, 1280, 720, 1280, 288)).toEqual({
      height: 720,
      left: 0,
      top: -216,
      width: 1280,
    })
  })

  it('uses a stable backing surface with a transform-only crop update', () => {
    const geometry = resolveCameraOrientationGeometry({
      cropBottom: 0,
      cropLeft: 100,
      cropRight: 100,
      cropTop: 0,
      flipHorizontal: false,
      flipVertical: false,
      rotation: 0,
    }, 1000, 500)

    expect(resolveCameraPreviewFrameTransform(geometry!, 1000, 500, 800, 400)).toEqual({
      height: 400,
      transform: 'translate3d(-100px, -50px, 0) scale(1.25)',
      width: 800,
    })
  })
})

describe('crop input bounds', () => {
  it('keeps one source pixel visible and caps pre-metadata edits conservatively', () => {
    const overlay = { ...crop, flipHorizontal: false, flipVertical: false, rotation: 0 as const }
    expect(getCameraCropEdgeMaximum(overlay, 'left', 100, 80)).toBe(97)
    expect(clampCameraCropValue(overlay, 'left', 500, 100, 80)).toBe(97)
    expect(clampCameraCropValue(overlay, 'top', 50_000)).toBe(4096)
  })
})

describe('getFeedOrientationTransform', () => {
  it('keeps flip and rotation composition explicit', () => {
    expect(getFeedOrientationTransform({ flipHorizontal: true, flipVertical: false, rotation: 90 }))
      .toBe('rotate(90deg) scaleX(-1) scaleY(1)')
  })
})

describe('resolveCameraSetupSafeFrame', () => {
  it('uses intrinsic dimensions and swaps axes for quarter-turn orientations', () => {
    expect(resolveCameraSetupSafeFrame({
      ...crop,
      flipHorizontal: true,
      flipVertical: false,
      rotation: 90,
    }, 1280, 720)).toEqual({
      heightPercent: (1276 / 1280) * 100,
      leftPercent: (4 / 720) * 100,
      topPercent: (1 / 1280) * 100,
      widthPercent: (714 / 720) * 100,
    })
  })

  it('waits for usable intrinsic video metadata', () => {
    expect(resolveCameraSetupSafeFrame({
      ...crop,
      flipHorizontal: false,
      flipVertical: false,
      rotation: 0,
    }, 0, 720)).toBeNull()
  })
})
