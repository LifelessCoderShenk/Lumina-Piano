import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { previewFeedbackUrl } from "@/lib/releases";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Support",
  description: "Help with Lumina Piano installation, Google sign-in, and trial exports.",
};

const answers = [
  {
    question: "How do I get started?",
    answer: "Install Lumina, open a sample piece or import a MIDI file, then export a short video. You can explore the preview without signing in.",
  },
  {
    question: "Does the free trial expire?",
    answer: "No. The trial has no time limit. Video exports include the Lumina symbol and name, including when you are signed in. Paid licenses are not available yet.",
  },
  {
    question: "How do I sign in to the app?",
    answer: "Choose Trial · Sign in at the top-right, then Continue with Google. Use the same Google account as the website. Finish in your browser and return to Lumina.",
  },
  {
    question: "What if sign-in fails?",
    answer: "Check your connection and retry from the app. If Lumina says the callback port is unavailable, close other Lumina windows and reopen the app. If sign-in times out, start again rather than reusing the old browser link.",
  },
  {
    question: "How do I request account deletion?",
    answer: `Email ${site.supportEmail} from the address used for your Lumina account, with the subject “Lumina account deletion request”. This is a manual request, not instant deletion. Do not send passwords or sign-in codes. Deleting the account does not remove projects or exports from your device.`,
  },
  {
    question: "Can I work offline?",
    answer: "Local MIDI editing and video exports do not require sign-in. Signing in and checking your account require an internet connection. Offline exports still include the trial watermark.",
  },
  {
    question: "Why does my computer warn about the download?",
    answer: "The Windows preview is unsigned and the Mac preview is not notarized. Release notes and checksums are linked on the download page. If you cannot install the preview, report your operating system and the warning you received.",
  },
  {
    question: "What if an export fails?",
    answer: "Try a short export to a folder you can write to, with enough free disk space. If it still fails, report the app version, export format, resolution, and error message. Keep private MIDI files and recordings out of public reports.",
  },
];

export default function Support() {
  return (
    <PageIntro eyebrow="Support" title="A little help." description="Get started. Get back to playing.">
      <div className="mt-12 max-w-3xl divide-y divide-line border-y border-line">
        {answers.map(({ question, answer }) => (
          <details key={question} className="py-5">
            <summary className="cursor-pointer rounded-sm text-lg font-medium focus-visible:outline-2 focus-visible:outline-offset-4">
              {question}
            </summary>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-secondary">{answer}</p>
          </details>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-4">
        <a href={`mailto:${site.supportEmail}`} className="button button--primary">Email support</a>
        <Link href="/download" className="button button--secondary">Downloads</Link>
      </div>
      <p className="mt-4 text-sm text-secondary"><a href={`mailto:${site.supportEmail}`} className="underline underline-offset-4">{site.supportEmail}</a></p>
      <p className="mt-4 text-sm text-secondary"><a href={previewFeedbackUrl} className="underline underline-offset-4">Report a public issue on GitHub</a></p>
    </PageIntro>
  );
}
