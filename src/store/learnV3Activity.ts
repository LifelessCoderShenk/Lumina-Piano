let learnV3ActivityReader: null | (() => boolean) = null

export function registerLearnV3ActivityReader(reader: () => boolean): void {
  learnV3ActivityReader = reader
}

export function isLearnV3Active(): boolean {
  return learnV3ActivityReader?.() ?? false
}
