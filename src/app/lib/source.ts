/**
 * Where a library file "came from" (the connector shown next to it in the picker). One rule for
 * the whole product: it delegates to the backend's own mapping (shared/platform.ts
 * sourceForLibraryFile), so the picker and the Conversations list always agree.
 */
import type { LibraryFile } from '../../shared/contracts';
import { sourceForLibraryFile } from '../../shared/platform';

export function librarySource(file: Pick<LibraryFile, 'filename' | 'format'>): string {
  return sourceForLibraryFile(file.filename, file.format);
}
