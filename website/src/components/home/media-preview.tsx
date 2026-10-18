import Image from "next/image";

import type { HomeMedia } from "@/lib/home-media";
import styles from "./media-preview.module.css";

// Schematic artwork, deliberately labeled: never presented as an app screenshot.
function PianoDrawing({ tone = "mixed" }: Pick<HomeMedia, "tone">) {
  const keys = Array.from({ length: 42 }, (_, i) => i);
  const notes = Array.from({ length: 54 }, (_, i) => ({
    x: 44 + ((i * 7 + Math.floor(i / 6) * 5) % 39) * 22,
    y: -120 + ((i * 89) % 510),
    height: 30 + ((i * 13) % 74),
  }));
  return (
    <svg
      viewBox="0 0 1000 562"
      preserveAspectRatio="xMidYMax slice"
      fill="none"
      aria-hidden="true"
    >
      {keys
        .filter((i) => i % 7 === 0)
        .map((i) => (
          <path
            key={i}
            d={`M${38 + i * 22} 0V430`}
            stroke="#fff"
            strokeOpacity=".035"
          />
        ))}
      <g className={styles.notes}>
        {notes.map((note, i) => (
          <rect
            key={i}
            x={note.x}
            y={note.y}
            width="15"
            height={note.height}
            rx="3"
            fill={
              tone === "amber" || (tone === "mixed" && note.x > 500)
                ? "#d6b78d"
                : "#8bafc9"
            }
            opacity={0.38 + (i % 4) * 0.16}
          />
        ))}
      </g>
      <path
        d="M38 430H962"
        stroke={tone === "amber" ? "#d6b78d" : "#a8c9de"}
        strokeWidth="2"
      />
      {keys.map((i) => (
        <rect
          key={i}
          x={38 + i * 22}
          y="437"
          width="20.5"
          height="96"
          rx="2"
          fill={
            [9, 16, 23, 30].includes(i)
              ? i > 20
                ? "#d6b78d"
                : "#8bafc9"
              : "#dededb"
          }
        />
      ))}
      {keys
        .filter((i) => ![2, 6].includes(i % 7) && i < 41)
        .map((i) => (
          <rect
            key={i}
            x={53 + i * 22}
            y="436"
            width="13"
            height="60"
            rx="1.5"
            fill="#101113"
            stroke="#303237"
          />
        ))}
      {[236, 390, 544, 698].map((x, i) => (
        <g key={x} fill={i > 1 ? "#d6b78d" : "#8bafc9"}>
          <circle cx={x} cy="422" r="3" />
          <circle cx={x - 8} cy="408" r="1.5" />
          <circle cx={x + 6} cy="392" r="1" />
        </g>
      ))}
    </svg>
  );
}
function DetailDrawing({ kind }: { kind: HomeMedia["kind"] }) {
  if (kind === "piano" || kind === "export")
    return <PianoDrawing tone={kind === "export" ? "amber" : "blue"} />;
  if (kind === "style")
    return (
      <div className={styles.stylePair}>
        <PianoDrawing tone="blue" />
        <PianoDrawing tone="amber" />
      </div>
    );
  if (kind === "score")
    return (
      <svg viewBox="0 0 1000 562" aria-hidden="true">
        <rect x="140" y="65" width="720" height="440" rx="4" fill="#dcd9d1" />
        {[160, 320].map((y) => (
          <g key={y} stroke="#77756e" strokeWidth="2">
            {[0, 18, 36, 54, 72].map((d) => (
              <path key={d} d={`M190 ${y + d}H810`} />
            ))}
            {[310, 480, 650].map((x) => (
              <path key={x} d={`M${x} ${y}v72`} />
            ))}
          </g>
        ))}
        {Array.from({ length: 14 }, (_, i) => (
          <g key={i} fill="#282925" stroke="#282925" strokeWidth="3">
            <ellipse
              cx={222 + (i % 7) * 85}
              cy={180 + Math.floor(i / 7) * 160 + (i % 3) * 18}
              rx="10"
              ry="7"
            />
            <path
              d={`M${231 + (i % 7) * 85} ${180 + Math.floor(i / 7) * 160 + (i % 3) * 18}v-48`}
            />
          </g>
        ))}
      </svg>
    );
  return (
    <svg viewBox="0 0 1000 562" aria-hidden="true" fill="none">
      {kind === "edit" ? (
        <>
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M80 ${92 + i * 46}H920`} stroke="#292d32" />
          ))}
          {Array.from({ length: 13 }, (_, i) => (
            <path key={i} d={`M${80 + i * 70} 72V488`} stroke="#292d32" />
          ))}
          {Array.from({ length: 19 }, (_, i) => (
            <rect
              key={i}
              x={105 + ((i * 127) % 700)}
              y={100 + ((i * 3) % 8) * 46}
              width={45 + (i % 3) * 30}
              height="24"
              rx="4"
              fill={i === 8 ? "#d6b78d" : "#80a6c0"}
              opacity={i === 8 ? 1 : 0.6}
            />
          ))}
          <path d="M547 70V490" stroke="#dededb" strokeWidth="2" />
          <rect
            x="556"
            y="97"
            width="57"
            height="30"
            rx="5"
            stroke="#d6b78d"
            strokeDasharray="4 4"
          />
        </>
      ) : (
        <>
          <rect
            x="92"
            y="88"
            width="816"
            height="220"
            rx="6"
            stroke="#41464e"
          />
          <path d="M130 198H870" stroke="#343a40" />
          {Array.from({ length: 80 }, (_, i) => {
            const h =
              8 +
              Math.abs(Math.sin(i * 1.7)) *
                85 *
                (0.4 + Math.sin(i * 0.08) ** 2);
            return (
              <path
                key={i}
                d={`M${140 + i * 9} ${198 - h / 2}v${h}`}
                stroke="#94b3c6"
                strokeWidth="4"
              />
            );
          })}
          <circle cx="126" cy="120" r="5" fill="#d6b78d" />
          <path d="M92 373H908M92 444H908" stroke="#343a40" />
          {Array.from({ length: 16 }, (_, i) => (
            <rect
              key={i}
              x={110 + i * 49}
              y={i % 2 ? 393 : 350}
              width="34"
              height="19"
              rx="3"
              fill="#bca487"
            />
          ))}
        </>
      )}
    </svg>
  );
}
export function MediaPreview({
  media,
  shape = "wide",
}: {
  media: HomeMedia;
  shape?: "hero" | "square" | "wide";
}) {
  return (
    <figure className={`${styles.frame} ${styles[shape]}`}>
      <div className={styles.screen} style={media.asset ? { aspectRatio: media.aspectRatio ?? "16 / 9" } : undefined}>
        {media.asset ? (
          media.asset.type === "image" ? (
            <Image
              src={media.asset.src}
              alt={media.asset.alt}
              fill
              sizes="(max-width: 700px) 100vw, 490px"
              className={styles.asset}
              priority={shape === "hero"}
            />
          ) : (
            <video
              controls
              preload={shape === "hero" ? "metadata" : "none"}
              playsInline
              muted={!media.asset.hasAudio}
              loop={!media.asset.hasAudio}
              poster={media.asset.poster}
              aria-label={media.asset.alt}
              className={styles.asset}
            >
              <source src={media.asset.src.replace(/\.mp4$/, ".webm")} type="video/webm" />
              <source src={media.asset.src} type="video/mp4" />
              {media.asset.captions && (
                <track
                  kind="captions"
                  src={media.asset.captions}
                  srcLang="en"
                  label="English"
                  default
                />
              )}
            </video>
          )
        ) : (
          <>
            {media.kind === "piano" ? (
              <PianoDrawing tone={media.tone} />
            ) : (
              <DetailDrawing kind={media.kind} />
            )}
            <span className={styles.label}>Illustration placeholder</span>
          </>
        )}
      </div>
      {!media.asset && (
        <figcaption className={styles.caption}>
          {media.title} · Actual capture to follow
        </figcaption>
      )}
    </figure>
  );
}
