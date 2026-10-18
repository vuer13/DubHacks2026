import { notFound } from "next/navigation";

import { StatesGallery } from "./StatesGallery";

export const metadata = { title: "TrailSense hiker states" };

/** Dev-only gallery of the twelve hiker frames. 404 in production. */
export default function DevStatesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StatesGallery />;
}
