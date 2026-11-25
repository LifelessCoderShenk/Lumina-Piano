// Pin downloads to a reviewed release; never silently replace installer assets.
export const windowsPreview = {
  version: "1.0.3 Preview 4",
  sha256: "6bbf6a20d68d10e049e7d360080ac203c30155b8246c2220b70078ccdfe22e07",
  url: "https://github.com/LifelessCoderShenk/Lumina-Piano/releases/download/v1.0.3-preview.4/Lumina-Piano-1.0.3-preview.4-Setup.exe",
  notes: "https://github.com/LifelessCoderShenk/Lumina-Piano/releases/tag/v1.0.3-preview.4",
};

export const macPreview = {
  notes: "https://github.com/LifelessCoderShenk/Lumina-Piano/releases/tag/mac-preview-2",
  appleSilicon: "https://github.com/LifelessCoderShenk/Lumina-Piano/releases/download/mac-preview-2/Lumina-Piano-macOS-arm64-preview.zip",
  intel: "https://github.com/LifelessCoderShenk/Lumina-Piano/releases/download/mac-preview-2/Lumina-Piano-macOS-x64-preview.zip",
};

export const previewFeedbackUrl = "https://github.com/LifelessCoderShenk/Lumina-Piano/issues/new?" + new URLSearchParams({
  title: "[Lumina preview] ",
  body: "App version:\nWindows/macOS version:\nProcessor (Intel/Apple Silicon):\n\nWhat happened?\n\nSteps to reproduce:\n1. \n\nWhat did you expect?\n\nReports are public. Do not include passwords, sign-in links, or private recordings.",
}).toString();

