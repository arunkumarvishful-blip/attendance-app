import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import FaceDetection from '@react-native-ml-kit/face-detection';
import { getEmbedding } from '../../lib/faceEmbedding';
import { takePictureWithRetry } from '../../lib/cameraCaptureUtils';

export default function FaceEnrollmentScreen({ route }: any) {
  const { employeeId, employeeName } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<'idle'|'capturing'|'done'|'error'>('idle');
  const [captureCount, setCaptureCount] = useState(0);
  const [embeddings, setEmbeddings] = useState<number[][]>([]);
  const cameraRef = useRef<CameraView>(null);

  const enrollAction = useAction(api.faceRecognitionAction.enrollFaceEmbedding);
  const REQUIRED_CAPTURES = 3;

  const captureAndEmbed = async () => {
    setStatus('capturing');
    try {
      const photo = await takePictureWithRetry(cameraRef);
      if (!photo) {
        Alert.alert('Error', 'Failed to capture photo');
        setStatus('idle');
        return;
      }
      const faces = await FaceDetection.detect(photo.uri);

      if (faces.length !== 1) {
        Alert.alert('Error', faces.length === 0
          ? 'No face detected. Look directly at camera.'
          : 'Multiple faces detected. Only one person in frame.'
        );
        setStatus('idle');
        return;
      }

      const embedding = await getEmbedding(photo.uri);
      const newEmbeddings = [...embeddings, embedding];
      setEmbeddings(newEmbeddings);
      setCaptureCount(c => c + 1);

      if (newEmbeddings.length >= REQUIRED_CAPTURES) {
        // Average all embeddings for better accuracy
        const avgEmbedding = newEmbeddings[0].map((_, i) =>
          newEmbeddings.reduce((sum, e) => sum + e[i], 0) / newEmbeddings.length
        );

        await enrollAction({ employeeId, embedding: avgEmbedding });
        setStatus('done');
        Alert.alert('Success', `${employeeName} enrolled successfully!`);
      } else {
        setStatus('idle');
        Alert.alert(
          'Photo captured',
          `${newEmbeddings.length}/${REQUIRED_CAPTURES} done. Take another.`
        );
      }
    } catch (err: any) {
      setStatus('error');
      Alert.alert('Error', err.message || 'Enrollment failed');
    }
  };

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Camera permission required</Text>
        <TouchableOpacity onPress={requestPermission}>
          <Text style={styles.link}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enroll: {employeeName}</Text>
      <Text style={styles.subtitle}>
        Photo {captureCount}/{REQUIRED_CAPTURES} — Look directly at camera
      </Text>
      <CameraView ref={cameraRef} style={styles.camera} facing="front" />
      {status !== 'done' && (
        <TouchableOpacity
          style={[styles.button, status === 'capturing' && styles.buttonDisabled]}
          onPress={captureAndEmbed}
          disabled={status === 'capturing'}
        >
          <Text style={styles.buttonText}>
            {status === 'capturing' ? 'Processing...' : 'Capture Photo'}
          </Text>
        </TouchableOpacity>
      )}
      {status === 'done' && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>
            ✅ {employeeName} enrolled successfully!
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: {
    color: '#fff', fontSize: 20, fontWeight: 'bold',
    textAlign: 'center', padding: 16
  },
  subtitle: {
    color: '#aaa', fontSize: 15, textAlign: 'center', marginBottom: 8
  },
  text: { color: '#000', fontSize: 16 },
  camera: { flex: 1 },
  button: {
    backgroundColor: '#1E3A5F', padding: 18, margin: 16,
    borderRadius: 12, alignItems: 'center'
  },
  buttonDisabled: { backgroundColor: '#555' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  link: { color: '#1E3A5F', fontSize: 16, marginTop: 12 },
  successBox: {
    backgroundColor: '#1A5C38', padding: 20, margin: 16, borderRadius: 12
  },
  successText: { color: '#fff', fontSize: 16, textAlign: 'center' },
});