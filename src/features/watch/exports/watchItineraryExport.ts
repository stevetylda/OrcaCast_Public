import type { SuggestedPlace } from "../../locations/types";

const COLORS = {
  navy: "#061d3c",
  cream: "#fff8e9",
  paper: "#fffdf6",
  teal: "#47d1ca",
  coral: "#ff6458",
  muted: "#526c84",
  sage: "#b9c9a5",
};

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color = COLORS.navy,
) {
  context.font = font;
  context.fillStyle = color;
  context.fillText(text, x, y);
}

async function loadBlobImage(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () =>
        reject(new Error("Itinerary map image could not be loaded."));
      next.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function buildWatchItineraryPng({
  mapBlob,
  weekRangeLabel,
  trendLabel,
  itineraryPlaces,
}: {
  mapBlob: Blob;
  weekRangeLabel: string;
  trendLabel: string;
  itineraryPlaces: SuggestedPlace[];
}) {
  const width = 1200;
  const rowHeight = 78;
  const mapTop = 230;
  const mapHeight = 500;
  const listTop = mapTop + mapHeight + 36;
  const careTop = listTop + itineraryPlaces.length * rowHeight + 30;
  const height = careTop + 292;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context not available.");

  context.fillStyle = COLORS.cream;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = COLORS.navy;
  context.lineWidth = 4;
  roundedRect(context, 20, 20, width - 40, height - 40, 34);
  context.stroke();

  context.fillStyle = COLORS.teal;
  context.beginPath();
  context.arc(82, 78, 34, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = COLORS.navy;
  context.lineWidth = 4;
  context.stroke();
  drawText(context, "≈", 63, 91, "900 42px Arial");
  drawText(context, "OrcaCast", 132, 92, "900 42px Arial");
  drawText(context, "— FORECAST LAB", 932, 76, "900 16px Arial", "#08787c");
  drawText(context, "SALISH SEA FIELD PLAN", 932, 105, "900 15px Arial");

  drawText(context, "Your Orca-Watching Itinerary", 58, 164, "900 50px Arial");
  drawText(
    context,
    `${weekRangeLabel}  ·  ${itineraryPlaces.length} planned ${itineraryPlaces.length === 1 ? "stop" : "stops"}`,
    60,
    207,
    "800 24px Arial",
    "#167f88",
  );

  const mapImage = await loadBlobImage(mapBlob);
  context.save();
  roundedRect(context, 58, mapTop, width - 116, mapHeight, 26);
  context.clip();
  context.drawImage(mapImage, 58, mapTop, width - 116, mapHeight);
  context.restore();
  context.strokeStyle = COLORS.navy;
  context.lineWidth = 4;
  roundedRect(context, 58, mapTop, width - 116, mapHeight, 26);
  context.stroke();

  itineraryPlaces.forEach((place, index) => {
    const y = listTop + index * rowHeight;
    context.fillStyle = COLORS.coral;
    context.beginPath();
    context.arc(85, y + 28, 24, 0, Math.PI * 2);
    context.fill();
    drawText(
      context,
      String(index + 1),
      78,
      y + 37,
      "900 25px Arial",
      COLORS.paper,
    );
    drawText(context, place.name, 130, y + 25, "900 25px Arial");
    drawText(
      context,
      place.region ?? "Salish Sea",
      130,
      y + 51,
      "700 16px Arial",
      COLORS.muted,
    );
    drawText(
      context,
      place.type === "Ferry" ? "Ferry terminal" : place.type,
      780,
      y + 34,
      "800 19px Arial",
      place.type === "Park" ? "#418753" : "#257aa0",
    );
    context.strokeStyle = "rgba(6,29,60,.28)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(58, y + rowHeight - 8);
    context.lineTo(width - 58, y + rowHeight - 8);
    context.stroke();
  });

  context.fillStyle = "#edf7ef";
  roundedRect(context, 58, careTop, width - 116, 224, 24);
  context.fill();
  context.strokeStyle = COLORS.navy;
  context.lineWidth = 3;
  context.stroke();
  drawText(
    context,
    "WATCH WITH CARE",
    88,
    careTop + 42,
    "900 18px Arial",
    "#08787c",
  );
  drawText(
    context,
    "Give Southern Resident killer whales room to feed, rest, and communicate.",
    88,
    careTop + 78,
    "800 20px Arial",
  );

  context.fillStyle = COLORS.coral;
  roundedRect(context, 88, careTop + 99, 214, 72, 18);
  context.fill();
  drawText(
    context,
    "1,000 YDS",
    112,
    careTop + 132,
    "900 25px Arial",
    COLORS.paper,
  );
  drawText(
    context,
    "WASHINGTON · STAY BACK",
    102,
    careTop + 157,
    "900 12px Arial",
    COLORS.paper,
  );
  context.fillStyle = COLORS.navy;
  roundedRect(context, 322, careTop + 99, 214, 72, 18);
  context.fill();
  drawText(
    context,
    "400 YDS",
    350,
    careTop + 132,
    "900 25px Arial",
    COLORS.paper,
  );
  drawText(
    context,
    "STOP IF SAFE",
    350,
    careTop + 157,
    "900 14px Arial",
    COLORS.paper,
  );

  drawText(
    context,
    "• Slow to 7 knots or less and move away from their path.",
    572,
    careTop + 112,
    "700 16px Arial",
    COLORS.muted,
  );
  drawText(
    context,
    "• Never chase, encircle, leapfrog, feed, or separate mothers and calves.",
    572,
    careTop + 140,
    "700 16px Arial",
    COLORS.muted,
  );
  drawText(
    context,
    "• Check current local rules before departure: BeWhaleWise.org",
    572,
    careTop + 168,
    "700 16px Arial",
    COLORS.muted,
  );
  drawText(context, trendLabel, 88, careTop + 204, "900 16px Arial", "#08787c");

  drawText(
    context,
    "Prepared with OrcaCast · Viewing guidance is not a substitute for current regulations.",
    58,
    height - 48,
    "700 14px Arial",
    COLORS.muted,
  );

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Itinerary image could not be generated.")),
      "image/png",
    );
  });
}
