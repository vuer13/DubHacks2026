import { GuidanceGlyph } from "@/components/GuidanceGlyph";
import { PillToggle } from "@/components/ui/PillToggle";
import type { LowVisionView as LowVisionViewModel } from "@/lib/ui/lowvision";

export type LowVisionViewProps = {
  view: LowVisionViewModel;
  onLowVisionChange: (on: boolean) => void;
};

const FRAME_HEIGHT = 844;

/**
 * Frames LV4 to LV7: black screen, one full-screen guidance glyph, one line of
 * 64px yellow text, and only the Low vision pill so the mode can be left.
 * The glyph and text keep the frame's proportions at any screen height.
 */
export function LowVisionView({ view, onLowVisionChange }: LowVisionViewProps) {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-black text-ts-sos-bg">
      <div className="absolute inset-0">
        <GuidanceGlyph kind={view.glyph} />
      </div>
      <p
        aria-live="assertive"
        aria-atomic="true"
        className="absolute inset-x-4 m-0 text-center text-lv tracking-[-0.02em] [text-wrap:balance]"
        style={{ top: (view.textTop / FRAME_HEIGHT) * 100 + "%" }}
      >
        {view.text}
      </p>
      <div className="absolute inset-x-0 bottom-6 flex justify-center">
        <PillToggle label="Low vision" checked tone="yellow" onChange={onLowVisionChange} />
      </div>
    </div>
  );
}
