export interface StorageBackend {
  load(key: string): unknown;
  save(key: string, value: unknown): void;
  saveImage(id: string, ext: string, b64: string): string;
}
export function useStorage(backend: StorageBackend): void;
export function storage(): StorageBackend;
