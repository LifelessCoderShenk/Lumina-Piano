// Salamander Grand Piano by Alexander Holm (CC BY 3.0).
// Attribution and source hashes: src/assets/piano/SOURCE.md.
const files = import.meta.glob('../assets/piano/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
export const PIANO_SAMPLE_URLS = Object.fromEntries(Object.entries(files).map(([path, url]) => {
  const name = path.split('/').at(-1)!.replace('.mp3', '').replace('s', '#')
  return [name, url]
}))
export const PIANO_ATTACK_SECONDS = 0.01
export const PIANO_RELEASE_SECONDS = 0.5
