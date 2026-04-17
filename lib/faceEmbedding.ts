import { Platform } from 'react-native';

let faceapi: any = null;
let modelsLoaded = false;

export async function initFaceNet() {
  if (modelsLoaded) return;

  faceapi = await import('face-api.js');

  if (Platform.OS === 'web') {
    await faceapi.nets.tinyFaceDetector.loadFromUri('/face-api-models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/face-api-models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('/face-api-models');
  } else {
    const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
    await faceapi.nets.tinyFaceDetector.loadFromUri(baseUrl);
    await faceapi.nets.faceLandmark68Net.loadFromUri(baseUrl);
    await faceapi.nets.faceRecognitionNet.loadFromUri(baseUrl);
  }

  modelsLoaded = true;
}

export async function getEmbedding(imageUri: string): Promise<number[]> {
  if (!modelsLoaded) await initFaceNet();

  return new Promise((resolve, reject) => {
    const image = document.createElement('img');
    image.crossOrigin = 'anonymous';
    image.onload = async () => {
      try {
        const detection = await faceapi
          .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!detection) {
          reject(new Error('No face detected'));
          return;
        }
        resolve(Array.from(detection.descriptor));
      } catch (err) {
        reject(err);
      }
    };
    image.onerror = reject;
    image.src = imageUri;
  });
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const magB = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
  return dot / (magA * magB);
}