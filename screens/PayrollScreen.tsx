import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Share, TextInput, Modal, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { colors, gradients, spacing, borderRadius, formatINR } from '../lib/theme';
import GlassCard from '../components/GlassCard';
import GlassButton from '../components/GlassButton';
import GlassInput from '../components/GlassInput';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';

export default function PayrollScreen() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const isAdmin = currentUser?.role === 'superadmin' || currentUser?.role === 'admin' || currentUser?.role === 'hr';
  const isEmployee = currentUser?.role === 'employee';
  const companies = useQuery(api.companies.list) || [];
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bonusEditId, setBonusEditId] = useState<string | null>(null);
  const [bonusValue, setBonusValue] = useState('');

  // Payment modal state
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [payRecordId, setPayRecordId] = useState<string | null>(null);
  const [payMode, setPayMode] = useState('Bank Transfer');
  const [payReference, setPayReference] = useState('');
  const [payDate, setPayDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const monthStr = String(month).padStart(2, '0');
  const queryArgs: any = { month: monthStr, year };
  if (selectedCompany) queryArgs.companyId = selectedCompany;

  // Employee sees only their own payroll
  const myPayroll = useQuery(
    api.payroll.getMyPayroll,
    isEmployee && currentUser?.employeeId ? { employeeId: currentUser.employeeId } : 'skip'
  ) || [];

  // Admin sees all payroll
  const adminPayroll = useQuery(
    api.payroll.getByMonth,
    isAdmin ? queryArgs : 'skip'
  ) || [];

  // Use the right data based on role
  const payrollData = isEmployee ? myPayroll.filter((p: any) => p.month === monthStr && p.year === year) : adminPayroll;

  const generate = useMutation(api.payroll.generate);
  const markPaid = useMutation(api.payroll.markPaid);
  const updateBonus = useMutation(api.payroll.updateBonus);

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const payModes = ['Bank Transfer', 'UPI', 'Cash', 'Cheque', 'NEFT/RTGS', 'IMPS'];

  const handleGenerate = async () => {
    try {
      const args: any = { month: monthStr, year };
      if (selectedCompany) args.companyId = selectedCompany;
      await generate(args);
      Alert.alert('Success', 'Payroll generated');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleBonusSave = async (id: string) => {
    try {
      await updateBonus({ id: id as any, bonus: parseFloat(bonusValue) || 0 });
      setBonusEditId(null); setBonusValue('');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const openPayModal = (id: string) => {
    setPayRecordId(id);
    setPayMode('Bank Transfer');
    setPayReference('');
    setPayDate(new Date());
    setPayModalVisible(true);
  };

  const handleMarkPaid = async () => {
    if (!payRecordId) return;
    try {
      const dateStr = `${payDate.getFullYear()}-${String(payDate.getMonth()+1).padStart(2,'0')}-${String(payDate.getDate()).padStart(2,'0')}`;
      await markPaid({
        id: payRecordId as any,
        paidDate: dateStr,
        paymentMode: payMode,
        paymentReference: payReference || undefined,
      });
      setPayModalVisible(false);
      Alert.alert('Success', 'Marked as paid');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const totalNet = payrollData.reduce((s: number, p: any) => s + (p.netSalary || 0), 0);
  const totalBonus = payrollData.reduce((s: number, p: any) => s + (p.bonus || 0), 0);

  const formatPayDate = (d: Date) => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
  };

  const generatePDF = async (records: any[]) => {
    const rows = records.map((p: any) => `<tr><td>${p.employeeName}</td><td>${formatINR(p.baseSalary)}</td><td>${p.daysWorked}/${p.workingDaysInMonth || p.totalDays}</td><td>${formatINR(p.bonus || 0)}</td><td>${formatINR(p.deductions)}</td><td><b>${formatINR(p.netSalary)}</b></td></tr>`).join('');
    const html = `<html><head><style>body{font-family:sans-serif;padding:20px}h1{color:#333}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style></head><body><h1>Payroll - ${monthNames[month-1]} ${year}</h1><table><tr><th>Employee</th><th>Base</th><th>Days Worked/Expected</th><th>Bonus</th><th>Deductions</th><th>Net</th></tr>${rows}<tr><td colspan="5"><b>Total</b></td><td><b>${formatINR(totalNet)}</b></td></tr></table></body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    await Share.share({ url: uri, title: `Payroll_${monthStr}_${year}.pdf` });
  };

  return (
    <LinearGradient colors={gradients.background as any} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Payroll</Text>

        {/* Month selector */}
        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); }}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.monthText}>{monthNames[month - 1]} {year}</Text>
          <TouchableOpacity onPress={() => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); }}>
            <Ionicons name="chevron-forward" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Company filter - admin only */}
        {isAdmin && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            <TouchableOpacity style={[styles.chip, !selectedCompany && styles.chipActive]} onPress={() => setSelectedCompany(null)}>
              <Text style={[styles.chipText, !selectedCompany && styles.chipTextActive]}>All</Text>
            </TouchableOpacity>
            {companies.map((c: any) => (
              <TouchableOpacity key={c._id} style={[styles.chip, selectedCompany === c._id && styles.chipActive]} onPress={() => setSelectedCompany(selectedCompany === c._id ? null : c._id)}>
                <Text style={[styles.chipText, selectedCompany === c._id && styles.chipTextActive]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Summary */}
        <GlassCard style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryLabel}>{isEmployee ? 'My Net Salary' : 'Total Net Salary'}</Text>
              <Text style={styles.summaryValue}>{formatINR(totalNet)}</Text>
            </View>
            <View style={styles.summaryRight}>
              <Text style={styles.summaryLabel}>Bonus</Text>
              <Text style={styles.summaryBonus}>{formatINR(totalBonus)}</Text>
            </View>
          </View>
          <Text style={styles.summaryCount}>{isEmployee ? '' : `${payrollData.length} employees`}</Text>
        </GlassCard>

        {/* Actions */}
        {isAdmin && (
          <View style={styles.actionRow}>
            <GlassButton title="Generate" onPress={handleGenerate} small />
            <GlassButton title="Export PDF" variant="secondary" onPress={() => generatePDF(payrollData)} small />
          </View>
        )}

        {/* Records */}
        {payrollData.map((p: any) => {
          const expanded = expandedId === p._id;
          const editingBonus = bonusEditId === p._id;
          const isPaid = p.status === 'paid';
          return (
            <TouchableOpacity key={p._id} style={styles.payCard} onPress={() => setExpandedId(expanded ? null : p._id)} activeOpacity={0.7}>
              <View style={styles.payHeader}>
                <View style={styles.payInfo}>
                  <Text style={styles.payName}>{p.employeeName || 'Employee'}</Text>
                  <Text style={styles.payDept}>{p.department || ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.payNet}>{formatINR(p.netSalary)}</Text>
                  {isPaid && (
                    <View style={styles.paidBadge}>
                      <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                      <Text style={styles.paidText}>Paid</Text>
                    </View>
                  )}
                </View>
              </View>
              {expanded && (
                <View style={styles.expandedContent}>
                  {/* Breakdown */}
                  <View style={styles.breakdownSection}>
                    <Text style={styles.sectionTitle}>Breakdown</Text>
                    
                    {/* Days Section */}
                    <View style={styles.breakdownRow}>
                      <Text style={styles.label}>Total Calendar Days:</Text>
                      <Text style={styles.value}>{p.totalDays}</Text>
                    </View>
                    
                    {p.nonWorkingDays ? (
                      <View style={styles.breakdownRow}>
                        <Text style={styles.label}>Non-Working Days (Paid):</Text>
                        <Text style={styles.value}>{p.nonWorkingDays}</Text>
                      </View>
                    ) : null}
                    
                    <View style={styles.breakdownRow}>
                      <Text style={styles.label}>Days Worked:</Text>
                      <Text style={styles.value}>{p.daysWorked}</Text>
                    </View>
                    {p.halfDays ? (
                      <View style={[styles.breakdownRow, { paddingLeft: 40 }]}>
                        <Text style={styles.label}>• Attendance Days:</Text>
                        <Text style={styles.value}>{p.daysWorked - (p.halfDays || 0) - (p.nonWorkingDays || 0)}</Text>
                      </View>
                    ) : null}
                    {p.halfDays ? (
                      <View style={[styles.breakdownRow, { paddingLeft: 40 }]}>
                        <Text style={styles.label}>• Half Days:</Text>
                        <Text style={styles.value}>{p.halfDays}</Text>
                      </View>
                    ) : null}
                    
                    <View style={styles.breakdownRow}>
                      <Text style={styles.label}>Absent Days (Leave):</Text>
                      <Text style={styles.value}>{p.absentDays || 0}</Text>
                    </View>
                  </View>

                  {/* Salary Calculation Section */}
                  <View style={styles.breakdownSection}>
                    <Text style={styles.sectionTitle}>Salary Calculation</Text>
                    
                    <View style={styles.breakdownRow}>
                      <Text style={styles.label}>Base Salary:</Text>
                      <Text style={styles.value}>₹{p.baseSalary?.toLocaleString('en-IN')}</Text>
                    </View>

                    <View style={styles.breakdownRow}>
                      <Text style={styles.label}>Per Day Salary:</Text>
                      <Text style={styles.value}>₹{(p.baseSalary / p.totalDays).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
                    </View>

                    {/* Deductions Breakdown */}
                    <View style={styles.breakdownRow}>
                      <Text style={styles.label}>Deductions:</Text>
                    </View>
                    
                    <View style={[styles.breakdownRow, { paddingLeft: 40 }]}>
                      <Text style={styles.label}>• Absent Days: {p.absentDays || 0} × ₹{(p.baseSalary / p.totalDays).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
                    </View>

                    {p.halfDays ? (
                      <View style={[styles.breakdownRow, { paddingLeft: 40 }]}>
                        <Text style={styles.label}>• Half Days: {p.halfDays} × ₹{((p.baseSalary / p.totalDays) * 0.5).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
                      </View>
                    ) : null}

                    <View style={styles.breakdownRow}>
                      <Text style={styles.label}>Total Deductions:</Text>
                      <Text style={styles.value}>₹{p.deductions?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
                    </View>

                    {/* Salary after deductions */}
                    <View style={[styles.breakdownRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 8 }]}>
                      <Text style={styles.label}>Salary (Base - Deductions):</Text>
                      <Text style={styles.value}>₹{((p.baseSalary || 0) - (p.deductions || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
                    </View>

                    {/* Bonus */}
                    {p.bonus ? (
                      <View style={styles.breakdownRow}>
                        <Text style={styles.label}>Bonus (Lumpsum):</Text>
                        <Text style={styles.value}>₹{p.bonus?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
                      </View>
                    ) : null}

                    {/* Net Salary */}
                    <View style={[styles.breakdownRow, { backgroundColor: colors.primary, borderRadius: 8, padding: 12, marginTop: 8 }]}>
                      <Text style={[styles.label, { color: 'white', fontWeight: '600' }]}>Net Salary:</Text>
                      <Text style={[styles.value, { color: 'white', fontWeight: '700', fontSize: 18 }]}>₹{p.netSalary?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
                    </View>
                  </View>

                  {/* Payment Status */}
                  {p.status === 'paid' && (
                    <View style={styles.breakdownSection}>
                      <Text style={styles.sectionTitle}>Payment Details</Text>
                      {p.paidDate && (
                        <View style={styles.breakdownRow}>
                          <Text style={styles.label}>Paid Date:</Text>
                          <Text style={styles.value}>{new Date(p.paidDate).toLocaleDateString()}</Text>
                        </View>
                      )}
                      {p.paymentMode && (
                        <View style={styles.breakdownRow}>
                          <Text style={styles.label}>Mode:</Text>
                          <Text style={styles.value}>{p.paymentMode}</Text>
                        </View>
                      )}
                      {p.paymentReference && (
                        <View style={styles.breakdownRow}>
                          <Text style={styles.label}>Reference:</Text>
                          <Text style={styles.value}>{p.paymentReference}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
        {payrollData.length === 0 && <Text style={styles.empty}>{isEmployee ? 'No payroll records for this month yet.' : 'No payroll records. Generate payroll for this month.'}</Text>}
      </ScrollView>

      {/* Payment Details Modal */}
      <Modal visible={payModalVisible} transparent animationType="slide" onRequestClose={() => setPayModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Payment Details</Text>
              <TouchableOpacity onPress={() => setPayModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Payment Date</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={styles.dateText}>{formatPayDate(payDate)}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={payDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(e: any, d?: Date) => { setShowDatePicker(Platform.OS === 'ios'); if (d) setPayDate(d); }}
                themeVariant="dark"
              />
            )}

            <Text style={styles.fieldLabel}>Payment Mode</Text>
            <View style={styles.modeGrid}>
              {payModes.map(m => (
                <TouchableOpacity key={m} style={[styles.modeChip, payMode === m && styles.modeChipActive]} onPress={() => setPayMode(m)}>
                  <Text style={[styles.modeChipText, payMode === m && styles.modeChipTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <GlassInput label="Transfer Reference / UTR (optional)" value={payReference} onChangeText={setPayReference} placeholder="e.g. UTR123456789" />

            <View style={{ marginTop: 20 }}>
              <GlassButton title="Confirm Payment" onPress={handleMarkPaid} />
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 20 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 16 },
  monthText: { fontSize: 18, fontWeight: '600', color: colors.text },
  filterRow: { marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border, marginRight: 8 },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
  summaryCard: { marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryRight: { alignItems: 'flex-end' },
  summaryLabel: { fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: 28, fontWeight: '700', color: colors.text, marginTop: 4 },
  summaryBonus: { fontSize: 20, fontWeight: '600', color: colors.success, marginTop: 4 },
  summaryCount: { fontSize: 12, color: colors.textTertiary, marginTop: 8 },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  payCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: borderRadius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.borderLight },
  payHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payInfo: { flex: 1 },
  payName: { fontSize: 15, fontWeight: '600', color: colors.text },
  payDept: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  payNet: { fontSize: 17, fontWeight: '700', color: colors.success },
  paidBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, backgroundColor: colors.successBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  paidText: { fontSize: 11, color: colors.success, fontWeight: '600' },
  expandedContent: { marginTop: 14, borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: 12 },
  breakdownSection: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  label: { fontSize: 13, color: colors.textSecondary },
  value: { fontSize: 13, fontWeight: '500', color: colors.text },
  payDetail: { marginTop: 14, borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  summaryList: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: borderRadius.sm, overflow: 'hidden' },
  summaryListItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  slLabel: { fontSize: 13, color: colors.textSecondary },
  slValue: { fontSize: 13, fontWeight: '500', color: colors.text },
  slLabelBold: { fontSize: 14, fontWeight: '700', color: colors.text },
  slValueBold: { fontSize: 15, fontWeight: '700', color: colors.primary },
  workingDaysRow: { backgroundColor: 'rgba(74,144,217,0.08)', borderBottomWidth: 0 },
  payDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  pdLabel: { fontSize: 13, color: colors.textSecondary },
  pdValue: { fontSize: 13, fontWeight: '500', color: colors.text },
  bonusEdit: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bonusInput: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, color: colors.text, fontSize: 14, width: 80, textAlign: 'right' },
  bonusRow: { flexDirection: 'row', alignItems: 'center' },
  netRow: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8, paddingTop: 10 },
  netLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  netValue: { fontSize: 18, fontWeight: '700', color: colors.primary },
  paymentInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: colors.successBg, borderRadius: borderRadius.sm, padding: 10 },
  paymentText: { fontSize: 12, color: colors.success, fontWeight: '500', flex: 1 },
  payActions: { flexDirection: 'row', gap: 12, marginTop: 14 },
  empty: { fontSize: 14, color: colors.textTertiary, textAlign: 'center', paddingVertical: 40 },

  // Payment modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.bgMid, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  dateButton: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: borderRadius.sm, padding: 12, borderWidth: 1, borderColor: colors.border },
  dateText: { fontSize: 15, color: colors.text, fontWeight: '500' },
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border },
  modeChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  modeChipText: { fontSize: 13, color: colors.textSecondary },
  modeChipTextActive: { color: colors.primary, fontWeight: '600' },
});