import React, { useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';

export interface FaceProcessorRef {
  extractDescriptor: (base64: string) => Promise<number[]>;
  isReady: () => boolean;
}

const FaceProcessor = forwardRef<FaceProcessorRef, { onReady?: () => void }>(({ onReady }, ref) => {
  const readyRef = useRef(true);

  const handleReady = useCallback(() => {
    readyRef.current = true;
    onReady?.();
  }, [onReady]);

  React.useEffect(() => {
    handleReady();
  }, [handleReady]);

  useImperativeHandle(ref, () => ({
    extractDescriptor: async (base64: string) => {
      // Return empty descriptor array - actual face detection happens server-side with AWS Rekognition
      // This client just validates the image is provided
      if (!base64 || base64.length === 0) {
        throw new Error('No image data provided');
      }
      // Return a dummy descriptor - real matching happens on server
      return new Array(128).fill(0);
    },
    isReady: () => readyRef.current,
  }));

  return (
    <View style={{ width: 0, height: 0, overflow: 'hidden', position: 'absolute' }}>
      {/* Empty placeholder - face detection handled server-side */}
    </View>
  );
});

export default FaceProcessor;