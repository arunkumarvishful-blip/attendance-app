import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform, Share, ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery, useMutation } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../convex/_generated/api';
import { colors, gradients, spacing, borderRadius } from '../lib/theme';
import GlassCard from '../components/GlassCard';
import GlassInput from '../components/GlassInput';
import GlassButton from '../components/GlassButton';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '../lib/utils';
import DeviceManagementScreen from './admin/DeviceManagementScreen';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// Indian Government Gazetted Holidays
// Fixed holidays have the same date every year
// Variable holidays change each year based on lunar calendar
const INDIAN_GOV_HOLIDAYS: {
  name: string;
  fixed?: { month: number; day: number };
  dates?: Record<number, string>; // year -> "MM-DD"
}[] = [
  // Fixed-date holidays
  { name: 'Pongal (Day 1)', fixed: { month: 1, day: 14 } },
  { name: 'Pongal (Day 2)', fixed: { month: 1, day: 15 } },
  { name: 'Republic Day', fixed: { month: 1, day: 26 } },
  { name: 'Independence Day', fixed: { month: 8, day: 15 } },
  { name: "Mahatma Gandhi's Birthday", fixed: { month: 10, day: 2 } },
  { name: 'Christmas Day', fixed: { month: 12, day: 25 } },
  // Variable-date holidays (dates from official Indian govt gazette)
  { name: 'Holi', dates: { 2025: '03-14', 2026: '03-04' } },
  { name: 'Id-ul-Fitr (Eid)', dates: { 2025: '03-31', 2026: '03-21' } },
  { name: 'Ram Navami', dates: { 2025: '04-06', 2026: '03-26' } },
  { name: 'Mahavir Jayanti', dates: { 2025: '04-10', 2026: '03-31' } },
  { name: 'Good Friday', dates: { 2025: '04-18', 2026: '04-03' } },
  { name: 'Buddha Purnima', dates: { 2025: '05-12', 2026: '05-01' } },
  { name: 'Id-ul-Zuha (Bakrid)', dates: { 2025: '06-07', 2026: '05-27' } },
  { name: 'Muharram', dates: { 2025: '07-06', 2026: '06-26' } },
  { name: 'Janmashtami', dates: { 2025: '08-16', 2026: '09-04' } },
  { name: 'Dussehra (Vijaya Dashami)', dates: { 2025: '10-02', 2026: '10-20' } },
  { name: 'Diwali (Deepavali)', dates: { 2025: '10-20', 2026: '11-08' } },
  { name: "Guru Nanak's Birthday", dates: { 2025: '11-05', 2026: '11-24' } },
];


const passwordRules = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One special character (!@#$...)', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function PasswordRequirements({ password }: { password: string }) {
  if (!password) return null;
  return (
    <View style={{ marginTop: 8, gap: 4 }}>
      {passwordRules.map((rule, i) => {
        const passed = rule.test(password);
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons
              name={passed ? 'checkmark-circle' : 'close-circle'}
              size={14}
              color={passed ? colors.success : colors.danger}
            />
            <Text style={{ fontSize: 12, color: passed ? colors.success : colors.textTertiary }}>
              {rule.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function EmployeeSettings({ currentUser }: { currentUser: any }) {
  const { signOut } = useAuthActions();
  const updateProfile = useMutation(api.users.updateOwnProfile);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [firstName, setFirstName] = useState(currentUser?.firstName || '');
  const [lastName, setLastName] = useState(currentUser?.lastName || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [saving, setSaving] = useState(false);

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  const { signIn } = useAuthActions();

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveType, setLeaveType] = useState('casual');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveLoading, setLeaveLoading] = useState(false);
  const requestLeaveEmp = useMutation(api.leaves.requestLeave);
  const myLeavesEmp = useQuery(api.leaves.getMyLeaves,
    currentUser?.employeeId ? { employeeId: currentUser.employeeId } : 'skip'
  );

  // Fix: avoid 'AA' when firstName/lastName are not set — fall back to email initial
  const rawInitials = (currentUser?.firstName && currentUser?.lastName)
    ? `${currentUser.firstName[0]}${currentUser.lastName[0]}`
    : currentUser?.firstName
    ? currentUser.firstName.slice(0, 2)
    : currentUser?.email
    ? currentUser.email[0].toUpperCase()
    : '?';
  const initials = rawInitials.toUpperCase();

  const handleSignOut = async () => {
    const doSignOut = async () => {
      try {
        // Clear session ID so next login generates a fresh one
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('app_session_id');
        }
        await signOut();
      } catch (e) {
        console.log('Sign out error', e);
      }
    };

    if (Platform.OS === 'web') {
      if ((globalThis as any).confirm('Are you sure you want to sign out?')) {
        await doSignOut();
      }
    } else {
      Alert.alert(
        'Sign Out',
        'Are you sure you want to sign out?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: doSignOut },
        ]
      );
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile({ firstName, lastName, phone });
      setShowEditModal(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPwd !== confirmPwd) { setPwdError("Passwords don't match"); return; }
    if (newPwd.length < 8) { setPwdError("Password must be at least 8 characters"); return; }
    setPwdError('');
    setPwdSaving(true);
    try {
      await signIn('password', { email: currentUser?.email, password: currentPwd, flow: 'signIn' });
      await signIn('password', { email: currentUser?.email, password: newPwd, flow: 'signUp' });
      setShowPasswordModal(false);
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
      Alert.alert('Success', 'Password updated successfully');
    } catch (e: any) {
      setPwdError('Current password is incorrect');
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <LinearGradient colors={gradients.background as any} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 24 }}>Settings</Text>

        {/* My Account Card */}
        <GlassCard style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.primary }}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
                {currentUser?.firstName} {currentUser?.lastName || ''}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{currentUser?.email}</Text>
              <View style={{ marginTop: 6, backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start' }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.primary }}>Employee</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => { setFirstName(currentUser?.firstName || ''); setLastName(currentUser?.lastName || ''); setPhone(currentUser?.phone || ''); setShowEditModal(true); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.borderLight }}
          >
            <Ionicons name="pencil-outline" size={18} color={colors.primary} />
            <Text style={{ fontSize: 15, color: colors.primary, fontWeight: '500' }}>Edit Profile</Text>
          </TouchableOpacity>
        </GlassCard>

        {/* Security Card */}
        <GlassCard style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Security</Text>
          <TouchableOpacity
            onPress={() => { setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); setPwdError(''); setShowPasswordModal(true); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }}
          >
            <Ionicons name="lock-closed-outline" size={20} color={colors.text} />
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: colors.text }}>Change Password</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </GlassCard>

        {/* Leave Requests */}
        <GlassCard style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Leave Requests</Text>
            <TouchableOpacity
              onPress={() => setShowLeaveModal(true)}
              style={{ backgroundColor: colors.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>+ Request Leave</Text>
            </TouchableOpacity>
          </View>
          {myLeavesEmp && myLeavesEmp.length > 0 ? myLeavesEmp.slice(0, 5).map((leave: any) => {
            const lColor = leave.status === 'approved' ? colors.success : leave.status === 'rejected' ? colors.danger : colors.warning;
            const lBg = leave.status === 'approved' ? colors.successBg : leave.status === 'rejected' ? colors.dangerBg : colors.warningBg;
            return (
              <View key={leave._id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text, textTransform: 'capitalize' }}>{leave.leaveType} Leave</Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{leave.startDate} → {leave.endDate}</Text>
                </View>
                <View style={{ backgroundColor: lBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: lColor, textTransform: 'uppercase' }}>{leave.status}</Text>
                </View>
              </View>
            );
          }) : (
            <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center', paddingVertical: 12 }}>No leave requests yet</Text>
          )}
        </GlassCard>

        {/* About Card */}
        <GlassCard style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>About</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 15, color: colors.text }}>AttendPay</Text>
            <Text style={{ fontSize: 14, color: colors.textTertiary }}>v1.0.0</Text>
          </View>
        </GlassCard>

        {/* Sign Out */}
        <TouchableOpacity
          onPress={async () => {
            const doSignOut = async () => {
              // Clear session ID so next login generates a fresh one
              if (typeof sessionStorage !== 'undefined') { sessionStorage.removeItem('app_session_id'); }
              try { await signOut(); } catch (e) { console.log('Sign out error', e); }
            };
            if (Platform.OS === 'web') {
              if ((globalThis as any).confirm('Are you sure you want to sign out?')) {
                await doSignOut();
              }
            } else {
              Alert.alert('Sign Out', 'Are you sure?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign Out', style: 'destructive', onPress: doSignOut },
              ]);
            }
          }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, marginTop: 8, backgroundColor: 'rgba(229,57,53,0.08)', borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.dangerGlow }}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.danger }}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={showEditModal} animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <LinearGradient colors={gradients.background as any} style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>Edit Profile</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <GlassInput label="First Name" value={firstName} onChangeText={setFirstName} placeholder="First name" />
              <GlassInput label="Last Name" value={lastName} onChangeText={setLastName} placeholder="Last name" />
              <GlassInput label="Phone Number" value={phone} onChangeText={setPhone} placeholder="+91 00000 00000" keyboardType="phone-pad" />
              <GlassButton title={saving ? 'Saving...' : 'Save Changes'} onPress={handleSaveProfile} style={{ marginTop: 20 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </LinearGradient>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={showPasswordModal} animationType="slide" onRequestClose={() => setShowPasswordModal(false)}>
        <LinearGradient colors={gradients.background as any} style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>Change Password</Text>
                <TouchableOpacity onPress={() => setShowPasswordModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <GlassInput label="Current Password" value={currentPwd} onChangeText={setCurrentPwd} secureTextEntry placeholder="Current password" />
              <GlassInput label="New Password" value={newPwd} onChangeText={setNewPwd} secureTextEntry placeholder="New password (min 8 chars)" />
              <GlassInput label="Confirm New Password" value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry placeholder="Confirm new password" />
              {pwdError ? <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 8 }}>{pwdError}</Text> : null}
              <GlassButton title={pwdSaving ? 'Updating...' : 'Update Password'} onPress={handleChangePassword} style={{ marginTop: 12 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </LinearGradient>
      </Modal>

      {/* Leave Request Modal */}
      <Modal visible={showLeaveModal} animationType="slide" onRequestClose={() => setShowLeaveModal(false)}>
        <LinearGradient colors={gradients.background as any} style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>Request Leave</Text>
                <TouchableOpacity onPress={() => setShowLeaveModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Leave Type</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {['casual', 'sick', 'annual', 'unpaid'].map(t => (
                  <TouchableOpacity key={t} onPress={() => setLeaveType(t)}
                    style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                      backgroundColor: leaveType === t ? colors.primaryLight : 'rgba(255,255,255,0.06)',
                      borderWidth: 1, borderColor: leaveType === t ? colors.primary : colors.border }}>
                    <Text style={{ fontSize: 13, color: leaveType === t ? colors.primary : colors.textSecondary, fontWeight: leaveType === t ? '600' : '400', textTransform: 'capitalize' }}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <GlassInput label="Start Date" value={leaveStart} onChangeText={setLeaveStart} placeholder="YYYY-MM-DD" />
              <GlassInput label="End Date" value={leaveEnd} onChangeText={setLeaveEnd} placeholder="YYYY-MM-DD" />
              <GlassInput label="Reason" value={leaveReason} onChangeText={setLeaveReason} placeholder="Enter reason for leave" multiline numberOfLines={3} />
              <GlassButton
                title={leaveLoading ? 'Submitting...' : 'Submit Request'}
                onPress={async () => {
                  if (!leaveStart || !leaveEnd || !leaveReason) {
                    Alert.alert('Error', 'Please fill all fields');
                    return;
                  }
                  if (!currentUser?.employeeId) {
                    Alert.alert('Error', 'Employee profile not linked. Contact admin.');
                    return;
                  }
                  setLeaveLoading(true);
                  try {
                    await requestLeaveEmp({
                      employeeId: currentUser.employeeId,
                      leaveType,
                      startDate: leaveStart,
                      endDate: leaveEnd,
                      reason: leaveReason,
                    });
                    setShowLeaveModal(false);
                    setLeaveStart(''); setLeaveEnd(''); setLeaveReason('');
                    Alert.alert('Success', 'Leave request submitted successfully');
                  } catch (e: any) {
                    Alert.alert('Error', e.message || 'Failed to submit');
                  } finally {
                    setLeaveLoading(false);
                  }
                }}
                style={{ marginTop: 20 }}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </LinearGradient>
      </Modal>
    </LinearGradient>
  );
}

export default function MoreScreen() {
  const { signOut } = useAuthActions();
  const currentUser = useQuery(api.users.getCurrentUser);
  const isSuperAdmin = currentUser?.role === 'superadmin';
  const isAdmin = isSuperAdmin || currentUser?.role === 'admin' || currentUser?.role === 'hr';
  const isEmployee = currentUser?.role === 'employee';
  const employeeId = currentUser?.employeeId;

  // Data
  const companies = useQuery(api.companies.list) || [];
  const shifts = useQuery(api.shifts.list, {}) || [];
  const holidays = useQuery(api.holidays.list, { year: new Date().getFullYear() }) || [];
  const allLeaves = useQuery(api.leaves.list, isAdmin ? {} : 'skip') || [];
  const myLeaves = useQuery(api.leaves.getMyLeaves, employeeId ? { employeeId } : 'skip') || [];
  const users = useQuery(api.users.listUsers) || [];
  const allEmployees = useQuery(api.employees.list, {}) || [];
  const departments = useQuery(api.departments.list, {}) || [];
  const positions = useQuery(api.positions.list, {}) || [];
  const payrollList = useQuery(api.payroll.getByMonth, { month: String(new Date().getMonth() + 1).padStart(2, '0'), year: new Date().getFullYear() }) || [];

  const currentMonthPrefix = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const allAttendanceExport = useQuery(api.attendance.getAllForExport, isAdmin ? { monthPrefix: currentMonthPrefix } : 'skip');

  // Mutations
  const createCompany = useMutation(api.companies.create);
  const updateCompany = useMutation(api.companies.update);
  const removeCompany = useMutation(api.companies.remove);
  const createShift = useMutation(api.shifts.create);
  const updateShift = useMutation(api.shifts.update);
  const removeShift = useMutation(api.shifts.remove);
  const deptList = useQuery(api.departments.list, {}) || [];
  const posList = useQuery(api.positions.list, {}) || [];
  const createDept = useMutation(api.departments.create);
  const updateDept = useMutation(api.departments.update);
  const removeDept = useMutation(api.departments.remove);
  const createPos = useMutation(api.positions.create);
  const updatePos = useMutation(api.positions.update);
  const removePos = useMutation(api.positions.remove);
  const createHoliday = useMutation(api.holidays.create);
  const removeHoliday = useMutation(api.holidays.remove);
  const setSharedOnlyDepts = useMutation(api.companies.setSharedOnlyDepartments);
  const approveLeave = useMutation(api.leaves.approve);
  const rejectLeave = useMutation(api.leaves.reject);
  const setUserRole = useMutation(api.users.setUserRole);
  const createUser = useMutation(api.users.createUser);
  const linkEmployee = useMutation(api.users.linkEmployee);
  const deleteUser = useMutation(api.users.deleteUser);
  const updateUser = useMutation(api.users.updateUser);
  const bulkCreateHolidays = useMutation(api.holidays.bulkCreate);
  const createLeave = useMutation(api.leaves.create);
  const triggerSync = useMutation(api.users.triggerManualSupabaseSync);

  // Section state
  const [section, setSection] = useState<string>('');
  const [showAccounting, setShowAccounting] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState('');

  // Company form
  const [compForm, setCompForm] = useState({ name: '', address: '', gstNumber: '', lateThreshold: '15', otThreshold: '8', weeklyOff: 0 });
  const [showCompForm, setShowCompForm] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);

  // Shift form
  const [shiftForm, setShiftForm] = useState({ name: '', companyIds: [] as string[], startTime: '09:00', endTime: '18:00' });
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Department form
  const [deptForm, setDeptForm] = useState({ name: '', companyId: '' });
  const [showDeptForm, setShowDeptForm] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);

  // Position form
  const [posForm, setPosForm] = useState({ name: '', departmentId: '' });
  const [showPosForm, setShowPosForm] = useState(false);
  const [editingPosId, setEditingPosId] = useState<string | null>(null);

  // Holiday form
  const [holForm, setHolForm] = useState({ name: '', date: new Date(), type: 'public', companyIds: [] as string[] });
  const [showHolForm, setShowHolForm] = useState(false);
  const [showHolDate, setShowHolDate] = useState(false);
  const [showGovHolidayModal, setShowGovHolidayModal] = useState(false);
  const [govHolidaysList, setGovHolidaysList] = useState<{ name: string; date: string; type: string; isFixed: boolean }[]>([]);
  const [selectedGovHolidays, setSelectedGovHolidays] = useState<Set<number>>(new Set());
  const [selectedGovCompanies, setSelectedGovCompanies] = useState<Set<string>>(new Set());
  const [loadingGovDates, setLoadingGovDates] = useState(false);
  const [addingGovHolidays, setAddingGovHolidays] = useState(false);
  const [holidayFilterCompany, setHolidayFilterCompany] = useState<string>('');

  // User form
  const [userForm, setUserForm] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'employee', employeeId: '', reportsTo: '' });
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState<string | null>(null);

  // Employee leave request form
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leaveType: 'casual', startDate: new Date(), endDate: new Date(), reason: '' });
  const [showLeaveStartDate, setShowLeaveStartDate] = useState(false);
  const [showLeaveEndDate, setShowLeaveEndDate] = useState(false);

  const handleCreateCompany = async () => {
    try {
      if (editingCompanyId) {
        await updateCompany({ id: editingCompanyId as any, name: compForm.name, address: compForm.address, gstNumber: compForm.gstNumber, lateThresholdMinutes: parseInt(compForm.lateThreshold) || 15, overtimeThresholdHours: parseInt(compForm.otThreshold) || 8, weeklyOffDay: compForm.weeklyOff });
      } else {
        await createCompany({ name: compForm.name, address: compForm.address, gstNumber: compForm.gstNumber, lateThresholdMinutes: parseInt(compForm.lateThreshold) || 15, overtimeThresholdHours: parseInt(compForm.otThreshold) || 8, weeklyOffDay: compForm.weeklyOff });
      }
      setShowCompForm(false); setEditingCompanyId(null);
      setCompForm({ name: '', address: '', gstNumber: '', lateThreshold: '15', otThreshold: '8', weeklyOff: 0 });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleEditCompany = (c: any) => {
    setEditingCompanyId(c._id);
    setCompForm({
      name: c.name, address: c.address || '', gstNumber: c.gstNumber || '',
      lateThreshold: String(c.lateThresholdMinutes), otThreshold: String(c.overtimeThresholdHours),
      weeklyOff: c.weeklyOffDay ?? 0,
    });
    setShowCompForm(true);
  };

  const handleCreateShift = async () => {
    if (!shiftForm.name || shiftForm.companyIds.length === 0) { Alert.alert('Error', 'Name and at least one company required'); return; }
    try {
      if (editingShiftId) {
        await updateShift({ id: editingShiftId as any, name: shiftForm.name, companyIds: shiftForm.companyIds as any, startTime: shiftForm.startTime, endTime: shiftForm.endTime });
      } else {
        await createShift({ name: shiftForm.name, companyIds: shiftForm.companyIds as any, startTime: shiftForm.startTime, endTime: shiftForm.endTime });
      }
      setShowShiftForm(false); setEditingShiftId(null);
      setShiftForm({ name: '', companyIds: [], startTime: '09:00', endTime: '18:00' });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleEditShift = (s: any) => {
    setEditingShiftId(s._id);
    setShiftForm({
      name: s.name,
      companyIds: s.companyIds || [],
      startTime: s.startTime,
      endTime: s.endTime,
    });
    setShowShiftForm(true);
  };

  // Department CRUD
  const handleSaveDept = async () => {
    if (!deptForm.name.trim()) { Alert.alert('Error', 'Department name required'); return; }
    try {
      if (editingDeptId) {
        await updateDept({ id: editingDeptId as any, name: deptForm.name.trim(), companyId: deptForm.companyId ? deptForm.companyId as any : undefined });
      } else {
        await createDept({ name: deptForm.name.trim(), companyId: deptForm.companyId ? deptForm.companyId as any : undefined });
      }
      setShowDeptForm(false); setEditingDeptId(null);
      setDeptForm({ name: '', companyId: '' });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleEditDept = (d: any) => {
    setEditingDeptId(d._id);
    setDeptForm({ name: d.name, companyId: d.companyId || '' });
    setShowDeptForm(true);
  };

  // Position CRUD
  const handleSavePos = async () => {
    if (!posForm.name.trim()) { Alert.alert('Error', 'Position name required'); return; }
    try {
      if (editingPosId) {
        await updatePos({ id: editingPosId as any, name: posForm.name.trim(), departmentId: posForm.departmentId ? posForm.departmentId as any : undefined });
      } else {
        await createPos({ name: posForm.name.trim(), departmentId: posForm.departmentId ? posForm.departmentId as any : undefined });
      }
      setShowPosForm(false); setEditingPosId(null);
      setPosForm({ name: '', departmentId: '' });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleEditPos = (p: any) => {
    setEditingPosId(p._id);
    setPosForm({ name: p.name, departmentId: p.departmentId || '' });
    setShowPosForm(true);
  };

  const handleCreateHoliday = async () => {
    if (!holForm.name) { Alert.alert('Error', 'Holiday name is required'); return; }
    try {
      const dateStr = holForm.date.toISOString().split('T')[0];
      await createHoliday({
        name: holForm.name,
        date: dateStr,
        type: holForm.type,
        companyIds: holForm.companyIds.length > 0 ? holForm.companyIds as any : undefined,
        year: holForm.date.getFullYear(),
      });
      setShowHolForm(false);
      setHolForm({ name: '', date: new Date(), type: 'public', companyIds: [] });
      Alert.alert('Success', 'Holiday added');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const openGovHolidayModal = () => {
    const year = new Date().getFullYear();
    const holidayList = INDIAN_GOV_HOLIDAYS.map(h => {
      let dateStr: string;
      if (h.fixed) {
        dateStr = `${year}-${String(h.fixed.month).padStart(2, '0')}-${String(h.fixed.day).padStart(2, '0')}`;
      } else if (h.dates && h.dates[year]) {
        dateStr = `${year}-${h.dates[year]}`;
      } else {
        // For years not in our lookup, use LLM fallback or show unknown
        dateStr = `${year}-01-01`;
      }
      return {
        name: h.name,
        date: dateStr,
        type: 'public',
        isFixed: !!h.fixed,
      };
    });

    // Check if any dates are missing (fallback to Jan 1)
    const hasMissing = holidayList.some(h => h.date.endsWith('-01-01') && !h.name.includes('Pongal') && h.name !== 'New Year');
    if (hasMissing) {
      // Fetch missing dates from LLM for unsupported years
      fetchVariableDates(year, holidayList);
    }

    setGovHolidaysList(holidayList);
    setSelectedGovHolidays(new Set());
    setSelectedGovCompanies(new Set());
    setShowGovHolidayModal(true);
  };

  const fetchVariableDates = async (year: number, currentList: { name: string; date: string; type: string; isFixed: boolean }[]) => {
    const missingHolidays = currentList.filter(h => !h.isFixed && h.date.endsWith('-01-01'));
    if (missingHolidays.length === 0) return;

    setLoadingGovDates(true);
    try {
      const resp = await fetch('https://api.a0.dev/ai/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Give exact dates for these Indian holidays in ${year}: ${missingHolidays.map(h => h.name).join(', ')}. Return YYYY-MM-DD format.` }],
          schema: {
            type: 'object',
            properties: {
              holidays: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    date: { type: 'string' },
                  },
                  required: ['name', 'date']
                }
              }
            },
            required: ['holidays']
          }
        }),
      });
      const data = await resp.json();
      if (data.schema_data?.holidays && Array.isArray(data.schema_data.holidays)) {
        const dateMap = new Map<string, string>();
        data.schema_data.holidays.forEach((h: { name: string; date: string }) => dateMap.set(h.name, h.date));
        type GovHolItem = { name: string; date: string; type: string; isFixed: boolean };
        setGovHolidaysList((prev: GovHolItem[]) =>
          prev.map((h: GovHolItem) => {
            const fetched = dateMap.get(h.name);
            if (fetched && h.date.endsWith('-01-01') && !h.isFixed) {
              return { ...h, date: fetched };
            }
            return h;
          })
        );
      }
    } catch {
      Alert.alert('Note', `Holiday dates for ${year} are approximate. 2025 and 2026 dates are from the official gazette.`);
    }
    setLoadingGovDates(false);
  };

  const toggleGovHoliday = (index: number) => {
    setSelectedGovHolidays((prev: Set<number>) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleSelectAllGovHolidays = () => {
    if (selectedGovHolidays.size === govHolidaysList.length) {
      setSelectedGovHolidays(new Set());
    } else {
      setSelectedGovHolidays(new Set(govHolidaysList.map((_: any, i: number) => i)));
    }
  };

  const toggleGovCompany = (id: string) => {
    setSelectedGovCompanies((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddSelectedGovHolidays = async () => {
    if (selectedGovHolidays.size === 0) {
      Alert.alert('Error', 'Please select at least one holiday');
      return;
    }
    const year = new Date().getFullYear();
    const selectedHols = govHolidaysList
      .filter((_: any, i: number) => selectedGovHolidays.has(i))
      .map((h: any) => ({ name: h.name, date: h.date, type: h.type, year }));
    const companyIds = Array.from(selectedGovCompanies) as any[];

    setAddingGovHolidays(true);
    try {
      const count = await bulkCreateHolidays({ holidays: selectedHols, companyIds });
      setShowGovHolidayModal(false);
      Alert.alert('Success', `${count} holiday${count !== 1 ? 's' : ''} added successfully`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setAddingGovHolidays(false);
  };

  const toggleShiftCompany = (id: string) => {
    setShiftForm((prev: any) => ({
      ...prev,
      companyIds: prev.companyIds.includes(id)
        ? prev.companyIds.filter((c: string) => c !== id)
        : [...prev.companyIds, id],
    }));
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    Alert.alert('Delete User', `Delete ${email}?`, [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteUser({ userId: userId as any }) },
    ]);
  };

  const handleCreateUser = async () => {
    if (!userForm.email) {
      Alert.alert('Error', 'Email is required');
      return;
    }

    // If editing, update the user
    if (editingUserId) {
      try {
        await updateUser({
          userId: editingUserId as any,
          firstName: userForm.firstName.trim() || undefined,
          lastName: userForm.lastName.trim() || undefined,
          role: userForm.role,
          employeeId: userForm.employeeId ? userForm.employeeId as any : undefined,
          reportsTo: userForm.reportsTo ? userForm.reportsTo as any : undefined,
          clearReportsTo: !userForm.reportsTo ? true : undefined,
        });
        Alert.alert('Success', 'User updated successfully');
        setShowUserForm(false);
        setEditingUserId(null);
        setUserForm({ firstName: '', lastName: '', email: '', password: '', role: 'employee', employeeId: '', reportsTo: '' });
      } catch (e: any) {
        Alert.alert('Error', e.message);
      }
      return;
    }

    // Creating new user - password required
    if (!userForm.password) {
      Alert.alert('Error', 'Password is required');
      return;
    }
    try {
      await createUser({
        email: userForm.email,
        firstName: userForm.firstName.trim() || undefined,
        lastName: userForm.lastName ? userForm.lastName.trim() : undefined,
        role: userForm.role,
        password: userForm.password,
        employeeId: userForm.employeeId ? userForm.employeeId as any : undefined,
        reportsTo: userForm.reportsTo ? userForm.reportsTo as any : undefined,
      });
      Alert.alert(
        'User Created',
        `Account created for ${userForm.email}.\n\nCredentials:\nEmail: ${userForm.email}\nPassword: ${userForm.password}\n\nThe user can now sign in directly with these credentials.`,
        [{ text: 'OK' }]
      );
      setShowUserForm(false);
      setEditingUserId(null);
      setUserForm({ firstName: '', lastName: '', email: '', password: '', role: 'employee', employeeId: '', reportsTo: '' });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleEditUser = (u: any) => {
    setEditingUserId(u._id);
    setUserForm({
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      email: u.email || '',
      password: '', // Don't show password - it can't be changed from here
      role: u.role || 'employee',
      employeeId: u.employeeId || '',
      reportsTo: u.reportsTo || '',
    });
    setShowUserForm(true);
  };

  const handleLinkEmployee = async (userId: string, employeeId: string) => {
    try {
      await linkEmployee({ userId: userId as any, employeeId: employeeId as any });
      setShowLinkModal(null);
      Alert.alert('Success', 'Employee linked to user account');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleRequestLeave = async () => {
    if (!employeeId) { Alert.alert('Error', 'Your account is not linked to an employee profile'); return; }
    if (!leaveForm.reason.trim()) { Alert.alert('Error', 'Please enter a reason for leave'); return; }
    try {
      await createLeave({
        employeeId,
        leaveType: leaveForm.leaveType,
        startDate: leaveForm.startDate.toISOString().split('T')[0],
        endDate: leaveForm.endDate.toISOString().split('T')[0],
        reason: leaveForm.reason.trim(),
      });
      setShowLeaveForm(false);
      setLeaveForm({ leaveType: 'casual', startDate: new Date(), endDate: new Date(), reason: '' });
      Alert.alert('Success', 'Leave request submitted. You will be notified once it is approved or declined.');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleExport = async (type: string) => {
    setExporting(type);
    try {
      let csvContent = '';
      let filename = '';
      let successMsg = '';

      if (type === 'employees') {
        filename = 'employees.csv';
        successMsg = `Exported ${(allEmployees || []).length} employees`;
        const headers = 'employee_code,first_name,last_name,email,department,position,company_name,shift_name,salary_type,salary_rate,bank_name,bank_account,ifsc_code,aadhar_number,status';
        const rows = (allEmployees || []).map((e: any) =>
          [
            `"${e.employeeId || ''}"`,
            `"${e.firstName || ''}"`,
            `"${e.lastName || ''}"`,
            `"${e.email || ''}"`,
            `"${e.department || ''}"`,
            `"${e.position || ''}"`,
            `"${e.companyName || ''}"`,
            `"${e.shiftName || ''}"`,
            `"${e.salaryType || ''}"`,
            `"${e.salaryRate || 0}"`,
            `"${e.bankName || ''}"`,
            `"${e.bankAccountNumber || ''}"`,
            `"${e.bankIfscCode || ''}"`,
            `"${e.aadharNumber || ''}"`,
            `"${e.status || ''}"`,
          ].join(',')
        );
        csvContent = [headers, ...rows].join('\n');
      }

      if (type === 'attendance') {
        filename = `attendance_${currentMonthPrefix}.csv`;
        successMsg = `Exported ${(allAttendanceExport || []).length} attendance records`;
        const headers = 'employee_name,employee_email,department,date,check_in_time,check_out_time,status,hours_worked,notes';
        const rows = (allAttendanceExport || []).map((a: any) =>
          [
            `"${a.employeeName || ''}"`,
            `"${a.employeeEmail || ''}"`,
            `"${a.department || ''}"`,
            `"${a.date || ''}"`,
            `"${a.checkInTime || ''}"`,
            `"${a.checkOutTime || ''}"`,
            `"${a.status || ''}"`,
            `"${a.hoursWorked || ''}"`,
            `"${(a.notes || '').replace(/"/g, "'")}"`,
          ].join(',')
        );
        csvContent = [headers, ...rows].join('\n');
      }

      if (type === 'leaves') {
        filename = 'leave_requests.csv';
        successMsg = `Exported ${(allLeaves || []).length} leave requests`;
        const headers = 'employee_name,leave_type,start_date,end_date,reason,status';
        const rows = (allLeaves || []).map((l: any) =>
          [
            `"${l.employeeName || l.employeeId || ''}"`,
            `"${l.leaveType || ''}"`,
            `"${l.startDate || ''}"`,
            `"${l.endDate || ''}"`,
            `"${(l.reason || '').replace(/"/g, "'")}"`,
            `"${l.status || ''}"`,
          ].join(',')
        );
        csvContent = [headers, ...rows].join('\n');
      }

      if (type === 'payroll') {
        filename = 'payroll.csv';
        successMsg = `Exported ${(payrollList || []).length} payroll records`;
        const headers = 'employee_name,month,year,base_salary,days_worked,total_days,overtime_pay,deductions,bonus,net_salary,status,paid_date';
        const rows = (payrollList || []).map((p: any) =>
          [
            `"${p.employeeName || p.employeeId || ''}"`,
            `"${p.month || ''}"`,
            `"${p.year || ''}"`,
            `"${p.baseSalary || 0}"`,
            `"${p.daysWorked || 0}"`,
            `"${p.totalDays || 0}"`,
            `"${p.overtimePay || 0}"`,
            `"${p.deductions || 0}"`,
            `"${p.bonus || 0}"`,
            `"${p.netSalary || 0}"`,
            `"${p.status || ''}"`,
            `"${p.paidDate || ''}"`,
          ].join(',')
        );
        csvContent = [headers, ...rows].join('\n');
      }

      if (!csvContent) {
        Alert.alert('No Data', 'No data available to export');
        setExporting('');
        return;
      }

      if (Platform.OS === 'web') {
        const blob = new Blob(['\uFEFF' + csvContent], {
          type: 'text/csv;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        Alert.alert('✓ Export Success', successMsg);
      } else {
        try {
          const FileSystem = await import('expo-file-system/legacy');
          const Sharing = await import('expo-sharing');
          const fileUri = `${FileSystem.documentDirectory}${filename}`;
          await FileSystem.writeAsStringAsync(fileUri, '\uFEFF' + csvContent, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'text/csv',
              dialogTitle: `Export ${filename}`,
              UTI: 'public.comma-separated-values-text',
            });
          } else {
            await Share.share({ message: csvContent, title: filename });
          }
        } catch {
          await Share.share({ message: csvContent, title: filename });
        }
      }
    } catch (e: any) {
      Alert.alert('Export Failed', e.message || 'Could not export data');
    } finally {
      setExporting('');
    }
  };

  const pendingLeaves = allLeaves.filter((l: any) => l.status === 'pending');

  const MenuButton = ({ icon, label, key2, count }: any) => (
    <TouchableOpacity style={[styles.menuBtn, section === key2 && styles.menuBtnActive]} onPress={() => setSection(section === key2 ? '' : key2)}>
      <Ionicons name={icon} size={20} color={section === key2 ? colors.primary : colors.textSecondary} />
      <Text style={[styles.menuLabel, section === key2 && { color: colors.primary }]}>{label}</Text>
      {count ? <View style={styles.badge}><Text style={styles.badgeText}>{count}</Text></View> : null}
      <Ionicons name={section === key2 ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );

  if (!isAdmin && currentUser !== undefined) {
    return <EmployeeSettings currentUser={currentUser} />;
  }

  return (
    <LinearGradient colors={gradients.background as any} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{isEmployee ? 'My Settings' : 'Settings'}</Text>

        {/* Admin-only sections */}
        {isAdmin && (
          <>
            {/* Companies */}
            <MenuButton icon="business" label="Companies" key2="companies" count={companies.length} />
            {section === 'companies' && (
              <View style={styles.sectionContent}>
                {isAdmin && <GlassButton title="Add Company" onPress={() => setShowCompForm(true)} small style={{ marginBottom: 12 }} />}
                {companies.map((c: any) => (
                  <GlassCard key={c._id} style={styles.itemCard}>
                    <View style={styles.itemRow}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{c.name}</Text>
                        {c.address ? <Text style={styles.itemSub}>{c.address}</Text> : null}
                        {c.gstNumber ? <Text style={styles.itemSub}>GST: {c.gstNumber}</Text> : null}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                        {isAdmin && (
                          <TouchableOpacity onPress={() => handleEditCompany(c)}>
                            <Ionicons name="create-outline" size={18} color={colors.primary} />
                          </TouchableOpacity>
                        )}
                        {isAdmin && (
                          <TouchableOpacity onPress={() => { Alert.alert('Delete', `Delete ${c.name}?`, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => removeCompany({ id: c._id }) }]); }}>
                            <Ionicons name="trash" size={18} color={colors.danger} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    <View style={styles.compactRow}>
                      <View style={styles.compactItem}><Text style={styles.compactLabel}>Late</Text><Text style={styles.compactValue}>{c.lateThresholdMinutes}m</Text></View>
                      <View style={styles.compactItem}><Text style={styles.compactLabel}>OT</Text><Text style={styles.compactValue}>{c.overtimeThresholdHours}h</Text></View>
                      <View style={styles.compactItem}><Text style={styles.compactLabel}>Off</Text><Text style={styles.compactValue}>{DAYS[c.weeklyOffDay ?? 0]?.slice(0,3)}</Text></View>
                    </View>

                    {/* Shared-Account-Only Department Restrictions */}
                    {isAdmin && deptList.length > 0 && (
                      <View style={styles.sharedOnlySection}>
                        <View style={styles.sharedOnlyHeader}>
                          <Ionicons name="phone-portrait-outline" size={14} color="#FF9800" />
                          <Text style={styles.sharedOnlyTitle}>Attendance Method per Department</Text>
                        </View>
                        <Text style={styles.sharedOnlySubtitle}>
                          Toggle departments that must use the shared kiosk device only. Employees in these departments cannot self-mark on their own profile.
                        </Text>
                        {deptList
                          .filter((d: any) => !d.companyId || d.companyId === c._id)
                          .map((dept: any) => {
                            const restrictedDepts: string[] = c.sharedAccountOnlyDepartments || [];
                            const isRestricted = restrictedDepts.some(
                              (r: string) => r.toLowerCase().trim() === (dept.name || '').toLowerCase().trim()
                            );
                            return (
                              <TouchableOpacity
                                key={dept._id}
                                onPress={async () => {
                                  const current: string[] = c.sharedAccountOnlyDepartments || [];
                                  const updated = isRestricted
                                    ? current.filter((d: string) => d.toLowerCase().trim() !== (dept.name || '').toLowerCase().trim())
                                    : [...current, dept.name];
                                  try {
                                    await setSharedOnlyDepts({ companyId: c._id, departments: updated });
                                  } catch (e: any) {
                                    Alert.alert('Error', e.message);
                                  }
                                }}
                                style={[
                                  styles.deptToggleRow,
                                  isRestricted && styles.deptToggleRowActive,
                                ]}
                                activeOpacity={0.7}
                              >
                                <View style={styles.deptToggleLeft}>
                                  <View style={[styles.deptToggleDot, isRestricted && styles.deptToggleDotActive]} />
                                  <Text style={[styles.deptToggleName, isRestricted && styles.deptToggleNameActive]}>
                                    {dept.name}
                                  </Text>
                                </View>
                                <View style={[styles.deptTogglePill, isRestricted && styles.deptTogglePillActive]}>
                                  <Ionicons
                                    name={isRestricted ? 'phone-portrait' : 'person-outline'}
                                    size={12}
                                    color={isRestricted ? '#FF9800' : colors.textTertiary}
                                  />
                                  <Text style={[styles.deptTogglePillText, isRestricted && styles.deptTogglePillTextActive]}>
                                    {isRestricted ? 'Kiosk only' : 'Self-mark OK'}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            );
                        })}
                      </View>
                    )}
                  </GlassCard>
                ))}
              </View>
            )}

            {/* Admin-only: Shifts */}
            <MenuButton icon="time" label="Shift Timings" key2="shifts" count={shifts.length} />
            {section === 'shifts' && (
              <View style={styles.sectionContent}>
                {isAdmin && <GlassButton title="Add Shift" onPress={() => { setEditingShiftId(null); setShiftForm({ name: '', companyIds: [], startTime: '09:00', endTime: '18:00' }); setShowShiftForm(true); }} small style={{ marginBottom: 12 }} />}
                {shifts.map((s: any) => (
                  <GlassCard key={s._id} style={styles.itemCard}>
                    <View style={styles.itemRow}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{s.name}</Text>
                        <Text style={styles.itemSub}>{s.startTime} - {s.endTime}</Text>
                        {s.companyNames && <Text style={styles.itemSub}>{s.companyNames.join(', ')}</Text>}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                        {isAdmin && (
                          <TouchableOpacity onPress={() => handleEditShift(s)}>
                            <Ionicons name="create-outline" size={18} color={colors.primary} />
                          </TouchableOpacity>
                        )}
                        {isAdmin && (
                          <TouchableOpacity onPress={() => { Alert.alert('Delete', `Delete ${s.name}?`, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => removeShift({ id: s._id }) }]); }}>
                            <Ionicons name="trash" size={18} color={colors.danger} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </GlassCard>
                ))}
              </View>
            )}

            {/* Departments */}
            <MenuButton icon="layers" label="Departments" key2="departments" count={deptList.length} />
            {section === 'departments' && (
              <View style={styles.sectionContent}>
                <GlassButton title="Add Department" onPress={() => { setEditingDeptId(null); setDeptForm({ name: '', companyId: '' }); setShowDeptForm(true); }} small style={{ marginBottom: 12 }} />
                {deptList.map((d: any) => (
                  <GlassCard key={d._id} style={styles.itemCard}>
                    <View style={styles.itemRow}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{d.name}</Text>
                        {d.companyName && <Text style={styles.itemSub}>{d.companyName}</Text>}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                        <TouchableOpacity onPress={() => handleEditDept(d)}>
                          <Ionicons name="create-outline" size={18} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => Alert.alert('Delete', `Delete ${d.name}?`, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => removeDept({ id: d._id }) }])}>
                          <Ionicons name="trash" size={18} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </GlassCard>
                ))}
              </View>
            )}

            {/* Positions */}
            <MenuButton icon="briefcase" label="Positions" key2="positions" count={posList.length} />
            {section === 'positions' && (
              <View style={styles.sectionContent}>
                <GlassButton title="Add Position" onPress={() => { setEditingPosId(null); setPosForm({ name: '', departmentId: '' }); setShowPosForm(true); }} small style={{ marginBottom: 12 }} />
                {posList.map((p: any) => (
                  <GlassCard key={p._id} style={styles.itemCard}>
                    <View style={styles.itemRow}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{p.name}</Text>
                        {p.departmentName && <Text style={styles.itemSub}>{p.departmentName}</Text>}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                        <TouchableOpacity onPress={() => handleEditPos(p)}>
                          <Ionicons name="create-outline" size={18} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => Alert.alert('Delete', `Delete ${p.name}?`, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => removePos({ id: p._id }) }])}>
                          <Ionicons name="trash" size={18} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </GlassCard>
                ))}
              </View>
            )}

            {/* Admin-only: Holidays */}
            <MenuButton icon="calendar" label="Holidays" key2="holidays" count={holidays.length} />
            {section === 'holidays' && (() => {
              // Group holidays by name+date, merging company names
              const filtered = holidayFilterCompany
                ? holidays.filter((h: any) => h.companyId === holidayFilterCompany)
                : holidays;
              const grouped = new Map<string, { name: string; date: string; type: string; companies: string[]; ids: string[] }>();
              for (const h of filtered as any[]) {
                const key = `${h.name}|${h.date}`;
                const existing = grouped.get(key);
                if (existing) {
                  if (h.companyName && !existing.companies.includes(h.companyName)) {
                    existing.companies.push(h.companyName);
                  }
                  existing.ids.push(h._id);
                } else {
                  grouped.set(key, {
                    name: h.name,
                    date: h.date,
                    type: h.type,
                    companies: h.companyName ? [h.companyName] : [],
                    ids: [h._id],
                  });
                }
              }
              const groupedList = Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date));

              return (
                <View style={styles.sectionContent}>
                  {isAdmin && (
                    <View style={styles.holActions}>
                      <GlassButton title="Add Holiday" onPress={() => setShowHolForm(true)} small />
                      <GlassButton title="Fetch Govt Holidays" variant="secondary" onPress={openGovHolidayModal} small />
                    </View>
                  )}

                  {/* Company Filter */}
                  <Text style={styles.fieldLabel}>Filter by Company</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={[styles.dayChip, !holidayFilterCompany && styles.dayChipActive]}
                        onPress={() => setHolidayFilterCompany('')}
                      >
                        <Text style={[styles.dayText, !holidayFilterCompany && styles.dayTextActive]}>All</Text>
                      </TouchableOpacity>
                      {companies.map((c: any) => (
                        <TouchableOpacity
                          key={c._id}
                          style={[styles.dayChip, holidayFilterCompany === c._id && styles.dayChipActive]}
                          onPress={() => setHolidayFilterCompany(holidayFilterCompany === c._id ? '' : c._id)}
                        >
                          <Text style={[styles.dayText, holidayFilterCompany === c._id && styles.dayTextActive]}>{c.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  {groupedList.length === 0 && <Text style={styles.emptyText}>No holidays found</Text>}
                  {groupedList.map((g) => (
                    <View key={`${g.name}-${g.date}`} style={styles.holItem}>
                      <View style={styles.holInfo}>
                        <Text style={styles.holName}>{g.name}</Text>
                        <Text style={styles.holDate}>
                          {formatDate(g.date)} • {g.type}
                        </Text>
                        <Text style={[styles.holDate, { color: colors.primary, marginTop: 2 }]}>
                          {g.companies.length > 0 ? g.companies.join(', ') : 'All Companies'}
                        </Text>
                      </View>
                      {isAdmin && (
                        <TouchableOpacity onPress={() => {
                          Alert.alert('Delete Holiday', `Delete "${g.name}" for ${g.companies.length > 0 ? g.companies.join(', ') : 'all companies'}?`, [
                            { text: 'Cancel' },
                            { text: 'Delete', style: 'destructive', onPress: async () => {
                              for (const id of g.ids) {
                                await removeHoliday({ id: id as any });
                              }
                            }},
                          ]);
                        }}>
                          <Ionicons name="trash" size={16} color={colors.danger} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              );
            })()}
            {/* User Management (Super Admin or Admin) */}
            {isAdmin && (
              <>
                <MenuButton icon="shield" label="User Management" key2="users" count={users.length} />
                {section === 'users' && (
                  <View style={styles.sectionContent}>
                    <GlassButton title="Add User" onPress={() => { setEditingUserId(null); setUserForm({ firstName: '', lastName: '', email: '', password: '', role: 'employee', employeeId: '', reportsTo: '' }); setShowUserForm(true); }} small style={{ marginBottom: 12 }} />
                    {users.map((u: any) => (
                      <GlassCard key={u._id} style={styles.itemCard}>
                        <View style={styles.itemRow}>
                          <View style={styles.itemInfo}>
                            <Text style={styles.itemName}>{u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : u.email || 'Unknown'}</Text>
                            <Text style={styles.itemSub}>{u.email} • {u.role || 'no role'}</Text>
                            {u.createdAt && <Text style={styles.itemSub}>Created: {new Date(u.createdAt).toLocaleDateString('en-IN')} at {new Date(u.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text>}
                            {u.employeeId && <Text style={[styles.itemSub, { color: colors.success }]}>Linked to employee</Text>}
                            {u.reportsToName && <Text style={[styles.itemSub, { color: colors.primary }]}>Reports to: {u.reportsToName}</Text>}
                          </View>
                          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                            <TouchableOpacity onPress={() => handleEditUser(u)} style={styles.roleBtn}>
                              <Ionicons name="create-outline" size={14} color={colors.primary} />
                            </TouchableOpacity>
                            {!u.employeeId && (
                              <TouchableOpacity onPress={() => setShowLinkModal(u._id)} style={styles.roleBtn}>
                                <Text style={styles.roleBtnText}>Link</Text>
                              </TouchableOpacity>
                            )}
                            {isSuperAdmin && u._id !== currentUser?._id && (
                              <TouchableOpacity onPress={() => handleDeleteUser(u._id, u.email)}>
                                <Ionicons name="trash" size={16} color={colors.danger} />
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </GlassCard>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* Device Management & Shared Accounts Configuration */}
            {isAdmin && (
              <>
                <MenuButton icon="hardware-chip-outline" label="Device Management" key2="devices" count={0} />
                {section === 'devices' && (
                  <View style={styles.sectionContent}>
                    <DeviceManagementScreen companyId={companies && companies.length > 0 ? companies[0]._id : ''} />
                  </View>
                )}
              </>
            )}

            {/* Accounting Section */}
            {isAdmin && (
              <>
                <TouchableOpacity style={[styles.menuBtn, showAccounting && styles.menuBtnActive]} onPress={() => setShowAccounting(!showAccounting)}>
                  <Ionicons name="calculator-outline" size={20} color={showAccounting ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.menuLabel, showAccounting && { color: colors.primary }]}>Accounting</Text>
                  <Ionicons name={showAccounting ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
                </TouchableOpacity>
                {showAccounting && (
                  <View style={styles.sectionContent}>
                    <GlassCard style={{ marginBottom: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 12 }}>Monthly Summary</Text>
                      {allEmployees?.map((emp: any) => {
                        const empPayroll = payrollList?.find((p: any) => p.employeeId === emp._id);
                        return (
                          <View key={emp._id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>{emp.firstName} {emp.lastName || ''}</Text>
                              <Text style={{ fontSize: 12, color: colors.textSecondary }}>{emp.department}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
                                ₹{(empPayroll?.netSalary || emp.salaryRate || 0).toLocaleString('en-IN')}
                              </Text>
                              <View style={{ backgroundColor: empPayroll?.status === 'paid' ? colors.successBg : colors.warningBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 4 }}>
                                <Text style={{ fontSize: 10, fontWeight: '600', color: empPayroll?.status === 'paid' ? colors.success : colors.warning }}>
                                  {empPayroll?.status?.toUpperCase() || 'PENDING'}
                                </Text>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </GlassCard>
                    <GlassCard>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Total Payroll This Month</Text>
                      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.primary }}>
                        ₹{(allEmployees?.reduce((sum: number, emp: any) => {
                          const pr = payrollList?.find((p: any) => p.employeeId === emp._id);
                          return sum + (pr?.netSalary || emp.salaryRate || 0);
                        }, 0) || 0).toLocaleString('en-IN')}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>
                        {allEmployees?.length || 0} employees
                      </Text>
                    </GlassCard>
                  </View>
                )}
              </>
            )}

            {/* Export Data Section — Admin only */}
            {isAdmin && (
              <>
                <TouchableOpacity
                  style={[styles.menuBtn, showExport && styles.menuBtnActive]}
                  onPress={() => setShowExport(!showExport)}>
                  <Ionicons name="download-outline" size={20} color={showExport ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.menuLabel, showExport && { color: colors.primary }]}>Export Data</Text>
                  <Ionicons name={showExport ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
                </TouchableOpacity>
                {showExport && (
                  <View style={styles.sectionContent}>
                    <GlassCard>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>
                        Download as CSV — import into Excel or Google Sheets
                      </Text>
                      {[
                        { key: 'employees', label: 'Export Employees', subtitle: `${(allEmployees || []).length} records`, icon: 'people-outline', color: colors.primary },
                        { key: 'attendance', label: 'Export Attendance', subtitle: `Current month (${currentMonthPrefix})`, icon: 'scan-outline', color: colors.success },
                        { key: 'leaves', label: 'Export Leave Requests', subtitle: `${(allLeaves || []).length} records`, icon: 'document-text-outline', color: colors.warning },
                        { key: 'payroll', label: 'Export Payroll', subtitle: `${(payrollList || []).length} records`, icon: 'wallet-outline', color: colors.danger },
                      ].map(item => (
                        <TouchableOpacity
                          key={item.key}
                          onPress={() => handleExport(item.key)}
                          disabled={!!exporting}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${item.color}20`, alignItems: 'center', justifyContent: 'center' }}>
                            {exporting === item.key ? (
                              <ActivityIndicator size="small" color={item.color} />
                            ) : (
                              <Ionicons name={item.icon as any} size={18} color={item.color} />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text }}>{item.label}</Text>
                            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                              {exporting === item.key ? 'Exporting...' : item.subtitle}
                            </Text>
                          </View>
                          <Ionicons name="download-outline" size={18} color={colors.textTertiary} />
                        </TouchableOpacity>
                      ))}
                      <View style={{ marginTop: 12, padding: 12, backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: borderRadius.md, borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)' }}>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                          <Ionicons name="information-circle" size={16} color={colors.primary} />
                          <Text style={{ flex: 1, fontSize: 12, color: colors.primary, lineHeight: 18 }}>
                            CSV files can be opened in Excel, Google Sheets, or imported into any database
                          </Text>
                        </View>
                      </View>

                      <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: 16 }}>
                        <Text style={{
                          fontSize: 12,
                          color: colors.textSecondary,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          marginBottom: 10,
                        }}>
                          Supabase Live Sync
                        </Text>

                        <TouchableOpacity
                          onPress={async () => {
                            setSyncLoading(true);
                            setSyncDone(false);
                            try {
                              await triggerSync();
                              const now = new Date().toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true,
                              });
                              setLastSyncTime(now);
                              setSyncDone(true);
                              Alert.alert(
                                '✓ Sync Triggered',
                                'Supabase sync started on server.\n\nAll data will be updated in Supabase within 1-2 minutes.\n\nCheck Supabase Table Editor to verify.'
                              );
                            } catch (e: any) {
                              Alert.alert('Sync Error', e.message || 'Could not trigger sync');
                            } finally {
                              setSyncLoading(false);
                            }
                          }}
                          disabled={syncLoading}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                            paddingVertical: 14,
                            borderRadius: borderRadius.md,
                            backgroundColor: syncDone
                              ? colors.successBg
                              : colors.primaryLight,
                            borderWidth: 1,
                            borderColor: syncDone ? colors.success : colors.primary,
                          }}>
                          {syncLoading ? (
                            <>
                              <ActivityIndicator size="small" color={colors.primary} />
                              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>
                                Triggering Sync...
                              </Text>
                            </>
                          ) : syncDone ? (
                            <>
                              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.success }}>
                                Sync Triggered
                              </Text>
                            </>
                          ) : (
                            <>
                              <Ionicons name="sync-outline" size={20} color={colors.primary} />
                              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>
                                Sync Now to Supabase
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>

                        {lastSyncTime ? (
                          <Text style={{
                            fontSize: 11,
                            color: colors.success,
                            textAlign: 'center',
                            marginTop: 6,
                          }}>
                            ✓ Last triggered at {lastSyncTime}
                          </Text>
                        ) : null}

                        <Text style={{
                          fontSize: 11,
                          color: colors.textTertiary,
                          textAlign: 'center',
                          marginTop: 6,
                        }}>
                          Auto-syncs every night at 12:00 AM and every 6 hours
                        </Text>
                      </View>
                    </GlassCard>
                  </View>
                )}
              </>
            )}
          </>
        )}

        {/* Leave Requests - visible to both admin and employees */}
        <MenuButton icon="document-text" label="Leave Requests" key2="leaves" count={isAdmin ? pendingLeaves.length : (myLeaves.filter((l: any) => l.status === 'pending').length)} />
        {section === 'leaves' && (
          <View style={styles.sectionContent}>
            {/* Employee: show own leave requests + request button */}
            {isEmployee && (
              <>
                <GlassButton title="Request Leave" onPress={() => setShowLeaveForm(true)} small style={{ marginBottom: 12 }} />
                {myLeaves.length === 0 && <Text style={styles.emptyText}>No leave requests yet</Text>}
                {myLeaves.map((l: any) => (
                  <GlassCard key={l._id} style={styles.itemCard}>
                    <View style={styles.leaveRow}>
                      <View style={styles.leaveInfo}>
                        <Text style={styles.itemName}>{l.employeeName || 'Me'}</Text>
                        <Text style={styles.itemSub}>{l.leaveType} • {formatDate(l.startDate)} → {formatDate(l.endDate)}</Text>
                        <Text style={styles.itemSub}>{l.reason}</Text>
                        {l.status !== 'pending' && l.approvedByName && (
                          <Text style={[styles.itemSub, { color: l.status === 'approved' ? colors.success : colors.danger, marginTop: 4 }]}>
                            {l.status === 'approved' ? 'Approved' : 'Declined'} by {l.approvedByName}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.leaveStatus, { backgroundColor: l.status === 'approved' ? colors.successBg : l.status === 'rejected' ? colors.dangerBg : colors.warningBg }]}>
                        <Text style={[styles.leaveStatusText, { color: l.status === 'approved' ? colors.success : l.status === 'rejected' ? colors.danger : colors.warning }]}>
                          {l.status === 'approved' ? 'Approved' : l.status === 'rejected' ? 'Declined' : 'Pending'}
                        </Text>
                      </View>
                    </View>
                  </GlassCard>
                ))}
              </>
            )}
            {/* Admin: show all leave requests with approve/reject */}
            {isAdmin && (
              <>
                {allLeaves.length === 0 && <Text style={styles.emptyText}>No leave requests</Text>}
                {allLeaves.map((l: any) => (
                  <GlassCard key={l._id} style={styles.itemCard}>
                    <View style={styles.leaveRow}>
                      <View style={styles.leaveInfo}>
                        <Text style={styles.itemName}>{l.employeeName || 'Employee'}</Text>
                        <Text style={styles.itemSub}>{l.leaveType} • {formatDate(l.startDate)} → {formatDate(l.endDate)}</Text>
                        <Text style={styles.itemSub}>{l.reason}</Text>
                        {l.status !== 'pending' && l.approvedByName && (
                          <Text style={[styles.itemSub, { color: l.status === 'approved' ? colors.success : colors.danger, marginTop: 4 }]}>
                            {l.status === 'approved' ? 'Approved' : 'Declined'} by {l.approvedByName}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.leaveStatus, { backgroundColor: l.status === 'approved' ? colors.successBg : l.status === 'rejected' ? colors.dangerBg : colors.warningBg }]}>
                        <Text style={[styles.leaveStatusText, { color: l.status === 'approved' ? colors.success : l.status === 'rejected' ? colors.danger : colors.warning }]}>
                          {l.status === 'approved' ? 'Approved' : l.status === 'rejected' ? 'Declined' : 'Pending'}
                        </Text>
                      </View>
                    </View>
                    {l.status === 'pending' && isAdmin && (
                      <View style={styles.leaveActions}>
                        <GlassButton title="Approve" onPress={() => approveLeave({ id: l._id })} small />
                        <GlassButton title="Decline" variant="danger" onPress={() => rejectLeave({ id: l._id })} small />
                      </View>
                    )}
                  </GlassCard>
                ))}
              </>
            )}
          </View>
        )}

        {/* Sign Out */}
        <TouchableOpacity
          onPress={async () => {
            const doSignOut = async () => {
              // Clear session ID so next login generates a fresh one
              if (typeof sessionStorage !== 'undefined') { sessionStorage.removeItem('app_session_id'); }
              try { await signOut(); } catch (e) { console.log('Sign out error', e); }
            };
            if (Platform.OS === 'web') {
              if ((globalThis as any).confirm('Are you sure you want to sign out?')) {
                await doSignOut();
              }
            } else {
              Alert.alert('Sign Out', 'Are you sure?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign Out', style: 'destructive', onPress: doSignOut },
              ]);
            }
          }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, marginTop: 8, backgroundColor: 'rgba(229,57,53,0.08)', borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.dangerGlow }}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.danger }}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Company Form Modal */}
      <Modal visible={showCompForm} animationType="slide" onRequestClose={() => setShowCompForm(false)}>
        <LinearGradient colors={gradients.background as any} style={styles.container}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.formScroll}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>{editingCompanyId ? 'Edit Company' : 'Add Company'}</Text>
                <TouchableOpacity onPress={() => setShowCompForm(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
              </View>
              <GlassInput label="Company Name *" value={compForm.name} onChangeText={(v: string) => setCompForm({...compForm, name: v})} />
              <GlassInput label="Address" value={compForm.address} onChangeText={(v: string) => setCompForm({...compForm, address: v})} multiline />
              <GlassInput label="GST Number" value={compForm.gstNumber} onChangeText={(v: string) => setCompForm({...compForm, gstNumber: v})} />
              <View style={styles.compactFormRow}>
                <View style={styles.compactFormItem}>
                  <GlassInput label="Late Threshold (min)" value={compForm.lateThreshold} onChangeText={(v: string) => setCompForm({...compForm, lateThreshold: v})} keyboardType="numeric" />
                </View>
                <View style={styles.compactFormItem}>
                  <GlassInput label="OT Threshold (hrs)" value={compForm.otThreshold} onChangeText={(v: string) => setCompForm({...compForm, otThreshold: v})} keyboardType="numeric" />
                </View>
              </View>
              <Text style={styles.fieldLabel}>Weekly Off Day</Text>
              <View style={styles.daysRow}>
                {DAYS.map((d, i) => (
                  <TouchableOpacity key={d} style={[styles.dayChip, compForm.weeklyOff === i && styles.dayChipActive]} onPress={() => setCompForm({...compForm, weeklyOff: i})}>
                    <Text style={[styles.dayText, compForm.weeklyOff === i && styles.dayTextActive]}>{d.slice(0,3)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <GlassButton title={editingCompanyId ? 'Update Company' : 'Save Company'} onPress={handleCreateCompany} style={{ marginTop: 20 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </LinearGradient>
      </Modal>

      {/* Shift Form Modal */}
      <Modal visible={showShiftForm} animationType="slide" onRequestClose={() => setShowShiftForm(false)}>
        <LinearGradient colors={gradients.background as any} style={styles.container}>
          <ScrollView contentContainerStyle={styles.formScroll}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingShiftId ? 'Edit Shift' : 'Add Shift'}</Text>
              <TouchableOpacity onPress={() => setShowShiftForm(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <GlassInput label="Shift Name *" value={shiftForm.name} onChangeText={(v: string) => setShiftForm({...shiftForm, name: v})} placeholder="e.g. Morning Shift" />
            <Text style={styles.fieldLabel}>Companies *</Text>
            <View style={styles.daysRow}>
              {companies.map((c: any) => (
                <TouchableOpacity key={c._id} style={[styles.dayChip, shiftForm.companyIds.includes(c._id) && styles.dayChipActive]} onPress={() => toggleShiftCompany(c._id)}>
                  <Text style={[styles.dayText, shiftForm.companyIds.includes(c._id) && styles.dayTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Start Time</Text>
            <TouchableOpacity style={styles.timeBtn} onPress={() => setShowStartPicker(true)}>
              <Text style={styles.timeText}>{shiftForm.startTime}</Text>
            </TouchableOpacity>
            {showStartPicker && (
              <DateTimePicker value={new Date(`2000-01-01T${shiftForm.startTime}`)} mode="time" is24Hour display="spinner" themeVariant="dark"
                onChange={(e: any, d?: Date) => { setShowStartPicker(Platform.OS === 'ios'); if (d) setShiftForm({...shiftForm, startTime: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}); }} />
            )}
            <Text style={styles.fieldLabel}>End Time</Text>
            <TouchableOpacity style={styles.timeBtn} onPress={() => setShowEndPicker(true)}>
              <Text style={styles.timeText}>{shiftForm.endTime}</Text>
            </TouchableOpacity>
            {showEndPicker && (
              <DateTimePicker value={new Date(`2000-01-01T${shiftForm.endTime}`)} mode="time" is24Hour display="spinner" themeVariant="dark"
                onChange={(e: any, d?: Date) => { setShowEndPicker(Platform.OS === 'ios'); if (d) setShiftForm({...shiftForm, endTime: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}); }} />
            )}
            <GlassButton title={editingShiftId ? 'Update Shift' : 'Save Shift'} onPress={handleCreateShift} style={{ marginTop: 20 }} />
          </ScrollView>
        </LinearGradient>
      </Modal>

      {/* Department Form Modal */}
      <Modal visible={showDeptForm} animationType="slide" onRequestClose={() => setShowDeptForm(false)}>
        <LinearGradient colors={gradients.background as any} style={styles.container}>
          <ScrollView contentContainerStyle={styles.formScroll}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingDeptId ? 'Edit Department' : 'Add Department'}</Text>
              <TouchableOpacity onPress={() => setShowDeptForm(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <GlassInput label="Department Name *" value={deptForm.name} onChangeText={(v: string) => setDeptForm({...deptForm, name: v})} />
            <Text style={styles.fieldLabel}>Company (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[styles.dayChip, !deptForm.companyId && styles.dayChipActive]} onPress={() => setDeptForm({...deptForm, companyId: ''})}>
                  <Text style={[styles.dayText, !deptForm.companyId && styles.dayTextActive]}>All</Text>
                </TouchableOpacity>
                {companies.map((c: any) => (
                  <TouchableOpacity key={c._id} style={[styles.dayChip, deptForm.companyId === c._id && styles.dayChipActive]} onPress={() => setDeptForm({...deptForm, companyId: c._id})}>
                    <Text style={[styles.dayText, deptForm.companyId === c._id && styles.dayTextActive]}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <GlassButton title={editingDeptId ? 'Update Department' : 'Save Department'} onPress={handleSaveDept} style={{ marginTop: 20 }} />
          </ScrollView>
        </LinearGradient>
      </Modal>

      {/* Position Form Modal */}
      <Modal visible={showPosForm} animationType="slide" onRequestClose={() => setShowPosForm(false)}>
        <LinearGradient colors={gradients.background as any} style={styles.container}>
          <ScrollView contentContainerStyle={styles.formScroll}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingPosId ? 'Edit Position' : 'Add Position'}</Text>
              <TouchableOpacity onPress={() => setShowPosForm(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <GlassInput label="Position Name *" value={posForm.name} onChangeText={(v: string) => setPosForm({...posForm, name: v})} />
            <Text style={styles.fieldLabel}>Department (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[styles.dayChip, !posForm.departmentId && styles.dayChipActive]} onPress={() => setPosForm({...posForm, departmentId: ''})}>
                  <Text style={[styles.dayText, !posForm.departmentId && styles.dayTextActive]}>Any</Text>
                </TouchableOpacity>
                {deptList.map((d: any) => (
                  <TouchableOpacity key={d._id} style={[styles.dayChip, posForm.departmentId === d._id && styles.dayChipActive]} onPress={() => setPosForm({...posForm, departmentId: d._id})}>
                    <Text style={[styles.dayText, posForm.departmentId === d._id && styles.dayTextActive]}>{d.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <GlassButton title={editingPosId ? 'Update Position' : 'Save Position'} onPress={handleSavePos} style={{ marginTop: 20 }} />
          </ScrollView>
        </LinearGradient>
      </Modal>

      {/* Holiday Form Modal */}
      <Modal visible={showHolForm} animationType="slide" onRequestClose={() => setShowHolForm(false)}>
        <LinearGradient colors={gradients.background as any} style={styles.container}>
          <ScrollView contentContainerStyle={styles.formScroll}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Add Holiday</Text>
              <TouchableOpacity onPress={() => setShowHolForm(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <GlassInput label="Holiday Name *" value={holForm.name} onChangeText={(v: string) => setHolForm({...holForm, name: v})} />
            <Text style={styles.fieldLabel}>Date</Text>
            <TouchableOpacity style={styles.timeBtn} onPress={() => setShowHolDate(true)}>
              <Text style={styles.timeText}>{formatDate(holForm.date.toISOString().split('T')[0])}</Text>
            </TouchableOpacity>
            {showHolDate && (
              <DateTimePicker value={holForm.date} mode="date" display="spinner" themeVariant="dark"
                onChange={(e: any, d?: Date) => { setShowHolDate(Platform.OS === 'ios'); if (d) setHolForm({...holForm, date: d}); }} />
            )}
            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.typeRow}>
              {['public', 'restricted', 'regional', 'company'].map(t => (
                <TouchableOpacity key={t} style={[styles.dayChip, holForm.type === t && styles.dayChipActive]} onPress={() => setHolForm({...holForm, type: t})}>
                  <Text style={[styles.dayText, holForm.type === t && styles.dayTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Assign to Companies (optional)</Text>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginBottom: 8 }}>
              If none selected, holiday will be added for all companies
            </Text>
            <View style={styles.daysRow}>
              {companies.map((c: any) => (
                <TouchableOpacity
                  key={c._id}
                  style={[styles.dayChip, holForm.companyIds.includes(c._id) && styles.dayChipActive]}
                  onPress={() => {
                    setHolForm((prev: any) => ({
                      ...prev,
                      companyIds: prev.companyIds.includes(c._id)
                        ? prev.companyIds.filter((id: string) => id !== c._id)
                        : [...prev.companyIds, c._id],
                    }));
                  }}
                >
                  <Text style={[styles.dayText, holForm.companyIds.includes(c._id) && styles.dayTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <GlassButton title="Save Holiday" onPress={handleCreateHoliday} style={{ marginTop: 20 }} />
          </ScrollView>
        </LinearGradient>
      </Modal>

      {/* Government Holidays Modal */}
      <Modal visible={showGovHolidayModal} animationType="slide" onRequestClose={() => setShowGovHolidayModal(false)}>
        <LinearGradient colors={gradients.background as any} style={styles.container}>
          <ScrollView contentContainerStyle={styles.formScroll}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Government Holidays</Text>
              <TouchableOpacity onPress={() => setShowGovHolidayModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 16 }}>
              Select holidays to add for {new Date().getFullYear()}. Variable-date holidays are fetched automatically.
            </Text>

            {/* Company Selection */}
            <Text style={styles.fieldLabel}>Assign to Companies (optional)</Text>
            <View style={styles.daysRow}>
              {companies.map((c: any) => (
                <TouchableOpacity
                  key={c._id}
                  style={[styles.dayChip, selectedGovCompanies.has(c._id) && styles.dayChipActive]}
                  onPress={() => toggleGovCompany(c._id)}
                >
                  <Text style={[styles.dayText, selectedGovCompanies.has(c._id) && styles.dayTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Select All / Deselect All */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.fieldLabel}>Select Holidays</Text>
              <TouchableOpacity onPress={toggleSelectAllGovHolidays}>
                <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>
                  {selectedGovHolidays.size === govHolidaysList.length ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            </View>

            {loadingGovDates && (
              <View style={{ padding: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: borderRadius.md, marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>Loading variable holiday dates...</Text>
              </View>
            )}

            {/* Holiday List with Checkboxes */}
            {govHolidaysList.map((h: any, index: number) => {
              const isSelected = selectedGovHolidays.has(index);
              return (
                <TouchableOpacity
                  key={`${h.name}-${h.date}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    marginBottom: 4,
                    backgroundColor: isSelected ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
                    borderRadius: borderRadius.md,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.primary : colors.borderLight,
                  }}
                  onPress={() => toggleGovHoliday(index)}
                >
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={isSelected ? colors.primary : colors.textTertiary}
                    style={{ marginRight: 12 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>{h.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                      {formatDate(h.date)}{h.isFixed ? ' • Fixed' : ' • Variable'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Add Button */}
            <View style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 12, color: colors.textTertiary, marginBottom: 8, textAlign: 'center' }}>
                {selectedGovHolidays.size} holiday{selectedGovHolidays.size !== 1 ? 's' : ''} selected
                {selectedGovCompanies.size > 0 ? ` for ${selectedGovCompanies.size} compan${selectedGovCompanies.size !== 1 ? 'ies' : 'y'}` : ' for all companies'}
              </Text>
              <GlassButton
                title={addingGovHolidays ? 'Adding...' : 'Add Selected Holidays'}
                onPress={handleAddSelectedGovHolidays}
                loading={addingGovHolidays}
              />
            </View>
          </ScrollView>
        </LinearGradient>
      </Modal>

      {/* User Form Modal */}
      <Modal visible={showUserForm} animationType="slide" onRequestClose={() => setShowUserForm(false)}>
        <LinearGradient colors={gradients.background as any} style={styles.container}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.formScroll}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>{editingUserId ? 'Edit User' : 'Add User'}</Text>
                <TouchableOpacity onPress={() => { setShowUserForm(false); setEditingUserId(null); }}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <GlassInput label="Email *" value={userForm.email}
                onChangeText={(v: string) => setUserForm({...userForm, email: v})}
                autoCapitalize="none" keyboardType="email-address"
                editable={!editingUserId} />
              <View style={styles.compactFormRow}>
                <View style={styles.compactFormItem}>
                  <GlassInput label="First Name" value={userForm.firstName}
                    onChangeText={(v: string) => setUserForm({...userForm, firstName: v})} />
                </View>
                <View style={styles.compactFormItem}>
                  <GlassInput label="Last Name" value={userForm.lastName}
                    onChangeText={(v: string) => setUserForm({...userForm, lastName: v})} />
                </View>
              </View>
              {!editingUserId && (
                <>
                  <GlassInput label="Password *" value={userForm.password}
                    onChangeText={(v: string) => setUserForm({...userForm, password: v})}
                    secureTextEntry
                    placeholder="Enter password" />
                  <PasswordRequirements password={userForm.password} />
                </>
              )}
              {editingUserId && (
                <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: borderRadius.md, padding: 12, marginBottom: 8, marginTop: 8 }}>
                  <Text style={{ fontSize: 12, color: colors.textTertiary, lineHeight: 18 }}>
                    Password cannot be changed from here. Contact support if the user needs a password reset.
                  </Text>
                </View>
              )}
              <Text style={styles.fieldLabel}>Role</Text>
              <View style={styles.daysRow}>
                {(isSuperAdmin ? ['superadmin', 'admin', 'employee'] : ['employee']).map(role => (
                  <TouchableOpacity key={role} style={[styles.dayChip, userForm.role === role && styles.dayChipActive]}
                    onPress={() => setUserForm({...userForm, role})}>
                    <Text style={[styles.dayText, userForm.role === role && styles.dayTextActive]}>{role}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Reports To (Manager/Admin)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.dayChip, !userForm.reportsTo && styles.dayChipActive]}
                    onPress={() => setUserForm({...userForm, reportsTo: ''})}>
                    <Text style={[styles.dayText, !userForm.reportsTo && styles.dayTextActive]}>None</Text>
                  </TouchableOpacity>
                  {users.filter((u: any) => (u.role === 'superadmin' || u.role === 'admin') && u._id !== editingUserId).map((u: any) => (
                    <TouchableOpacity key={u._id}
                      style={[styles.dayChip, userForm.reportsTo === u._id && styles.dayChipActive]}
                      onPress={() => setUserForm({...userForm, reportsTo: u._id})}>
                      <Text style={[styles.dayText, userForm.reportsTo === u._id && styles.dayTextActive]}>
                        {u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : u.email}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <Text style={styles.fieldLabel}>Link to Employee (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={[styles.dayChip, !userForm.employeeId && styles.dayChipActive]}
                    onPress={() => setUserForm({...userForm, employeeId: ''})}>
                    <Text style={[styles.dayText, !userForm.employeeId && styles.dayTextActive]}>None</Text>
                  </TouchableOpacity>
                  {allEmployees.map((e: any) => (
                    <TouchableOpacity key={e._id} style={[styles.dayChip, userForm.employeeId === e._id && styles.dayChipActive]}
                      onPress={() => setUserForm({...userForm, employeeId: e._id, role: 'employee'})}>
                      <Text style={[styles.dayText, userForm.employeeId === e._id && styles.dayTextActive]}>{e.firstName} {e.lastName || ''}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              {!editingUserId && (
                <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: borderRadius.md, padding: 12, marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18 }}>
                    After creating, share the email and password with the user. They can sign in directly on the login screen.
                  </Text>
                </View>
              )}
              <GlassButton title={editingUserId ? 'Update User' : 'Create User'} onPress={handleCreateUser} />
            </ScrollView>
          </KeyboardAvoidingView>
        </LinearGradient>
      </Modal>

      {/* Link Modal */}
      <Modal visible={showLinkModal !== null} transparent animationType="fade" onRequestClose={() => setShowLinkModal(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: colors.bgMid, borderRadius: borderRadius.lg, padding: 20, maxHeight: '70%', borderWidth: 1, borderColor: colors.border }}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Link Employee</Text>
              <TouchableOpacity onPress={() => setShowLinkModal(null)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {allEmployees.map((e: any) => (
                <TouchableOpacity key={e._id} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}
                  onPress={() => showLinkModal && handleLinkEmployee(showLinkModal, e._id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{e.firstName} {e.lastName || ''}</Text>
                    <Text style={styles.itemSub}>{e.department} • {e.position}</Text>
                  </View>
                  <Ionicons name="link" size={20} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Employee Leave Request Form Modal */}
      <Modal visible={showLeaveForm} animationType="slide" onRequestClose={() => setShowLeaveForm(false)}>
        <LinearGradient colors={gradients.background as any} style={styles.container}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.formScroll}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>Request Leave</Text>
                <TouchableOpacity onPress={() => setShowLeaveForm(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Leave Type</Text>
              <View style={styles.typeRow}>
                {['casual', 'sick', 'annual', 'unpaid'].map(t => (
                  <TouchableOpacity key={t} style={[styles.dayChip, leaveForm.leaveType === t && styles.dayChipActive]}
                    onPress={() => setLeaveForm({ ...leaveForm, leaveType: t })}>
                    <Text style={[styles.dayText, leaveForm.leaveType === t && styles.dayTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Start Date</Text>
              <TouchableOpacity style={styles.timeBtn} onPress={() => setShowLeaveStartDate(true)}>
                <Text style={styles.timeText}>{formatDate(leaveForm.startDate.toISOString().split('T')[0])}</Text>
              </TouchableOpacity>
              {showLeaveStartDate && (
                <DateTimePicker value={leaveForm.startDate} mode="date" display="spinner" themeVariant="dark"
                  onChange={(e: any, d?: Date) => { setShowLeaveStartDate(Platform.OS === 'ios'); if (d) setLeaveForm({ ...leaveForm, startDate: d }); }} />
              )}

              <Text style={styles.fieldLabel}>End Date</Text>
              <TouchableOpacity style={styles.timeBtn} onPress={() => setShowLeaveEndDate(true)}>
                <Text style={styles.timeText}>{formatDate(leaveForm.endDate.toISOString().split('T')[0])}</Text>
              </TouchableOpacity>
              {showLeaveEndDate && (
                <DateTimePicker value={leaveForm.endDate} mode="date" display="spinner" themeVariant="dark"
                  onChange={(e: any, d?: Date) => { setShowLeaveEndDate(Platform.OS === 'ios'); if (d) setLeaveForm({ ...leaveForm, endDate: d }); }} />
              )}

              <GlassInput label="Reason *" value={leaveForm.reason}
                onChangeText={(v: string) => setLeaveForm({ ...leaveForm, reason: v })}
                multiline numberOfLines={3} placeholder="Please enter the reason for your leave request" />

              <GlassButton title="Submit Leave Request" onPress={handleRequestLeave} style={{ marginTop: 20 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </LinearGradient>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 20 },
  menuBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: borderRadius.md, marginBottom: 6, borderWidth: 1, borderColor: colors.borderLight },
  menuBtnActive: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: colors.primary },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.text },
  badge: { backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  sectionContent: { paddingVertical: 12, paddingHorizontal: 4 },
  itemCard: { marginBottom: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '600', color: colors.text },
  itemSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  compactRow: { flexDirection: 'row', gap: 16, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderLight },

  // Shared-account-only dept restriction styles
  sharedOnlySection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,152,0,0.2)',
    gap: 6,
  },
  sharedOnlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  sharedOnlyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF9800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sharedOnlySubtitle: {
    fontSize: 11,
    color: colors.textTertiary,
    lineHeight: 16,
    marginBottom: 8,
  },
  deptToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  deptToggleRowActive: {
    backgroundColor: 'rgba(255,152,0,0.07)',
    borderColor: 'rgba(255,152,0,0.25)',
  },
  deptToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  deptToggleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.borderLight,
  },
  deptToggleDotActive: {
    backgroundColor: '#FF9800',
  },
  deptToggleName: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  deptToggleNameActive: {
    color: colors.text,
    fontWeight: '600',
  },
  deptTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  deptTogglePillActive: {
    backgroundColor: 'rgba(255,152,0,0.18)',
  },
  deptTogglePillText: {
    fontSize: 11,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  deptTogglePillTextActive: {
    color: '#FF9800',
    fontWeight: '700',
  },
  compactItem: { alignItems: 'center' },
  compactLabel: { fontSize: 10, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  compactValue: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 2 },
  holActions: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  govCard: { marginBottom: 16 },
  govTitle: { fontSize: 14, fontWeight: '600', color: colors.primary, marginBottom: 8 },
  govRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  govInfo: { flex: 1 },
  govName: { fontSize: 14, fontWeight: '500', color: colors.text },
  govDate: { fontSize: 12, color: colors.textSecondary },
  govAddBtn: { padding: 4 },
  holItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  holInfo: { flex: 1 },
  holName: { fontSize: 14, fontWeight: '500', color: colors.text },
  holDate: { fontSize: 12, color: colors.textSecondary },
  leaveRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  leaveInfo: { flex: 1 },
  leaveStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  leaveStatusText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  leaveActions: { flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderLight },
  roleButtons: { flexDirection: 'row', gap: 6 },
  roleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border },
  roleBtnActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  roleBtnText: { fontSize: 11, color: colors.textSecondary, textTransform: 'capitalize' },
  roleBtnTextActive: { color: colors.primary, fontWeight: '600' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, marginTop: 24, backgroundColor: 'rgba(229,57,53,0.08)', borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.dangerGlow },
  signOutText: { fontSize: 15, fontWeight: '600', color: colors.danger },
  emptyText: { fontSize: 14, color: colors.textTertiary, textAlign: 'center', paddingVertical: 20 },
  // Forms
  formScroll: { padding: 20, paddingTop: 60 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  formTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
  fieldLabel: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 12 },
  compactFormRow: { flexDirection: 'row', gap: 12 },
  compactFormItem: { flex: 1 },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  dayChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border },
  dayChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  dayText: { fontSize: 13, color: colors.textSecondary },
  dayTextActive: { color: colors.primary, fontWeight: '600' },
  timeBtn: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8 },
  timeText: { fontSize: 16, color: colors.text, fontWeight: '500' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
});

// ... existing code ...