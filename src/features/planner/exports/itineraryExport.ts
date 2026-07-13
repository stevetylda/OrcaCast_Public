import type { SuggestedPlace } from "../../locations/types";
import { buildMonthTicks, type WeekBar } from "../model/plannerChart";

export function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function rasterizeSvgToPngBlob(
  svgMarkup: string,
  width: number,
  height: number,
) {
  const svgBlob = new Blob([svgMarkup], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () =>
        reject(new Error("Card image could not be rendered."));
      next.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context not available.");
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/png");
    });
    if (!blob) throw new Error("Card image could not be generated.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function buildItineraryCardSvg({
  tripCityLabel,
  tripLabel,
  tripLengthLabel,
  itineraryPlaces,
  weekBars,
}: {
  tripCityLabel: string;
  tripLabel: string;
  tripLengthLabel: string;
  itineraryPlaces: SuggestedPlace[];
  weekBars: WeekBar[];
}) {
  const width = 960;
  const outerPad = 22;
  const innerPad = 54;
  const lineHeight = 34;
  const itineraryStartY = 234;
  const chartHeight = 164;
  const chartWidth = width - innerPad * 2;
  const chartTop =
    itineraryStartY + Math.max(itineraryPlaces.length, 1) * lineHeight + 70;
  const height = Math.max(700, chartTop + chartHeight + 94);
  const barMax = Math.max(1, ...weekBars.map((bar) => bar.count));
  const barWidth = chartWidth / Math.max(weekBars.length, 1);
  const monthTicks = buildMonthTicks(weekBars);

  const itineraryMarkup = itineraryPlaces
    .map((place, index) => {
      const y = itineraryStartY + index * lineHeight;
      return `
        <circle cx="${innerPad + 12}" cy="${y - 5}" r="11" fill="#D8F0EA" />
        <text x="${innerPad + 12}" y="${y}" fill="#136B73" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="700" text-anchor="middle">${index + 1}</text>
        <text x="${innerPad + 38}" y="${y - 4}" fill="#173657" font-family="Helvetica, Arial, sans-serif" font-size="19" font-weight="700">${escapeXml(place.name)}</text>
        <text x="${innerPad + 38}" y="${y + 15}" fill="#5D7894" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="600">${escapeXml(place.region ?? "Salish Sea")}</text>
      `;
    })
    .join("");

  const barMarkup = weekBars
    .map((bar) => {
      const heightScale = Math.max(
        8,
        (bar.count / barMax) * (chartHeight - 28),
      );
      const x = innerPad + bar.index * barWidth + 1.5;
      const y = chartTop + chartHeight - heightScale - 22;
      const fill = bar.highlighted
        ? "url(#tripBarGradient)"
        : "rgba(179, 210, 235, 0.7)";
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(4, barWidth - 3).toFixed(2)}" height="${heightScale.toFixed(2)}" rx="8" fill="${fill}" />`;
    })
    .join("");

  const tickMarkup = monthTicks
    .map((tick) => {
      const x = innerPad + tick.index * barWidth + barWidth / 2;
      return `<text x="${x.toFixed(2)}" y="${chartTop + chartHeight}" fill="#637B93" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" text-anchor="middle">${escapeXml(tick.label)}</text>`;
    })
    .join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
    <defs>
      <pattern id="airmailStripe" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="56" height="56" fill="#F7F7F1"/>
        <rect width="16" height="56" fill="#24A38B"/>
        <rect x="16" width="12" height="56" fill="#F7F7F1"/>
        <rect x="28" width="16" height="56" fill="#6EDAD0"/>
        <rect x="44" width="12" height="56" fill="#F7F7F1"/>
      </pattern>
      <linearGradient id="paperWash" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FFFDF5"/>
        <stop offset="100%" stop-color="#FBF7EC"/>
      </linearGradient>
      <linearGradient id="tripBarGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7BE2D2"/>
        <stop offset="100%" stop-color="#136B73"/>
      </linearGradient>
      <filter id="paperNoise" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
        <feComponentTransfer>
          <feFuncA type="table" tableValues="0 0.07"/>
        </feComponentTransfer>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" rx="34" fill="url(#airmailStripe)"/>
    <rect x="${outerPad}" y="${outerPad}" width="${width - outerPad * 2}" height="${height - outerPad * 2}" rx="24" fill="url(#paperWash)"/>
    <rect x="${outerPad}" y="${outerPad}" width="${width - outerPad * 2}" height="${height - outerPad * 2}" rx="24" filter="url(#paperNoise)" opacity="0.65"/>

    <text x="${innerPad}" y="98" fill="#173657" font-family="Georgia, 'Times New Roman', serif" font-size="40" font-weight="700">Orca Itinerary</text>
    <text x="${innerPad}" y="136" fill="#2C7F7C" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="700">From ${escapeXml(tripCityLabel)}</text>
    <text x="${innerPad}" y="166" fill="#173657" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="700">${escapeXml(tripLabel)}</text>
    <text x="${innerPad}" y="194" fill="#5D7894" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="700">${escapeXml(tripLengthLabel)}</text>

    <line x1="${innerPad}" y1="214" x2="${width - innerPad}" y2="214" stroke="#173657" stroke-opacity="0.22" stroke-width="2"/>

    ${itineraryMarkup}

    <line x1="${innerPad}" y1="${chartTop - 18}" x2="${width - innerPad}" y2="${chartTop - 18}" stroke="#173657" stroke-opacity="0.14" stroke-width="1.5"/>
    ${barMarkup}
    ${tickMarkup}
  </svg>`;

  return { svg, width, height };
}
