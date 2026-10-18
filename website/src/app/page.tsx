import Link from "next/link";
import { CorrectionDemo } from "@/components/home/correction-demo";
import { Check, Download, Music2, SlidersHorizontal, Film } from "lucide-react";
import { MediaPreview } from "@/components/home/media-preview";
import { ComparisonSection } from "@/components/home/comparison-section";
import { homeMedia } from "@/lib/home-media";
import { referenceContent } from "@/lib/reference-content";
import styles from "./home.module.css";

const steps = [
  {
    title: "Start with your music",
    text: "Load a MIDI file or record a connected keyboard.",
    icon: Music2,
  },
  {
    title: "Edit and personalize",
    text: "Refine the notes, then choose colors and effects.",
    icon: SlidersHorizontal,
  },
  {
    title: "Save your video",
    text: "Export a performance video to share.",
    icon: Film,
  },
];
const questions = [
  {
    question: "What can I make with Lumina Piano?",
    answer:
      "Create falling-note piano visualizations, record performances with MIDI, camera, and audio, edit MIDI notes, generate sheet music, and export piano videos.",
  },
  {
    question: "Do I need a MIDI keyboard?",
    answer:
      "You can begin with a MIDI file. To capture notes from your playing, connect a MIDI-capable keyboard or digital piano.",
  },
  {
    question: "Can I correct notes after recording?",
    answer:
      "Yes. You can adjust MIDI note pitch, timing, duration, and velocity without recording the whole performance again.",
  },
  {
    question: "Can I work with sheet music?",
    answer:
      "Lumina can generate notation from a MIDI performance. Review and correct the notes, then export sheet music as a PDF.",
  },
  {
    question: "Which desktop platforms are supported?",
    answer:
      "Lumina Piano is designed for Windows and macOS. Official installers and installation details will appear on the Download page.",
  },
  {
    question: "How does the trial work?",
    answer:
      "The free trial includes watermarked exports. The purchase model is a one-time license; its price has not yet been decided.",
  },
];

export default function Home() {
  return (
    <div className={styles.home}>
      <section
        className={`${styles.container} ${styles.hero}`}
        aria-labelledby="hero-title"
      >
        <p className={styles.badge}>Piano visualization & recording</p>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <h1 id="hero-title">
              {referenceContent.title.split("\n").map((line, i) => (
                <span key={line}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
            </h1>
            <p>{referenceContent.intro}</p>
            <Link href="/download" className={styles.primaryButton}>
              <Download size={22} aria-hidden="true" />
              Download Lumina Piano
            </Link>
            <div className={styles.textLinks}>
              <Link href="/showcase#performance-demo" className="inline-flex min-h-11 items-center">Watch a performance <span aria-hidden="true" className="ml-2">→</span></Link>
            </div>
            <div className={styles.platforms}>
              <span>Windows</span>
              <span>macOS</span>
            </div>
          </div>
          <MediaPreview media={homeMedia.hero} shape="hero" />
        </div>
        <ul className={styles.benefits}>
          {[
            "Import MIDI",
            "Edit notes",
            "Visual effects",
            "Record video",
            "Export performances",
          ].map((item) => (
            <li key={item}>
              <Check size={19} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section
        className={`${styles.container} ${styles.overview}`}
        aria-labelledby="overview-title"
      >
        <div>
          <h2 id="overview-title">How Lumina works</h2>
          <p className={styles.sectionIntro}>
            Begin with your playing. Finish with a piano video.
          </p>
          <ol className={styles.steps}>
            {steps.map((step, i) => (
              <li key={step.title}>
                <div>
                  <span>{i + 1}</span>
                  <step.icon size={30} strokeWidth={1.5} aria-hidden="true" />
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className={styles.desktopPreview}>
          <MediaPreview media={homeMedia.performance} shape="wide" />
          <p>An original eight-bar MIDI piece. Press play to hear Lumina’s piano audio.</p>
        </div>
      </section>

      <div className={styles.container}><CorrectionDemo /></div>

      <div className={styles.container}>
        {referenceContent.rows.map((row, i) => (
          <section
            key={row.id}
            id={row.id}
            className={`${styles.featureRow} ${i % 2 ? styles.reversed : ""}`}
            aria-labelledby={`${row.id}-title`}
          >
            <div className={styles.featureMedia}>
              <MediaPreview media={homeMedia[row.media]} shape="square" />
            </div>
            <div className={styles.featureCopy}>
              <h2 id={`${row.id}-title`}>{row.title}</h2>
              <p className={styles.lead}>{row.lead}</p>
              <ul>
                {row.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>

      <ComparisonSection />

      <section className={styles.downloadBand} aria-labelledby="download-title">
        <div className={styles.container}>
          <h2 id="download-title">Try Lumina with your next performance.</h2>
          <p>Free trial with watermarked exports.</p>
          <div className={styles.downloadButtons}>
            <Link
              href="/download"
              className={styles.primaryButton}
              aria-label="Windows download information"
            >
              <Download size={22} aria-hidden="true" />
              Windows
            </Link>
            <Link
              href="/download"
              className={styles.primaryButton}
              aria-label="macOS download information"
            >
              <Download size={22} aria-hidden="true" />
              macOS
            </Link>
          </div>
          <p className={styles.downloadNote}>
            Official installers are not available yet. View platform download
            information.
          </p>
        </div>
      </section>

      <section
        className={`${styles.container} ${styles.license}`}
        aria-labelledby="license-title"
      >
        <h2 id="license-title">Free trial. One-time license.</h2>
        <p>
          Try Lumina before purchasing. The license price is still being
          decided.
        </p>
        <div className={styles.tableWrap}>
          <table>
            <caption className="sr-only">
              Lumina Piano trial and purchase information
            </caption>
            <thead>
              <tr>
                <th scope="col">Details</th>
                <th scope="col">Free trial</th>
                <th scope="col">One-time license</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Exports</th>
                <td>Watermarked</td>
                <td>Without trial watermark</td>
              </tr>
              <tr>
                <th scope="row">Payment</th>
                <td>Free</td>
                <td>One-time purchase</td>
              </tr>
              <tr>
                <th scope="row">Price</th>
                <td>No charge</td>
                <td>To be decided</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Link href="/pricing" className={styles.pricingLink}>
          Pricing information
        </Link>
      </section>

      <section
        className={`${styles.container} ${styles.faq}`}
        aria-labelledby="faq-title"
      >
        <h2 id="faq-title">Questions about Lumina</h2>
        <p>Getting started with piano visuals and performance recording.</p>
        <div>
          {questions.map((item, i) => (
            <details key={item.question} open={i === 0}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
