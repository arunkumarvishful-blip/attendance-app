import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Alert, Platform, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, borderRadius } from '../../lib/theme';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuthActions } from '@convex-dev/auth/react';

export default function OfficeSettingsScreen() {
  const { signOut } = useAuthActions();
  const currentUser = useQuery(api.users.getCurrentUser);
  const quickAddEmployee = useMutation(api.housekeeping.quickAddEmployee);
  
  const [loading, setLoading] = React.useState(false);
  const [showAddEmployeeForm, setShowAddEmployeeForm] = React.useState(false);
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [email, setEmail] = React.useState('');

  const handleLogout = async () => {
    const doSignOut = async () => {
      try {
        await signOut();
      } catch (e) {
        console.log('Sign out error', e);
      }
      if (Platform.OS === 'web') {
        try { (globalThis as any).location?.reload(); } catch {}
      }
    };

    if (Platform.OS === 'web') {
      if ((globalThis as any).confirm('Are you sure you want to sign out?')) {
        await doSignOut();
      }
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: doSignOut },
      ]);
    }
  };

  const handleAddEmployee = async () => {
    if (!firstName.trim() || !email.trim()) {
      Alert.alert('Error', 'Please enter first name and email');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Error', 'Please enter a valid email');
      return;
    }

    setLoading(true);
    try {
      const result = await quickAddEmployee({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        department:"" ,
        position: "",
      });
      
      if (result.success) {
        Alert.alert('Success', result.message);
        setFirstName('');
        setLastName('');
        setEmail('');
        setShowAddEmployeeForm(false);
      } else {
        Alert.alert('Info', result.message);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add employee');
    } finally {
      setLoading(false);
    }
  };

  const rules = [
    { icon: 'clock-outline', label: 'Office Hours', value: '9:30 AM - 5:30 PM' },
    { icon: 'food', label: 'Lunch Break', value: '30-45 min (2 min grace)' },
    { icon: 'clock-alert-outline', label: 'Late Login', value: 'Auto-extends checkout time' },
    { icon: 'close-circle-outline', label: 'Early Checkout', value: 'Not allowed (even if tasks done)' },
    { icon: 'clipboard-check-outline', label: 'Tasks', value: 'Must update status before leaving' },
    { icon: 'calendar-clock', label: 'Hard Task Extension', value: '2 auto-approvals per week' },
    { icon: 'cash-minus', label: 'Max Daily Deduction', value: '50%' },
    { icon: 'lock-outline', label: 'Deduction Rollback', value: 'Not allowed' },
  ];

  return (
    <LinearGradient colors={gradients.background} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={s.title}>Settings</Text>

          <View style={s.card}>
            <Text style={s.cardTitle}>Account</Text>
            <View style={s.row}>
              <MaterialCommunityIcons name="email-outline" size={18} color={colors.textSecondary} />
              <Text style={s.rowText}>{currentUser?.email || 'office@gmail.com'}</Text>
            </View>
            <View style={s.row}>
              <MaterialCommunityIcons name="shield-account-outline" size={18} color={colors.textSecondary} />
              <Text style={s.rowText}>Office Shared Device</Text>
            </View>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Admin Tools</Text>
            <TouchableOpacity 
              style={[s.adminBtn, loading && { opacity: 0.6 }]} 
              onPress={() => setShowAddEmployeeForm(!showAddEmployeeForm)}
              disabled={loading}
            >
              <MaterialCommunityIcons name="account-plus" size={18} color="#fff" />
              <Text style={s.adminBtnText}>{showAddEmployeeForm ? 'Close Form' : 'Add Employee'}</Text>
            </TouchableOpacity>

            {showAddEmployeeForm && (
              <View style={{ marginTop: 16, padding: 12, backgroundColor: colors.glassLight, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.borderLight }}>
                <Text style={s.formLabel}>First Name *</Text>
                <TextInput
                  style={s.input}
                  placeholder="Enter first name"
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholderTextColor={colors.textSecondary}
                />

                <Text style={[s.formLabel, { marginTop: 12 }]}>Last Name</Text>
                <TextInput
                  style={s.input}
                  placeholder="Enter last name (optional)"
                  value={lastName}
                  onChangeText={setLastName}
                  placeholderTextColor={colors.textSecondary}
                />

                <Text style={[s.formLabel, { marginTop: 12 }]}>Email *</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g., john@example.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  placeholderTextColor={colors.textSecondary}
                />

                <Text style={[s.formLabel, { marginTop: 12 }]}>Department & Position</Text>
                <View style={[s.input, { justifyContent: 'center', paddingVertical: 12, borderWidth: 1, borderColor: colors.borderLight }]}>
                  <TextInput style={s.input} />
                </View>

                <TouchableOpacity
                  style={[s.submitBtn, loading && { opacity: 0.6 }]}
                  onPress={handleAddEmployee}
                  disabled={loading}
                >
                  <Text style={s.submitBtnText}>{loading ? 'Adding...' : 'Add Employee'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Policy Rules</Text>
            {rules.map((r, i) => (
              <View key={i} style={[s.ruleRow, i < rules.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
                <MaterialCommunityIcons name={r.icon as any} size={18} color={colors.primary} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={s.ruleLabel}>{r.label}</Text>
                  <Text style={s.ruleValue}>{r.value}</Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity style={s.signOutBtn} onPress={handleLogout}>
            <MaterialCommunityIcons name="logout" size={20} color="#fff" />
            <Text style={s.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 20 },
  card: { backgroundColor: colors.glass, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.glassBorder, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  rowText: { fontSize: 14, color: colors.textSecondary },
  ruleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  ruleLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  ruleValue: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  adminBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.success || '#10b981', padding: 12, borderRadius: borderRadius.md },
  adminBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  formLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.borderLight, borderRadius: borderRadius.sm, padding: 10, color: colors.text, fontSize: 13, backgroundColor: colors.glassLight },
  submitBtn: { backgroundColor: colors.primary, padding: 12, borderRadius: borderRadius.sm, marginTop: 12, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.danger, padding: 14, borderRadius: borderRadius.md, marginTop: 10 },
  signOutText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});