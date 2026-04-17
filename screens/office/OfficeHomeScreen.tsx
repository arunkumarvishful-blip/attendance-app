import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, FlatList, Alert, ActivityIndicator, TextInput, Modal, Platform, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { colors, gradients, spacing, borderRadius } from '../../lib/theme';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import * as FileSystem from 'expo-file-system';

const OFFICE_EMAIL = "office@gmail.com";
const getLocalDate = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
};
const getLocalTime = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

// Get unique device ID
const getDeviceId = async () => {
  const deviceId = Device.deviceName || Device.modelId || `device-${Device.brand}-${Device.productName}`;
  return deviceId;
};

const LEAVE_TYPES = ['Sick Leave', 'Casual Leave', 'Personal Leave', 'Emergency Leave'];

export default function OfficeHomeScreen() {
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const employees = useQuery(api.officeAttendance.getOfficeEmployees);

  if (selectedEmployee) {
    return <EmployeePanel employee={selectedEmployee} onBack={() => setSelectedEmployee(null)} />;
  }

  return (
    <LinearGradient colors={gradients.background} style={s.flex}>
      <SafeAreaView style={s.flex}>
        <View style={s.header}>
          <MaterialCommunityIcons name="office-building" size={28} color={colors.primary} />
          <View style={{ marginLeft: 12 }}>
            <Text style={s.headerTitle}>Office Attendance</Text>
            <Text style={s.headerSub}>Select your identity to continue</Text>
          </View>
        </View>
        {!employees ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
        ) : employees.length === 0 ? (
          <Text style={s.emptyText}>No office employees found</Text>
        ) : (
          <FlatList
            data={employees}
            numColumns={2}
            keyExtractor={(item) => item._id}
            contentContainerStyle={s.grid}
            columnWrapperStyle={{ gap: 12 }}
            renderItem={({ item }) => {
              const statusColor = item.statusIndicator === 'checked_in' ? colors.success :
                item.statusIndicator === 'checked_out' ? colors.textTertiary : 'transparent';
              return (
                <TouchableOpacity style={s.empCard} onPress={() => setSelectedEmployee(item)} activeOpacity={0.7}>
                  {item.faceImageUrl ? (
                    <Image source={{ uri: item.faceImageUrl }} style={[s.avatarImg, item.statusIndicator !== 'not_checked_in' && { borderColor: statusColor, borderWidth: 2 }]} />
                  ) : (
                    <View style={[s.avatar, item.statusIndicator !== 'not_checked_in' && { borderColor: statusColor, borderWidth: 2 }]}>
                      <Text style={s.avatarText}>{(item.firstName?.[0] || '').toUpperCase()}{(item.lastName?.[0] || '').toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={s.empName} numberOfLines={1}>{item.firstName} {item.lastName}</Text>
                  <Text style={s.empDept}>{item.department}</Text>
                  <View style={[s.statusBadge, {
                    backgroundColor: item.statusIndicator === 'checked_in' ? colors.successBg :
                      item.statusIndicator === 'checked_out' ? 'rgba(255,255,255,0.05)' : colors.warningBg,
                  }]}>
                    <View style={[s.dot, { backgroundColor: item.statusIndicator === 'checked_in' ? colors.success :
                      item.statusIndicator === 'checked_out' ? colors.textTertiary : colors.warning }]} />
                    <Text style={[s.statusText, {
                      color: item.statusIndicator === 'checked_in' ? colors.success :
                        item.statusIndicator === 'checked_out' ? colors.textTertiary : colors.warning,
                    }]}>
                      {item.statusIndicator === 'checked_in' ? 'Working' : item.statusIndicator === 'checked_out' ? 'Done' : 'Not In'}
                    </Text>
                  </View>
                  {item.lateMinutes > 0 && <Text style={s.lateBadge}>{item.lateMinutes}m late</Text>}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

function EmployeePanel({ employee, onBack }: { employee: any; onBack: () => void }) {
  const today = getLocalDate();
  const status = useQuery(api.officeAttendance.getEmployeeDayStatus, { employeeId: employee._id, date: today });
  const tasks = useQuery(api.officeTasks.getEmployeeTasks, { employeeId: employee._id, date: today });
  const leaves = useQuery(api.officeAttendance.getEmployeeLeaves, { employeeId: employee._id });

  // Device and eligibility state
  const [deviceId, setDeviceId] = useState<string>('');

  // Get device ID on mount
  useEffect(() => {
    getDeviceId().then(id => setDeviceId(id || `device-${Date.now()}`));
  }, []);

  const checkIn = useMutation(api.officeAttendance.officeCheckIn);
  const checkOut = useMutation(api.officeAttendance.officeCheckOut);
  const startBreak = useMutation(api.officeAttendance.startLunchBreak);
  const endBreak = useMutation(api.officeAttendance.endLunchBreak);
  const updateTask = useMutation(api.officeTasks.updateTaskStatus);
  const requestExt = useMutation(api.officeTasks.requestTaskExtension);
  const requestLeave = useMutation(api.officeAttendance.requestLeaveFromOffice);
  const verifyFace = useAction(api.faceRecognitionAction.verifyFaceIdentity);

  const [loading, setLoading] = useState('');
  const [extModal, setExtModal] = useState(false);
  const [extTaskId, setExtTaskId] = useState<any>(null);
  const [extReason, setExtReason] = useState('');

  // Manual check-in time correction state
  const [editTimeModal, setEditTimeModal] = useState(false);
  const [editCheckInTime, setEditCheckInTime] = useState('');
  const updateCheckInTime = useMutation(api.officeAttendance.manuallyUpdateCheckInTime);

  // Camera face verification state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'checkin' | 'checkout' | null>(null);
  const [cameraStatus, setCameraStatus] = useState<'ready' | 'capturing' | 'verifying' | 'verified' | 'failed'>('ready');
  const [verifyMsg, setVerifyMsg] = useState('');
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const captureTimerRef = useRef<any>(null);

  // Leave request state
  const [leaveModal, setLeaveModal] = useState(false);
  const [leaveType, setLeaveType] = useState(LEAVE_TYPES[0]);
  const [leaveStart, setLeaveStart] = useState(today);
  const [leaveEnd, setLeaveEnd] = useState(today);
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveLoading, setLeaveLoading] = useState(false);

  // Task submission state
  const [taskSubmitModal, setTaskSubmitModal] = useState(false);
  const [submitTaskId, setSubmitTaskId] = useState<any>(null);
  const [submitStatus, setSubmitStatus] = useState('completed');
  const [submitReason, setSubmitReason] = useState('');
  const submitTask = useMutation(api.officeTasks.submitTaskUpdate);

  const att = status?.attendance;
  const brk = status?.lunchBreak;
  const isCheckedIn = !!att?.checkInTime && !att?.checkOutTime;
  const isCheckedOut = !!att?.checkOutTime;
  const isOnBreak = !!brk?.startTime && !brk?.endTime;

  // Open camera for face verification
  const openCamera = useCallback(async (action: 'checkin' | 'checkout') => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera access is needed for face verification.');
        return;
      }
    }
    setPendingAction(action);
    setCameraStatus('ready');
    setVerifyMsg('');
    setCameraOpen(true);
  }, [permission]);

  // Auto-capture after camera opens
  useEffect(() => {
    if (cameraOpen && cameraStatus === 'ready') {
      captureTimerRef.current = setTimeout(() => {
        captureAndVerify();
      }, 2000);
    }
    return () => { if (captureTimerRef.current) clearTimeout(captureTimerRef.current); };
  }, [cameraOpen, cameraStatus]);

  const captureAndVerify = useCallback(async () => {
    if (!cameraRef.current || cameraStatus !== 'ready') return;
    setCameraStatus('capturing');
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5, skipProcessing: true });
      if (!photo?.base64) {
        setCameraStatus('failed');
        setVerifyMsg('Failed to capture photo. Tap to retry.');
        return;
      }
      setCameraStatus('verifying');
      const result = await verifyFace({
        imageBase64: photo.base64,
        expectedEmployeeId: employee._id,
      });
      if (result.success && result.verified) {
        setCameraStatus('verified');
        setVerifyMsg(`Identity verified: ${result.employeeName} (${result.confidence}%)`);
        // Proceed with attendance action after brief delay
        setTimeout(async () => {
          setCameraOpen(false);
          await performAttendanceAction();
        }, 1000);
      } else {
        setCameraStatus('failed');
        setVerifyMsg(result.reason || 'Verification failed');
      }
    } catch (e: any) {
      setCameraStatus('failed');
      setVerifyMsg(e.message || 'Camera error');
    }
  }, [employee._id, pendingAction, cameraStatus]);

  const performAttendanceAction = useCallback(async () => {
    if (!pendingAction) return;
    setLoading(pendingAction);
    try {
      // Ensure deviceId is available
      let finalDeviceId = deviceId;
      if (!finalDeviceId) {
        finalDeviceId = await getDeviceId() || `device-${Date.now()}`;
      }

      // Face verification is already done in the camera modal above
      // Just send the attendance action with required fields
      const args = { 
        employeeId: employee._id, 
        date: today, 
        time: getLocalTime(), 
        sharedAccountEmail: OFFICE_EMAIL, 
        deviceId: finalDeviceId,
        imageAccount: OFFICE_EMAIL,
        imageStorageType: "convex",
      };
      
      let result: any;
      if (pendingAction === 'checkin') result = await checkIn(args);
      else result = await checkOut(args);
      
      if (result && !result.success) Alert.alert('Cannot proceed', result.message);
      else if (result) Alert.alert('Success', result.message);
    } catch (e: any) { 
      // Parse leave-related errors
      const errorMsg = e.message || 'Something went wrong';
      if (errorMsg.startsWith('LEAVE_BLOCKED:')) {
        const parts = errorMsg.split(':');
        const leaveType = parts[1];
        const startDate = parts[2];
        const endDate = parts[3];
        Alert.alert(
          'On Leave', 
          `You are on approved ${leaveType} from ${startDate} to ${endDate}.\n\nAttendance cannot be marked during approved leave.`
        );
      } else {
        Alert.alert('Error', errorMsg); 
      }
    }
    setLoading('');
    setPendingAction(null);
  }, [pendingAction, employee._id, today, deviceId, checkIn, checkOut]);

  const handleBreakAction = useCallback(async (action: string) => {
    setLoading(action);
    try {
      // Ensure deviceId is available
      let finalDeviceId = deviceId;
      if (!finalDeviceId) {
        finalDeviceId = await getDeviceId() || `device-${Date.now()}`;
      }

      const args: any = { 
        employeeId: employee._id, 
        date: today, 
        time: getLocalTime(), 
        sharedAccountEmail: OFFICE_EMAIL, 
        deviceId: finalDeviceId,
      };
      
      let result: any;
      if (action === 'breakStart') result = await startBreak(args);
      else result = await endBreak(args);
      if (result && !result.success) Alert.alert('Cannot proceed', result.message);
      else if (result) Alert.alert('Success', result.message);
    } catch (e: any) { Alert.alert('Error', e.message || 'Something went wrong'); }
    setLoading('');
  }, [employee._id, today, deviceId, startBreak, endBreak]);

  const handleTaskToggle = useCallback(async (taskId: any, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    try {
      const r = await updateTask({ taskId, status: newStatus });
      if (!r.success) Alert.alert('Error', r.message);
    } catch (e: any) { Alert.alert('Error', e.message); }
  }, []);

  const handleExtRequest = useCallback(async () => {
    if (!extTaskId || !extReason.trim()) return;
    try {
      const r = await requestExt({ taskId: extTaskId, reason: extReason.trim() });
      Alert.alert(r.success ? 'Extension' : 'Error', r.message);
      setExtModal(false); setExtReason(''); setExtTaskId(null);
    } catch (e: any) { Alert.alert('Error', e.message); }
  }, [extTaskId, extReason]);

  const handleLeaveSubmit = useCallback(async () => {
    if (!leaveReason.trim()) return;
    setLeaveLoading(true);
    try {
      const r = await requestLeave({
        employeeId: employee._id,
        leaveType,
        startDate: leaveStart,
        endDate: leaveEnd,
        reason: leaveReason.trim(),
        sharedAccountEmail: OFFICE_EMAIL,
      });
      Alert.alert(r.success ? 'Success' : 'Error', r.message);
      if (r.success) {
        setLeaveModal(false); setLeaveReason(''); setLeaveStart(today); setLeaveEnd(today);
      }
    } catch (e: any) { Alert.alert('Error', e.message); }
    setLeaveLoading(false);
  }, [employee._id, leaveType, leaveStart, leaveEnd, leaveReason]);

  const diffColor = (d: string) => d === 'hard' ? '#E53935' : d === 'medium' ? '#FF9800' : '#4CAF50';

  if (!status) return (
    <LinearGradient colors={gradients.background} style={s.flex}>
      <SafeAreaView style={s.flex}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    </LinearGradient>
  );

  return (
    <LinearGradient colors={gradients.background} style={s.flex}>
      <SafeAreaView style={s.flex}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Header */}
          <TouchableOpacity onPress={onBack} style={s.backRow}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.primary} />
            <Text style={s.backText}>Back to employees</Text>
          </TouchableOpacity>
          <View style={s.profileRow}>
            {employee.faceImageUrl ? (
              <Image source={{ uri: employee.faceImageUrl }} style={s.avatarLgImg} />
            ) : (
              <View style={s.avatarLg}>
                <Text style={s.avatarLgText}>{(employee.firstName?.[0] || '').toUpperCase()}{(employee.lastName?.[0] || '').toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.profileName}>{employee.firstName} {employee.lastName}</Text>
              <Text style={s.profileDept}>{employee.department}</Text>
            </View>
          </View>

          {/* Attendance Status */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Attendance</Text>

            {!att ? (
              <>
                <View style={s.statusRow}>
                  <MaterialCommunityIcons name="clock-outline" size={20} color={colors.textSecondary} />
                  <Text style={s.statusInfo}>Not checked in yet</Text>
                </View>
                <TouchableOpacity 
                  style={[s.actionBtn, s.btnGreen]} 
                  onPress={() => openCamera('checkin')} 
                  disabled={!!loading}
                >
                  {loading === 'checkin' ? <ActivityIndicator color="#fff" /> :
                    <><MaterialCommunityIcons name="face-recognition" size={20} color="#fff" /><Text style={s.btnText}>Scan Face to Check In</Text></>}
                </TouchableOpacity>
              </>
            ) : isCheckedOut ? (
              <View>
                <View style={s.statusRow}>
                  <MaterialCommunityIcons name="check-circle" size={20} color={colors.success} />
                  <Text style={[s.statusInfo, { color: colors.success }]}>Completed for today</Text>
                </View>
                <View style={s.infoGrid}>
                  <TouchableOpacity onPress={() => { setEditCheckInTime(att.checkInTime || ''); setEditTimeModal(true); }}>
                    <InfoItem label="Check In" value={att.checkInTime || '-'} />
                  </TouchableOpacity>
                  <InfoItem label="Check Out" value={att.checkOutTime || '-'} />
                  <InfoItem label="Hours" value={`${att.hoursWorked || 0}h`} />
                  <InfoItem label="Status" value={att.status || '-'} color={att.status === 'late' ? colors.warning : colors.success} />
                </View>
              </View>
            ) : (
              <View>
                <View style={s.statusRow}>
                  <MaterialCommunityIcons name="account-check" size={20} color={colors.success} />
                  <Text style={[s.statusInfo, { color: colors.success }]}>Checked in at {att.checkInTime}</Text>
                </View>
                {att.lateMinutes > 0 && (
                  <View style={[s.warningBanner, { backgroundColor: colors.warningBg }]}>
                    <MaterialCommunityIcons name="alert" size={16} color={colors.warning} />
                    <Text style={[s.warningText, { color: colors.warning }]}>
                      Late by {att.lateMinutes} min. Must work until {att.extendedCheckoutTime || '5:30 PM'}
                    </Text>
                  </View>
                )}
                <TouchableOpacity style={[s.actionBtn, s.btnRed]} onPress={() => openCamera('checkout')} disabled={!!loading}>
                  {loading === 'checkout' ? <ActivityIndicator color="#fff" /> :
                    <><MaterialCommunityIcons name="face-recognition" size={20} color="#fff" /><Text style={s.btnText}>Scan Face to Check Out</Text></>}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Lunch Break */}
          {isCheckedIn && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Lunch Break</Text>
              <Text style={s.cardSubtitle}>3045 min allowed (2 min grace)</Text>
              {!brk ? (
                <TouchableOpacity style={[s.actionBtn, s.btnOrange]} onPress={() => handleBreakAction('breakStart')} disabled={!!loading}>
                  {loading === 'breakStart' ? <ActivityIndicator color="#fff" /> :
                    <><MaterialCommunityIcons name="food" size={20} color="#fff" /><Text style={s.btnText}>Start Break</Text></>}
                </TouchableOpacity>
              ) : isOnBreak ? (
                <View>
                  <View style={[s.warningBanner, { backgroundColor: colors.warningBg }]}>
                    <MaterialCommunityIcons name="timer-sand" size={16} color={colors.warning} />
                    <Text style={[s.warningText, { color: colors.warning }]}>Break in progress since {brk.startTime}</Text>
                  </View>
                  <TouchableOpacity style={[s.actionBtn, s.btnBlue]} onPress={() => handleBreakAction('breakEnd')} disabled={!!loading}>
                    {loading === 'breakEnd' ? <ActivityIndicator color="#fff" /> :
                      <><MaterialCommunityIcons name="food-off" size={20} color="#fff" /><Text style={s.btnText}>End Break</Text></>}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.infoGrid}>
                  <InfoItem label="Start" value={brk.startTime || '-'} />
                  <InfoItem label="End" value={brk.endTime || '-'} />
                  <InfoItem label="Duration" value={`${brk.durationMinutes || 0} min`}
                    color={brk.durationMinutes && brk.durationMinutes < 28 ? colors.danger : brk.durationMinutes && brk.durationMinutes > 47 ? colors.danger : colors.success} />
                </View>
              )}
            </View>
          )}

          {/* Tasks */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>Today's Tasks</Text>
              <Text style={s.taskCount}>{tasks?.filter((t: any) => t.status === 'completed').length || 0}/{tasks?.length || 0}</Text>
            </View>
            {!tasks || tasks.length === 0 ? (
              <Text style={s.emptySmall}>No tasks assigned for today</Text>
            ) : (
              tasks.map((task: any) => (
                <View key={task._id} style={[s.taskRow, { flexDirection: 'column', alignItems: 'stretch' }]}>
                  {/* Task header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={[s.taskCheck, task.status === 'completed' && s.taskCheckDone]}>
                      {task.status === 'completed' && <MaterialCommunityIcons name="check" size={14} color="#fff" />}
                    </View>
                    <View style={s.taskInfo}>
                      <Text style={[s.taskTitle, task.status === 'completed' && s.taskTitleDone]}>{task.title}</Text>
                      {task.description ? <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>{task.description}</Text> : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <View style={[s.diffBadge, { backgroundColor: diffColor(task.difficulty) + '22', borderColor: diffColor(task.difficulty) }]}>
                          <Text style={[s.diffText, { color: diffColor(task.difficulty) }]}>{task.difficulty.toUpperCase()}</Text>
                        </View>
                        {task.deadline && task.deadline !== today && (
                          <View style={[s.diffBadge, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                            <Text style={[s.diffText, { color: colors.primary }]}>Due: {task.deadline}</Text>
                          </View>
                        )}
                        {task.status === 'extended' && <Text style={s.extBadge}>Extended</Text>}
                        {task.status === 'extension_requested' && <Text style={s.extPendBadge}>Ext. Pending</Text>}
                      </View>
                    </View>
                  </View>

                  {/* ALWAYS show Complete / Pending buttons for ALL tasks */}
                  <View style={s.taskActions}>
                    <TouchableOpacity
                      style={[s.taskStatusBtn, task.status === 'completed' && s.taskStatusBtnActive]}
                      onPress={async () => {
                        try {
                          const r = await updateTask({ taskId: task._id, status: 'completed' });
                          if (!r.success) Alert.alert('Error', r.message);
                        } catch (e: any) { Alert.alert('Error', e.message); }
                      }}
                    >
                      <MaterialCommunityIcons name="check-circle" size={18} color={task.status === 'completed' ? '#fff' : colors.success} />
                      <Text style={[s.taskStatusText, task.status === 'completed' && s.taskStatusTextActive]}>Complete</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.taskStatusBtn, task.status !== 'completed' && s.taskStatusBtnPending]}
                      onPress={async () => {
                        try {
                          const r = await updateTask({ taskId: task._id, status: 'pending' });
                          if (!r.success) Alert.alert('Error', r.message);
                        } catch (e: any) { Alert.alert('Error', e.message); }
                      }}
                    >
                      <MaterialCommunityIcons name="clock-outline" size={18} color={task.status !== 'completed' ? '#fff' : colors.warning} />
                      <Text style={[s.taskStatusText, task.status !== 'completed' && s.taskStatusTextPending]}>Pending</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Submission status banner */}
                  {task.submission && (
                    <View style={[s.submissionBanner, {
                      backgroundColor: task.submission.adminResponse === 'approved' ? colors.successBg :
                        task.submission.adminResponse === 'rejected' ? colors.dangerBg : colors.warningBg,
                    }]}>
                      <MaterialCommunityIcons
                        name={task.submission.adminResponse === 'approved' ? 'check-circle' :
                          task.submission.adminResponse === 'rejected' ? 'close-circle' : 'clock-outline'}
                        size={14}
                        color={task.submission.adminResponse === 'approved' ? colors.success :
                          task.submission.adminResponse === 'rejected' ? colors.danger : colors.warning}
                      />
                      <Text style={[s.submissionText, {
                        color: task.submission.adminResponse === 'approved' ? colors.success :
                          task.submission.adminResponse === 'rejected' ? colors.danger : colors.warning,
                      }]}>
                        {task.submission.adminResponse === 'pending' ? 'Submitted — Pending Admin Review' :
                          task.submission.adminResponse === 'approved' ? `Approved${task.submission.status === 'completed' ? ' — Completed' : ''}` :
                          `Rejected${task.submission.responseNote ? ': ' + task.submission.responseNote : ''}`}
                      </Text>
                    </View>
                  )}

                  {/* Submit to Admin button — always available */}
                  {(!task.submission || task.submission.adminResponse !== 'pending') && (
                    <TouchableOpacity
                      style={s.submitToAdminBtn}
                      onPress={() => { setSubmitTaskId(task._id); setSubmitStatus(task.status === 'completed' ? 'completed' : 'incomplete'); setSubmitReason(''); setTaskSubmitModal(true); }}
                    >
                      <MaterialCommunityIcons name="send" size={14} color={colors.primary} />
                      <Text style={s.submitToAdminText}>Submit to Admin</Text>
                    </TouchableOpacity>
                  )}

                  {/* Extension request button for hard tasks */}
                  {task.difficulty === 'hard' && task.status === 'pending' && !task.extensionRequest && !task.submission && (
                    <TouchableOpacity
                      onPress={() => { setExtTaskId(task._id); setExtModal(true); }}
                      style={[s.taskActionBtn, { backgroundColor: '#9C27B022', alignSelf: 'flex-start', marginTop: 6 }]}
                    >
                      <MaterialCommunityIcons name="clock-plus-outline" size={16} color="#9C27B0" />
                      <Text style={[s.taskActionText, { color: '#9C27B0' }]}>Request Extension</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>

          {/* Deductions */}
          {status.deductions.length > 0 && (
            <View style={[s.card, { borderColor: colors.danger + '33' }]}>
              <View style={s.cardHeader}>
                <Text style={[s.cardTitle, { color: colors.danger }]}>Deductions</Text>
                <Text style={[s.taskCount, { color: colors.danger }]}>{status.totalDeductionPercent}%</Text>
              </View>
              {status.deductions.map((d: any, i: number) => (
                <View key={i} style={s.dedRow}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.danger} />
                  <Text style={s.dedText}>{d.description}</Text>
                  <Text style={s.dedPct}>{d.deductionPercent}%</Text>
                </View>
              ))}
              <Text style={s.dedMax}>Max daily deduction: 50%</Text>
            </View>
          )}

          {/* Leave Requests */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>Leave Requests</Text>
              <TouchableOpacity style={s.leaveApplyBtn} onPress={() => setLeaveModal(true)}>
                <MaterialCommunityIcons name="plus" size={16} color="#fff" />
                <Text style={s.leaveApplyText}>Apply Leave</Text>
              </TouchableOpacity>
            </View>
            {!leaves || leaves.length === 0 ? (
              <Text style={s.emptySmall}>No leave requests</Text>
            ) : (
              leaves.slice(0, 5).map((l: any) => (
                <View key={l._id} style={s.leaveRow}>
                  <View style={s.leaveInfo}>
                    <Text style={s.leaveType}>{l.leaveType}</Text>
                    <Text style={s.leaveDates}>{l.startDate}  {l.endDate}</Text>
                    <Text style={s.leaveReasonText} numberOfLines={1}>{l.reason}</Text>
                  </View>
                  <View style={[s.leaveBadge, {
                    backgroundColor: l.status === 'approved' ? colors.successBg :
                      l.status === 'rejected' ? colors.dangerBg : colors.warningBg,
                  }]}>
                    <Text style={[s.leaveBadgeText, {
                      color: l.status === 'approved' ? colors.success :
                        l.status === 'rejected' ? colors.danger : colors.warning,
                    }]}>{l.status.toUpperCase()}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* Face Verification Camera Modal */}
        <Modal visible={cameraOpen} animationType="slide" statusBarTranslucent>
          <View style={s.cameraContainer}>
            <CameraView ref={cameraRef} style={s.camera} facing="front" />
            <View style={s.cameraOverlay}>
              <SafeAreaView style={s.flex}>
                {/* Top bar */}
                <View style={s.cameraTopBar}>
                  <TouchableOpacity onPress={() => { setCameraOpen(false); setPendingAction(null); }} style={s.cameraCloseBtn}>
                    <MaterialCommunityIcons name="close" size={26} color="#fff" />
                  </TouchableOpacity>
                  <Text style={s.cameraTitle}>
                    {pendingAction === 'checkin' ? 'Verify to Check In' : 'Verify to Check Out'}
                  </Text>
                </View>

                {/* Center face guide */}
                <View style={s.cameraCenter}>
                  <View style={s.faceGuide}>
                    {cameraStatus === 'ready' && (
                      <Text style={s.faceGuideText}>Position your face in the circle</Text>
                    )}
                    {cameraStatus === 'capturing' && (
                      <ActivityIndicator size="large" color="#fff" />
                    )}
                    {cameraStatus === 'verifying' && (
                      <View style={{ alignItems: 'center' }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={s.faceGuideText}>Verifying identity...</Text>
                      </View>
                    )}
                    {cameraStatus === 'verified' && (
                      <View style={{ alignItems: 'center' }}>
                        <MaterialCommunityIcons name="check-circle" size={60} color={colors.success} />
                        <Text style={[s.faceGuideText, { color: colors.success }]}>{verifyMsg}</Text>
                      </View>
                    )}
                    {cameraStatus === 'failed' && (
                      <View style={{ alignItems: 'center' }}>
                        <MaterialCommunityIcons name="close-circle" size={60} color={colors.danger} />
                        <Text style={[s.faceGuideText, { color: colors.danger }]}>{verifyMsg}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Bottom actions */}
                <View style={s.cameraBottom}>
                  {cameraStatus === 'ready' && (
                    <TouchableOpacity style={s.captureBtn} onPress={captureAndVerify}>
                      <View style={s.captureBtnInner} />
                    </TouchableOpacity>
                  )}
                  {cameraStatus === 'failed' && (
                    <TouchableOpacity style={s.retryBtn} onPress={() => setCameraStatus('ready')}>
                      <MaterialCommunityIcons name="refresh" size={22} color="#fff" />
                      <Text style={s.retryBtnText}>Try Again</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={s.cameraHint}>
                    {employee.firstName} {employee.lastName}  {employee.department}
                  </Text>
                </View>
              </SafeAreaView>
            </View>
          </View>
        </Modal>

        {/* Extension Request Modal */}
        <Modal visible={extModal} transparent animationType="fade">
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <Text style={s.modalTitle}>Request Extension</Text>
              <Text style={s.modalSub}>Hard tasks only. 2 auto-approvals per week.</Text>
              <TextInput style={s.modalInput} placeholder="Reason for extension..." placeholderTextColor={colors.textTertiary}
                value={extReason} onChangeText={setExtReason} multiline />
              <View style={s.modalBtns}>
                <TouchableOpacity style={s.modalCancel} onPress={() => { setExtModal(false); setExtReason(''); }}>
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.modalSubmit, !extReason.trim() && { opacity: 0.5 }]}
                  onPress={handleExtRequest} disabled={!extReason.trim()}>
                  <Text style={s.modalSubmitText}>Submit Request</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Leave Request Modal */}
        <Modal visible={leaveModal} transparent animationType="fade">
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <Text style={s.modalTitle}>Apply for Leave</Text>
              <Text style={s.modalSub}>{employee.firstName} {employee.lastName}</Text>

              <Text style={s.fieldLabel}>Leave Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {LEAVE_TYPES.map(t => (
                  <TouchableOpacity key={t} onPress={() => setLeaveType(t)}
                    style={[s.typeChip, leaveType === t && s.typeChipActive]}>
                    <Text style={[s.typeChipText, leaveType === t && s.typeChipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={s.fieldLabel}>Start Date</Text>
              <TextInput style={s.modalInputSm} value={leaveStart} onChangeText={setLeaveStart}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} />

              <Text style={s.fieldLabel}>End Date</Text>
              <TextInput style={s.modalInputSm} value={leaveEnd} onChangeText={setLeaveEnd}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} />

              <Text style={s.fieldLabel}>Reason</Text>
              <TextInput style={s.modalInput} placeholder="Reason for leave..." placeholderTextColor={colors.textTertiary}
                value={leaveReason} onChangeText={setLeaveReason} multiline />

              <View style={s.modalBtns}>
                <TouchableOpacity style={s.modalCancel} onPress={() => { setLeaveModal(false); setLeaveReason(''); }}>
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.modalSubmit, (!leaveReason.trim() || leaveLoading) && { opacity: 0.5 }]}
                  onPress={handleLeaveSubmit} disabled={!leaveReason.trim() || leaveLoading}>
                  {leaveLoading ? <ActivityIndicator color="#fff" size="small" /> :
                    <Text style={s.modalSubmitText}>Submit Request</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Task Submit Modal */}
        <Modal visible={taskSubmitModal} transparent animationType="fade">
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <Text style={s.modalTitle}>Submit Task Update</Text>
              <Text style={s.modalSub}>This will be sent to admin for review</Text>

              <Text style={s.fieldLabel}>Status</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <TouchableOpacity
                  style={[s.statusOption, submitStatus === 'completed' && s.statusOptionActive]}
                  onPress={() => setSubmitStatus('completed')}
                >
                  <MaterialCommunityIcons name="check-circle" size={20} color={submitStatus === 'completed' ? colors.success : colors.textTertiary} />
                  <Text style={[s.statusOptionText, submitStatus === 'completed' && { color: colors.success }]}>Completed</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.statusOption, submitStatus === 'incomplete' && s.statusOptionActiveRed]}
                  onPress={() => setSubmitStatus('incomplete')}
                >
                  <MaterialCommunityIcons name="alert-circle" size={20} color={submitStatus === 'incomplete' ? colors.danger : colors.textTertiary} />
                  <Text style={[s.statusOptionText, submitStatus === 'incomplete' && { color: colors.danger }]}>Not Completed</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.fieldLabel}>{submitStatus === 'incomplete' ? 'Reason (required)' : 'Notes (optional)'}</Text>
              <TextInput
                style={s.modalInput}
                placeholder={submitStatus === 'incomplete' ? 'Why could you not complete this task?' : 'Add any notes about this task...'}
                placeholderTextColor={colors.textTertiary}
                value={submitReason}
                onChangeText={setSubmitReason}
                multiline
              />

              <View style={s.modalBtns}>
                <TouchableOpacity style={s.modalCancel} onPress={() => { setTaskSubmitModal(false); setSubmitReason(''); setSubmitTaskId(null); }}>
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.modalSubmit, (submitStatus === 'incomplete' && !submitReason.trim()) && { opacity: 0.5 }]}
                  disabled={submitStatus === 'incomplete' && !submitReason.trim()}
                  onPress={async () => {
                    if (!submitTaskId) return;
                    try {
                      const r = await submitTask({
                        employeeId: employee._id,
                        taskId: submitTaskId,
                        status: submitStatus,
                        reason: submitReason.trim() || undefined,
                      });
                      Alert.alert(r.success ? 'Submitted' : 'Error', r.message);
                      if (r.success) { setTaskSubmitModal(false); setSubmitReason(''); setSubmitTaskId(null); }
                    } catch (e: any) { Alert.alert('Error', e.message); }
                  }}
                >
                  <Text style={s.modalSubmitText}>Submit to Admin</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Manual Check-In Time Edit Modal */}
        <Modal visible={editTimeModal} transparent animationType="fade">
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <Text style={s.modalTitle}>Correct Check-In Time</Text>
              <Text style={s.modalSub}>This will recalculate late minutes and deductions</Text>
              
              <Text style={s.fieldLabel}>New Check-In Time</Text>
              <TextInput
                style={s.modalInputSm}
                placeholder="h:mm AM/PM"
                placeholderTextColor={colors.textTertiary}
                value={editCheckInTime}
                onChangeText={setEditCheckInTime}
              />
              <Text style={[s.fieldLabel, { marginTop: 8, color: colors.textTertiary, fontSize: 11 }]}>
                Shift starts at 9:30 AM. Times after 9:30 AM will be marked as late.
              </Text>

              <View style={s.modalBtns}>
                <TouchableOpacity style={s.modalCancel} onPress={() => { setEditTimeModal(false); setEditCheckInTime(''); }}>
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.modalSubmit, !editCheckInTime.trim() && { opacity: 0.5 }]}
                  disabled={!editCheckInTime.trim()}
                  onPress={async () => {
                    if (!att || !editCheckInTime.trim()) return;
                    try {
                      const result = await updateCheckInTime({
                        attendanceId: status.attendance._id || att._id,
                        newCheckInTime: editCheckInTime.trim(),
                      });
                      Alert.alert(result.success ? 'Updated' : 'Error', result.message);
                      if (result.success) { 
                        setEditTimeModal(false); 
                        setEditCheckInTime('');
                      }
                    } catch (e: any) { Alert.alert('Error', e.message); }
                  }}
                >
                  <Text style={s.modalSubmitText}>Update Check-In Time</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

function InfoItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.infoItem}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
  headerSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  grid: { padding: 16, paddingTop: 8, gap: 12 },
  empCard: {
    flex: 1, backgroundColor: colors.glass, borderRadius: borderRadius.md, borderWidth: 1,
    borderColor: colors.glassBorder, padding: 16, alignItems: 'center',
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.glassMedium,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: colors.glassBorder,
  },
  avatarImg: {
    width: 52, height: 52, borderRadius: 26, marginBottom: 10, borderWidth: 1, borderColor: colors.glassBorder,
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: colors.text },
  empName: { fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'center' },
  empDept: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '600' },
  lateBadge: { fontSize: 10, color: colors.warning, marginTop: 4, fontWeight: '600' },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 40, fontSize: 15 },
  // Panel styles
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backText: { color: colors.primary, fontSize: 14, fontWeight: '500' },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatarLg: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.primary },
  avatarLgText: { fontSize: 20, fontWeight: '700', color: colors.primary },
  avatarLgImg: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: colors.primary,
  },
  profileName: { fontSize: 20, fontWeight: '700', color: colors.text },
  profileDept: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  card: {
    backgroundColor: colors.glass, borderRadius: borderRadius.md, borderWidth: 1,
    borderColor: colors.glassBorder, padding: 16, marginBottom: 14,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 10 },
  cardSubtitle: { fontSize: 11, color: colors.textTertiary, marginTop: -8, marginBottom: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  statusInfo: { fontSize: 14, color: colors.textSecondary },
  warningBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 8, marginBottom: 12 },
  warningText: { fontSize: 12, flex: 1 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoItem: { flex: 1, minWidth: '45%', backgroundColor: colors.glassLight, borderRadius: 8, padding: 10 },
  infoLabel: { fontSize: 10, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: borderRadius.md, marginTop: 8 },
  btnGreen: { backgroundColor: colors.success },
  btnRed: { backgroundColor: colors.danger },
  btnOrange: { backgroundColor: colors.warning },
  btnBlue: { backgroundColor: colors.primary },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  // Tasks
  taskCount: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  emptySmall: { color: colors.textTertiary, fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  taskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  taskCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.glassBorder, justifyContent: 'center', alignItems: 'center' },
  taskCheckDone: { backgroundColor: colors.success, borderColor: colors.success },
  taskInfo: { flex: 1, marginLeft: 10 },
  taskTitle: { fontSize: 14, color: colors.text, fontWeight: '500' },
  taskTitleDone: { textDecorationLine: 'line-through', color: colors.textTertiary },
  diffBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },
  diffText: { fontSize: 9, fontWeight: '700' },
  extBadge: { fontSize: 10, color: colors.primary, fontWeight: '600', backgroundColor: colors.primaryLight, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  extPendBadge: { fontSize: 10, color: colors.warning, fontWeight: '600', backgroundColor: colors.warningBg, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  extBtn: { padding: 6 },
  // Deductions
  dedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  dedText: { flex: 1, fontSize: 12, color: colors.textSecondary },
  dedPct: { fontSize: 13, fontWeight: '700', color: colors.danger },
  dedMax: { fontSize: 10, color: colors.textTertiary, marginTop: 8, textAlign: 'center' },
  // Leave section
  leaveApplyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  leaveApplyText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  leaveRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  leaveInfo: { flex: 1 },
  leaveType: { fontSize: 13, fontWeight: '600', color: colors.text },
  leaveDates: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  leaveReasonText: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  leaveBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  leaveBadgeText: { fontSize: 10, fontWeight: '700' },
  // Camera modal
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraOverlay: { ...StyleSheet.absoluteFillObject },
  cameraTopBar: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 8 },
  cameraCloseBtn: { padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  cameraTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginLeft: 12 },
  cameraCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  faceGuide: {
    width: 420,
    height: 420,
    borderRadius: 210,
    borderWidth: 3, borderColor: colors.primary,
    justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)',
  },
  faceGuideText: { color: '#fff', fontSize: 13, textAlign: 'center', marginTop: 8, paddingHorizontal: 20 },
  cameraBottom: { alignItems: 'center', paddingBottom: 30 },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  captureBtnInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginBottom: 12 },
  retryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cameraHint: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#1C2128', borderRadius: borderRadius.lg, padding: 20, borderWidth: 1, borderColor: colors.glassBorder, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 },
  modalSub: { fontSize: 12, color: colors.textTertiary, marginBottom: 16 },
  modalInput: { backgroundColor: colors.glass, borderRadius: 10, padding: 12, color: colors.text, fontSize: 14, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.glassBorder, marginBottom: 8 },
  modalInputSm: { backgroundColor: colors.glass, borderRadius: 10, padding: 12, color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.glassBorder, marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancel: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: colors.glass, alignItems: 'center' },
  modalCancelText: { color: colors.textSecondary, fontWeight: '600' },
  modalSubmit: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  modalSubmitText: { color: '#fff', fontWeight: '600' },
  // Leave modal
  fieldLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, marginRight: 8 },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  typeChipTextActive: { color: '#fff' },
  // Task submission
  taskActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  taskStatusBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1.5, borderColor: colors.glassBorder,
  },
  taskStatusBtnActive: { backgroundColor: colors.success, borderColor: colors.success },
  taskStatusBtnPending: { backgroundColor: colors.warning, borderColor: colors.warning },
  taskStatusText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  taskStatusTextActive: { color: '#fff' },
  taskStatusTextPending: { color: '#fff' },
  submitToAdminBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 6, paddingVertical: 8, borderRadius: 8,
    backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '33',
  },
  submitToAdminText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  taskActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.glassBorder },
  taskActionText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  submissionBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: 8, marginBottom: 12 },
  submissionText: { fontSize: 11, fontWeight: '600', flex: 1 },
  statusOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'transparent' },
  statusOptionActive: { borderColor: colors.success, backgroundColor: colors.success + '15' },
  statusOptionActiveRed: { borderColor: colors.danger, backgroundColor: colors.danger + '15' },
  statusOptionText: { fontSize: 13, fontWeight: '600', color: colors.textTertiary },
});

// ... rest of the code ...