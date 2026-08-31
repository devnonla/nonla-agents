import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { getSiteRoot, treeContentHash } from "./sites-fs.js";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const MAX_THUMBNAIL_BYTES = 3 * 1024 * 1024;

function thumbnailPath(siteId: string) {
  return `${getSiteRoot(siteId)}/thumbnail.png`;
}

function thumbnailMetaPath(siteId: string) {
  return `${getSiteRoot(siteId)}/thumbnail.hash`;
}

/** Read thumbnail from the site directory, or null if missing. */
export async function readSiteThumbnailPng(siteId: string): Promise<Buffer | null> {
  const path = thumbnailPath(siteId);
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length < 8) return null;
    return buf;
  } catch {
    return null;
  }
}

/** Persist a client-captured PNG under `{dataDir}/sites/{id}/thumbnail.png`. */
export async function writeSiteThumbnailPng(siteId: string, png: Buffer): Promise<void> {
  if (!Buffer.isBuffer(png) || png.length < 8) {
    throw new BadRequestException("Invalid thumbnail image");
  }
  if (png.length > MAX_THUMBNAIL_BYTES) {
    throw new BadRequestException("Thumbnail too large");
  }
  if (!png.subarray(0, 4).equals(PNG_MAGIC)) {
    throw new BadRequestException("Thumbnail must be a PNG");
  }

  await Bun.write(thumbnailPath(siteId), png);
  await Bun.write(thumbnailMetaPath(siteId), treeContentHash(siteId, "draft"));
}

export async function hasSiteThumbnail(siteId: string): Promise<boolean> {
  return (await readSiteThumbnailPng(siteId)) !== null;
}
