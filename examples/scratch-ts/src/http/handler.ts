import { linkFor } from "../slug.js";

/** The edge: it may reach the core. */
export function handle(title: string): string {
  return linkFor(title);
}
