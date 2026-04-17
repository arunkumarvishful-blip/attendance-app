import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Platform, Image, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { colors, gradients, spacing, borderRadius, formatINR } from '../lib/theme';
import { getLocalDate, formatDate } from '../lib/utils';
import KPICard from '../components/KPICard';
import GlassCard from '../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';

function NotificationBell() {
  const unreadCount = useQuery(api.notifications.getUnreadCount);
  const notifications = useQuery(api.notifications.getMyNotifications);
  const markRead = useMutation(api.notifications.markAllRead);
  const [showNotifications, setShowNotifications] = useState(false);

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => { setShowNotifications(true); markRead(); }}
        style={{ position: 'absolute', top: 60, right: 20, zIndex: 10 }}>
        <View style={{ position: 'relative' }}>
          <Ionicons name="notifications-outline" size={26} color={colors.text} />
          {unreadCount && unreadCount > 0 ? (
            <View style={{
              position: 'absolute', top: -4, right: -4,
              backgroundColor: colors.danger, borderRadius: 10,
              minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center',
              paddingHorizontal: 4,
            }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>

      <Modal visible={showNotifications} animationType="slide" onRequestClose={() => setShowNotifications(false)}>
        <LinearGradient colors={gradients.background as any} style={{ flex: 1 }}>
          <View style={{ padding: 20, paddingTop: 60 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>Notifications</Text>
              <TouchableOpacity onPress={() => setShowNotifications(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
            {!notifications || notifications.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Ionicons name="notifications-off-outline" size={48} color={colors.textTertiary} />
                <Text style={{ fontSize: 15, color: colors.textTertiary, marginTop: 12 }}>No notifications yet</Text>
              </View>
            ) : notifications.map((n: any) => {
              const isLeaveApproved = n.type === 'leave_response' && n.title.includes('Approved');
              const isLeaveRejected = n.type === 'leave_response' && n.title.includes('Rejected');
              const isAttendance = n.type === 'attendance';
              const iconName = isLeaveApproved ? 'checkmark-circle' : isLeaveRejected ? 'close-circle' : isAttendance ? 'scan' : 'document-text';
              const iconColor = isLeaveApproved ? colors.success : isLeaveRejected ? colors.danger : isAttendance ? colors.primary : colors.warning;
              return (
                <GlassCard key={n._id} style={{ marginBottom: 10, opacity: n.read ? 0.7 : 1 }}>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${iconColor}20`, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={iconName as any} size={20} color={iconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 }}>{n.title}</Text>
                        <Text style={{ fontSize: 11, color: colors.textTertiary, marginLeft: 8 }}>{timeAgo(n.createdAt)}</Text>
                      </View>
                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 18 }}>{n.message}</Text>
                      {!n.read && (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, position: 'absolute', top: 0, right: 0 }} />
                      )}
                    </View>
                  </View>
                </GlassCard>
              );
            })}
          </ScrollView>
        </LinearGradient>
      </Modal>
    </>
  );
}

function EmployeeDashboard({ currentUser }: { currentUser: any }) {
  const today = getLocalDate();
  const monthPrefix = today.slice(0, 7); // "2025-06"
  
  const todayRecord = useQuery(api.attendance.getMyTodayAttendance, 
    currentUser?.employeeId ? { employeeId: currentUser.employeeId, date: today } : 'skip'
  );
  const summary = useQuery(api.attendance.getMyMonthSummary,
    currentUser?.employeeId ? { employeeId: currentUser.employeeId, monthPrefix } : 'skip'
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const statusColor = todayRecord?.status === 'present' ? colors.success 
    : todayRecord?.status === 'late' ? colors.warning 
    : todayRecord?.status === 'absent' ? colors.danger 
    : colors.textTertiary;

  const statusBg = todayRecord?.status === 'present' ? colors.successBg 
    : todayRecord?.status === 'late' ? colors.warningBg 
    : todayRecord?.status === 'absent' ? colors.dangerBg 
    : 'rgba(255,255,255,0.06)';

  const statusLabel = todayRecord?.status 
    ? todayRecord.status.charAt(0).toUpperCase() + todayRecord.status.slice(1)
    : 'Not Marked';

  return (
    <LinearGradient colors={gradients.background as any} style={{ flex: 1 }}>
      <NotificationBell />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
        
        {/* Greeting */}
        <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 4 }}>{greeting},</Text>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
          {currentUser?.firstName || 'Employee'}
        </Text>
        <Text style={{ fontSize: 13, color: colors.textTertiary, marginBottom: 24 }}>
          {formatDate(today)}
        </Text>

        {/* Today's Status Card */}
        <GlassCard style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Today's Attendance</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ backgroundColor: statusBg, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: statusColor }}>{statusLabel}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 12, color: colors.textTertiary }}>Check In</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
                {todayRecord?.checkInTime || '—'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 12, color: colors.textTertiary }}>Check Out</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
                {todayRecord?.checkOutTime || '—'}
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* Monthly Summary — reuse KPICard */}
        <Text style={{ fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>This Month</Text>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          <KPICard title="Present" value={summary?.present || 0} icon="checkmark-circle" color={colors.success} glowColor={colors.successGlow} />
          <KPICard title="Late" value={summary?.late || 0} icon="time" color={colors.warning} glowColor={colors.warningGlow} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
          <KPICard title="Absent" value={summary?.absent || 0} icon="close-circle" color={colors.danger} glowColor={colors.dangerGlow} />
          <KPICard title="Total Days" value={summary?.total || 0} icon="calendar" color={colors.primary} glowColor={colors.primaryGlow} />
        </View>

        {/* Last 7 Days */}
        <GlassCard>
          <Text style={{ fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>Last 7 Days</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {(summary?.last7days || []).map((day: any) => {
              const dotColor = day.status === 'present' ? colors.success 
                : day.status === 'late' ? colors.warning 
                : day.status === 'absent' ? colors.danger 
                : 'rgba(255,255,255,0.15)';
              const d = new Date(day.date);
              const dayLabel = ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
              const dateNum = d.getDate();
              return (
                <View key={day.date} style={{ alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 10, color: colors.textTertiary }}>{dayLabel}</Text>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor }} />
                  <Text style={{ fontSize: 10, color: colors.textTertiary }}>{dateNum}</Text>
                </View>
              );
            })}
          </View>
        </GlassCard>

      </ScrollView>
    </LinearGradient>
  );
}

export default function DashboardScreen() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const initAdmin = useMutation(api.users.initializeAdmin);
  const today = getLocalDate();
  const stats = useQuery(api.attendance.getStats, { date: today });
  const employees = useQuery(api.employees.list, {});
  const recentAttendance = useQuery(api.attendance.getByDate, { date: today });
  const pendingLeaves = useQuery(api.leaves.list, {});
  const [refreshing, setRefreshing] = React.useState(false);

  useEffect(() => {
    if (currentUser && currentUser.role !== 'superadmin') {
      initAdmin().catch(() => {});
    }
  }, [currentUser]);

  const isAdmin = currentUser?.role === 'superadmin' || currentUser?.role === 'admin' || currentUser?.role === 'hr';
  const totalEmployees = employees?.length || 0;
  const present = stats?.present || 0;
  const late = stats?.late || 0;
  const absent = stats?.absent || 0;
  const pendingCount = pendingLeaves?.filter((l: any) => l.status === 'pending').length || 0;

  const isEmployee = currentUser?.role === 'employee';

  if (isEmployee && currentUser?.employeeId) {
    return <EmployeeDashboard currentUser={currentUser} />;
  }

  return (
    <LinearGradient colors={gradients.background as any} style={styles.container}>
      <NotificationBell />
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 1000); }} tintColor={colors.primary} />}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Welcome back</Text>
          <Text style={styles.name}>{currentUser?.firstName ? `${currentUser.firstName} ${currentUser.lastName || ''}`.trim() : currentUser?.email || 'User'}</Text>
          <Text style={styles.role}>{currentUser?.role?.toUpperCase() || 'EMPLOYEE'}</Text>
        </View>

        <Text style={styles.dateText}>{formatDate(today)}</Text>

        <View style={styles.kpiRow}>
          <KPICard title="Present" value={present} icon="checkmark-circle" color={colors.success} glowColor={colors.successGlow} />
          <KPICard title="Late" value={late} icon="time" color={colors.warning} glowColor={colors.warningGlow} />
        </View>
        <View style={styles.kpiRow}>
          <KPICard title="Absent" value={absent} icon="close-circle" color={colors.danger} glowColor={colors.dangerGlow} />
          <KPICard title="Team" value={totalEmployees} icon="people" color={colors.primary} glowColor={colors.primaryGlow} />
        </View>

        {pendingCount > 0 && isAdmin && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text" size={18} color={colors.warning} />
              <Text style={styles.sectionTitle}>{pendingCount} Pending Leave Requests</Text>
            </View>
          </GlassCard>
        )}

        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Activity</Text>
          {recentAttendance && recentAttendance.length > 0 ? (
            recentAttendance.slice(0, 8).map((a: any) => (
              <View key={a._id} style={styles.actRow}>
                {a.employeeFaceUrl ? (
                  <Image source={{ uri: a.employeeFaceUrl }} style={styles.actAvatar} />
                ) : (
                  <View style={[styles.actAvatar, styles.actAvatarPlaceholder]}>
                    <Text style={styles.actAvatarText}>
                      {(a.employeeName || '?')[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.actName} numberOfLines={1}>{a.employeeName || 'Employee'}</Text>
                <Text style={styles.actTime}>{a.checkInTime || '--:--'}</Text>
                <View style={[styles.actStatusBadge, { backgroundColor: a.status === 'present' ? colors.successBg : a.status === 'late' ? colors.warningBg : colors.dangerBg }]}>
                  <Text style={[styles.actStatus, { color: a.status === 'present' ? colors.success : a.status === 'late' ? colors.warning : colors.danger }]}>{a.status}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>No attendance records today</Text>
          )}
        </GlassCard>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, paddingTop: 60 },
  header: { marginBottom: 24 },
  greeting: { fontSize: 14, color: colors.textSecondary },
  name: { fontSize: 26, fontWeight: '700', color: colors.text, marginTop: 4 },
  role: { fontSize: 11, fontWeight: '600', color: colors.primary, letterSpacing: 1, marginTop: 4 },
  dateText: { fontSize: 13, color: colors.textTertiary, marginBottom: 16 },
  kpiRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  section: { marginTop: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12 },
  actRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight, gap: 10 },
  actAvatar: { width: 28, height: 28, borderRadius: 14 },
  actAvatarPlaceholder: { backgroundColor: 'rgba(99,102,241,0.2)', alignItems: 'center', justifyContent: 'center' },
  actAvatarText: { fontSize: 12, fontWeight: '700', color: '#6366f1' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  actName: { flex: 1, fontSize: 14, color: colors.text },
  actTime: { fontSize: 13, color: colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  actStatusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  actStatus: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  empty: { fontSize: 14, color: colors.textTertiary, textAlign: 'center', paddingVertical: 20 },
});