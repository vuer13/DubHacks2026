"use client";

import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

import { sharePath } from "@/lib/session";

export type ShareTileProps = { sessionId: string };

/** QR modules as one SVG path, drawn from the qrcode matrix (no innerHTML). */
function qrPath(text: string): { size: number; d: string } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  let d = "";
  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) {
      if (modules.get(row, col)) d += "M" + col + " " + row + "h1v1h-1z";
    }
  }
  return { size: modules.size, d };
}

/** "Share this hike" link with the session QR tile (frame 12). */
export function ShareTile({ sessionId }: ShareTileProps) {
  const path = sharePath(sessionId);
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const qr = useMemo(() => (origin ? qrPath(origin + path) : null), [origin, path]);

  return (
    <a
      href={path}
      aria-label="Share this hike, opens the share page"
      className="flex items-center gap-3 text-ts-accent-bright no-underline"
    >
      <span className="text-meta font-semibold underline underline-offset-[3px]">Share this hike</span>
      <span aria-hidden="true" className="flex h-24 w-24 shrink-0 rounded-[12px] bg-ts-text p-2">
        {qr ? (
          <svg width="80" height="80" viewBox={"0 0 " + qr.size + " " + qr.size} shapeRendering="crispEdges">
            <path fill="#000000" d={qr.d} />
          </svg>
        ) : null}
      </span>
    </a>
  );
}
