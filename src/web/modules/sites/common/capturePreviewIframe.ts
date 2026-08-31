import { toBlob } from "html-to-image";

const CAPTURE_WIDTH = 960;
const CAPTURE_HEIGHT = 600;

/** Capture the same-origin live preview iframe into a PNG blob. */
export async function capturePreviewIframe(iframe: HTMLIFrameElement): Promise<Blob | null> {
  const doc = iframe.contentDocument;
  if (!doc?.body) return null;

  const target = (doc.getElementById("root") as HTMLElement | null) ?? doc.body;
  if (!target) return null;

  const blob = await toBlob(target, {
    width: CAPTURE_WIDTH,
    height: CAPTURE_HEIGHT,
    canvasWidth: CAPTURE_WIDTH,
    canvasHeight: CAPTURE_HEIGHT,
    pixelRatio: 1,
    cacheBust: true,
    style: {
      width: `${CAPTURE_WIDTH}px`,
      height: `${CAPTURE_HEIGHT}px`,
      overflow: "hidden",
    },
  });

  return blob;
}
