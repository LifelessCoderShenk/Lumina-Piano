export type SongDifficulty = 'beginner' | 'intermediate' | 'advanced'
export type SongSource = 'built-in' | 'user'

export interface SongMetadata {
  id: string
  title: string
  composer: string
  difficulty: SongDifficulty
  source: SongSource
  file: string
  filePath?: string
}

export type SongManifestEntry = SongMetadata
