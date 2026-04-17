import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../lib/theme';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import * as FileSystem from 'expo-file-system/legacy';
import { takePictureWithRetry, isCameraError } from '../../lib/cameraCaptureUtils';
import FaceDetection from '@react-native-ml-kit/face-detection';
import { getEmbedding, initFaceNet } from '../../lib/faceEmbedding';

const ACCOUNT_EMAIL = "office@gmail.com";
// Company ID is now fetched dynamically based on accountEmail in the backend
const ALLOWED_DEPARTMENTS = ["HR", "Finance", "Engineering", "Operations"];

const COOLDOWN_CHECKIN = 10 * 60 * 1000;
const COOLDOWN_CHECKOUT = 24 * 60 * 60 * 1000;
const COOLDOWN_WARNING = 5 * 60 * 1000;
const COOLDOWN_DENIED = 2 * 60 * 1000;
const COOLDOWN_COMPLETED = 24 * 60 * 60 * 1000;
const COOLDOWN_PERMISSION = 24 * 60 * 60 * 1000;

type ScanState = 'idle' | 'scanning' | 'success' | 'warning' | 'denied' | 'error' | 'completed' | 'duplicate' | 'multiple_faces';

interface CooldownEntry {
  timestamp: number;
  action: string;
  duration: number;
}

export default function OfficeFaceScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [resultData, setResultData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [multipleFacesResult, setMultipleFacesResult] = useState<any>(null);
  const [showCamera, setShowCamera] = useState(true);
  const cameraRef = useRef<any>(null);
  const cooldownMap = useRef<Map<string, CooldownEntry>>(new Map());
  const isProcessing = useRef(false);
  const lastScanDate = useRef<string>('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const cleanupTimeoutRef = useRef<any>(null);

  const recognizeAction = useAction(api.faceRecognitionAction.recognizeFaceAndMarkAttendance);
  const generateUploadUrl = useMutation(api.employees.generateUploadUrl);
  const _keepAlive = useQuery(api.users.getCurrentUser);

useEffect(() => {
  initFaceNet().catch(err => console.error('FaceNet init failed:', err));
}, []);

  useEffect(() => {
    const interval = setInterval(() => {
      console.log('Office session keepalive');
    }, 4 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkDate = setInterval(() => {
      const today = new Date().toISOString().split('T')[0];
      if (lastScanDate.current && lastScanDate.current !== today) {
        cooldownMap.current.clear();
        lastScanDate.current = today;
      }
    }, 60 * 1000);
    return () => clearInterval(checkDate);
  }, []);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
      }
      // Stop auto-scan interval
      if (permission?.granted && scanState === 'idle') {
        isProcessing.current = false;
        setScanState('idle');
      }
    };
  }, []);



  // When status changes, hide/show camera accordingly
  useEffect(() => {
    if (scanState === 'success' || scanState === 'error' || scanState === 'denied' || 
        scanState === 'warning' || scanState === 'completed' || scanState === 'duplicate' || 
        scanState === 'multiple_faces') {
      setShowCamera(false);
    } else if (scanState === 'idle' || scanState === 'scanning') {
      setShowCamera(true);
    }
  }, [scanState]);

  const isInCooldown = (employeeId: string): boolean => {
    const entry = cooldownMap.current.get(employeeId);
    if (!entry) return false;
    if (Date.now() - entry.timestamp > entry.duration) {
      cooldownMap.current.delete(employeeId);
      return false;
    }
    return true;
  };

  const addCooldown = (employeeId: string, action: string, duration: number) => {
    cooldownMap.current.set(employeeId, { timestamp: Date.now(), action, duration });
  };

  const captureAndRecognize = useCallback(async () => {
    if (isProcessing.current || scanState !== 'idle' || !cameraRef.current) return;
    isProcessing.current = true;
    setScanState('scanning');
    setErrorMsg('');

    try {
      // Capture photo with automatic retry on failure
      const photo = await takePictureWithRetry(cameraRef.current, { quality: 0.7, base64: true });
      
      if (!photo?.uri || !photo?.base64) {
        isProcessing.current = false;
        setScanState('idle');
        return;
      }

      let storageId: string | undefined;
      try {
        const uploadUrl = await generateUploadUrl();
        const response = await FileSystem.uploadAsync(uploadUrl, photo.uri, {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': 'image/jpeg' },
        });
        storageId = JSON.parse(response.body).storageId;
      } catch (uploadErr) {
        console.warn('Storage upload failed, continuing with base64:', uploadErr);
      }

      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const localTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      lastScanDate.current = localDate;

      const result = await recognizeAction({
        capturedStorageId: storageId as any,
        imageBase64: photo.base64,
        localDate,
        localTime,
        accountEmail: ACCOUNT_EMAIL,
      });

      const empId = result.employeeId || 'unknown';

      if (result.errorType === "multiple_faces") {
        setMultipleFacesResult({ message: result.reason || "Only one person at a time please" });
        setScanState("multiple_faces");
        setTimeout(() => { setScanState("idle"); setMultipleFacesResult(null); }, 3000);
        isProcessing.current = false;
        return;
      }

      if (empId !== 'unknown' && isInCooldown(empId)) {
        setScanState('idle');
        isProcessing.current = false;
        return;
      }

      if (result.success) {
        const isLate = result.status === 'late';
        const isPermission = result.status === 'permission';
        const actionLabel = result.action === 'checkin'
          ? (isLate ? 'Checked In (Late)' : 'Checked In')
          : (isPermission ? 'Checked Out (Permission)' : 'Checked Out');

        setResultData({
          name: result.employeeName,
          department: result.department,
          action: actionLabel,
          time: result.time || localTime,
          confidence: result.confidence,
          employeeId: empId,
          isLate,
          isPermission,
          isCheckout: result.action === 'checkout',
        });
        setScanState('success');

        if (result.action === 'checkout') {
          addCooldown(empId, 'checkout', isPermission ? COOLDOWN_PERMISSION : COOLDOWN_CHECKOUT);
        } else {
          addCooldown(empId, 'checkin', COOLDOWN_CHECKIN);
        }
        
        // Auto-reset after 4 seconds
        cleanupTimeoutRef.current = setTimeout(() => {
          setScanState('idle');
          setResultData(null);
        }, 4000);
        
      } else if (result.warning) {
        setResultData({
          name: result.employeeName || 'Employee',
          department: result.department || '',
          confidence: result.confidence,
          reason: result.reason || 'Check-out is only available after 5:30 PM',
        });
        setScanState('warning');
        addCooldown(empId, 'warning', COOLDOWN_WARNING);
        
        // Use ref for timeout
        cleanupTimeoutRef.current = setTimeout(() => {
          setScanState('idle');
          setResultData(null);
        }, 4000);
        
      } else if (result.accessDenied) {
        setResultData({
          name: result.employeeName || 'Unknown',
          department: result.department || 'Unknown',
          confidence: result.confidence,
          reason: result.reason,
        });
        setScanState('denied');
        if (empId !== 'unknown') addCooldown(empId, 'denied', COOLDOWN_DENIED);
        
        // Use ref for timeout
        cleanupTimeoutRef.current = setTimeout(() => {
          setScanState('idle');
          setResultData(null);
        }, 3000);
        
      } else {
        const reason = result.reason || 'Face not recognized';
        if (reason.includes('already completed') || reason.includes('Attendance already')) {
          setResultData({ name: result.employeeName, department: result.department, reason });
          setScanState('completed');
          addCooldown(empId, 'completed', COOLDOWN_COMPLETED);
        } else if (reason.includes('Already scanned') || reason.includes('duplicate')) {
          setScanState('duplicate');
          addCooldown(empId, 'duplicate', COOLDOWN_CHECKIN);
          cleanupTimeoutRef.current = setTimeout(() => {
            setScanState('idle');
            setResultData(null);
          }, 2000);
        } else {
          setErrorMsg(reason);
          setScanState('error');
          cleanupTimeoutRef.current = setTimeout(() => {
            setScanState('idle');
            setErrorMsg('');
          }, 2000);
        }
      }
    } catch (error: any) {
      console.error('Office scan error:', error);
      if (error?.errorType === "multiple_faces") {
        setMultipleFacesResult({ message: error?.reason || "Only one person at a time please" });
        setScanState("multiple_faces");
        setTimeout(() => { setScanState("idle"); setMultipleFacesResult(null); }, 3000);
        return;
      }
      const msg = error?.message || '';
      if (isCameraError(error)) {
        setErrorMsg('Camera not ready. Please try again.');
      } else if (msg.includes('Unauthenticated') || msg.includes('OIDC') || msg.includes('token') || msg.includes('expired')) {
        setErrorMsg('Session expired. Please restart the app and log in again.');
      } else {
        setErrorMsg('Scan failed. Please try again.');
      }
      setScanState('error');
      cleanupTimeoutRef.current = setTimeout(() => {
        setScanState('idle');
        setErrorMsg('');
      }, 3000);
    } finally {
      isProcessing.current = false;
    }
  }, [scanState, generateUploadUrl, recognizeAction]);

 const handleScan = async () => {
  if (isProcessing.current || !cameraRef.current) return;
  isProcessing.current = true;
  setScanState('scanning');

  try {
    const photo = await takePictureWithRetry(cameraRef);
    if (!photo?.uri) throw new Error('Camera capture failed');

    // ML Kit: detect face on-device
    const faces = await FaceDetection.detect(photo.uri);

    if (faces.length === 0) {
      setScanState('error');
      setErrorMsg('No face detected. Please look directly at the camera.');
      return;
    }
    if (faces.length > 1) {
      setScanState('multiple_faces');
      setMultipleFacesResult({ count: faces.length });
      return;
    }

    // FaceNet: generate embedding on-device
    const embedding = await getEmbedding(photo.uri);

    // Upload proof image for audit trail
    let storageId: string | undefined;
    try {
      const uploadUrl = await generateUploadUrl();
      const blob = await fetch(photo.uri).then(r => r.blob());
      const uploadResp = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob,
      });
      const { storageId: sid } = await uploadResp.json();
      storageId = sid;
    } catch (uploadErr) {
      console.warn('Proof image upload failed (non-fatal):', uploadErr);
    }

    // Send embedding to Convex for matching
    const now = new Date();
    const localDate = now.toLocaleDateString('en-CA');
    const localTime = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const result = await recognizeAction({
      embedding,
      localDate,
      localTime,
      proofImageId: storageId as any,
      allowedDepartments: ALLOWED_DEPARTMENTS,
      accountEmail: ACCOUNT_EMAIL,
      deviceId: ACCOUNT_EMAIL,
    });

    if (!result.success) {
      setScanState('denied');
      setErrorMsg(result.message || 'Face not recognised');
      addCooldown(ACCOUNT_EMAIL, 'denied', COOLDOWN_DENIED);
      return;
    }

    if (result.action === 'completed') {
      setScanState('completed');
      addCooldown(ACCOUNT_EMAIL, 'completed', COOLDOWN_COMPLETED);
      return;
    }

    if (result.action === 'duplicate') {
      setScanState('duplicate');
      return;
    }

    if (result.action === 'too_early') {
      setScanState('warning');
      setResultData(result);
      addCooldown(ACCOUNT_EMAIL, 'warning', COOLDOWN_WARNING);
      return;
    }

    setScanState('success');
    setResultData(result);
    const cooldownDuration = result.action === 'checkin'
      ? COOLDOWN_CHECKIN : COOLDOWN_CHECKOUT;
    addCooldown(ACCOUNT_EMAIL, result.action, cooldownDuration);

  } catch (err: any) {
    if (isCameraError(err)) {
      setShowCamera(false);
      setTimeout(() => setShowCamera(true), 1000);
    }
    setScanState('error');
    setErrorMsg(err?.message || 'Scan failed. Please try again.');
  } finally {
    isProcessing.current = false;
  }
};

  if (!permission) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.permissionText}>Camera permission is required for face scan.</Text>
        <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {showCamera ? (
        <CameraView ref={cameraRef} style={styles.camera} facing="front">
          <View style={styles.overlay}>
            <View style={styles.header}>
              <Text style={styles.headerText}>Office Face Scan</Text>
              <Text style={styles.subText}>Align face in the circle and scan</Text>
            </View>

            <View style={styles.guideContainer}>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <View style={[styles.circleBorder, scanState === 'scanning' && styles.circleBorderActive]} />
              </Animated.View>
              <TouchableOpacity
                style={styles.scanButton}
                onPress={handleScan}
                disabled={scanState === 'scanning'}
              >
                <MaterialCommunityIcons
                  name={scanState === 'scanning' ? 'loading' : 'camera'}
                  size={28}
                  color="#fff"
                />
                <Text style={styles.scanButtonText}>{scanState === 'scanning' ? 'Scanning' : 'Scan'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.statusBar}>
              <View
                style={[
                  styles.statusDot,
                  scanState === 'idle'
                    ? styles.dotReady
                    : scanState === 'scanning'
                      ? styles.dotActive
                      : scanState === 'success'
                        ? styles.dotSuccess
                        : scanState === 'warning'
                          ? styles.dotWarning
                          : styles.dotDenied,
                ]}
              />
              <Text style={styles.statusText}>
                {scanState === 'idle' ? 'Ready' : scanState === 'scanning' ? 'Scanning...' : 'Processed'}
              </Text>
            </View>
          </View>
        </CameraView>
      ) : (
        <View style={styles.center}>
          {scanState === 'success' && (
            <View style={styles.resultCard}>
              <Text style={styles.resultName}>{resultData?.employeeName || resultData?.name || 'Employee'}</Text>
              <Text style={styles.resultAction}>{resultData?.action || 'Attendance marked'}</Text>
              <Text style={styles.resultTime}>{resultData?.time || ''}</Text>
              <Text style={styles.resultConfidence}>Confidence: {resultData?.confidence || '--'}%</Text>
            </View>
          )}

          {scanState === 'warning' && (
            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>Warning</Text>
              <Text style={styles.warningMessage}>{resultData?.reason || 'Please try again later.'}</Text>
            </View>
          )}

          {scanState === 'denied' && (
            <View style={styles.accessDeniedCard}>
              <Text style={styles.deniedTitle}>Access Denied</Text>
              <Text style={styles.deniedMessage}>{errorMsg || 'Face not recognised.'}</Text>
            </View>
          )}

          {scanState === 'completed' && (
            <View style={styles.completedCard}>
              <Text style={styles.completedTitle}>Already Completed</Text>
              <Text style={styles.completedMessage}>Attendance for today is already completed.</Text>
            </View>
          )}

          {scanState === 'duplicate' && (
            <View style={styles.duplicateCard}>
              <Text style={styles.duplicateText}>Duplicate scan detected.</Text>
            </View>
          )}

          {scanState === 'multiple_faces' && (
            <View style={styles.multipleFacesCard}>
              <Text style={styles.multipleFacesTitle}>Multiple Faces</Text>
              <Text style={styles.multipleFacesMessage}>
                {multipleFacesResult?.message || 'Only one person should be visible.'}
              </Text>
            </View>
          )}

          {scanState === 'error' && (
            <View style={styles.errorCard}>
              <MaterialCommunityIcons name="alert-circle" size={18} color="#fff" />
              <Text style={styles.errorText}>{errorMsg || 'Scan failed'}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.scanNextButton}
            onPress={() => {
              setErrorMsg('');
              setResultData(null);
              setMultipleFacesResult(null);
              setShowCamera(true);
              setScanState('idle');
            }}
          >
            <MaterialCommunityIcons name="camera-retake" size={18} color="#fff" />
            <Text style={styles.scanNextText}>Scan Again</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, backgroundColor: '#0a0e27' },
  permissionText: { fontSize: 16, color: '#fff', textAlign: 'center', paddingHorizontal: 20 },
  permButton: { backgroundColor: '#4A90D9', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  permButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  header: {
    alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12,
  },
  headerText: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  subText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  guideContainer: { alignItems: 'center', justifyContent: 'center' },
  circleBorder: {
    width: 420,
    height: 420,
    borderRadius: 210,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  scanningBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
  },
  scanningText: { color: '#4A90D9', fontSize: 13, fontWeight: '500' },
  resultCard: {
    backgroundColor: 'rgba(76, 175, 80, 0.95)', paddingHorizontal: 28, paddingVertical: 20,
    borderRadius: 16, alignItems: 'center', gap: 4, width: '85%',
  },
  resultCardLate: { backgroundColor: 'rgba(255, 152, 0, 0.95)' },
  resultCardPermission: { backgroundColor: 'rgba(156, 39, 176, 0.95)' },
  resultName: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginTop: 4 },
  resultDept: { fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  resultDivider: {
    width: 40, height: 2, backgroundColor: 'rgba(255,255,255,0.4)',
    marginVertical: 8, borderRadius: 1,
  },
  resultAction: { fontSize: 18, fontWeight: '700', color: '#fff' },
  resultTime: { fontSize: 15, color: 'rgba(255,255,255,0.9)' },
  resultConfidence: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  scanNextButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 10, marginTop: 16,
  },
  scanNextText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  completedCard: {
    backgroundColor: 'rgba(20, 40, 20, 0.95)', paddingHorizontal: 28, paddingVertical: 24,
    borderRadius: 16, alignItems: 'center', width: '85%',
    borderWidth: 2, borderColor: '#4CAF50',
  },
  completedTitle: { fontSize: 20, fontWeight: 'bold', color: '#4CAF50', marginTop: 8 },
  completedName: { fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 4 },
  completedDept: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  completedMessage: {
    fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 10, lineHeight: 20,
  },
  duplicateCard: {
    backgroundColor: 'rgba(255, 152, 0, 0.85)', paddingHorizontal: 20, paddingVertical: 14,
    borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 10, width: '85%',
  },
  duplicateText: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },
  warningCard: {
    backgroundColor: 'rgba(30, 20, 0, 0.95)',
    borderColor: '#FF9800', borderWidth: 2,
    borderRadius: 16, padding: 24, alignItems: 'center', width: '90%',
  },
  warningIconCircle: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255, 152, 0, 0.15)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
    borderWidth: 2, borderColor: 'rgba(255, 152, 0, 0.3)',
  },
  warningTitle: { fontSize: 22, fontWeight: 'bold', color: '#FF9800', marginBottom: 4 },
  warningName: { fontSize: 18, fontWeight: '700', color: '#fff' },
  warningDept: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 4 },
  warningDivider: {
    width: 40, height: 2, backgroundColor: 'rgba(255, 152, 0, 0.4)',
    marginVertical: 10, borderRadius: 1,
  },
  warningMessage: { fontSize: 15, color: '#FF9800', textAlign: 'center', fontWeight: '600' },
  warningSubMessage: {
    fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 6, lineHeight: 18,
  },
  warningTimer: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 12, fontStyle: 'italic' },
  accessDeniedCard: {
    backgroundColor: 'rgba(30, 0, 0, 0.95)', paddingHorizontal: 28, paddingVertical: 24,
    borderRadius: 16, alignItems: 'center', width: '90%',
    borderWidth: 2, borderColor: '#f44336',
  },
  deniedIconCircle: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(244, 67, 54, 0.15)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
    borderWidth: 2, borderColor: 'rgba(244, 67, 54, 0.3)',
  },
  deniedTitle: { fontSize: 24, fontWeight: 'bold', color: '#f44336', marginBottom: 8 },
  deniedMessage: {
    fontSize: 15, color: '#fff', textAlign: 'center', lineHeight: 22, fontWeight: '600',
  },
  deniedSubMessage: {
    fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 6, lineHeight: 18,
  },
  deniedInfoBox: {
    backgroundColor: 'rgba(244, 67, 54, 0.15)', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 8, marginTop: 12, width: '100%', alignItems: 'center',
  },
  deniedInfoLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginVertical: 1 },
  deniedTimer: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 12, fontStyle: 'italic' },
  errorCard: {
    backgroundColor: 'rgba(244, 67, 54, 0.8)', paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8, width: '85%',
  },
  errorText: { color: '#fff', fontSize: 13, flex: 1 },
  multipleFacesCard: {
    backgroundColor: 'rgba(20, 0, 30, 0.95)', paddingHorizontal: 28, paddingVertical: 24,
    borderRadius: 16, alignItems: 'center', width: '85%',
    borderWidth: 2, borderColor: '#9C27B0',
  },
  multipleFacesTitle: { fontSize: 20, fontWeight: 'bold', color: '#9C27B0', marginTop: 8 },
  multipleFacesMessage: {
    fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 8, lineHeight: 20,
  },
  multipleFacesTimer: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 12, fontStyle: 'italic' },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  dotReady: { backgroundColor: '#4CAF50' },
  dotActive: { backgroundColor: '#4A90D9' },
  dotSuccess: { backgroundColor: '#4CAF50' },
  dotDenied: { backgroundColor: '#f44336' },
  dotWarning: { backgroundColor: '#FF9800' },
  scanButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(74, 144, 217, 0.9)',
    borderRadius: 60,
    width: 120,
    height: 120,
    gap: 6,
    borderWidth: 3,
    borderColor: '#4A90D9',
  },
  scanButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  circleBorderActive: {
    width: 420,
    height: 420,
    borderRadius: 210,
    borderWidth: 4,
    borderColor: '#4A90D9',
  },
  statusText: { color: '#fff', fontSize: 12 },
});