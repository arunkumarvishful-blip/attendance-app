import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, Alert, KeyboardAvoidingView, Platform, Image, ActivityIndicator, Pressable
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useQuery, useMutation, useConvex } from 'convex/react';
import { api } from '../convex/_generated/api';
import { colors, gradients, spacing, borderRadius } from '../lib/theme';
import GlassCard from '../components/GlassCard';
import GlassInput from '../components/GlassInput';
import GlassButton from '../components/GlassButton';
import { Ionicons } from '@expo/vector-icons';
import CameraPermissionGate from '../components/CameraPermissionGate';
import { takePictureWithRetry, isCameraError } from '../lib/cameraCaptureUtils';

// Avatar component with initials fallback
function EmployeeAvatar({ uri, firstName, lastName, size = 44, showBadge = false }: { uri?: string; firstName?: string; lastName?: string; size?: number; showBadge?: boolean }) {
  const initials = `${(firstName || '?')[0]}${(lastName || '')[0] || ''}`.toUpperCase();
  return (
    <View style={{ position: 'relative' }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initials}</Text>
        </View>
      )}
      {showBadge && (
        <View style={{ position: 'absolute', bottom: -1, right: -1, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bgMid }}>
          <Ionicons name="checkmark" size={10} color="#fff" />
        </View>
      )}
    </View>
  );
}

// Helper: upload photo using XMLHttpRequest (works on all devices)
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

const passwordRules = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One special character (!@#$...)', test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p) },
];

export default function EmployeesScreen({ navigation }: any)  {
  const currentUser = useQuery(api.users.getCurrentUser);
  const isAdmin = currentUser?.role === 'superadmin' || currentUser?.role === 'admin' || currentUser?.role === 'hr';
  const isSuperAdmin = currentUser?.role === 'superadmin';
  const companies = useQuery(api.companies.list) || [];
  const shifts = useQuery(api.shifts.list, {}) || [];
  const employees = useQuery(api.employees.list, {}) || [];
  const deptList = useQuery(api.departments.list, {}) || [];
  const posList = useQuery(api.positions.list, {}) || [];
  const createEmp = useMutation(api.employees.create);
  const updateEmp = useMutation(api.employees.update);
  const deactivateEmp = useMutation(api.employees.deactivate);
  const registerFace = useMutation(api.employees.registerFace);
  const uploadAadhar = useMutation(api.employees.uploadAadhar);
  const uploadBankProof = useMutation(api.employees.uploadBankProof);
  const genUploadUrl = useMutation(api.employees.generateUploadUrl);
  const removeEmp = useMutation(api.employees.remove);
  const convex = useConvex();

  const users = useQuery(api.users.listUsers) || [];
  const createUser = useMutation(api.users.createUser);
  const resetUserPasswordAccess = useMutation(api.users.resetUserPasswordAccess);

  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<any>(null);
  const [detailEmp, setDetailEmp] = useState<any>(null);
  const [cameraTarget, setCameraTarget] = useState<any>(null);
  const [cameraType, setCameraType] = useState<string>('face');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const [capturing, setCapturing] = useState(false);

  // Request camera permission on mount
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, []);

  // User account linking state
  const [showUserForm, setShowUserForm] = useState(false);
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState('employee');
  const [userReportsTo, setUserReportsTo] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  // Form state
  const [form, setForm] = useState({ firstName: '', lastName: '', employeeId: '', email: '', department: '', position: '', companyId: '', shiftId: '', salaryType: 'monthly', salaryRate: '', bankName: '', bankAccountNumber: '', bankIfscCode: '', aadharNumber: '' });

  const resetForm = () => setForm({ firstName: '', lastName: '', employeeId: '', email: '', department: '', position: '', companyId: '', shiftId: '', salaryType: 'monthly', salaryRate: '', bankName: '', bankAccountNumber: '', bankIfscCode: '', aadharNumber: '' });

  const openEdit = (emp: any) => {
    setForm({
      firstName: emp.firstName || '', lastName: emp.lastName || '', employeeId: emp.employeeId || '', email: emp.email || '',
      department: emp.department || '', position: emp.position || '', companyId: emp.companyId || '',
      shiftId: emp.shiftId || '', salaryType: emp.salaryType || 'monthly', salaryRate: String(emp.salaryRate || ''),
      bankName: emp.bankName || '', bankAccountNumber: emp.bankAccountNumber || '',
      bankIfscCode: emp.bankIfscCode || '', aadharNumber: emp.aadharNumber || '',
    });
    setEditId(emp._id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.firstName || !form.email || !form.department || !form.position || !form.salaryRate) {
      Alert.alert('Error', 'Please fill required fields'); return;
    }
    try {
      const data: any = { ...form, salaryRate: parseFloat(form.salaryRate) };
      if (!data.companyId) delete data.companyId;
      if (!data.shiftId) delete data.shiftId;
      if (!data.employeeId) delete data.employeeId;
      if (!data.lastName) delete data.lastName;
      // Remove any legacy fields that the backend no longer accepts
      delete data.fullName;
      if (editId) {
        await updateEmp({ id: editId, ...data });
      } else {
        await createEmp(data);
      }
      setShowForm(false); resetForm(); setEditId(null);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      // Capture with retry logic
      const photo = await takePictureWithRetry(cameraRef.current, { quality: 0.7 });
      
      if (!photo?.uri) {
        Alert.alert('Error', 'Could not capture photo. Please try again.');
        setCapturing(false);
        return;
      }

      const safeUri = photo.uri.startsWith('file://') ? photo.uri : `file://${photo.uri}`;

      // Upload using XMLHttpRequest (works on all devices)
      const uploadUrl = await genUploadUrl();
      const storageId = await xhrUpload(uploadUrl, safeUri);

      if (cameraType === 'face') {
        await registerFace({ id: cameraTarget, storageId });
        // Enroll face in AWS Rekognition
        try {
          const enrollResult = await convex.action(
            api.faceRecognitionAction.enrollEmployeeFace,
            { employeeId: cameraTarget, storageId }
          );
          if (enrollResult.success) {
            Alert.alert('Face Registered', enrollResult.message);
          } else {
            Alert.alert('Face Photo Saved', `Photo saved but AWS enrollment issue: ${enrollResult.message}\n\nYou can still use manual attendance.`);
          }
        } catch (enrollErr: any) {
          console.error('AWS enrollment error:', enrollErr);
          Alert.alert('Face Photo Saved', `Photo saved but AWS enrollment failed: ${enrollErr.message}\n\nYou can still use manual attendance.`);
        }
      } else if (cameraType === 'aadhar') {
        await uploadAadhar({ id: cameraTarget, storageId });
        Alert.alert('Success', 'Aadhar photo captured');
      } else if (cameraType === 'bankproof') {
        await uploadBankProof({ id: cameraTarget, storageId });
        Alert.alert('Success', 'Bank proof photo captured');
      }
      setCameraTarget(null);
    } catch (e: any) { 
      if (isCameraError(e)) {
        Alert.alert('Camera Error', 'Camera not ready. Please try again.');
      } else {
        Alert.alert('Error', e.message); 
      }
    }
    setCapturing(false);
  };

  const filtered = employees.filter((e: any) => {
    if (search) {
      const q = search.toLowerCase();
      const fullName = `${e.firstName} ${e.lastName || ''}`.toLowerCase();
      if (!fullName.includes(q) && !(e.employeeId || '').toLowerCase().includes(q) && !(e.email || '').toLowerCase().includes(q)) return false;
    }
    if (companyFilter && e.companyId !== companyFilter) return false;
    return true;
  });

  const salaryTypes = ['monthly', 'weekly', 'daily', 'hourly'];

  const handleCreateUserForEmployee = async (emp: any) => {
    if (!emp?.email) {
      Alert.alert('Error', 'Employee must have an email address first');
      return;
    }
    if (!userPassword) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }
    const failedRule = passwordRules.find(r => !r.test(userPassword));
    if (failedRule) {
      Alert.alert('Error', failedRule.label);
      return;
    }
    setCreatingUser(true);
    try {
      await createUser({
        email: emp.email.toLowerCase().trim(),
        firstName: emp.firstName,
        lastName: emp.lastName,
        role: userRole,
        employeeId: emp._id,
        reportsTo: userReportsTo ? userReportsTo as any : undefined,
      });
      const managerName = userReportsTo
        ? users.find((u: any) => u._id === userReportsTo)
          ? `${users.find((u: any) => u._id === userReportsTo)?.firstName || ''} ${users.find((u: any) => u._id === userReportsTo)?.lastName || ''}`.trim()
          : ''
        : 'None';
      Alert.alert(
        'User Account Created',
        `Login credentials for ${emp.firstName}:\n\nEmail: ${emp.email}\nPassword: ${userPassword}\nRole: ${userRole}\nReports To: ${managerName}\n\nShare these credentials with the employee. They need to use "Activate Account" on the login screen.`
      );
      setShowUserForm(false);
      setUserPassword('');
      setUserRole('employee');
      setUserReportsTo('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setCreatingUser(false);
  };

  const getLinkedUser = (emp: any) => {
    if (!emp) return null;
    return users.find((u: any) => u.employeeId === emp._id) || null;
  };

  const handleResetPasswordForLinkedUser = async (linkedUser: any) => {
    if (!linkedUser?._id) return;
    const normalizedEmail = String(linkedUser?.email || '').toLowerCase().trim();
    const blockedSharedEmail = normalizedEmail === 'office@gmail.com' || normalizedEmail === 'employee@gmail.com';
    const blockedSharedRole = linkedUser?.role === 'office_shared' || linkedUser?.role === 'shared_employee';
    if (blockedSharedEmail || blockedSharedRole) {
      Alert.alert('Not Allowed', 'Shared attendance accounts cannot be reset from this screen.');
      return;
    }

    Alert.alert(
      'Reset Password Access',
      `Reset password access for ${linkedUser.email}?\n\nThis will sign out the user from all devices and require account re-activation on next login.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              setResettingPassword(true);
              await resetUserPasswordAccess({ userId: linkedUser._id });
              Alert.alert(
                'Password Reset Enabled',
                `Done for ${linkedUser.email}.\n\nNext login flow:\n1. Enter email + any new password on Login\n2. App will activate account\n3. User will be prompted to set final password`
              );
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to reset password access');
            } finally {
              setResettingPassword(false);
            }
          },
        },
      ]
    );
  };

  if (!isAdmin) {
    return (
      <LinearGradient colors={gradients.background as any} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
          <Text style={{ fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 20 }}>My Profile</Text>
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: colors.primary }}>
                {`${(currentUser?.firstName || '?')[0]}${(currentUser?.lastName || '')[0] || ''}`.toUpperCase()}
              </Text>
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>
              {currentUser?.firstName} {currentUser?.lastName || ''}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>{currentUser?.email}</Text>
          </View>
          <GlassCard>
            <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center', lineHeight: 20 }}>
              To view or update your full employee details, go to the Profile tab.{'\n'}
              Contact your admin to update your department, salary, or shift.
            </Text>
          </GlassCard>
        </ScrollView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={gradients.background as any} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Employees</Text>
          {isAdmin && (
            <TouchableOpacity style={styles.addBtn} onPress={() => { resetForm(); setEditId(null); setShowForm(true); }}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <TextInput style={styles.searchInput} placeholder="Search by name, ID, email..." placeholderTextColor={colors.textTertiary} value={search} onChangeText={setSearch} />
        </View>

        {/* Company filter */}
        {companies.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            <TouchableOpacity style={[styles.chip, !companyFilter && styles.chipActive]} onPress={() => setCompanyFilter('')}>
              <Text style={[styles.chipText, !companyFilter && styles.chipTextActive]}>All</Text>
            </TouchableOpacity>
            {companies.map((c: any) => (
              <TouchableOpacity key={c._id} style={[styles.chip, companyFilter === c._id && styles.chipActive]} onPress={() => setCompanyFilter(companyFilter === c._id ? '' : c._id)}>
                <Text style={[styles.chipText, companyFilter === c._id && styles.chipTextActive]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <Text style={styles.count}>{filtered.length} employees</Text>

        {filtered.map((emp: any) => (
          <TouchableOpacity key={emp._id} style={styles.empCard} onPress={() => setDetailEmp(emp)}>
            <View style={styles.empAvatarWrap}>
              <EmployeeAvatar
                uri={emp.faceImageUrl}
                firstName={emp.firstName}
                lastName={emp.lastName}
                size={44}
                showBadge={!!emp.faceImageUrl}
              />
              <View style={[styles.statusBadge, { backgroundColor: emp.status === 'active' ? colors.success : colors.danger }]} />
            </View>
            <View style={styles.empInfo}>
              <Text style={styles.empName}>{emp.firstName} {emp.lastName || ''}</Text>
              <Text style={styles.empRole}>{emp.position} • {emp.department}</Text>
              {emp.companyName && <Text style={styles.empCompany}>{emp.companyName}</Text>}
            </View>
            {isAdmin && (
              <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(emp)}>
                <Ionicons name="pencil" size={16} color={colors.primary} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Detail Modal */}
      <Modal visible={!!detailEmp} transparent animationType="slide" onRequestClose={() => setDetailEmp(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}
          onPress={() => setDetailEmp(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.bgMid,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              borderColor: colors.border,
              maxHeight: '90%',
              paddingTop: 12,
            }}
          >
            {/* Drag handle */}
            <View style={{
              width: 40,
              height: 4,
              backgroundColor: colors.border,
              borderRadius: 2,
              alignSelf: 'center',
              marginBottom: 16,
            }} />

            {/* Header with close button — always visible */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              marginBottom: 16,
            }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{
                  fontSize: 20,
                  fontWeight: '700',
                  color: colors.text,
                  lineHeight: 26,
                }} numberOfLines={3}>
                  {detailEmp?.firstName} {detailEmp?.lastName || ''}
                </Text>
                <Text style={{
                  fontSize: 13,
                  color: colors.textSecondary,
                  marginTop: 4,
                }}>
                  {detailEmp?.department} • {detailEmp?.position}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setDetailEmp(null)}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Scrollable content */}
            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: 40,
              }}
              showsVerticalScrollIndicator={false}
            >
              {/* Avatar */}
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                {detailEmp?.faceImageUrl ? (
                  <Image
                    source={{ uri: detailEmp.faceImageUrl }}
                    style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 10 }}
                  />
                ) : (
                  <View style={{
                    width: 80, height: 80, borderRadius: 40,
                    backgroundColor: colors.primaryLight,
                    alignItems: 'center', justifyContent: 'center',
                    marginBottom: 10,
                  }}>
                    <Text style={{ fontSize: 28, fontWeight: '700', color: colors.primary }}>
                      {`${(detailEmp?.firstName || '?')[0]}${(detailEmp?.lastName || '')[0] || ''}`.toUpperCase()}
                    </Text>
                  </View>
                )}
                {!detailEmp?.faceImageUrl && isAdmin && (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}
                    onPress={() => {
                      if (!permission?.granted) { requestPermission(); return; }
                      setCameraTarget(detailEmp?._id); setCameraType('face'); setDetailEmp(null);
                    }}
                  >
                    <Ionicons name="camera-outline" size={14} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '500' }}>Tap to register face</Text>
                  </TouchableOpacity>
                )}
                {!detailEmp?.faceImageUrl && isAdmin && (
  <TouchableOpacity
    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}
    onPress={() => {
      if (!permission?.granted) { requestPermission(); return; }
      setCameraTarget(detailEmp?._id); setCameraType('face'); setDetailEmp(null);
    }}
  >
    <Ionicons name="camera-outline" size={14} color={colors.primary} />
    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '500' }}>Tap to register face</Text>
  </TouchableOpacity>
)}

{/* ADD THIS BELOW */}
{isAdmin && (
  <TouchableOpacity
    style={{
      flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8,
      backgroundColor: '#1E3A5F', paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: 8,
    }}
    onPress={() => {
      setDetailEmp(null);
      navigation.navigate('FaceEnrollment', {
        params: {
          employeeId: detailEmp?._id,
          employeeName: `${detailEmp?.firstName} ${detailEmp?.lastName || ''}`,
        }
      });
    }}
  >
    <Ionicons name="scan-outline" size={14} color="#fff" />
    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Enroll Face (ML Kit)</Text>
  </TouchableOpacity>
)}
                {detailEmp?.employeeId && (
                  <View style={{
                    backgroundColor: colors.primaryLight,
                    paddingHorizontal: 12, paddingVertical: 4,
                    borderRadius: 12, marginTop: 6,
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>
                      {detailEmp.employeeId}
                    </Text>
                  </View>
                )}
              </View>

              {/* Details rows */}
              {[
                { label: 'Email', value: detailEmp?.email, icon: 'mail-outline' },
                { label: 'Company', value: detailEmp?.companyName || 'Not assigned', icon: 'business-outline' },
                { label: 'Department', value: detailEmp?.department, icon: 'grid-outline' },
                { label: 'Position', value: detailEmp?.position, icon: 'briefcase-outline' },
                { label: 'Shift', value: detailEmp?.shiftName || 'Not assigned', icon: 'time-outline' },
                { label: 'Salary Type', value: detailEmp?.salaryType, icon: 'cash-outline' },
                { label: 'Salary Rate', value: `₹${(detailEmp?.salaryRate || 0).toLocaleString('en-IN')}`, icon: 'wallet-outline' },
                { label: 'Bank', value: detailEmp?.bankName || 'Not set', icon: 'card-outline' },
                { label: 'Account No', value: detailEmp?.bankAccountNumber || 'Not set', icon: 'card-outline' },
                { label: 'IFSC', value: detailEmp?.bankIfscCode || 'Not set', icon: 'code-outline' },
                { label: 'Aadhar', value: detailEmp?.aadharNumber || 'Not set', icon: 'id-card-outline' },
                { label: 'Status', value: detailEmp?.status || 'active', icon: 'ellipse-outline' },
              ].filter(row => row.value).map(row => (
                <View key={row.label} style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.borderLight,
                }}>
                  <Ionicons
                    name={row.icon as any}
                    size={16}
                    color={colors.textSecondary}
                    style={{ marginRight: 10, width: 20 }}
                  />
                  <Text style={{
                    fontSize: 12,
                    color: colors.textSecondary,
                    width: 90,
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                  }}>
                    {row.label}
                  </Text>
                  <Text style={{
                    flex: 1,
                    fontSize: 14,
                    fontWeight: '500',
                    color: colors.text,
                    textAlign: 'right',
                    flexWrap: 'wrap',
                  }}>
                    {row.value}
                  </Text>
                </View>
              ))}

              {/* Aadhar Photo */}
              <View style={styles.docSection}>
                <Text style={styles.docSectionTitle}>Aadhar Card Photo</Text>
                {detailEmp?.aadharImageUrl ? (
                  <Image source={{ uri: detailEmp.aadharImageUrl }} style={styles.docImage} resizeMode="contain" />
                ) : (
                  <View style={styles.docPlaceholder}>
                    <Ionicons name="document-outline" size={24} color={colors.textTertiary} />
                    <Text style={styles.docPlaceholderText}>No Aadhar photo</Text>
                  </View>
                )}
                {isAdmin && (
                  <TouchableOpacity style={styles.docCaptureBtn} onPress={() => {
                    if (!permission?.granted) { requestPermission(); return; }
                    setCameraTarget(detailEmp?._id); setCameraType('aadhar'); setDetailEmp(null);
                  }}>
                    <Ionicons name="camera-outline" size={16} color={colors.primary} />
                    <Text style={styles.docCaptureBtnText}>{detailEmp?.aadharImageUrl ? 'Re-capture Aadhar' : 'Capture Aadhar Photo'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Bank Proof Photo */}
              <View style={styles.docSection}>
                <Text style={styles.docSectionTitle}>Bank Proof Photo</Text>
                {detailEmp?.bankProofImageUrl ? (
                  <Image source={{ uri: detailEmp.bankProofImageUrl }} style={styles.docImage} resizeMode="contain" />
                ) : (
                  <View style={styles.docPlaceholder}>
                    <Ionicons name="document-outline" size={24} color={colors.textTertiary} />
                    <Text style={styles.docPlaceholderText}>No bank proof photo</Text>
                  </View>
                )}
                {isAdmin && (
                  <TouchableOpacity style={styles.docCaptureBtn} onPress={() => {
                    if (!permission?.granted) { requestPermission(); return; }
                    setCameraTarget(detailEmp?._id); setCameraType('bankproof'); setDetailEmp(null);
                  }}>
                    <Ionicons name="camera-outline" size={16} color={colors.primary} />
                    <Text style={styles.docCaptureBtnText}>{detailEmp?.bankProofImageUrl ? 'Re-capture Bank Proof' : 'Capture Bank Proof'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* User Account Section */}
              {isAdmin && detailEmp && (() => {
                const linkedUser = getLinkedUser(detailEmp);
                return (
                  <View style={styles.docSection}>
                    <Text style={styles.docSectionTitle}>User Login Account</Text>
                    {linkedUser ? (
                      <View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Email</Text>
                          <Text style={styles.detailValue}>{linkedUser.email}</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Role</Text>
                          <Text style={[styles.detailValue, { textTransform: 'capitalize' }]}>{linkedUser.role}</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Reports To</Text>
                          <Text style={styles.detailValue}>{linkedUser.reportsToName || 'Not assigned'}</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Status</Text>
                          <Text style={[styles.detailValue, { color: colors.success }]}>Account Linked</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.docCaptureBtn, { marginTop: 8, opacity: resettingPassword ? 0.6 : 1 }]}
                          onPress={() => handleResetPasswordForLinkedUser(linkedUser)}
                          disabled={resettingPassword}
                        >
                          {resettingPassword ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : (
                            <Ionicons name="refresh-outline" size={16} color={colors.primary} />
                          )}
                          <Text style={styles.docCaptureBtnText}>Reset Login Password</Text>
                        </TouchableOpacity>
                      </View>
                    ) : !showUserForm ? (
                      <View>
                        <View style={styles.docPlaceholder}>
                          <Ionicons name="person-add-outline" size={24} color={colors.textTertiary} />
                          <Text style={styles.docPlaceholderText}>No login account linked</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.docCaptureBtn}
                          onPress={() => { setShowUserForm(true); setUserPassword(''); setUserRole('employee'); }}
                        >
                          <Ionicons name="key-outline" size={16} color={colors.primary} />
                          <Text style={styles.docCaptureBtnText}>Create Login Account</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View>
                        <View style={{ marginBottom: 8 }}>
                          <Text style={styles.fieldLabel}>Email (from employee)</Text>
                          <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: borderRadius.sm, padding: 12, borderWidth: 1, borderColor: colors.borderLight }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{detailEmp.email}</Text>
                          </View>
                        </View>
                        <Text style={styles.fieldLabel}>Password</Text>
                        <TextInput
                          style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: borderRadius.sm, padding: 12, color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 4 }}
                          placeholder="Enter password"
                          placeholderTextColor={colors.textTertiary}
                          secureTextEntry
                          value={userPassword}
                          onChangeText={setUserPassword}
                        />
                        {userPassword.length > 0 && (
                          <View style={{ marginBottom: 8 }}>
                            {passwordRules.map((rule, i) => {
                              const passed = rule.test(userPassword);
                              return (
                                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                  <Ionicons name={passed ? 'checkmark-circle' : 'close-circle'} size={14} color={passed ? colors.success : colors.danger} />
                                  <Text style={{ fontSize: 12, color: passed ? colors.success : colors.danger }}>{rule.label}</Text>
                                </View>
                              );
                            })}
                          </View>
                        )}
                        <Text style={styles.fieldLabel}>Role</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                          {['employee', 'admin'].map(r => (
                            <TouchableOpacity
                              key={r}
                              style={[styles.typeChip, userRole === r && styles.typeChipActive]}
                              onPress={() => setUserRole(r)}
                            >
                              <Text style={[styles.typeChipText, userRole === r && styles.typeChipTextActive]}>{r}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <Text style={styles.fieldLabel}>Reports To (Manager/Admin)</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                              style={[styles.typeChip, !userReportsTo && styles.typeChipActive]}
                              onPress={() => setUserReportsTo('')}
                            >
                              <Text style={[styles.typeChipText, !userReportsTo && styles.typeChipTextActive]}>None</Text>
                            </TouchableOpacity>
                            {users.filter((u: any) => u.role === 'superadmin' || u.role === 'admin').map((u: any) => (
                              <TouchableOpacity
                                key={u._id}
                                style={[styles.typeChip, userReportsTo === u._id && styles.typeChipActive]}
                                onPress={() => setUserReportsTo(u._id)}
                              >
                                <Text style={[styles.typeChipText, userReportsTo === u._id && styles.typeChipTextActive]}>
                                  {u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : u.email}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            style={[styles.docCaptureBtn, { flex: 1, backgroundColor: 'transparent', borderColor: colors.border }]}
                            onPress={() => { setShowUserForm(false); setUserPassword(''); }}
                          >
                            <Text style={[styles.docCaptureBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.faceBtn, { flex: 1, opacity: creatingUser ? 0.6 : 1 }]}
                            onPress={() => handleCreateUserForEmployee(detailEmp)}
                            disabled={creatingUser}
                          >
                            {creatingUser ? (
                              <ActivityIndicator color="#fff" size="small" />
                            ) : (
                              <>
                                <Ionicons name="checkmark" size={16} color="#fff" />
                                <Text style={styles.faceBtnText}>Create Account</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* Action buttons */}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                {isAdmin && (
                  <>
                    <TouchableOpacity
                      onPress={() => {
                        if (!permission?.granted) { requestPermission(); return; }
                        setCameraTarget(detailEmp?._id); setCameraType('face'); setDetailEmp(null);
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: colors.primary,
                        paddingVertical: 14,
                        borderRadius: borderRadius.md,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center',
                        gap: 6,
                      }}>
                      <Ionicons name="camera" size={16} color="#fff" />
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>
                        {detailEmp?.faceImageUrl ? 'Re-capture Face' : 'Register Face'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        openEdit(detailEmp);
                        setDetailEmp(null);
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: colors.primaryLight,
                        paddingVertical: 14,
                        borderRadius: borderRadius.md,
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: colors.primary,
                      }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>Edit</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {isAdmin && (
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert('Deactivate', `Deactivate ${detailEmp?.firstName} ${detailEmp?.lastName || ''}?`, [
                      { text: 'Cancel' },
                      { text: 'Deactivate', style: 'destructive', onPress: async () => {
                        try { await deactivateEmp({ id: detailEmp._id }); setDetailEmp(null); } catch (e: any) { Alert.alert('Error', e.message); }
                      }},
                    ]);
                  }}
                  style={{ alignItems: 'center', paddingVertical: 14, marginTop: 8 }}>
                  <Text style={{ fontSize: 14, color: colors.danger, fontWeight: '500' }}>Deactivate Employee</Text>
                </TouchableOpacity>
              )}

              {isSuperAdmin && (
                <TouchableOpacity
                  onPress={async () => {
                    const name = `${detailEmp?.firstName} ${detailEmp?.lastName || ''}`.trim();
                    const msg = `Are you sure you want to permanently delete ${name}?\n\nThis will remove ALL data including:\n• Attendance records\n• Tasks & submissions\n• Leave requests\n• Salary deductions\n• Face images\n• Login account\n\nThis action CANNOT be undone.`;

                    const doDelete = async () => {
                      try {
                        await removeEmp({ id: detailEmp._id });
                        setDetailEmp(null);
                        if (Platform.OS === 'web') {
                          (globalThis as any).alert?.('Employee and all related data permanently removed.');
                        } else {
                          Alert.alert('Deleted', 'Employee and all related data permanently removed.');
                        }
                      } catch (e: any) {
                        if (Platform.OS === 'web') {
                          (globalThis as any).alert?.('Error: ' + e.message);
                        } else {
                          Alert.alert('Error', e.message);
                        }
                      }
                    };

                    if (Platform.OS === 'web') {
                      if ((globalThis as any).confirm?.(msg)) {
                        await doDelete();
                      }
                    } else {
                      Alert.alert(
                        'Permanently Delete',
                        msg,
                        [
                          { text: 'Cancel' },
                          { text: 'Delete Permanently', style: 'destructive', onPress: doDelete },
                        ]
                      );
                    }
                  }}
                  style={{
                    alignItems: 'center',
                    paddingVertical: 14,
                    marginTop: 4,
                    backgroundColor: 'rgba(239,68,68,0.1)',
                    borderRadius: borderRadius.md,
                    borderWidth: 1,
                    borderColor: colors.danger,
                  }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="trash" size={16} color={colors.danger} />
                    <Text style={{ fontSize: 14, color: colors.danger, fontWeight: '600' }}>Delete Employee Permanently</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: colors.danger, marginTop: 2, opacity: 0.7 }}>Super Admin Only</Text>
                </TouchableOpacity>
              )}

              {/* Close button at bottom */}
              <TouchableOpacity
                onPress={() => setDetailEmp(null)}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  paddingVertical: 14,
                  borderRadius: borderRadius.md,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginTop: 12,
                }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add/Edit Form Modal */}
      <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
        <LinearGradient colors={gradients.background as any} style={styles.container}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.formScroll}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>{editId ? 'Edit Employee' : 'Add Employee'}</Text>
                <TouchableOpacity onPress={() => setShowForm(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
              </View>

              {/* Face photo at top of form when editing */}
              {editId && (
                <View style={{ alignItems: 'center', marginBottom: 20 }}>
                  <TouchableOpacity
                    onPress={() => {
                      if (!permission?.granted) { requestPermission(); return; }
                      setCameraTarget(editId); setCameraType('face'); setShowForm(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <EmployeeAvatar
                      uri={employees.find((e: any) => e._id === editId)?.faceImageUrl}
                      firstName={form.firstName}
                      lastName={form.lastName}
                      size={88}
                      showBadge={!!employees.find((e: any) => e._id === editId)?.faceImageUrl}
                    />
                    {!employees.find((e: any) => e._id === editId)?.faceImageUrl && (
                      <View style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bgEnd }}>
                        <Ionicons name="camera" size={14} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>
                    {employees.find((e: any) => e._id === editId)?.faceImageUrl ? 'Tap to re-capture face' : 'Tap to register face'}
                  </Text>
                </View>
              )}

              <GlassInput label="First Name *" value={form.firstName} onChangeText={(v: string) => setForm({...form, firstName: v})} />
              <GlassInput label="Last Name" value={form.lastName} onChangeText={(v: string) => setForm({...form, lastName: v})} />
              <GlassInput label="Employee ID" value={form.employeeId} onChangeText={(v: string) => setForm({...form, employeeId: v})} />
              <GlassInput label="Email *" value={form.email} onChangeText={(v: string) => setForm({...form, email: v})} keyboardType="email-address" />
              
              {/* Department selector */}
              <Text style={styles.fieldLabel}>Department *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorRow}>
                {deptList.map((d: any) => (
                  <TouchableOpacity key={d._id} style={[styles.selectorChip, form.department === d.name && styles.selectorChipActive]} onPress={() => setForm({...form, department: d.name})}>
                    <Text style={[styles.selectorChipText, form.department === d.name && styles.selectorChipTextActive]}>{d.name}</Text>
                  </TouchableOpacity>
                ))}
                {deptList.length === 0 && (
                  <GlassInput label="" value={form.department} onChangeText={(v: string) => setForm({...form, department: v})} placeholder="No departments — type here" />
                )}
              </ScrollView>

              {/* Position selector */}
              <Text style={styles.fieldLabel}>Position *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorRow}>
                {(form.department
                  ? posList.filter((p: any) => {
                      const dept = deptList.find((d: any) => d.name === form.department);
                      return !p.departmentId || (dept && p.departmentId === dept._id);
                    })
                  : posList
                ).map((p: any) => (
                  <TouchableOpacity key={p._id} style={[styles.selectorChip, form.position === p.name && styles.selectorChipActive]} onPress={() => setForm({...form, position: p.name})}>
                    <Text style={[styles.selectorChipText, form.position === p.name && styles.selectorChipTextActive]}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
                {posList.length === 0 && (
                  <GlassInput label="" value={form.position} onChangeText={(v: string) => setForm({...form, position: v})} placeholder="No positions — type here" />
                )}
              </ScrollView>

              {/* Company selector */}
              <Text style={styles.fieldLabel}>Company</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorRow}>
                {companies.map((c: any) => (
                  <TouchableOpacity key={c._id} style={[styles.selectorChip, form.companyId === c._id && styles.selectorChipActive]} onPress={() => setForm({...form, companyId: c._id})}>
                    <Text style={[styles.selectorChipText, form.companyId === c._id && styles.selectorChipTextActive]}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Shift selector */}
              <Text style={styles.fieldLabel}>Shift</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorRow}>
                {shifts.map((s: any) => (
                  <TouchableOpacity key={s._id} style={[styles.selectorChip, form.shiftId === s._id && styles.selectorChipActive]} onPress={() => setForm({...form, shiftId: s._id})}>
                    <Text style={[styles.selectorChipText, form.shiftId === s._id && styles.selectorChipTextActive]}>{s.name} ({s.startTime}-{s.endTime})</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Salary type */}
              <Text style={styles.fieldLabel}>Salary Type</Text>
              <View style={styles.typeRow}>
                {salaryTypes.map(t => (
                  <TouchableOpacity key={t} style={[styles.typeChip, form.salaryType === t && styles.typeChipActive]} onPress={() => setForm({...form, salaryType: t})}>
                    <Text style={[styles.typeChipText, form.salaryType === t && styles.typeChipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <GlassInput label="Salary Rate (₹) *" value={form.salaryRate} onChangeText={(v: string) => setForm({...form, salaryRate: v})} keyboardType="numeric" />
              <GlassInput label="Bank Name" value={form.bankName} onChangeText={(v: string) => setForm({...form, bankName: v})} />
              <GlassInput label="Bank Account Number" value={form.bankAccountNumber} onChangeText={(v: string) => setForm({...form, bankAccountNumber: v})} />
              <GlassInput label="Bank IFSC Code" value={form.bankIfscCode} onChangeText={(v: string) => setForm({...form, bankIfscCode: v})} />
              <GlassInput label="Aadhar Number" value={form.aadharNumber} onChangeText={(v: string) => setForm({...form, aadharNumber: v})} />

              {/* Aadhar Photo in form - only when editing */}
              {editId && (
                <View style={styles.formDocSection}>
                  <Text style={styles.fieldLabel}>Aadhar Card Photo</Text>
                  {employees.find((e: any) => e._id === editId)?.aadharImageUrl ? (
                    <Image source={{ uri: employees.find((e: any) => e._id === editId)?.aadharImageUrl }} style={styles.formDocImage} resizeMode="contain" />
                  ) : (
                    <View style={styles.formDocPlaceholder}>
                      <Ionicons name="document-outline" size={20} color={colors.textTertiary} />
                      <Text style={styles.formDocPlaceholderText}>No photo yet</Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.formDocCaptureBtn} onPress={() => {
                    if (!permission?.granted) { requestPermission(); return; }
                    setCameraTarget(editId); setCameraType('aadhar'); setShowForm(false);
                  }}>
                    <Ionicons name="camera-outline" size={16} color={colors.primary} />
                    <Text style={styles.formDocCaptureBtnText}>Capture Aadhar Photo</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Bank Proof Photo in form - only when editing */}
              {editId && (
                <View style={styles.formDocSection}>
                  <Text style={styles.fieldLabel}>Bank Proof Photo</Text>
                  {employees.find((e: any) => e._id === editId)?.bankProofImageUrl ? (
                    <Image source={{ uri: employees.find((e: any) => e._id === editId)?.bankProofImageUrl }} style={styles.formDocImage} resizeMode="contain" />
                  ) : (
                    <View style={styles.formDocPlaceholder}>
                      <Ionicons name="document-outline" size={20} color={colors.textTertiary} />
                      <Text style={styles.formDocPlaceholderText}>No photo yet</Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.formDocCaptureBtn} onPress={() => {
                    if (!permission?.granted) { requestPermission(); return; }
                    setCameraTarget(editId); setCameraType('bankproof'); setShowForm(false);
                  }}>
                    <Ionicons name="camera-outline" size={16} color={colors.primary} />
                    <Text style={styles.formDocCaptureBtnText}>Capture Bank Proof Photo</Text>
                  </TouchableOpacity>
                </View>
              )}

              <GlassButton title="Save" onPress={handleSave} style={{ marginTop: 16 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </LinearGradient>
      </Modal>

      {/* Camera Modal */}
      <Modal visible={!!cameraTarget} animationType="slide" onRequestClose={() => setCameraTarget(null)}>
        <CameraPermissionGate permission={permission} requestPermission={requestPermission}>
        <View style={styles.cameraContainer}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={cameraType === 'face' ? 'front' : 'back'} />
          <View style={styles.camOverlay}>
            <TouchableOpacity style={styles.camClose} onPress={() => setCameraTarget(null)}>
              <Ionicons name="close-circle" size={36} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
            <Text style={styles.camLabel}>
              {cameraType === 'face' ? 'Face Photo' : cameraType === 'aadhar' ? 'Aadhar Card' : 'Bank Proof'}
            </Text>
          </View>
          <View style={styles.camBottom}>
            <TouchableOpacity style={styles.camCapture} onPress={handleCapture} disabled={capturing}>
              {capturing ? <ActivityIndicator color="#fff" /> : <Ionicons name="camera" size={32} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
        </CameraPermissionGate>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 10 },
  filterRow: { marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border, marginRight: 8 },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
  count: { fontSize: 12, color: colors.textTertiary, marginBottom: 12 },
  empCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: borderRadius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.borderLight, gap: 12 },
  empAvatarWrap: { position: 'relative' },
  empAvatar: { width: 44, height: 44, borderRadius: 22 },
  empAvatarEmpty: { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  statusBadge: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.bgMid },
  empInfo: { flex: 1 },
  empName: { fontSize: 15, fontWeight: '600', color: colors.text },
  empRole: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  empCompany: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  editBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  // Detail modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.bgMid, borderRadius: 20, padding: 20, maxHeight: '85%', borderWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  detailPhoto: { width: 80, height: 80, borderRadius: 40, alignSelf: 'center', marginBottom: 16 },
  detailGrid: {},
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  detailLabel: { fontSize: 13, color: colors.textSecondary },
  detailValue: { fontSize: 13, fontWeight: '500', color: colors.text, maxWidth: '60%', textAlign: 'right' },
  detailActions: { gap: 12, marginTop: 20 },
  faceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: borderRadius.md },
  faceBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  deactivateBtn: { alignItems: 'center', paddingVertical: 12 },
  deactivateBtnText: { fontSize: 14, color: colors.danger, fontWeight: '500' },
  // Document sections in detail modal
  docSection: { marginTop: 16, padding: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.borderLight },
  docSectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  docImage: { width: '100%', height: 180, borderRadius: borderRadius.sm, backgroundColor: 'rgba(0,0,0,0.2)' },
  docPlaceholder: { height: 80, alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.borderLight, borderStyle: 'dashed' },
  docPlaceholderText: { fontSize: 12, color: colors.textTertiary, marginTop: 4 },
  docCaptureBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 8, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryLight },
  docCaptureBtnText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  // Document sections in form
  formDocSection: { marginTop: 4, marginBottom: 12 },
  formDocImage: { width: '100%', height: 160, borderRadius: borderRadius.sm, backgroundColor: 'rgba(0,0,0,0.2)', marginBottom: 8 },
  formDocPlaceholder: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.borderLight, borderStyle: 'dashed', marginBottom: 8 },
  formDocPlaceholderText: { fontSize: 12, color: colors.textTertiary },
  formDocCaptureBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryLight },
  formDocCaptureBtnText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  // Form modal
  formScroll: { padding: 20, paddingTop: 60 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  formTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
  fieldLabel: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
  selectorRow: { marginBottom: 8 },
  selectorChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border, marginRight: 8 },
  selectorChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  selectorChipText: { fontSize: 13, color: colors.textSecondary },
  selectorChipTextActive: { color: colors.primary, fontWeight: '600' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border },
  typeChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  typeChipText: { fontSize: 13, color: colors.textSecondary, textTransform: 'capitalize' },
  typeChipTextActive: { color: colors.primary, fontWeight: '600' },
  // Camera
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: 50, paddingHorizontal: 20 },
  camClose: { alignSelf: 'flex-start' },
  camLabel: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center', marginTop: 8 },
  camBottom: { position: 'absolute', bottom: 50, alignSelf: 'center' },
  camCapture: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)' },
});

// ... existing code ...