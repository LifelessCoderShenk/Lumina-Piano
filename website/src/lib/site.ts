export const site = {
  name: "Lumina Piano",
  supportEmail: "luminapiano.app@gmail.com",
  description:
    "A creative desktop workspace for everyday pianists. Visualize, record, edit, and share your piano performances on Windows and macOS.",
};

export const navigation = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/showcase", label: "Showcase" },
  { href: "/pricing", label: "Pricing" },
  { href: "/download", label: "Download" },
] as const;

export const accountDeletionEmailUrl = `mailto:${site.supportEmail}?subject=${encodeURIComponent("Lumina account deletion request")}`;
