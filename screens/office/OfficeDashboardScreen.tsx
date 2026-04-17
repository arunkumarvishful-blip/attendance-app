import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, SafeAreaView, Image, FlatList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients } from '../../lib/theme';

const DEPARTMENTS = ['Software', 'Accounting', 'General', 'Management'] as const;

type Department = (typeof DEPARTMENTS)[number];

export default function OfficeDashboardScreen() {
  const [activeDepartment, setActiveDepartment] = useState<Department>('Software');

  const stats = useQuery(api.officeAttendance.getOfficeDepartmentStats, {
    department: activeDepartment,
  });

  const dashboard = useQuery(api.officeAttendance.getOfficeDashboard, {
    department: activeDepartment,
  });

  const sortedDashboard = useMemo(() => {
    if (!dashboard) return [];
    return [...dashboard].sort((a, b) => {
      const aName = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
      const bName = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [dashboard]);

  const renderMemberCard = ({ item }: any) => {
    const isPresent = item.status === 'present' || item.status === 'late' || item.status === 'permission';
    const isLate = item.status === 'late';

    return (
      <View
        style={[
          styles.memberCard,
          isPresent && !isLate && styles.memberCardPresent,
          isLate && styles.memberCardLate,
        ]}
      >
        {item.faceImageUrl ? (
          <Image
            source={{ uri: item.faceImageUrl }}
            style={[
              styles.memberPhoto,
              isPresent && !isLate && styles.memberPhotoBorder,
              isLate && styles.memberPhotoLate,
            ]}
          />
        ) : (
          <View style={[styles.memberPhoto, styles.memberPhotoFallback]}>
            <Text style={styles.memberPhotoText}>
              {(item.firstName?.[0] || '').toUpperCase()}
              {(item.lastName?.[0] || '').toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.memberDetails}>
          <Text style={styles.memberName}>{item.firstName} {item.lastName}</Text>
          <Text style={styles.memberPosition}>{item.position || item.department}</Text>
          <View style={styles.timingRow}>
            <Text style={styles.timing}>
              {item.checkInTime ? `In: ${item.checkInTime}` : 'Not checked in'}
            </Text>
            {item.checkOutTime ? <Text style={styles.timing}>Out: {item.checkOutTime}</Text> : null}
          </View>
        </View>

        <View
          style={[
            styles.statusBadge,
            isPresent && !isLate ? styles.statusPresent : isLate ? styles.statusLate : styles.statusAbsent,
          ]}
        >
          <Text style={styles.statusText}>{isLate ? 'Late' : isPresent ? 'Present' : 'Absent'}</Text>
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={gradients.background as any} style={styles.container}>
      <SafeAreaView style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Office Dashboard</Text>
            <Text style={styles.subtitle}>Live attendance by department</Text>
          </View>

          <View style={styles.summaryCards}>
            <View style={styles.card}>
              <MaterialCommunityIcons name="check-circle" size={26} color="#4CAF50" />
              <Text style={styles.cardValue}>{stats?.present || 0}</Text>
              <Text style={styles.cardLabel}>Present</Text>
            </View>
            <View style={styles.card}>
              <MaterialCommunityIcons name="clock-alert-outline" size={26} color="#FF9800" />
              <Text style={styles.cardValue}>{stats?.late || 0}</Text>
              <Text style={styles.cardLabel}>Late</Text>
            </View>
            <View style={styles.card}>
              <MaterialCommunityIcons name="exit-run" size={26} color="#2196F3" />
              <Text style={styles.cardValue}>{stats?.permission || 0}</Text>
              <Text style={styles.cardLabel}>Permission</Text>
            </View>
            <View style={styles.card}>
              <MaterialCommunityIcons name="close-circle" size={26} color="#F44336" />
              <Text style={styles.cardValue}>{stats?.absent || 0}</Text>
              <Text style={styles.cardLabel}>Absent</Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {DEPARTMENTS.map((department) => {
              const isActive = activeDepartment === department;
              return (
                <TouchableOpacity
                  key={department}
                  onPress={() => setActiveDepartment(department)}
                  style={[styles.tab, isActive && styles.tabActive]}
                >
                  <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{department}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <FlatList
            data={sortedDashboard}
            renderItem={renderMemberCard}
            keyExtractor={(item) => item._id}
            scrollEnabled={false}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.emptyText}>No employees found for this department.</Text>}
          />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#b0b9c1',
  },
  summaryCards: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  card: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardValue: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  cardLabel: {
    marginTop: 4,
    fontSize: 11,
    color: '#b0b9c1',
  },
  tabs: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 14,
  },
  tab: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tabActive: {
    backgroundColor: '#4A90D9',
    borderColor: '#4A90D9',
  },
  tabText: {
    color: '#c8d0d8',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  memberCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  memberCardPresent: {
    backgroundColor: 'rgba(76,175,80,0.1)',
    borderColor: 'rgba(76,175,80,0.3)',
  },
  memberCardLate: {
    backgroundColor: 'rgba(255,152,0,0.1)',
    borderColor: 'rgba(255,152,0,0.3)',
  },
  memberPhoto: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  memberPhotoFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  memberPhotoText: {
    color: '#fff',
    fontWeight: '700',
  },
  memberPhotoBorder: {
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  memberPhotoLate: {
    borderWidth: 2,
    borderColor: '#FF9800',
  },
  memberDetails: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  memberPosition: {
    marginTop: 2,
    fontSize: 12,
    color: '#b0b9c1',
  },
  timingRow: {
    marginTop: 4,
    gap: 4,
  },
  timing: {
    fontSize: 11,
    color: '#7fb5ff',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusPresent: {
    backgroundColor: 'rgba(76,175,80,0.2)',
  },
  statusLate: {
    backgroundColor: 'rgba(255,152,0,0.2)',
  },
  statusAbsent: {
    backgroundColor: 'rgba(244,67,54,0.2)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  emptyText: {
    color: '#b0b9c1',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
