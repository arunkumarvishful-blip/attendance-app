import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, Text, View, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { Authenticated, Unauthenticated, AuthLoading, useQuery, useMutation } from 'convex/react';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from './lib/theme';
import { api } from './convex/generated/api';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import AttendanceScreen from './screens/AttendanceScreen';
import EmployeesScreen from './screens/EmployeesScreen';
import PayrollScreen from './screens/PayrollScreen';
import MoreScreen from './screens/MoreScreen';
import EmployeePortalScreen from './screens/EmployeePortalScreen';
import SetPasswordScreen from './screens/SetPasswordScreen';
import ProfileScreen from './screens/ProfileScreen';
import SharedHomeScreen from './screens/shared/SharedHomeScreen';
import SharedDashboardScreen from './screens/shared/SharedDashboardScreen';
import DepartmentScreen from './screens/shared/DepartmentScreen';
import MemberProfileScreen from './screens/shared/MemberProfileScreen';
import AddEmployeeScreen from './screens/shared/AddEmployeeScreen';
import SharedSettingsScreen from './screens/shared/SharedSettingsScreen';
import OfficeHomeScreen from './screens/office/OfficeHomeScreen';
import OfficeSettingsScreen from './screens/office/OfficeSettingsScreen';
import OfficeDashboardScreen from './screens/office/OfficeDashboardScreen';
import TaskAssignmentScreen from './screens/admin/TaskAssignmentScreen';
import SuperAdminDashboard from './screens/Superadmindashboard';
import SuperAdminAttendance from './screens/Superadminattendance';
import SuperAdminEmployees from './screens/Superadminemployees';
import SuperAdminSettings from './screens/Superadminsettings';
import React, { useEffect } from 'react';
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function FaceScanWebFallback() {
  return (
    <LinearGradient colors={['#0D1117', '#161B22', '#1C2128']} style={styles.loading}>
      <Text style={{ color: colors.text, textAlign: 'center', paddingHorizontal: 20 }}>
        Face scan features are available only in Android or iOS app.
      </Text>
    </LinearGradient>
  );
}

const SharedFaceScanComponent = Platform.OS === 'web'
  ? FaceScanWebFallback
  : require('./screens/shared/SharedFaceScanScreen').default;

const OfficeFaceScanComponent = Platform.OS === 'web'
  ? FaceScanWebFallback
  : require('./screens/office/OfficeFaceScanScreen').default;

const FaceEnrollmentComponent = Platform.OS === 'web'
  ? FaceScanWebFallback
  : require('./screens/admin/FaceEnrollmentScreen').default;

function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }) => {
          let iconName: any = 'home';
          if (route.name === 'Dashboard') iconName = focused ? 'grid' : 'grid-outline';
          else if (route.name === 'Attendance') iconName = focused ? 'scan' : 'scan-outline';
          else if (route.name === 'Employees') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === 'Tasks') iconName = focused ? 'clipboard' : 'clipboard-outline';
          else if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';
          return <Ionicons name={iconName} size={22} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 8,
          height: 88,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500', letterSpacing: 0.3 },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Attendance" component={AttendanceScreen} />
      <Tab.Screen name="Employees" component={EmployeesScreen} />
      <Tab.Screen name="Tasks" component={TaskAssignmentScreen} />
      <Tab.Screen name="Settings" component={MoreScreen} />
    </Tab.Navigator>
  );
}

function EmployeeTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }) => {
          let iconName: any = 'home';
          if (route.name === 'Dashboard') iconName = focused ? 'grid' : 'grid-outline';
          else if (route.name === 'Attendance') iconName = focused ? 'calendar' : 'calendar-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          else if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';
          return <Ionicons name={iconName} size={22} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 8,
          height: 88,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500', letterSpacing: 0.3 },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Attendance" component={AttendanceScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="Settings" component={MoreScreen} />
    </Tab.Navigator>
  );
}

// SharedAccount Navigation Stack
function SharedAccountStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="SharedHome" component={SharedHomeScreen} />
      <Stack.Screen name="Department" component={DepartmentScreen} />
      <Stack.Screen name="MemberProfile" component={MemberProfileScreen} />
      <Stack.Screen name="AddEmployee" component={AddEmployeeScreen} />
      <Stack.Screen name="FaceEnrollment" component={FaceEnrollmentComponent} options={{ title: 'Enroll Face' }} />
    </Stack.Navigator>
  );
}

// SharedAccount Tabs
function SharedAccountTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }: any) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: colors.tabBg,
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.1)',
          height: 60,
        },
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarIcon: ({ color, size }: any) => {
          let iconName = 'home';
          if (route.name === 'FaceScan') iconName = 'face-recognition';
          if (route.name === 'Dash') iconName = 'chart-box';
          if (route.name === 'Settings') iconName = 'cog';
          return <MaterialCommunityIcons name={iconName as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={SharedAccountStack}
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        name="FaceScan"
        component={SharedFaceScanComponent}
        options={{ title: 'Scan' }}
      />
      <Tab.Screen
        name="Dash"
        component={SharedDashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <Tab.Screen
        name="Settings"
        component={SharedSettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

// OfficeAccount Tabs (for office@gmail.com shared device)
function OfficeAccountTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={({ route }: any) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: colors.tabBg,
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.1)',
          height: 60,
        },
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarIcon: ({ color, size }: any) => {
          let iconName = 'home';
          if (route.name === 'Dashboard') iconName = 'chart-box';
          if (route.name === 'FaceScan') iconName = 'face-recognition';
          if (route.name === 'Settings') iconName = 'cog';
          return <MaterialCommunityIcons name={iconName as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={OfficeHomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Dashboard" component={OfficeDashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="FaceScan" component={OfficeFaceScanComponent} options={{ title: 'Scan' }} />
      <Tab.Screen name="Settings" component={OfficeSettingsScreen} options={{ title: 'Settings' }} />
    </Tab.Navigator>
  );
}

const SUPER_ADMIN_EMAIL = 'perikaruppan@gmail.com';

function SuperAdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }) => {
          let iconName: any = 'home';
          if (route.name === 'SA_Dashboard') iconName = focused ? 'grid' : 'grid-outline';
          else if (route.name === 'SA_Attendance') iconName = focused ? 'calendar' : 'calendar-outline';
          else if (route.name === 'SA_Employees') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === 'SA_Tasks') iconName = focused ? 'clipboard' : 'clipboard-outline';
          else if (route.name === 'SA_Settings') iconName = focused ? 'settings' : 'settings-outline';
          return <Ionicons name={iconName} size={22} color={color} />;
        },
        tabBarActiveTintColor: '#F59E0B',
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBg,
          borderTopWidth: 1,
          borderTopColor: 'rgba(245,158,11,0.2)',
          paddingTop: 8,
          height: 88,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
      })}
    >
      <Tab.Screen name="SA_Dashboard" component={SuperAdminDashboard} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="SA_Attendance" component={SuperAdminAttendance} options={{ title: 'Attendance' }} />
      <Tab.Screen name="SA_Employees" component={SuperAdminEmployees} options={{ title: 'Employees' }} />
      <Tab.Screen name="SA_Tasks" component={TaskAssignmentScreen} options={{ title: 'Tasks' }} />
      <Tab.Screen name="SA_Settings" component={SuperAdminSettings} options={{ title: 'Settings' }} />
    </Tab.Navigator>
  );
}


function AuthenticatedApp() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const autoLink = useMutation(api.users.autoLinkEmployeeByEmail);
  const normalizedEmail = (currentUser?.email || '').trim().toLowerCase();

  useEffect(() => {
    if (currentUser && currentUser.role === 'employee' && !currentUser.employeeId) {
      autoLink().catch(() => {});
    }
  }, [currentUser?.email]);

  if (currentUser === undefined) {
    return (
      <LinearGradient colors={['#0D1117', '#161B22', '#1C2128']} style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </LinearGradient>
    );
  }

  // User record was deleted - gracefully logout and show login screen
  if (currentUser === null) {
    return <LoginScreen />;
  }

  // Route shared accounts FIRST — before any password checks
  if (normalizedEmail === 'office@gmail.com') {
    return <OfficeAccountTabs />;
  }
  if (normalizedEmail === 'employee@gmail.com') {
    return <SharedAccountTabs />;
  }

  // Super Admin — perikaruppan@gmail.com gets exclusive super admin UI
  if (normalizedEmail === SUPER_ADMIN_EMAIL || currentUser?.role === 'superadmin') {
    return <SuperAdminTabs />;
  }

  const isEmployee = currentUser?.role === 'employee';
  const mustSetPassword = currentUser?.mustSetPassword === true;

  // First-time employee login: must set their own password
  if (isEmployee && mustSetPassword) {
    return <SetPasswordScreen />;
  }

  // Route by role
  if (currentUser?.role === 'superadmin' || currentUser?.role === 'admin') {
    return <AdminTabs />;
  }

  return <EmployeeTabs />;
}

const convex = new ConvexReactClient("https://uncommon-gerbil-175.convex.cloud");

export default function App() {
  return (
    <ConvexAuthProvider client={convex}>
      <SafeAreaProvider>
        <NavigationContainer>
          <AuthLoading>
            <LinearGradient colors={['#0D1117', '#161B22', '#1C2128']} style={styles.loading}>
              <ActivityIndicator size="large" color={colors.primary} />
            </LinearGradient>
          </AuthLoading>
          <Unauthenticated>
            <LoginScreen />
          </Unauthenticated>
          <Authenticated>
            <AuthenticatedApp />
          </Authenticated>
        </NavigationContainer>
      </SafeAreaProvider>
    </ConvexAuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});