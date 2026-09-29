// Types for the web app's static demo build (web/src/lib/local-api.ts); the view
// shapes themselves are typed in web/src/lib/api.ts.
export interface Api {
  /** Re-read stored uploads/appeals and rebuild the index (after another tab wrote them). */
  refresh(): void;
  handle(method: string, url: URL, readBody: (limit: number) => Promise<unknown>): Promise<unknown>;
}
export function createApi(): Api;
export function serialize(body: unknown): string;
export const CATEGORY_LABELS: Record<string, string>;
