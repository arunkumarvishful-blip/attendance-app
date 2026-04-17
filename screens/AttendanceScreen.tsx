import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
Modal, ActivityIndicator, Image, Dimensions, Pressable, Vibration, FlatList, Platform, TextInput,
Animated as RNAnimated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery, useMutation, useConvex } from 'convex/react';
import { api } from '../convex/_generated/api';
import { colors, gradients, spacing, borderRadius } from '../lib/theme';
import { getLocalDate, getLocalTime, formatDate, formatTime } from '../lib/utils';
import GlassCard from '../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Ellipse, Defs, Mask, Rect } from 'react-native-svg';
import CameraPermissionGate from '../components/CameraPermissionGate';
import { useFocusEffect } from '@react-navigation/native';

const { width: SW, height: SH } = Dimensions.get('window');

const OVAL_W = SW * 0.58;
const OVAL_H = OVAL_W * 1.35;
const OVAL_CX = SW / 2;
const OVAL_CY = SH * 0.36;

function MyAttendanceHistory({ employeeId }: { employeeId: any }) {
  const today = getLocalDate();
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7));

  const records = useQuery(api.attendance.getMyAttendanceByMonth, { employeeId, monthPrefix: selectedMonth });
  const summary = useQuery(api.attendance.getMyMonthSummary, { employeeId, monthPrefix: selectedMonth });

  // Generate last 12 months for the month picker
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const val = d.toISOString().slice(0, 7);
    const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
    months.push({ val, label });
  }

  return (
    <LinearGradient colors={gradients.background as any} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
        
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 20 }}>My Attendance</Text>

        {/* Month picker */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {months.map(m => (
              <TouchableOpacity
                key={m.val}
                onPress={() => setSelectedMonth(m.val)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                  backgroundColor: selectedMonth === m.val ? colors.primaryLight : 'rgba(255,255,255,0.06)',
                  borderWidth: 1,
                  borderColor: selectedMonth === m.val ? colors.primary : colors.border,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: selectedMonth === m.val ? '600' : '400', color: selectedMonth === m.val ? colors.primary : colors.textSecondary }}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Summary chips */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Present', value: summary?.present || 0, color: colors.success, bg: colors.successBg },
            { label: 'Late', value: summary?.late || 0, color: colors.warning, bg: colors.warningBg },
            { label: 'Absent', value: summary?.absent || 0, color: colors.danger, bg: colors.dangerBg },
          ].map(s => (
            <View key={s.label} style={{ flex: 1, backgroundColor: s.bg, borderRadius: borderRadius.md, padding: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: s.color }}>{s.value}</Text>
              <Text style={{ fontSize: 11, color: s.color, marginTop: 2 }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Records list */}
        {!records || records.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Ionicons name="calendar-outline" size={48} color={colors.textTertiary} />
            <Text style={{ fontSize: 14, color: colors.textTertiary, marginTop: 12 }}>No records for this month</Text>
          </View>
        ) : (
          records.map((r: any) => {
            const d = new Date(r.date);
            const dayLabel = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
            const dateFormatted = `${dayLabel}, ${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
            const statusColor = r.status === 'present' ? colors.success : r.status === 'late' ? colors.warning : colors.danger;
            const statusBg = r.status === 'present' ? colors.successBg : r.status === 'late' ? colors.warningBg : colors.dangerBg;
            return (
              <GlassCard key={r._id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{dateFormatted}</Text>
                  <View style={{ backgroundColor: statusBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: statusColor, textTransform: 'uppercase' }}>{r.status}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 20, marginTop: 10 }}>
                  <View>
                    <Text style={{ fontSize: 10, color: colors.textTertiary, textTransform: 'uppercase' }}>Check In</Text>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>{r.checkInTime || '—'}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 10, color: colors.textTertiary, textTransform: 'uppercase' }}>Check Out</Text>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>{r.checkOutTime || '—'}</Text>
                  </View>
                  {r.hoursWorked ? (
                    <View>
                      <Text style={{ fontSize: 10, color: colors.textTertiary, textTransform: 'uppercase' }}>Hours</Text>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>{r.hoursWorked.toFixed(1)}h</Text>
                    </View>
                  ) : null}
                </View>
              </GlassCard>
            );
          })
        )}

      </ScrollView>
    </LinearGradient>
  );
}



function EmployeeFaceScan({ employeeId }: { employeeId: any }) {
  const today = (() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })();

  const todayRecord = useQuery(api.attendance.getMyTodayAttendance,
    { employeeId, date: today });
  const summary = useQuery(api.attendance.getMyMonthSummary,
    { employeeId, monthPrefix: today.slice(0, 7) });
  const monthRecords = useQuery(api.attendance.getMyAttendanceByMonth,
    { employeeId, monthPrefix: today.slice(0, 7) });
  const markFaceScan = useMutation(api.attendance.employeeFaceScanAttendance);
  const checkAndMarkLeave = useMutation(api.attendance.autoMarkLeaveAbsent);
  const convex = useConvex();

  const [permission, requestPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'success' | 'failed' | 'leave' | null>(null);
  const [scanMessage, setScanMessage] = useState('');
  const [leaveInfo, setLeaveInfo] = useState<{ type: string; start: string; end: string } | null>(null);
  const [checkingLeave, setCheckingLeave] = useState(false);
  const cameraRef = useRef<any>(null);

  // Request camera permission on mount
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, []);

  const checkedIn = !!todayRecord?.checkInTime;
  const checkedOut = !!todayRecord?.checkOutTime;
  const status = todayRecord?.status;

  const statusColor = status === 'present' ? colors.success
    : status === 'late' ? colors.warning
    : status === 'absent' ? colors.danger
    : colors.textTertiary;
  const statusBg = status === 'present' ? colors.successBg
    : status === 'late' ? colors.warningBg
    : status === 'absent' ? colors.dangerBg
    : 'rgba(255,255,255,0.06)';

  // Check leave status on component mount
  useEffect(() => {
    const checkLeave = async () => {
      setCheckingLeave(true);
      try {
        const result = await checkAndMarkLeave({ employeeId, date: today });
        if (result.blocked) {
          setLeaveInfo({
            type: result.leaveType || 'approved',
            start: today,
            end: today,
          });
          setScanResult('leave');
          setScanMessage(result.reason || 'You are on approved leave today.');
        }
      } catch (e) {
        // ignore errors in background check
      } finally {
        setCheckingLeave(false);
      }
    };
    checkLeave();
  }, [employeeId, today]);

  const handleOpenCamera = async () => {
    // Re-check leave before opening camera
    setCheckingLeave(true);
    try {
      const result = await checkAndMarkLeave({ employeeId, date: today });
      if (result.blocked) {
        setLeaveInfo({
          type: result.leaveType || 'approved',
          start: today,
          end: today,
        });
        setScanResult('leave');
        setScanMessage(result.reason || 'You are on approved leave today. Check-in blocked.');
        setCheckingLeave(false);
        return;
      }
    } catch (e) {
      setCheckingLeave(false);
    }
    setCheckingLeave(false);

    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera Permission', 'Camera access is required for face scan.');
        return;
      }
    }
    setScanResult(null);
    setScanMessage('');
    setShowCamera(true);
  };

  const handleCapture = async () => {
    if (!cameraRef.current || scanning) return;
    setScanning(true);
    try {
      // Capture with base64 directly
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });

      if (!photo.base64) {
        throw new Error('Photo capture failed: no base64 data received');
      }

      const localToday = (() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      })();

      // Bug fix 1: standardised to 12h AM/PM to match face-scan screens
      const localTime = (() => {
        const now = new Date();
        return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      })();

      // Bug fix 3: upload photo first so checkInImageId/checkOutImageId is stored
      let capturedStorageId: string | undefined;
      try {
        setScanStatus('Uploading photo...');
        const safeUri = photo.uri.startsWith('file://') ? photo.uri : `file://${photo.uri}`;
        const uploadUrl = await genUploadUrl();
        capturedStorageId = await xhrUpload(uploadUrl, safeUri);
      } catch (uploadErr) {
        console.warn('Photo upload failed, continuing without proof image:', uploadErr);
      }

      const result = await convex.action(api.faceRecognitionAction.recognizeFaceAndMarkAttendance, {
        ...(capturedStorageId ? { capturedStorageId } : { imageBase64: photo.base64 }),
        localDate: localToday,
        localTime,
      });

      setShowCamera(false);

      if (result.success) {
        setScanResult('success');
        setScanMessage(
          `${result.employeeName} - ${result.action === 'checkin' ? 'Checked In' : 'Checked Out'} at ${result.time}`
        );
      } else {
        setScanResult('failed');
        setScanMessage(
          result.reason || 'Face not recognized. Try again with better lighting and position.'
        );
      }
    } catch (e: any) {
      setShowCamera(false);
      const errorMsg = e.message || '';

      if (errorMsg.includes('base64') || errorMsg.includes('capture')) {
        setScanResult('failed');
        setScanMessage('Camera error. Please try again.');
      } else {
        setScanResult('failed');
        setScanMessage(errorMsg || 'Face scan failed. Please try again.');
      }
    } finally {
      setScanning(false);
    }
  };

  const isOnLeave = scanResult === 'leave';

  return (
    <LinearGradient colors={gradients.background as any} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
          Attendance
        </Text>
        <Text style={{ fontSize: 13, color: colors.textTertiary, marginBottom: 24 }}>
          {formatDate(today)}
        </Text>

        {/* Leave Day Banner */}
        {(isOnLeave) && (
          <View style={{
            backgroundColor: colors.warningBg,
            borderRadius: borderRadius.md,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: colors.warning,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Ionicons name="calendar" size={22} color={colors.warning} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.warning }}>
                Leave Day — No Attendance Required
              </Text>
            </View>
            <Text style={{ fontSize: 13, color: colors.warning, lineHeight: 20, textTransform: 'capitalize' }}>
              {scanMessage || 'You have an approved leave today. Attendance has been marked as Absent automatically.'}
            </Text>
          </View>
        )}

        {/* Scan Result Banner — success */}
        {scanResult === 'success' && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: colors.successBg,
            borderRadius: borderRadius.md, padding: 14, marginBottom: 16,
            borderWidth: 1, borderColor: colors.success,
          }}>
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: colors.success }}>
              {scanMessage}
            </Text>
            <TouchableOpacity onPress={() => setScanResult(null)}>
              <Ionicons name="close" size={18} color={colors.success} />
            </TouchableOpacity>
          </View>
        )}

        {/* Scan Result Banner — failed */}
        {scanResult === 'failed' && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: colors.dangerBg,
            borderRadius: borderRadius.md, padding: 14, marginBottom: 16,
            borderWidth: 1, borderColor: colors.danger,
          }}>
            <Ionicons name="close-circle" size={22} color={colors.danger} />
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: colors.danger }}>
              {scanMessage}
            </Text>
            <TouchableOpacity onPress={() => setScanResult(null)}>
              <Ionicons name="close" size={18} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}

        {/* Today Card */}
        <GlassCard style={{ marginBottom: 20 }}>
          <Text style={{
            fontSize: 12, color: colors.textSecondary,
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16,
          }}>
            Today's Status
          </Text>

          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{ backgroundColor: statusBg, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: statusColor }}>
                {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Not Scanned Yet'}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 }}>
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="log-in-outline" size={22} color={colors.success} />
              <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Check In</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 2 }}>
                {todayRecord?.checkInTime || '—'}
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: colors.borderLight }} />
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="log-out-outline" size={22} color={colors.warning} />
              <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Check Out</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 2 }}>
                {todayRecord?.checkOutTime || '—'}
              </Text>
            </View>
          </View>

          {/* Scan Button — hidden on leave, blocked for shared-only depts */}
          {checkingLeave ? (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 8 }}>
                Checking leave status...
              </Text>
            </View>
          ) : !canSelfMark ? (
            <View style={{
              backgroundColor: 'rgba(255, 152, 0, 0.08)',
              borderRadius: borderRadius.md,
              padding: 20,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255, 152, 0, 0.3)',
              gap: 10,
            }}>
              <Ionicons name="phone-portrait-outline" size={36} color="#FF9800" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FF9800', textAlign: 'center' }}>
                Shared Device Required
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
                {selfMarkBlockReason || 'Your department must use the shared attendance device to check in or out.'}
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: 'rgba(255,152,0,0.12)',
                borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
              }}>
                <Ionicons name="scan-outline" size={14} color="#FF9800" />
                <Text style={{ fontSize: 12, color: '#FF9800', fontWeight: '600' }}>
                  Use the face scan kiosk to mark attendance
                </Text>
              </View>
            </View>
          ) : isOnLeave ? (
            <View style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              borderRadius: borderRadius.md,
              padding: 16,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.borderLight,
            }}>
              <Ionicons name="ban-outline" size={32} color={colors.textTertiary} />
              <Text style={{ fontSize: 14, color: colors.textTertiary, marginTop: 10, textAlign: 'center', lineHeight: 20 }}>
                Face scan disabled on leave days
              </Text>
            </View>
          ) : !checkedIn ? (
            <TouchableOpacity
              onPress={handleOpenCamera}
              style={{
                backgroundColor: colors.primary,
                paddingVertical: 16,
                borderRadius: borderRadius.md,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 10,
              }}>
              <Ionicons name="scan-outline" size={22} color="#fff" />
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                Scan Face to Check In
              </Text>
            </TouchableOpacity>
          ) : !checkedOut ? (
            <TouchableOpacity
              onPress={handleOpenCamera}
              style={{
                backgroundColor: colors.warning,
                paddingVertical: 16,
                borderRadius: borderRadius.md,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 10,
              }}>
              <Ionicons name="scan-outline" size={22} color="#fff" />
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                Scan Face to Check Out
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              borderRadius: borderRadius.md,
              padding: 14,
              alignItems: 'center',
            }}>
              <Ionicons name="checkmark-circle" size={28} color={colors.success} />
              <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}>
                Attendance completed for today
              </Text>
            </View>
          )}
        </GlassCard>

        {/* Monthly Summary */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Present', value: summary?.present || 0, color: colors.success, bg: colors.successBg },
            { label: 'Late', value: summary?.late || 0, color: colors.warning, bg: colors.warningBg },
            { label: 'Absent', value: summary?.absent || 0, color: colors.danger, bg: colors.dangerBg },
          ].map(s => (
            <View key={s.label} style={{
              flex: 1, backgroundColor: s.bg,
              borderRadius: borderRadius.md, padding: 12, alignItems: 'center',
            }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: s.color }}>{s.value}</Text>
              <Text style={{ fontSize: 11, color: s.color, marginTop: 2 }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* History */}
        <Text style={{
          fontSize: 12, color: colors.textSecondary,
          textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
        }}>
          This Month
        </Text>
        {!monthRecords || monthRecords.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 30 }}>
            <Ionicons name="calendar-outline" size={40} color={colors.textTertiary} />
            <Text style={{ fontSize: 14, color: colors.textTertiary, marginTop: 10 }}>
              No records this month
            </Text>
          </View>
        ) : monthRecords.map((r: any) => {
          const d = new Date(r.date);
          const dayLabel = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
          const dateFormatted = `${dayLabel}, ${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
          const sColor = r.status === 'present' ? colors.success
            : r.status === 'late' ? colors.warning
            : colors.danger;
          const sBg = r.status === 'present' ? colors.successBg
            : r.status === 'late' ? colors.warningBg
            : colors.dangerBg;
          return (
            <GlassCard key={r._id} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
                  {dateFormatted}
                </Text>
                <View style={{ backgroundColor: sBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: sColor, textTransform: 'uppercase' }}>
                    {r.status}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 20, marginTop: 8 }}>
                <View>
                  <Text style={{ fontSize: 10, color: colors.textTertiary, textTransform: 'uppercase' }}>In</Text>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text }}>
                    {r.checkInTime || '—'}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 10, color: colors.textTertiary, textTransform: 'uppercase' }}>Out</Text>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text }}>
                    {r.checkOutTime || '—'}
                  </Text>
                </View>
                {r.hoursWorked ? (
                  <View>
                    <Text style={{ fontSize: 10, color: colors.textTertiary, textTransform: 'uppercase' }}>Hours</Text>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text }}>
                      {r.hoursWorked.toFixed(1)}h
                    </Text>
                  </View>
                ) : null}
              </View>
            </GlassCard>
          );
        })}
      </ScrollView>

      {/* Face Scan Camera Modal */}
      <Modal
        visible={showCamera}
        animationType="slide"
        onRequestClose={() => setShowCamera(false)}
      >
        <CameraPermissionGate permission={permission} requestPermission={requestPermission}>
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front">
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Svg height="100%" width="100%" style={{ position: 'absolute' }}>
                  <Defs>
                    <Mask id="empMask">
                      <Rect width="100%" height="100%" fill="white" />
                      <Ellipse cx="50%" cy="40%" rx="30%" ry="38%" fill="black" />
                    </Mask>
                  </Defs>
                  <Rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#empMask)" />
                  <Ellipse cx="50%" cy="40%" rx="30%" ry="38%" fill="none" stroke={colors.primary} strokeWidth="2" />
                </Svg>

                <View style={{ position: 'absolute', top: '15%', alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
                    {checkedIn ? 'Face Scan — Check Out' : 'Face Scan — Check In'}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 6 }}>
                    Position your face in the oval
                  </Text>
                </View>

                <View style={{ position: 'absolute', bottom: 80, alignItems: 'center', width: '100%' }}>
                  {scanning ? (
                    <View style={{ alignItems: 'center', gap: 12 }}>
                      <ActivityIndicator size="large" color={colors.primary} />
                      <Text style={{ color: '#fff', fontSize: 14 }}>Processing...</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={handleCapture}
                      style={{
                        width: 72, height: 72, borderRadius: 36,
                        backgroundColor: colors.primary,
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: 4, borderColor: '#fff',
                      }}>
                      <Ionicons name="scan" size={32} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  onPress={() => setShowCamera(false)}
                  style={{
                    position: 'absolute', top: 50, left: 20,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    borderRadius: 20, padding: 8,
                  }}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </CameraView>
          </View>
        </CameraPermissionGate>
      </Modal>
    </LinearGradient>
  );
}

// Avatar component for employee photos
function EmployeeAvatar({ uri, name, size = 40 }: { uri?: string; name?: string; size?: number }) {
  const initials = (name || '?').split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

// Helper: upload photo using XMLHttpRequest
function xhrUpload(uploadUrl: string, fileUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Content-Type', 'image/jpeg');
    xhr.timeout = 30000;
    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(res.storageId);
        } catch {
          reject(new Error('Invalid upload response'));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.send({ uri: fileUri } as any);
  });
}

export default function AttendanceScreen() {
const currentUser = useQuery(api.users.getCurrentUser);
const isAdmin = currentUser?.role === 'superadmin' || currentUser?.role === 'admin' || currentUser?.role === 'hr';
const canDelete = currentUser?.role === 'superadmin' || currentUser?.role === 'admin';
const isEmployee = currentUser?.role === 'employee';

const [selectedDate, setSelectedDate] = useState(new Date());
const [showDatePicker, setShowDatePicker] = useState(false);
const [scannerOpen, setScannerOpen] = useState(false);
const [searchQuery, setSearchQuery] = useState('');
const [deptFilter, setDeptFilter] = useState('');
const [detailRecord, setDetailRecord] = useState<any>(null);
const [showScanner, setShowScanner] = useState(false);
const [showCamera, setShowCamera] = useState(false);

const dateStr = selectedDate.toISOString().split('T')[0];
const employees = useQuery(api.employees.getActiveWithFaces);
const records = useQuery(api.attendance.getByDate, { date: dateStr });
const smartCheckIn = useMutation(api.attendance.smartCheckInOut);
const deleteAttendance = useMutation(api.attendance.remove);
const genUploadUrl = useMutation(api.attendance.generateUploadUrl);
const convex = useConvex();
const [permission, requestPermission] = useCameraPermissions();

// Check if this employee's department is restricted to shared-account only
const selfMarkCheck = useQuery(
  api.companies.checkCanSelfMark,
  isEmployee ? {} : 'skip'
);
// Safely read canSelfMark — default true (allow) if query is loading or errored
const canSelfMark = !isEmployee || (selfMarkCheck != null && typeof selfMarkCheck === 'object' && 'canSelfMark' in selfMarkCheck ? selfMarkCheck.canSelfMark !== false : true);
const selfMarkBlockReason = (selfMarkCheck != null && typeof selfMarkCheck === 'object' && 'canSelfMark' in selfMarkCheck && selfMarkCheck.canSelfMark === false)
  ? (selfMarkCheck as any).reason
  : undefined;

// Camera state
const cameraRef = useRef<any>(null);
const [capturedUri, setCapturedUri] = useState<string | null>(null);
const [scanning, setScanning] = useState(false);
const [scanStatus, setScanStatus] = useState('Position your face in the oval');
const [result, setResult] = useState<any>(null);
const [matchedEmployee, setMatchedEmployee] = useState<any>(null);
const [noMatchReason, setNoMatchReason] = useState<string>('');
const mountedRef = useRef(true);
const pulseAnim = useRef(new RNAnimated.Value(1)).current;
const cleanupTimeoutRef = useRef<any>(null);

useEffect(() => { 
  mountedRef.current = true; 
  return () => { 
    mountedRef.current = false;
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
    }
  }; 
}, []);

// Close scanner when leaving the tab
useFocusEffect(
  useCallback(() => {
    // Tab is focused
    return () => {
      // Tab is unfocused - close scanner and cleanup
      if (scannerOpen) {
        closeScanner();
      }
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
      }
    };
  }, [scannerOpen])
);

// Request camera permission on mount
useEffect(() => {
  if (!permission?.granted) {
    requestPermission();
  }
}, []);

// Pulse animation for oval guide
useEffect(() => {
if (!scannerOpen || result) return;
const anim = RNAnimated.loop(
RNAnimated.sequence([
RNAnimated.timing(pulseAnim, { toValue: 1.03, duration: 1400, useNativeDriver: true }),
RNAnimated.timing(pulseAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
])
);
anim.start();
return () => anim.stop();
}, [scannerOpen, result]);

const uploadPhoto = async (photoUri: string): Promise<string> => {
  const safeUri = photoUri.startsWith('file://') ? photoUri : `file://${photoUri}`;
  const uploadUrl = await genUploadUrl();
  const storageId = await xhrUpload(uploadUrl, safeUri);
  return storageId;
}

// Manual scan - triggered by Scan button - uses AWS Rekognition for face matching
const handleScan = async () => {
  if (!cameraRef.current || scanning || result) return;
  setScanning(true);
  setScanStatus('Capturing...');
  setMatchedEmployee(null);
  setNoMatchReason('');

  try {
    // Step 1: Capture photo with retry
    let photo: any;
    let retries = 0;
    const maxRetries = 2;

    while (retries < maxRetries) {
      try {
        photo = await cameraRef.current?.takePictureAsync({ quality: 0.7 });
        if (photo?.uri) break;
      } catch (captureErr: any) {
        retries++;
        if (retries >= maxRetries) throw captureErr;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    const photoUri = photo?.uri || null;

    if (!photoUri) {
      setScanStatus('Camera capture failed');
      setNoMatchReason('Could not capture photo. Please try again.');
      setScanning(false);
      return;
    }

    const safeUri = photoUri.startsWith('file://') ? photoUri : `file://${photoUri}`;
    setCapturedUri(safeUri);

    // Step 2: Upload to Convex storage using XMLHttpRequest
    setScanStatus('Uploading photo...');
    const uploadUrl = await genUploadUrl();
    const storageId = await xhrUpload(uploadUrl, safeUri);
    if (!storageId) throw new Error('No storage ID returned');

    // Step 3: Call AWS Rekognition via server action
    setScanStatus('Recognizing face...');
    const now = new Date();
    // Bug fix 1: standardised to 12h AM/PM to match face-scan screens
    const localTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const recognitionResult = await convex.action(
      api.faceRecognitionAction.recognizeFaceAndMarkAttendance,
      {
        capturedStorageId: storageId,
        localDate: getLocalDate(),
        localTime,
      }
    );

    if (!mountedRef.current) { setScanning(false); return; }

    // Step 4: Handle result
    if (recognitionResult.success && recognitionResult.action) {
      const matchedEmp = (employees || []).find((e: any) => e._id === recognitionResult.employeeId);
      Vibration.vibrate(200);
      setResult({
        employee: matchedEmp || { firstName: recognitionResult.employeeName || 'Employee', lastName: '' },
        action: recognitionResult.action,
        time: recognitionResult.time || localTime,
      });
      setScanStatus(`Recognized: ${recognitionResult.employeeName || 'Employee'}`);
      setMatchedEmployee(null);
      setNoMatchReason('');

      setTimeout(() => {
        if (mountedRef.current) {
          setResult(null);
          setCapturedUri(null);
          setScanStatus('Position your face in the oval');
        }
      }, 3500);
    } else {
      setScanStatus('Face not recognized');
      setNoMatchReason(
        recognitionResult.reason || 'Face not recognized. Try better lighting.'
      );
    }
  } catch (err: any) {
    console.error('Recognition error:', err);
    setScanStatus('Recognition failed');
    if (err.message?.includes('Image could not be captured') || err.message?.includes('takePictureAsync')) {
      setNoMatchReason('Camera not ready. Please try again.');
    } else if (err.message?.includes('Network request failed') || err.message?.includes('Upload failed')) {
      setNoMatchReason('Network error. Check your internet connection and try again.');
    } else {
      setNoMatchReason(err.message || 'An error occurred. Please try again.');
    }
  }
  setScanning(false);
};

// Check-in handler
const handleCheckIn = async (emp: any, photoUri?: string) => {
  try {
    setScanStatus('Checking in...');
    const now = new Date();
    // Bug fix 1: standardised to 12h AM/PM to match face-scan records
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    let proofImageId: any = undefined;
    const uri = photoUri || capturedUri;
    if (uri) {
      proofImageId = await uploadPhoto(uri);
    }

    const r = await smartCheckIn({ employeeId: emp._id, localDate: getLocalDate(), localTime: time, proofImageId });
    Vibration.vibrate(200);
    setResult({ employee: emp, action: r.action || 'checkin', time });
    setMatchedEmployee(null);
    setNoMatchReason('');
    setTimeout(() => {
      if (mountedRef.current) {
        setResult(null);
        setCapturedUri(null);
        setScanStatus('Position your face in the oval');
      }
    }, 3500);
  } catch (e: any) {
    Alert.alert('Error', e.message);
    setScanStatus('Position your face in the oval');
  }
};

// Manual employee tap from grid
const handleEmployeeTap = async (emp: any) => {
  await handleCheckIn(emp);
};

const handleRetry = () => {
  if (cleanupTimeoutRef.current) {
    clearTimeout(cleanupTimeoutRef.current);
    cleanupTimeoutRef.current = null;
  }
  setMatchedEmployee(null);
  setNoMatchReason('');
  setCapturedUri(null);
  setScanStatus('Position your face in the oval');
};

const handleDeleteAttendance = (id: any) => {
Alert.alert('Delete Record', 'Are you sure?', [
{ text: 'Cancel', style: 'cancel' },
{ text: 'Delete', style: 'destructive', onPress: async () => {
try { await deleteAttendance({ id }); setDetailRecord(null); } catch (e: any) { Alert.alert('Error', e.message); }
}},
]);
};

const closeScanner = () => {
  if (cleanupTimeoutRef.current) {
    clearTimeout(cleanupTimeoutRef.current);
    cleanupTimeoutRef.current = null;
  }
  setScannerOpen(false);
  setShowCamera(false);  // Fix: reset so camera remounts cleanly next open
  setResult(null);       // Fix: clear result so camera isn't hidden on next open
  setCapturedUri(null);
  setScanStatus('Position your face in the oval');
  setMatchedEmployee(null);
  setNoMatchReason('');
  setScanning(false);
};

const openScanner = () => {
  setShowCamera(true);
  setShowScanner(true);
};

// Filter records
const filteredRecords = (records || []).filter((r: any) => {
if (searchQuery && !(r.employeeName || '').toLowerCase().includes(searchQuery.toLowerCase())) return false;
if (deptFilter && r.department !== deptFilter) return false;
return true;
});

const departments = [...new Set((records || []).map((r: any) => r.department).filter(Boolean))];

const getOvalColor = () => {
if (scanning) return colors.primary;
if (matchedEmployee) return colors.success;
if (noMatchReason) return colors.warning;
return 'rgba(255,255,255,0.5)';
};

if (isEmployee) {
  if (!currentUser?.employeeId) {
    return (
      <LinearGradient colors={gradients.background as any} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Ionicons name="warning-outline" size={48} color={colors.warning} />
          <Text style={{ fontSize: 16, color: colors.text, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>
            Profile Not Linked
          </Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}>
            Your account is not linked to an employee profile yet. Please contact your admin.
          </Text>
        </View>
      </LinearGradient>
    );
  }
  return <EmployeeFaceScan employeeId={currentUser.employeeId} />;
}

return (
<LinearGradient colors={gradients.background as any} style={styles.container}>
<ScrollView contentContainerStyle={styles.scroll}>
<View style={styles.headerRow}>
<Text style={styles.title}>Attendance</Text>
{isAdmin && (
<TouchableOpacity style={styles.scanBtn} onPress={() => {
  if (!permission?.granted) { requestPermission(); return; }
  const withFaces = (employees || []).filter((e: any) => e.faceImageUrl);
  if (withFaces.length === 0) {
    Alert.alert('No Face Photos', 'No employee face photos found. Please add employee photos from the Employees screen.');
    return;
  }
  setShowCamera(true); // Fix: ensure camera renders when modal opens
  setResult(null);     // Fix: clear previous scan result
  setScannerOpen(true);
}}>
  <Ionicons name="scan" size={20} color="#fff" />
  <Text style={styles.scanBtnText}>Face Scan</Text>
</TouchableOpacity>
)}
</View>

{/* Date Picker */}
<TouchableOpacity style={styles.datePicker} onPress={() => setShowDatePicker(true)}>
<Ionicons name="calendar" size={18} color={colors.primary} />
<Text style={styles.dateText}>{formatDate(dateStr)}</Text>
<Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
</TouchableOpacity>
{showDatePicker && (
<DateTimePicker value={selectedDate} mode="date" display="spinner" themeVariant="dark"
onChange={(e: any, d?: Date) => { setShowDatePicker(Platform.OS === 'ios'); if (d) setSelectedDate(d); }} />
)}

{/* Search + Department filter */}
<View style={styles.searchRow}>
<View style={styles.searchWrap}>
<Ionicons name="search" size={16} color={colors.textTertiary} />
<TextInput style={styles.searchInput} placeholder="Search employee..." placeholderTextColor={colors.textTertiary} value={searchQuery} onChangeText={setSearchQuery} />
</View>
</View>
{departments.length > 0 && (
<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deptRow}>
<TouchableOpacity style={[styles.deptChip, !deptFilter && styles.deptChipActive]} onPress={() => setDeptFilter('')}>
<Text style={[styles.deptChipText, !deptFilter && styles.deptChipTextActive]}>All</Text>
</TouchableOpacity>
{departments.map((d: any) => (
<TouchableOpacity key={d} style={[styles.deptChip, deptFilter === d && styles.deptChipActive]} onPress={() => setDeptFilter(deptFilter === d ? '' : d)}>
<Text style={[styles.deptChipText, deptFilter === d && styles.deptChipTextActive]}>{d}</Text>
</TouchableOpacity>
))}
</ScrollView>
)}

{/* Records */}
<View style={styles.recordsHeader}>
<Text style={styles.recordsCount}>{filteredRecords.length} records</Text>
</View>
{filteredRecords.map((r: any) => (
<TouchableOpacity key={r._id} style={styles.recordCard} onPress={() => setDetailRecord(r)}>
<EmployeeAvatar uri={r.employeeFaceUrl} name={r.employeeName} size={44} />
<View style={styles.recordInfo}>
<Text style={styles.recordName}>{r.employeeName || 'Employee'}</Text>
<Text style={styles.recordDept}>{r.department || ''}</Text>
</View>
<View style={{ alignItems: 'flex-end' }}>
<View style={styles.recordTimes}>
<Text style={styles.timeIn}>{formatTime(r.checkInTime)}</Text>
<Text style={styles.timeSep}>{'\u2192'}</Text>
<Text style={styles.timeOut}>{formatTime(r.checkOutTime)}</Text>
</View>
<Text style={[styles.punctualityLabel, { color: r.status === 'late' ? colors.warning : colors.success }]}>
{r.status === 'late' ? 'Late' : 'On Time'}
</Text>
</View>
</TouchableOpacity>
))}
{filteredRecords.length === 0 && <Text style={styles.empty}>No records for this date</Text>}
</ScrollView>

{/* Detail Modal */}
<Modal visible={!!detailRecord} transparent animationType="fade" onRequestClose={() => setDetailRecord(null)}>
<View style={styles.modalOverlay}>
<ScrollView style={styles.modalScrollContent}>
<View style={styles.modalCard}>
<View style={styles.modalHeader}>
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
  <EmployeeAvatar uri={detailRecord?.employeeFaceUrl} name={detailRecord?.employeeName} size={40} />
  <Text style={styles.modalTitle}>{detailRecord?.employeeName}</Text>
</View>
<TouchableOpacity onPress={() => setDetailRecord(null)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
</View>
<View style={styles.detailRow}><Text style={styles.detailLabel}>Date</Text><Text style={styles.detailValue}>{formatDate(detailRecord?.date || '')}</Text></View>
<View style={styles.detailRow}><Text style={styles.detailLabel}>Status</Text><Text style={[styles.detailValue, { color: detailRecord?.status === 'present' ? colors.success : detailRecord?.status === 'late' ? colors.warning : colors.danger }]}>{detailRecord?.status}</Text></View>

{/* Check In Section */}
<View style={styles.photoSection}>
<View style={styles.photoSectionHeader}>
<Ionicons name="log-in" size={16} color={colors.success} />
<Text style={styles.photoSectionTitle}>Check In</Text>
<Text style={styles.photoSectionTime}>{formatTime(detailRecord?.checkInTime)}</Text>
</View>
{detailRecord?.checkInImageUrl ? (
<Image source={{ uri: detailRecord.checkInImageUrl }} style={styles.attendancePhoto} />
) : (
<View style={styles.noPhoto}>
<Ionicons name="image-outline" size={24} color={colors.textTertiary} />
<Text style={styles.noPhotoText}>No photo</Text>
</View>
)}
</View>

<View style={styles.detailRow}><Text style={styles.detailLabel}>Hours Worked</Text><Text style={styles.detailValue}>{detailRecord?.hoursWorked?.toFixed(1) || '0.0'}h</Text></View>

{/* Check Out Section */}
{detailRecord?.checkOutTime && (
<View style={styles.photoSection}>
<View style={styles.photoSectionHeader}>
<Ionicons name="log-out" size={16} color={colors.danger} />
<Text style={styles.photoSectionTitle}>Check Out</Text>
<Text style={styles.photoSectionTime}>{formatTime(detailRecord?.checkOutTime)}</Text>
</View>
{detailRecord?.checkOutImageUrl ? (
<Image source={{ uri: detailRecord.checkOutImageUrl }} style={styles.attendancePhoto} />
) : (
<View style={styles.noPhoto}>
<Ionicons name="image-outline" size={24} color={colors.textTertiary} />
<Text style={styles.noPhotoText}>Not checked out</Text>
</View>
)}
</View>
)}

{canDelete && (
<TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteAttendance(detailRecord?._id)}>
<Ionicons name="trash" size={16} color="#fff" />
<Text style={styles.deleteBtnText}>Delete Record</Text>
</TouchableOpacity>
)}
</View>
</ScrollView>
</View>
</Modal>

{/* Scanner Modal - Native Camera */}
<Modal visible={scannerOpen} animationType="slide" onRequestClose={closeScanner}>
<CameraPermissionGate permission={permission} requestPermission={requestPermission}>
<View style={styles.scannerContainer}>
{/* Native camera - CameraView from expo-camera */}
{scannerOpen && showCamera && (
  <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
)}
{/* Face oval guide overlay */}
{!result && (
  <RNAnimated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: pulseAnim }] }]} pointerEvents="none">
    <Svg width={SW} height={SH} style={StyleSheet.absoluteFill}>
      <Defs>
        <Mask id="faceMask">
          <Rect x="0" y="0" width={SW} height={SH} fill="white" />
          <Ellipse cx={OVAL_CX} cy={OVAL_CY} rx={OVAL_W / 2} ry={OVAL_H / 2} fill="black" />
        </Mask>
      </Defs>
      <Rect x="0" y="0" width={SW} height={SH} fill="rgba(0,0,0,0.5)" mask="url(#faceMask)" />
      <Ellipse
        cx={OVAL_CX} cy={OVAL_CY}
        rx={OVAL_W / 2} ry={OVAL_H / 2}
        fill="none"
        stroke={getOvalColor()}
        strokeWidth={3}
        strokeDasharray={scanning ? "10,6" : "0"}
      />
    </Svg>
  </RNAnimated.View>
)}

{/* Guide text under oval */}
{!result && !matchedEmployee && !noMatchReason && (
  <View style={[styles.guideTextWrap, { top: OVAL_CY + OVAL_H / 2 + 20 }]}>
    <Text style={styles.guideText}>
      {scanning ? 'Recognizing face...' : 'Position your face within the oval'}
    </Text>
    {!scanning && (
      <Text style={[styles.guideText, { fontSize: 12, marginTop: 6, opacity: 0.7 }]}>
        Hold phone upright • Face the camera • Good lighting
      </Text>
    )}
  </View>
)}

{/* Close button */}
<Pressable style={styles.closeBtn} onPress={closeScanner} hitSlop={20}>
  <Ionicons name="close-circle" size={36} color="rgba(255,255,255,0.9)" />
</Pressable>

{/* Status bar */}
<View style={styles.statusBar}>
  <View style={[styles.statusIndicator,
    scanning ? { backgroundColor: colors.primary } :
    noMatchReason ? { backgroundColor: colors.danger } :
    { backgroundColor: colors.success }
  ]} />
  <Text style={styles.statusText}>{scanStatus}</Text>
  {scanning && <ActivityIndicator size="small" color="#fff" style={{ marginLeft: 8 }} />}
</View>

{/* SCAN BUTTON - manual trigger */}
{!result && !matchedEmployee && !noMatchReason && !scanning && (
  <View style={styles.scanButtonWrap}>
    <TouchableOpacity style={styles.scanButton} onPress={handleScan} activeOpacity={0.7}>
      <View style={styles.scanButtonInner}>
        <Ionicons name="scan" size={28} color="#fff" />
      </View>
    </TouchableOpacity>
    <Text style={styles.scanButtonLabel}>Tap to Scan</Text>
  </View>
)}

{/* Scanning spinner overlay */}
{scanning && (
  <View style={styles.scanningOverlay}>
    <ActivityIndicator size="large" color="#fff" />
    <Text style={styles.scanningText}>Recognizing...</Text>
  </View>
)}

{/* Result overlay */}
{result && (
  <View style={styles.resultOverlay}>
    <View style={styles.resultCard}>
      <View style={[styles.resultIconCircle, { backgroundColor: result.action === 'checkin' ? 'rgba(76,175,80,0.2)' : 'rgba(74,144,217,0.2)' }]}>
        <Ionicons name={result.action === 'checkin' ? 'log-in' : 'log-out'} size={36} color={result.action === 'checkin' ? colors.success : colors.primary} />
      </View>
      <Text style={styles.resultName}>{result.employee.firstName} {result.employee.lastName || ''}</Text>
      <Text style={styles.resultAction}>{result.action === 'checkin' ? 'Checked In' : 'Checked Out'}</Text>
      <Text style={styles.resultTime}>{result.time}</Text>
    </View>
  </View>
)}

{/* No match overlay */}
{!result && !matchedEmployee && noMatchReason && !scanning && (
  <View style={styles.noMatchOverlay}>
    <View style={styles.noMatchCard}>
      <Ionicons name="alert-circle" size={32} color={colors.warning} />
      <Text style={styles.noMatchTitle}>Face Not Recognized</Text>
      <Text style={styles.noMatchReason}>{noMatchReason}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
        <Ionicons name="refresh" size={18} color="#fff" />
        <Text style={styles.retryBtnText}>Retry Scan</Text>
      </TouchableOpacity>
      <Text style={styles.orText}>or select employee manually below</Text>
    </View>
  </View>
)}

{/* Employee grid for manual selection */}
{!result && !matchedEmployee && employees && employees.length > 0 && (
  <View style={styles.empGrid}>
    <Text style={styles.empGridTitle}>
      {noMatchReason ? 'Select employee manually' : scanning ? 'Scanning...' : 'Or tap to check in manually'}
    </Text>
    <FlatList
      data={employees}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(item: any) => item._id}
      contentContainerStyle={{ paddingHorizontal: 12 }}
      renderItem={({ item }: any) => (
        <TouchableOpacity style={styles.empGridItem} onPress={() => handleEmployeeTap(item)} disabled={scanning}>
          {item.faceImageUrl ? (
            <Image source={{ uri: item.faceImageUrl }} style={styles.empGridPhoto} />
          ) : (
            <View style={[styles.empGridPhoto, styles.empGridPlaceholder]}>
              <Ionicons name="person" size={24} color={colors.textTertiary} />
            </View>
          )}
          <Text style={styles.empGridName} numberOfLines={1}>{item.firstName}</Text>
        </TouchableOpacity>
      )}
    />
  </View>
)}
</View>
</CameraPermissionGate>
</Modal>
</LinearGradient>
);
}

const styles = StyleSheet.create({
container: { flex: 1 },
scroll: { padding: 20, paddingTop: 60 },
headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
title: { fontSize: 26, fontWeight: '700', color: colors.text },
scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 16, borderRadius: borderRadius.md },
scanBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
datePicker: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.06)', padding: 12, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
dateText: { fontSize: 15, color: colors.text, flex: 1 },
searchRow: { marginBottom: 12 },
searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 },
searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 10 },
deptRow: { marginBottom: 12 },
deptChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border, marginRight: 8 },
deptChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
deptChipText: { fontSize: 13, color: colors.textSecondary },
deptChipTextActive: { color: colors.primary, fontWeight: '600' },
recordsHeader: { marginBottom: 8 },
recordsCount: { fontSize: 12, color: colors.textTertiary },
recordCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: borderRadius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.borderLight, gap: 12 },
recordInfo: { flex: 1 },
recordName: { fontSize: 15, fontWeight: '500', color: colors.text },
recordDept: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
recordTimes: { flexDirection: 'row', alignItems: 'center', gap: 4 },
timeIn: { fontSize: 13, color: colors.success, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
timeSep: { fontSize: 12, color: colors.textMuted },
timeOut: { fontSize: 13, color: colors.danger, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
punctualityLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 },
empty: { fontSize: 14, color: colors.textTertiary, textAlign: 'center', paddingVertical: 40 },
// Detail modal
modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
modalScrollContent: { flexGrow: 1, justifyContent: 'center' },
modalCard: { backgroundColor: colors.bgMid, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border, maxHeight: '90%' },
modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
detailLabel: { fontSize: 14, color: colors.textSecondary },
detailValue: { fontSize: 14, fontWeight: '600', color: colors.text },
photoSection: { marginTop: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: borderRadius.md, padding: 12, borderWidth: 1, borderColor: colors.borderLight },
photoSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
photoSectionTitle: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 },
photoSectionTime: { fontSize: 15, fontWeight: '700', color: colors.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
attendancePhoto: { width: '100%', height: 180, borderRadius: borderRadius.md },
noPhoto: { width: '100%', height: 100, borderRadius: borderRadius.md, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderLight, borderStyle: 'dashed' },
noPhotoText: { fontSize: 12, color: colors.textTertiary, marginTop: 4 },
deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.danger, paddingVertical: 14, borderRadius: borderRadius.md, marginTop: 20 },
deleteBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
// Scanner
scannerContainer: { flex: 1, backgroundColor: '#000' },
closeBtn: { position: 'absolute', top: 50, left: 20, zIndex: 100 },
statusBar: { position: 'absolute', top: 50, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
statusIndicator: { width: 8, height: 8, borderRadius: 4 },
statusText: { fontSize: 13, color: '#fff', fontWeight: '500' },
guideTextWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 10 },
guideText: { fontSize: 15, color: 'rgba(255,255,255,0.85)', fontWeight: '500', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, overflow: 'hidden' },
// Scan button
scanButtonWrap: { position: 'absolute', bottom: 140, alignSelf: 'center', alignItems: 'center', zIndex: 30 },
scanButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)', elevation: 8, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12 },
scanButtonInner: { alignItems: 'center', justifyContent: 'center' },
scanButtonLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500', marginTop: 8 },
// Scanning overlay
scanningOverlay: { position: 'absolute', top: OVAL_CY - 30, alignSelf: 'center', alignItems: 'center', zIndex: 20 },
scanningText: { color: '#fff', fontSize: 14, fontWeight: '500', marginTop: 8 },
// Result overlay
resultOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
resultCard: { alignItems: 'center', padding: 32 },
resultIconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
resultName: { fontSize: 24, fontWeight: '700', color: '#fff', marginTop: 4 },
resultAction: { fontSize: 18, color: colors.success, fontWeight: '600', marginTop: 8 },
resultTime: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
// No match
noMatchOverlay: { position: 'absolute', top: 100, left: 20, right: 20, zIndex: 40 },
noMatchCard: { backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: colors.warning },
noMatchTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 8 },
noMatchReason: { fontSize: 13, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 20, borderRadius: borderRadius.md, marginTop: 14 },
retryBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
orText: { fontSize: 12, color: colors.textTertiary, marginTop: 10 },
// Employee grid
empGrid: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.8)', paddingTop: 16, paddingBottom: 40 },
empGridTitle: { fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 12 },
empGridItem: { alignItems: 'center', width: 80, marginHorizontal: 6 },
empGridPhoto: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
empGridPlaceholder: { backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
empGridName: { fontSize: 11, color: '#fff', marginTop: 6, textAlign: 'center' },
});