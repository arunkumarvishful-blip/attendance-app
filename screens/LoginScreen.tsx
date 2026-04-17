import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator, TextInput, ScrollView, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthActions } from '@convex-dev/auth/react';
import { useConvex, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { colors, gradients, spacing, borderRadius } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const ensureAdmin = useMutation(api.users.ensureAdminExists);
  const repairPasswordAccountLink = useMutation(api.users.repairPasswordAccountLinkByEmail);
  const convex = useConvex();
  useEffect(() => { ensureAdmin().catch(() => {}); }, []);

  const { signIn } = useAuthActions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Prevent setState on unmounted component (happens when signIn succeeds and navigates away)
  const mountedRef = React.useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    if (!trimmedEmail || !trimmedPassword) {
      setError('Please enter both email and password.');
      return;
    }
    if (mountedRef.current) setLoading(true);
    if (mountedRef.current) setError('');
    try {
      // Try signing in first
      await signIn('password', { email: trimmedEmail, password: trimmedPassword, flow: 'signIn' });
      // signIn succeeded — component will unmount due to navigation, so stop here
      return;
    } catch (signInError: any) {
      const msg = signInError.message || '';
      const nullUserLinkError =
        msg.includes("Cannot read properties of null (reading '_id')") ||
        msg.includes("reading '_id'");
      if (nullUserLinkError) {
        try {
          await repairPasswordAccountLink({ email: trimmedEmail });
          await signIn('password', { email: trimmedEmail, password: trimmedPassword, flow: 'signIn' });
          return;
        } catch (retryError: any) {
          const retryMsg = retryError?.message || '';
          if (mountedRef.current) {
            if (retryMsg.includes('Invalid password')) {
              setError('Invalid password. Please try again.');
            } else {
              setError('Login failed. Please check your credentials.');
            }
          }
          return;
        }
      }
      // Some Convex auth versions return "Invalid credentials" for accounts
      // that don't have a password auth record yet. If the email is pre-created
      // by admin, try first-time signUp flow automatically.
      if (msg.includes('Invalid credentials')) {
        try {
          const isRegistered = await convex.query(api.users.checkEmailExists, { email: trimmedEmail });
          if (isRegistered) {
            await signIn('password', { email: trimmedEmail, password: trimmedPassword, flow: 'signUp' });
            return;
          }
          if (mountedRef.current) {
            setError('This email is not registered. Please contact your admin.');
          }
          return;
        } catch (activateError: any) {
          const activateMsg = activateError?.message || '';
          if (mountedRef.current) {
            if (activateMsg.includes('already been used') || activateMsg.includes('already exists')) {
              setError('Invalid password. Please try again.');
            } else if (activateMsg.includes('not registered')) {
              setError('This email is not registered. Please contact your admin.');
            } else {
              setError('Login failed. Please check your credentials.');
            }
          }
          return;
        }
      }
      // If the auth account doesn't exist yet, try signUp to create it
      // This handles first-time login for admin-created users & default admin
      if (msg.includes('InvalidAccountId') || msg.includes('not registered') || msg.includes('Could not verify')) {
        try {
          await signIn('password', { email: trimmedEmail, password: trimmedPassword, flow: 'signUp' });
          // signUp succeeded — component will unmount, stop here
          return;
        } catch (signUpError: any) {
          const signUpMsg = signUpError.message || '';
          if (mountedRef.current) {
            if (signUpMsg.includes('not registered')) {
              setError('This email is not registered. Please contact your admin.');
            } else if (signUpMsg.includes('already been used') || signUpMsg.includes('already exists')) {
              setError('Invalid password. Please try again.');
            } else {
              setError('Invalid email or password.');
            }
          }
        }
      } else if (msg.includes('Invalid password')) {
        if (mountedRef.current) setError('Invalid password. Please try again.');
      } else {
        if (mountedRef.current) setError('Login failed. Please check your credentials.');
      }
    } finally {
      // Only reset loading if still mounted (i.e. login failed)
      if (mountedRef.current) setLoading(false);
    }
  };

  return (
    <LinearGradient colors={gradients.background as any} style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.content}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.innerContent}>
              <View style={styles.header}>
                <View style={styles.logoCircle}>
                  <Ionicons name="finger-print" size={32} color={colors.primary} />
                </View>
                <Text style={styles.title}>AttendPay</Text>
                <Text style={styles.subtitle}>Attendance & Payroll Management</Text>
              </View>

              <View style={styles.card}>
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle" size={16} color={colors.primary} />
                  <Text style={styles.infoText}>
                    Your login credentials are provided by your admin.
                  </Text>
                </View>
                <View style={styles.inputWrap}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="email@example.com"
                    placeholderTextColor="rgba(230,237,243,0.3)"
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>
                <View style={styles.inputWrap}>
                  <Text style={styles.label}>Password</Text>
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor="rgba(230,237,243,0.3)"
                    secureTextEntry
                  />
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <TouchableOpacity style={styles.btn} onPress={handleSubmit} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign In</Text>}
                </TouchableOpacity>
              </View>

              <Text style={styles.footer}>Powered by AttendPay</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  innerContent: { width: '100%', maxWidth: 440, alignSelf: 'center' as const },
  header: { alignItems: 'center', marginBottom: 32 },
  logoCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  card: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 24 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(99,102,241,0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
  },
  infoText: { fontSize: 13, color: colors.primary, flex: 1 },
  inputWrap: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: colors.text },
  error: { fontSize: 13, color: colors.danger, marginBottom: 12, textAlign: 'center' },
  btn: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: borderRadius.md, alignItems: 'center', marginTop: 8 },
  btnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  footer: { fontSize: 12, color: colors.textTertiary, textAlign: 'center', marginTop: 24 },
});