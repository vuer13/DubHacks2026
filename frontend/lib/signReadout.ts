import type { SignReading } from "@/lib/schema";

export type SignReadout = {
  fingerprint: string;
  chunks: string[];
};

const normalize = (text: string): string =>
  text.trim().replace(/\s+/g, " ").toLowerCase();

export function buildSignReadout(
  sign: SignReading | null | undefined,
): SignReadout | null {
  if (!sign || sign.kind === "none") return null;

  const arrows = sign.arrows.filter((arrow) => arrow.label.trim());
  const labels = new Set(arrows.map((arrow) => normalize(arrow.label)));
  const parts = [
    ...arrows.map((arrow) => `${arrow.direction}, ${arrow.label.trim()}`),
    ...sign.lines.filter((line) => line.trim() && !labels.has(normalize(line))),
  ];

  const chunks: string[] = [];
  for (const part of new Set(parts)) {
    const words = part.trim().split(/\s+/);
    for (let index = 0; index < words.length; index += 12) {
      chunks.push(words.slice(index, index + 12).join(" "));
    }
  }
  if (chunks.length === 0) return null;

  return {
    fingerprint: JSON.stringify({
      lines: sign.lines.map(normalize).filter(Boolean).sort(),
      arrows: arrows.map(
        (arrow) => `${arrow.direction}:${normalize(arrow.label)}`,
      ).sort(),
    }),
    chunks,
  };
}


export class SignReadoutHistory {
  private completed = new Set<string>();
  private ignoreUntil = 0;

  acceptsResult(sourceStartedAt: number, now = Date.now()): boolean {
    const age = now - sourceStartedAt;
    return age >= 0 && age <= 10_000 &&
      now >= this.ignoreUntil && sourceStartedAt >= this.ignoreUntil;
  }

  canRead(fingerprint: string, sourceStartedAt: number, now = Date.now()): boolean {
    if (!this.acceptsResult(sourceStartedAt, now)) return false;
    for (const previous of this.completed) {
      if (isSameSign(previous, fingerprint)) return false;
    }
    return true;
  }

  markFinished(fingerprint: string, now = Date.now()): void {
    this.completed.add(fingerprint);
    this.ignoreUntil = now + 2_000;
  }

  reset(): void {
    this.completed.clear();
    this.ignoreUntil = 0;
  }
}



export function isSameSign(a: string, b: string): boolean {
  if (a === b) return true;

  const words = (fingerprint: string): string[] => {
    try {
      const sign = JSON.parse(fingerprint) as {
        lines: string[];
        arrows: string[];
      };
      const text = [
        ...sign.lines,
        ...sign.arrows.map((arrow) => arrow.replace(/^[^:]*:/, "")),
      ].join(" ").toLowerCase();

      const ignored = new Set([
        "trail", "trails", "km", "m", "mile", "miles",
        "the", "to", "and",
      ]);
      return [...new Set(
        (text.match(/[a-z]+/g) ?? []).filter(
          (word) => !ignored.has(word),
        ),
      )];
    } catch {
      return [];
    }
  };

  const left = words(a);
  const right = words(b);
  if (!left.length || !right.length) return false;

  const close = (x: string, y: string): boolean => {
    if (x === y) return true;
    if (Math.min(x.length, y.length) < 4) return false;

    let row = Array.from({ length: y.length + 1 }, (_, i) => i);
    for (let i = 1; i <= x.length; i++) {
      const next = [i];
      for (let j = 1; j <= y.length; j++) {
        next[j] = Math.min(
          next[j - 1] + 1,
          row[j] + 1,
          row[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
        );
      }
      row = next;
    }
    return row[y.length] <= 1;
  };

  const remaining = [...right];
  let matches = 0;
  for (const word of left) {
    let index = remaining.indexOf(word);
    if (index < 0) {
      index = remaining.findIndex((other) => close(word, other));
    }
    if (index >= 0) {
      matches++;
      remaining.splice(index, 1);
    }
  }

  return (2 * matches) / (left.length + right.length) >= 0.75;
}
