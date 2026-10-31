/** Sizes of the patient app's home-screen icons (Android 192/512, iOS 180). */
export const appIconSizes = [180, 192, 512] as const;
export type AppIconSize = (typeof appIconSizes)[number];

export function parseIconSize(value: string): { size: AppIconSize; maskable: boolean } | null {
  const match = /^(\d+)(-maskable)?$/.exec(value);
  const size = match ? (Number(match[1]) as AppIconSize) : null;
  return size && appIconSizes.includes(size) ? { size, maskable: Boolean(match![2]) } : null;
}
