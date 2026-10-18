"use client";

import { HikerScreen, type HikerScreenHandlers } from "@/components/hiker/HikerScreen";
import { hikerFixtures } from "@/lib/ui/fixtures";
import { selectHikerView } from "@/lib/ui/state";

const noop = () => {};
const handlers: HikerScreenHandlers = {
  onUseDemo: noop,
  onVideoSelected: noop,
  onToggleLog: noop,
  onMicPress: noop,
  onLiveChange: noop,
  onLowVisionChange: noop,
};

export function StatesGallery() {
  return (
    <div className="min-h-dvh bg-black p-6 text-ts-text">
      <h1 className="m-0 mb-6 text-heading">Hiker screen states</h1>
      <div className="flex gap-6 overflow-x-auto pb-6">
        {hikerFixtures.map((fixture) => (
          <figure key={fixture.frame} className="m-0 flex shrink-0 flex-col gap-3" data-frame={fixture.png}>
            <figcaption className="text-label">
              {fixture.frame}
              <span className="block text-meta font-normal text-ts-text-muted">{fixture.png}</span>
            </figcaption>
            <HikerScreen
              state={fixture.state}
              view={selectHikerView(fixture.state, fixture.now)}
              {...(fixture.sessionId ? { sessionId: fixture.sessionId } : {})}
              framed
              handlers={handlers}
            />
          </figure>
        ))}
      </div>
    </div>
  );
}
