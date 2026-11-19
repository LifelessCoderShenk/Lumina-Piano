// Pin downloads to a reviewed release; never silently replace installer assets.
export const windowsPreview = {
  version: "1.0.0 Preview 1",
  sha256: "75a8bb4692c0b638aaa2ba3205e660d918cf068307d60cb9efa6ed8ede939f9d",
  url: "https://github.com/LifelessCoderShenk/Lumina-Piano/releases/download/v1.0.0-preview.1/Lumina-Piano-1.0.0-preview.1-Setup.exe",
  notes: "https://github.com/LifelessCoderShenk/Lumina-Piano/releases/tag/v1.0.0-preview.1",
};

export const previewFeedbackUrl = "https://github.com/LifelessCoderShenk/Lumina-Piano/issues/new?" + new URLSearchParams({
  title: `[Windows ${windowsPreview.version}] `,
  body: `App version: ${windowsPreview.version}\nWindows version:\n\nWhat happened?\n\nSteps to reproduce:\n1. \n\nWhat did you expect?\n\nReports are public. Do not include passwords, sign-in links, or private recordings.`,
}).toString();
