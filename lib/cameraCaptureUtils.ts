/**
 * Utility for safely capturing images from camera with retry logic
 * Handles "Image could not be captured" errors by retrying
 */

export async function takePictureWithRetry(
  cameraRef: any,
  options: { quality?: number; base64?: boolean } = {}
): Promise<{ uri: string; base64?: string } | null> {
  if (!cameraRef) return null;

  let retries = 0;
  const maxRetries = 2;

  while (retries < maxRetries) {
    try {
      const photo = await cameraRef.takePictureAsync({
        quality: options.quality ?? 0.7,
        base64: options.base64 ?? false,
      });

      if (photo?.uri && (options.base64 ? photo.base64 : true)) {
        return photo;
      }
    } catch (error: any) {
      console.warn(`Camera capture attempt ${retries + 1} failed:`, error.message);
      retries++;
      
      if (retries < maxRetries) {
        // Wait before retry to let camera reset
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }

  return null;
}

export function isCameraError(error: any): boolean {
  const msg = error?.message || error?.toString() || '';
  return msg.includes('Image could not be captured') ||
         msg.includes('takePictureAsync') ||
         msg.includes('Camera');
}
