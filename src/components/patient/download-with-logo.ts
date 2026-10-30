import type { PhotoLogo } from "./photo";

const SIZE = { s: 0.22, m: 0.3, l: 0.4 } as const;

/**
 * Saves a photo with the clinic logo burned in, laid out like the on-screen overlay. Runs in the
 * browser from the photo the patient is already viewing; the stored original stays clean.
 */
export async function downloadWithLogo(input: {
  photoSrc: string;
  logo: PhotoLogo;
  opacity: number;
  fileName: string;
}): Promise<void> {
  const photo = await loadBitmap(input.photoSrc);
  const canvas = document.createElement("canvas");
  canvas.width = photo.width;
  canvas.height = photo.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(photo, 0, 0);

  if (input.logo) {
    const logo = await loadBitmap(input.logo.src);
    const plate = input.logo.backing === "plate";
    const boxW = photo.width * SIZE[input.logo.size];
    const padX = plate ? boxW * 0.04 : 0;
    const padY = plate ? boxW * 0.03 : 0;
    let w = boxW - padX * 2;
    let h = (w * logo.height) / logo.width;
    const maxH = photo.width * 0.16;
    if (h > maxH) {
      h = maxH;
      w = (h * logo.width) / logo.height;
    }
    const outerW = w + padX * 2;
    const outerH = h + padY * 2;
    const margin = photo.width * 0.05;
    const [vertical, horizontal] = input.logo.position.split("-") as ["top" | "bottom", "start" | "end"];
    // The page is right-to-left: "start" is the right edge, "end" the left.
    const x = horizontal === "start" ? photo.width - margin - outerW : margin;
    const y = vertical === "top" ? margin : photo.height - margin - outerH;

    ctx.globalAlpha = input.opacity;
    if (plate) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.roundRect(x, y, outerW, outerH, photo.width * 0.006);
      ctx.fill();
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = photo.width * 0.004;
      ctx.shadowOffsetY = photo.width * 0.002;
    }
    ctx.drawImage(logo, x + padX, y + padY, w, h);
    ctx.globalAlpha = 1;
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("Could not create the image");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = input.fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function loadBitmap(src: string): Promise<ImageBitmap> {
  const response = await fetch(src, { credentials: "same-origin" });
  if (!response.ok) throw new Error("Could not load the image");
  return createImageBitmap(await response.blob());
}
