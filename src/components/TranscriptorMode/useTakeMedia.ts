import { useEffect, useState } from 'react'

import { readMediaAsset, type RecordedMediaAsset, type ResolvedMediaSegment } from '../../transcription/mediaStorage'
import type { TranscriptionMediaSource, TranscriptionSession } from '../../transcription/types'

export interface ActiveTakeMedia {
  url: string
  timeMs: number
  segment: ResolvedMediaSegment
  config: TranscriptionMediaSource | null
}

export function useTakeMedia(take: TranscriptionSession, latest: readonly RecordedMediaAsset[] | RecordedMediaAsset | null) {
  const [resolved, setResolved] = useState<{ id: string; segments: ResolvedMediaSegment[]; urls: Map<string, string> }>({ id: '', segments: [], urls: new Map() })
  const [warning, setWarning] = useState<string | null>(null)
  const latestAssets = Array.isArray(latest) ? latest : latest ? [latest] : []
  const latestKey = latestAssets.map((asset) => asset.id).join('|')
  useEffect(() => {
    let canceled = false
    const urls = new Map<string, string>()
    const segments = take.mediaSegments ?? (take.durationMs ? [{ sourceId: take.id, sourceOffsetMs: 0, startMs: 0, durationMs: take.durationMs }] : [])
    void (async () => {
      const sources = new Map<string, RecordedMediaAsset>()
      let missing = false
      for (const id of new Set(segments.map((segment) => segment.sourceId))) {
        const source = latestAssets.find((asset) => asset.id === id) ?? await readMediaAsset(id).catch(() => null)
        if (source) { sources.set(id, source); urls.set(id, URL.createObjectURL(source.blob)) }
        else if (take.mediaSegments?.length) missing = true
      }
      if (canceled) { urls.forEach((url) => URL.revokeObjectURL(url)); return }
      setResolved({ id: take.id, urls, segments: segments.flatMap((segment) => { const source = sources.get(segment.sourceId); return source ? [{ ...segment, source }] : [] }) })
      setWarning(missing ? 'Some recorded inputs are unavailable. Their video is hidden and their audio is silent.' : null)
    })()
    return () => { canceled = true; urls.forEach((url) => URL.revokeObjectURL(url)) }
  }, [take.id, take.mediaSegments, take.durationMs, latestKey])

  const atAll = (timeMs: number): ActiveTakeMedia[] => resolved.id !== take.id ? [] : resolved.segments.flatMap((segment) => {
    const config = take.settings.mediaSources?.find((source) => source.id === (segment.inputId ?? segment.source.inputId)) ?? null
    const kind = segment.kind ?? segment.source.kind ?? 'video'
    const timelineStart = segment.startMs + (kind === 'audio' ? config?.latencyMs ?? 0 : 0)
    if (timeMs < timelineStart || timeMs >= timelineStart + segment.durationMs) return []
    return [{ segment, url: resolved.urls.get(segment.sourceId)!, timeMs: segment.sourceOffsetMs + timeMs - timelineStart, config }]
  })
  return {
    ready: resolved.id === take.id,
    warning,
    segments: resolved.id === take.id ? resolved.segments : [],
    atAll,
    at: (timeMs: number) => {
      const first = atAll(timeMs).find((entry) => (entry.segment.kind ?? entry.segment.source.kind ?? 'video') === 'video')
      return first ? { url: first.url, timeMs: first.timeMs, hasMicrophone: first.segment.source.hasMicrophone } : null
    },
  }
}
