import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput, Alert, FlatList, ActivityIndicator, Modal } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { colors, gradients, borderRadius } from '../../lib/theme';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
const DIFF_COLORS: Record<string, string> = { Easy: '#4CAF50', Medium: '#FF9800', Hard: '#F44336' };
const DIFF_ICONS: Record<string, string> = { Easy: 'checkbox-marked-circle', Medium: 'alert-circle', Hard: 'fire' };

export default function TaskAssignmentScreen() {
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedEmpId, setSelectedEmpId] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<string>('Easy');
  const [assigning, setAssigning] = useState(false);

  // Checkout form state
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [checkoutEmpId, setCheckoutEmpId] = useState<any>(null);
  const [checkoutDate, setCheckoutDate] = useState('');
  const [checkoutTime, setCheckoutTime] = useState('');
  const [closingCheckout, setClosingCheckout] = useState(false);

  const employees = useQuery(api.officeAttendance.getOfficeEmployees);
  const tasks = useQuery(api.officeTasks.getEmployeeTasks, selectedEmpId ? { employeeId: selectedEmpId, date: selectedDate } : 'skip');
  const extensionRequests = useQuery(api.officeTasks.getExtensionRequests);
  const taskSubmissions = useQuery(api.officeTasks.getTaskUpdateSubmissions, { status: "pending" });
  const assignTask = useMutation(api.officeTasks.assignTask);
  const respondToExtension = useMutation(api.officeTasks.respondToExtension);
  const respondToSubmission = useMutation(api.officeTasks.respondToTaskUpdate);
  const closeCheckout = useMutation(api.housekeeping.closeIncompleteCheckout);

  const selectedEmployee = useMemo(() => employees?.find((e: any) => e._id === selectedEmpId), [employees, selectedEmpId]);

  const handleCloseCheckout = async () => {
    if (!checkoutEmpId || !checkoutDate || !checkoutTime) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    // Validate time format (HH:MM)
    if (!/^\d{2}:\d{2}$/.test(checkoutTime)) {
      Alert.alert('Error', 'Time must be in HH:MM format (e.g., 17:30)');
      return;
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkoutDate)) {
      Alert.alert('Error', 'Date must be in YYYY-MM-DD format');
      return;
    }

    setClosingCheckout(true);
    try {
      const result = await closeCheckout({
        employeeId: checkoutEmpId as any,
        date: checkoutDate,
        checkOutTime: checkoutTime,
      });
      
      Alert.alert('Success', result.message);
      setCheckoutEmpId(null);
      setCheckoutDate('');
      setCheckoutTime('');
      setShowCheckoutForm(false);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to close checkout');
    } finally {
      setClosingCheckout(false);
    }
  };

  const handleAssign = async () => {
    if (!title.trim()) return Alert.alert('Error', 'Task title is required');
    if (!selectedEmpId) return Alert.alert('Error', 'Select an employee first');
    setAssigning(true);
    try {
      const result = await assignTask({
        employeeId: selectedEmpId,
        date: selectedDate,
        title: title.trim(),
        description: description.trim() || undefined,
        difficulty,
        assignedBy: 'Admin',
      });
      if (result.success) {
        Alert.alert('Success', 'Task assigned successfully');
        setTitle(''); setDescription(''); setDifficulty('Easy'); setShowForm(false);
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setAssigning(false);
  };

  const handleExtension = async (reqId: any, approved: boolean) => {
    const action = approved ? 'approve' : 'reject';
    Alert.alert(`${approved ? 'Approve' : 'Reject'} Extension`, `Are you sure you want to ${action} this extension request?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: approved ? 'Approve' : 'Reject',
        style: approved ? 'default' : 'destructive',
        onPress: async () => {
          try {
            const result = await respondToExtension({ requestId: reqId, approved, respondedBy: 'Admin' });
            Alert.alert(result.success ? 'Done' : 'Error', result.message);
          } catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  const handleSubmissionResponse = async (subId: any, approved: boolean) => {
    const action = approved ? 'approve' : 'reject';
    Alert.alert(`${approved ? 'Approve' : 'Reject'} Submission`, `Are you sure you want to ${action} this task submission?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: approved ? 'Approve' : 'Reject',
        style: approved ? 'default' : 'destructive',
        onPress: async () => {
          try {
            const result = await respondToSubmission({ submissionId: subId, approved });
            Alert.alert(result.success ? 'Done' : 'Error', result.message);
          } catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  // Date navigation
  const shiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };
  const formatDate = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <LinearGradient colors={gradients.background as any} style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Header */}
          <Text style={styles.header}>Task Assignment</Text>
          <Text style={styles.subHeader}>Assign and manage office employee tasks</Text>

          {/* Manual Checkout Section (Admin Only) */}
          <View style={[styles.taskCard, { borderWidth: 1, borderColor: '#2196F344', marginBottom: 20 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <MaterialCommunityIcons name="clock-check" size={20} color="#2196F3" />
              <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#2196F3' }]}>
                Manual Checkout (Admin)
              </Text>
            </View>
            <TouchableOpacity 
              style={[styles.addBtn, { backgroundColor: '#2196F3', marginTop: 8 }]} 
              onPress={() => setShowCheckoutForm(!showCheckoutForm)}
            >
              <MaterialCommunityIcons name="clock-check" size={16} color="#fff" />
              <Text style={styles.addBtnText}>{showCheckoutForm ? 'Close Form' : 'Close Incomplete Checkout'}</Text>
            </TouchableOpacity>

            {showCheckoutForm && (
              <View style={{ marginTop: 16, padding: 12, backgroundColor: colors.glassLight, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.borderLight }}>
                <Text style={styles.label}>Employee</Text>
                <View style={styles.selectContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 120 }}>
                    {(employees || []).map((emp: any) => (
                      <TouchableOpacity
                        key={emp._id.toString()}
                        style={[
                          styles.selectOption,
                          checkoutEmpId === emp._id.toString() && { backgroundColor: colors.primary }
                        ]}
                        onPress={() => setCheckoutEmpId(emp._id.toString())}
                      >
                        <Text style={[
                          styles.selectOptionText,
                          checkoutEmpId === emp._id.toString() && { color: '#fff' }
                        ]}>
                          {emp.firstName} {emp.lastName}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <Text style={[styles.label, { marginTop: 12 }]}>Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 2025-01-15"
                  value={checkoutDate}
                  onChangeText={setCheckoutDate}
                  placeholderTextColor={colors.textSecondary}
                />

                <Text style={[styles.label, { marginTop: 12 }]}>Checkout Time (HH:MM)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 17:30"
                  value={checkoutTime}
                  onChangeText={setCheckoutTime}
                  placeholderTextColor={colors.textSecondary}
                />

                <TouchableOpacity
                  style={[styles.submitBtn, closingCheckout && { opacity: 0.6 }]}
                  onPress={handleCloseCheckout}
                  disabled={closingCheckout}
                >
                  <Text style={styles.submitBtnText}>{closingCheckout ? 'Processing...' : 'Close Checkout'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Task Submissions */}
          {taskSubmissions && taskSubmissions.length > 0 && (
            <View style={[styles.taskCard, { borderWidth: 1, borderColor: '#FF980044', marginBottom: 20 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <MaterialCommunityIcons name="bell-ring-outline" size={20} color="#FF9800" />
                <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#FF9800' }]}>
                  Pending Submissions ({taskSubmissions.length})
                </Text>
              </View>
              {taskSubmissions.map((sub: any) => (
                <View key={sub._id} style={[styles.taskCard, { backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: 8 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{sub.employeeName}</Text>
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>{sub.employeeDept}</Text>
                  </View>
                  <Text style={styles.taskTitle}>{sub.taskTitle}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 6 }}>
                    <View style={[styles.diffBadge, { backgroundColor: DIFF_COLORS[sub.taskDifficulty] ? DIFF_COLORS[sub.taskDifficulty] + '22' : '#99999922' }]}>
                      <Text style={[styles.diffText, { color: DIFF_COLORS[sub.taskDifficulty] || '#999' }]}>{sub.taskDifficulty}</Text>
                    </View>
                    <View style={[styles.statusBadge, {
                      backgroundColor: sub.status === 'completed' ? '#4CAF5022' : '#F4433622'
                    }]}>
                      <Text style={[styles.statusText, {
                        color: sub.status === 'completed' ? '#4CAF50' : '#F44336'
                      }]}>
                        {sub.status === 'completed' ? '✓ Completed' : '✗ Incomplete'}
                      </Text>
                    </View>
                  </View>
                  {sub.reason ? (
                    <View style={{ backgroundColor: 'rgba(255,152,0,0.1)', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                      <Text style={{ fontSize: 12, color: '#FFB74D' }}>Reason: {sub.reason}</Text>
                    </View>
                  ) : null}
                  <View style={styles.extReqBtns}>
                    <TouchableOpacity
                      style={[styles.extBtn, { backgroundColor: '#4CAF5033' }]}
                      onPress={() => handleSubmissionResponse(sub._id, true)}
                    >
                      <MaterialCommunityIcons name="check" size={16} color="#4CAF50" />
                      <Text style={[styles.extBtnText, { color: '#4CAF50' }]}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.extBtn, { backgroundColor: '#F4433633' }]}
                      onPress={() => handleSubmissionResponse(sub._id, false)}
                    >
                      <MaterialCommunityIcons name="close" size={16} color="#F44336" />
                      <Text style={[styles.extBtnText, { color: '#F44336' }]}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Date Selector */}
          <View style={styles.dateRow}>
            <TouchableOpacity onPress={() => shiftDate(-1)} style={styles.dateArrow}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.dateCenter}>
              <MaterialCommunityIcons name="calendar" size={16} color={colors.primary} />
              <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
              {selectedDate === today && <View style={styles.todayBadge}><Text style={styles.todayText}>Today</Text></View>}
            </View>
            <TouchableOpacity onPress={() => shiftDate(1)} style={styles.dateArrow}>
              <MaterialCommunityIcons name="chevron-right" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Employee Selector */}
          <Text style={styles.sectionTitle}>Select Employee</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.empScroll}>
            {(employees || []).map((emp: any) => {
              const isSelected = emp._id === selectedEmpId;
              return (
                <TouchableOpacity
                  key={emp._id}
                  style={[styles.empChip, isSelected && styles.empChipSelected]}
                  onPress={() => setSelectedEmpId(emp._id)}
                >
                  <View style={[styles.empDot, { backgroundColor: isSelected ? colors.primary : colors.textMuted }]} />
                  <Text style={[styles.empChipText, isSelected && styles.empChipTextSelected]}>
                    {emp.firstName} {emp.lastName?.[0] || ''}
                  </Text>
                  <Text style={styles.empDept}>{emp.department}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Tasks List */}
          {selectedEmpId && (
            <>
              <View style={styles.taskHeader}>
                <Text style={styles.sectionTitle}>
                  Tasks for {selectedEmployee?.firstName || 'Employee'} ({tasks?.length || 0})
                </Text>
                <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
                  <MaterialCommunityIcons name="plus" size={18} color="#fff" />
                  <Text style={styles.addBtnText}>Add Task</Text>
                </TouchableOpacity>
              </View>

              {tasks && tasks.length === 0 && (
                <View style={styles.emptyCard}>
                  <MaterialCommunityIcons name="clipboard-text-outline" size={40} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No tasks assigned for this date</Text>
                </View>
              )}

              {(tasks || []).map((task: any) => (
                <View key={task._id} style={styles.taskCard}>
                  <View style={styles.taskTop}>
                    <View style={[styles.diffBadge, { backgroundColor: DIFF_COLORS[task.difficulty] + '22' }]}>
                      <MaterialCommunityIcons name={DIFF_ICONS[task.difficulty] as any} size={14} color={DIFF_COLORS[task.difficulty]} />
                      <Text style={[styles.diffText, { color: DIFF_COLORS[task.difficulty] }]}>{task.difficulty}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {task.deadline && task.deadline !== selectedDate && (
                        <View style={[styles.statusBadge, { backgroundColor: '#2196F322' }]}>
                          <Text style={[styles.statusText, { color: '#2196F3' }]}>Due: {task.deadline}</Text>
                        </View>
                      )}
                      <View style={[styles.statusBadge, {
                        backgroundColor: task.status === 'completed' ? '#4CAF5022' :
                          task.status === 'pending' ? '#FF980022' :
                          task.status === 'extended' ? '#2196F322' : '#9C27B022'
                      }]}>
                        <Text style={[styles.statusText, {
                          color: task.status === 'completed' ? '#4CAF50' :
                            task.status === 'pending' ? '#FF9800' :
                            task.status === 'extended' ? '#2196F3' : '#9C27B0'
                        }]}>
                          {task.status === 'extension_requested' ? 'Ext. Requested' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  {task.description ? <Text style={styles.taskDesc}>{task.description}</Text> : null}
                  {/* Submission info */}
                  {task.submission && (
                    <View style={{
                      backgroundColor: task.submission.adminResponse === 'approved' ? '#4CAF5011' :
                        task.submission.adminResponse === 'rejected' ? '#F4433611' : '#FF980011',
                      borderRadius: 8, padding: 8, marginTop: 8, borderLeftWidth: 2,
                      borderLeftColor: task.submission.adminResponse === 'approved' ? '#4CAF50' :
                        task.submission.adminResponse === 'rejected' ? '#F44336' : '#FF9800',
                    }}>
                      <Text style={{ fontSize: 11, color: colors.textMuted }}>
                        Employee submitted: <Text style={{ fontWeight: '700', color: task.submission.status === 'completed' ? '#4CAF50' : '#F44336' }}>
                          {task.submission.status === 'completed' ? 'Completed' : 'Incomplete'}
                        </Text>
                        {task.submission.reason ? ` — "${task.submission.reason}"` : ''}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>
                        Review: {task.submission.adminResponse.charAt(0).toUpperCase() + task.submission.adminResponse.slice(1)}
                      </Text>
                    </View>
                  )}
                  {task.extensionRequest && task.extensionRequest.status === 'pending' && (
                    <View style={styles.extReqCard}>
                      <Text style={styles.extReqText}>Extension requested: {task.extensionRequest.reason}</Text>
                      <View style={styles.extReqBtns}>
                        <TouchableOpacity
                          style={[styles.extBtn, { backgroundColor: '#4CAF5033' }]}
                          onPress={() => handleExtension(task.extensionRequest._id, true)}
                        >
                          <MaterialCommunityIcons name="check" size={16} color="#4CAF50" />
                          <Text style={[styles.extBtnText, { color: '#4CAF50' }]}>Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.extBtn, { backgroundColor: '#F4433633' }]}
                          onPress={() => handleExtension(task.extensionRequest._id, false)}
                        >
                          <MaterialCommunityIcons name="close" size={16} color="#F44336" />
                          <Text style={[styles.extBtnText, { color: '#F44336' }]}>Reject</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                  {task.extensionRequest && task.extensionRequest.isAutoApproved && (
                    <View style={styles.autoApproved}>
                      <MaterialCommunityIcons name="lightning-bolt" size={14} color="#2196F3" />
                      <Text style={styles.autoApprovedText}>Auto-approved (within weekly limit)</Text>
                    </View>
                  )}
                </View>
              ))}
            </>
          )}

          {/* Pending Extension Requests (Global) */}
          {extensionRequests && extensionRequests.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
                Pending Extension Requests ({extensionRequests.length})
              </Text>
              {extensionRequests.map((req: any) => (
                <View key={req._id} style={[styles.taskCard, { borderLeftColor: '#9C27B0', borderLeftWidth: 3 }]}>
                  <Text style={styles.taskTitle}>{req.taskTitle}</Text>
                  <Text style={styles.taskDesc}>
                    {req.employeeName} " {req.employeeDepartment} " {req.taskDifficulty}
                  </Text>
                  <Text style={[styles.taskDesc, { color: '#FF9800', marginTop: 4 }]}>Reason: {req.reason}</Text>
                  <View style={[styles.extReqBtns, { marginTop: 8 }]}>
                    <TouchableOpacity
                      style={[styles.extBtn, { backgroundColor: '#4CAF5033' }]}
                      onPress={() => handleExtension(req._id, true)}
                    >
                      <MaterialCommunityIcons name="check" size={16} color="#4CAF50" />
                      <Text style={[styles.extBtnText, { color: '#4CAF50' }]}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.extBtn, { backgroundColor: '#F4433633' }]}
                      onPress={() => handleExtension(req._id, false)}
                    >
                      <MaterialCommunityIcons name="close" size={16} color="#F44336" />
                      <Text style={[styles.extBtnText, { color: '#F44336' }]}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>

        {/* Add Task Modal */}
        <Modal visible={showForm} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Assign New Task</Text>
                <TouchableOpacity onPress={() => setShowForm(false)}>
                  <MaterialCommunityIcons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Employee</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>
                  {selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName || ''} (${selectedEmployee.department})` : 'None selected'}
                </Text>
              </View>

              <Text style={styles.label}>Date</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{formatDate(selectedDate)}</Text>
              </View>

              <Text style={styles.label}>Task Title *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter task title"
                placeholderTextColor={colors.textMuted}
                value={title}
                onChangeText={setTitle}
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Enter task description (optional)"
                placeholderTextColor={colors.textMuted}
                value={description}
                onChangeText={setDescription}
                multiline
              />

              <Text style={styles.label}>Difficulty Level</Text>
              <View style={styles.diffRow}>
                {DIFFICULTIES.map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.diffOption, difficulty === d && { backgroundColor: DIFF_COLORS[d] + '33', borderColor: DIFF_COLORS[d] }]}
                    onPress={() => setDifficulty(d)}
                  >
                    <MaterialCommunityIcons name={DIFF_ICONS[d] as any} size={18} color={difficulty === d ? DIFF_COLORS[d] : colors.textMuted} />
                    <Text style={[styles.diffOptionText, difficulty === d && { color: DIFF_COLORS[d] }]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.assignBtn} onPress={handleAssign} disabled={assigning}>
                {assigning ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check-circle" size={18} color="#fff" />
                    <Text style={styles.assignBtnText}>Assign Task</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  header: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 4 },
  subHeader: { fontSize: 13, color: colors.textMuted, marginBottom: 16 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 8 },
  dateArrow: { padding: 8 },
  dateCenter: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' },
  dateText: { fontSize: 15, fontWeight: '600', color: colors.text },
  todayBadge: { backgroundColor: colors.primary + '33', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  todayText: { fontSize: 10, fontWeight: '600', color: colors.primary },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12 },
  empScroll: { marginBottom: 20 },
  empChip: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, marginRight: 10, minWidth: 100, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  empChipSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  empDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 6 },
  empChipText: { fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' },
  empChipTextSelected: { color: colors.primary },
  empDept: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  emptyCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 30, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 13, color: colors.textMuted },
  taskCard: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, marginBottom: 10 },
  taskTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  diffBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  diffText: { fontSize: 11, fontWeight: '600' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  taskTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 2 },
  taskDesc: { fontSize: 12, color: colors.textMuted },
  extReqCard: { backgroundColor: '#9C27B011', borderRadius: 8, padding: 10, marginTop: 8, borderLeftWidth: 2, borderLeftColor: '#9C27B0' },
  extReqText: { fontSize: 12, color: '#CE93D8', marginBottom: 8 },
  extReqBtns: { flexDirection: 'row', gap: 8 },
  extBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  extBtnText: { fontSize: 12, fontWeight: '600' },
  autoApproved: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  autoApprovedText: { fontSize: 11, color: '#2196F3' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1a1f36', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
  readOnly: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12 },
  readOnlyText: { fontSize: 14, color: colors.text },
  selectContainer: { marginBottom: 4 },
  selectOption: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.glassLight, borderRadius: borderRadius.sm, marginRight: 8, borderWidth: 1, borderColor: colors.borderLight },
  selectOptionText: { fontSize: 12, color: colors.text, fontWeight: '500' },
  input: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 12, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  diffRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  diffOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingVertical: 12, borderWidth: 1, borderColor: 'transparent' },
  diffOptionText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  assignBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, marginTop: 20 },
  assignBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  submitBtn: { backgroundColor: colors.primary, padding: 12, borderRadius: borderRadius.sm, marginTop: 12, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  textSecondary: { color: colors.textSecondary },
});