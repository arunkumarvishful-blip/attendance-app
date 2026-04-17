import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform, Image
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { colors, gradients, spacing, borderRadius, formatINR } from '../lib/theme';
import GlassCard from '../components/GlassCard';
import GlassButton from '../components/GlassButton';
import GlassInput from '../components/GlassInput';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, formatTime, getLocalDate } from '../lib/utils';

export default function EmployeePortalScreen() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const profile = useQuery(api.users.getMyEmployeeProfile);
  const employeeId = currentUser?.employeeId;

  const myAttendance = useQuery(api.attendance.getMyAttendance,
    employeeId ? { employeeId } : 'skip');
  const myPayroll = useQuery(api.payroll.getMyPayroll,
    employeeId ? { employeeId } : 'skip');
  const myLeaves = useQuery(api.leaves.getMyLeaves,
    employeeId ? { employeeId } : 'skip');

  const createLeave = useMutation(api.leaves.create);

  const [tab, setTab] = useState<'attendance' | 'salary' | 'leave'>('attendance');
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leaveType: 'casual', startDate: new Date(), endDate: new Date(), reason: ''
  });
  const [showStartDate, setShowStartDate] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);
  const [detailRecord, setDetailRecord] = useState<any>(null);

  const handleRequestLeave = async () => {
    if (!employeeId || !leaveForm.reason) {
      Alert.alert('Error', 'Please fill in the reason');
      return;
    }
    try {
      await createLeave({
        employeeId,
        companyId: profile?.companyName ? undefined : undefined,
        leaveType: leaveForm.leaveType,
        startDate: leaveForm.startDate.toISOString().split('T')[0],
        endDate: leaveForm.endDate.toISOString().split('T')[0],
        reason: leaveForm.reason,
      });
      setShowLeaveForm(false);
      setLeaveForm({ leaveType: 'casual', startDate: new Date(), endDate: new Date(), reason: '' });
      Alert.alert('Success', 'Leave request submitted');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (!profile) {
    return (
      <LinearGradient colors={gradients.background as any} style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="person-circle" size={64} color={colors.textTertiary} />
          <Text style={styles.noLink}>Your account is not linked to an employee profile yet.</Text>
          <Text style={styles.noLinkSub}>Please contact your admin to link your account.</Text>
        </View>
      </LinearGradient>
    );
  }

  const recentAttendance = (myAttendance || []).slice(0, 30);
  const pendingLeaves = (myLeaves || []).filter((l: any) => l.status === 'pending').length;

  return (
    <LinearGradient colors={gradients.background as any} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          {profile.faceImageUrl ? (
            <Image source={{ uri: profile.faceImageUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={32} color={colors.textTertiary} />
            </View>
          )}
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profile.firstName} {profile.lastName || ''}</Text>
            <Text style={styles.profileSub}>{profile.position} • {profile.department}</Text>
            {profile.companyName && <Text style={styles.profileSub}>{profile.companyName}</Text>}
          </View>
        </View>

        {/* Tab Selector */}
        <View style={styles.tabBar}>
          {(['attendance', 'salary', 'leave'] as const).map(t => (
            <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
              <Ionicons name={t === 'attendance' ? 'time' : t === 'salary' ? 'wallet' : 'document-text'} size={18}
                color={tab === t ? colors.primary : colors.textTertiary} />
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'attendance' ? 'Attendance' : t === 'salary' ? 'Salary' : 'Leave'}
              </Text>
              {t === 'leave' && pendingLeaves > 0 && (
                <View style={styles.badge}><Text style={styles.badgeText}>{pendingLeaves}</Text></View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Attendance Tab */}
        {tab === 'attendance' && (
          <View>
            <Text style={styles.sectionTitle}>Recent Attendance</Text>
            {recentAttendance.length === 0 && <Text style={styles.emptyText}>No attendance records</Text>}
            {recentAttendance.map((r: any) => (
              <TouchableOpacity key={r._id} onPress={() => setDetailRecord(r)}>
                <GlassCard style={styles.recordCard}>
                  <View style={styles.recordRow}>
                    <View>
                      <Text style={styles.recordDate}>{formatDate(r.date)}</Text>
                      <Text style={styles.recordTime}>
                        {formatTime(r.checkInTime)} → {formatTime(r.checkOutTime)}
                      </Text>
                    </View>
                    <View style={styles.recordRight}>
                      <View style={[styles.statusDot, {
                        backgroundColor: r.status === 'present' ? colors.success : r.status === 'late' ? colors.warning : colors.danger
                      }]} />
                      <Text style={styles.recordHours}>{r.hoursWorked?.toFixed(1) || '-'}h</Text>
                    </View>
                  </View>
                </GlassCard>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Salary Tab */}
        {tab === 'salary' && (
          <View>
            <Text style={styles.sectionTitle}>Salary History</Text>
            {(!myPayroll || myPayroll.length === 0) && <Text style={styles.emptyText}>No payroll records</Text>}
            {(myPayroll || []).map((p: any) => (
              <GlassCard key={p._id} style={styles.recordCard}>
                <View style={styles.recordRow}>
                  <View>
                    <Text style={styles.recordDate}>{p.month}/{p.year}</Text>
                    <Text style={styles.recordTime}>Base: {formatINR(p.baseSalary)}</Text>
                  </View>
                  <View style={styles.recordRight}>
                    <Text style={styles.netSalary}>{formatINR(p.netSalary)}</Text>
                    <View style={[styles.paidBadge, {
                      backgroundColor: p.status === 'paid' ? colors.successBg : colors.warningBg
                    }]}>
                      <Text style={[styles.paidText, {
                        color: p.status === 'paid' ? colors.success : colors.warning
                      }]}>{p.status}</Text>
                    </View>
                  </View>
                </View>
                {/* Details */}
                <View style={styles.salaryDetails}>
                  <View style={styles.salaryRow}>
                    <Text style={styles.salaryLabel}>Days Worked</Text>
                    <Text style={styles.salaryValue}>{p.daysWorked} / {p.workingDaysInMonth || p.totalDays}</Text>
                  </View>
                  {(p.bonus ?? 0) > 0 && (
                    <View style={styles.salaryRow}>
                      <Text style={styles.salaryLabel}>Bonus</Text>
                      <Text style={[styles.salaryValue, { color: colors.success }]}>+{formatINR(p.bonus)}</Text>
                    </View>
                  )}
                  <View style={styles.salaryRow}>
                    <Text style={styles.salaryLabel}>Deductions</Text>
                    <Text style={[styles.salaryValue, { color: colors.danger }]}>-{formatINR(p.deductions)}</Text>
                  </View>
                  {p.paidDate && (
                    <View style={styles.salaryRow}>
                      <Text style={styles.salaryLabel}>Paid On</Text>
                      <Text style={styles.salaryValue}>{formatDate(p.paidDate)} {p.paymentMode ? `• ${p.paymentMode}` : ''}</Text>
                    </View>
                  )}
                </View>
              </GlassCard>
            ))}
          </View>
        )}

        {/* Leave Tab */}
        {tab === 'leave' && (
          <View>
            <View style={styles.leaveHeader}>
              <Text style={styles.sectionTitle}>Leave Requests</Text>
              <GlassButton title="Request Leave" onPress={() => setShowLeaveForm(true)} small />
            </View>
            {(!myLeaves || myLeaves.length === 0) && <Text style={styles.emptyText}>No leave requests</Text>}
            {(myLeaves || []).map((l: any) => (
              <GlassCard key={l._id} style={styles.recordCard}>
                <View style={styles.recordRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recordDate}>{l.leaveType}</Text>
                    <Text style={styles.recordTime}>{formatDate(l.startDate)} → {formatDate(l.endDate)}</Text>
                    <Text style={[styles.recordTime, { marginTop: 4 }]}>{l.reason}</Text>
                  </View>
                  <View style={[styles.leaveStatusBadge, {
                    backgroundColor: l.status === 'approved' ? colors.successBg :
                      l.status === 'rejected' ? colors.dangerBg : colors.warningBg
                  }]}>
                    <Text style={[styles.leaveStatusText, {
                      color: l.status === 'approved' ? colors.success :
                        l.status === 'rejected' ? colors.danger : colors.warning
                    }]}>{l.status}</Text>
                  </View>
                </View>
              </GlassCard>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Attendance Detail Modal */}
      <Modal visible={!!detailRecord} transparent animationType="fade" onRequestClose={() => setDetailRecord(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Attendance Detail</Text>
              <TouchableOpacity onPress={() => setDetailRecord(null)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            {detailRecord && (
              <ScrollView>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Date</Text>
                  <Text style={styles.detailValue}>{formatDate(detailRecord.date)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <Text style={[styles.detailValue, {
                    color: detailRecord.status === 'present' ? colors.success : colors.warning
                  }]}>{detailRecord.status}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Check In</Text>
                  <Text style={styles.detailValue}>{formatTime(detailRecord.checkInTime)}</Text>
                </View>
                {detailRecord.checkInImageUrl && (
                  <Image source={{ uri: detailRecord.checkInImageUrl }} style={styles.proofPhoto} />
                )}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Check Out</Text>
                  <Text style={styles.detailValue}>{formatTime(detailRecord.checkOutTime)}</Text>
                </View>
                {detailRecord.checkOutImageUrl && (
                  <Image source={{ uri: detailRecord.checkOutImageUrl }} style={styles.proofPhoto} />
                )}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Hours</Text>
                  <Text style={styles.detailValue}>{detailRecord.hoursWorked?.toFixed(2) || '-'}</Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Leave Request Form */}
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
                  <TouchableOpacity key={t} style={[styles.typeChip, leaveForm.leaveType === t && styles.typeChipActive]}
                    onPress={() => setLeaveForm({ ...leaveForm, leaveType: t })}>
                    <Text style={[styles.typeText, leaveForm.leaveType === t && styles.typeTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Start Date</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowStartDate(true)}>
                <Text style={styles.dateText}>{formatDate(leaveForm.startDate.toISOString().split('T')[0])}</Text>
              </TouchableOpacity>
              {showStartDate && (
                <DateTimePicker value={leaveForm.startDate} mode="date" display="spinner" themeVariant="dark"
                  onChange={(e: any, d?: Date) => { setShowStartDate(Platform.OS === 'ios'); if (d) setLeaveForm({ ...leaveForm, startDate: d }); }} />
              )}

              <Text style={styles.fieldLabel}>End Date</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowEndDate(true)}>
                <Text style={styles.dateText}>{formatDate(leaveForm.endDate.toISOString().split('T')[0])}</Text>
              </TouchableOpacity>
              {showEndDate && (
                <DateTimePicker value={leaveForm.endDate} mode="date" display="spinner" themeVariant="dark"
                  onChange={(e: any, d?: Date) => { setShowEndDate(Platform.OS === 'ios'); if (d) setLeaveForm({ ...leaveForm, endDate: d }); }} />
              )}

              <GlassInput label="Reason *" value={leaveForm.reason}
                onChangeText={(v: string) => setLeaveForm({ ...leaveForm, reason: v })}
                multiline numberOfLines={3} placeholder="Why do you need leave?" />

              <GlassButton title="Submit Request" onPress={handleRequestLeave} style={{ marginTop: 20 }} />
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  noLink: { fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'center', marginTop: 16 },
  noLinkSub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 },
  avatar: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: colors.border },
  avatarPlaceholder: { backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 20, fontWeight: '700', color: colors.text },
  profileSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  tabBar: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.borderLight },
  tabActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  tabText: { fontSize: 12, fontWeight: '500', color: colors.textTertiary },
  tabTextActive: { color: colors.primary, fontWeight: '600' },
  badge: { backgroundColor: colors.primary, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, marginLeft: 4 },
  badgeText: { fontSize: 10, fontWeight: '600', color: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.textTertiary, textAlign: 'center', paddingVertical: 30 },
  recordCard: { marginBottom: 8 },
  recordRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recordDate: { fontSize: 14, fontWeight: '600', color: colors.text },
  recordTime: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  recordRight: { alignItems: 'flex-end', gap: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  recordHours: { fontSize: 14, fontWeight: '600', color: colors.text },
  netSalary: { fontSize: 16, fontWeight: '700', color: colors.text },
  paidBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  paidText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  salaryDetails: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderLight },
  salaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  salaryLabel: { fontSize: 12, color: colors.textSecondary },
  salaryValue: { fontSize: 12, fontWeight: '500', color: colors.text },
  leaveHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  leaveStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  leaveStatusText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: colors.bgMid, borderRadius: borderRadius.lg, padding: 20, maxHeight: '80%', borderWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  detailLabel: { fontSize: 13, color: colors.textSecondary },
  detailValue: { fontSize: 13, fontWeight: '500', color: colors.text },
  proofPhoto: { width: '100%', height: 160, borderRadius: borderRadius.md, marginVertical: 8 },
  // Leave form
  formScroll: { padding: 20, paddingTop: 60 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  formTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
  fieldLabel: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 12 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  typeChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border },
  typeChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  typeText: { fontSize: 13, color: colors.textSecondary, textTransform: 'capitalize' },
  typeTextActive: { color: colors.primary, fontWeight: '600' },
  dateBtn: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8 },
  dateText: { fontSize: 15, color: colors.text, fontWeight: '500' },
});