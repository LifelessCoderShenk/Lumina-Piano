// Pin downloads to a reviewed release; never silently replace installer assets.
export const windowsPreview = {
  version: "1.0.2 Preview 3",
  sha256: "55b16ea2149acb828f8bd588241d281ae2010f9dbbf9e4c3bb8755a1c07f336d",
  url: "https://github.com/LifelessCoderShenk/Lumina-Piano/releases/download/v1.0.2-preview.3/Lumina-Piano-1.0.2-preview.3-Setup.exe",
  notes: "https://github.com/LifelessCoderShenk/Lumina-Piano/releases/tag/v1.0.2-preview.3",
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

