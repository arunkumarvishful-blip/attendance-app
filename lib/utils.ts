export function formatDate(dateStr: string): string {
const d = new Date(dateStr + 'T00:00:00');
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const day = String(d.getDate()).padStart(2, '0');
const month = months[d.getMonth()];
const year = String(d.getFullYear()).slice(-2);
return `${day}-${month}-${year}`;
}

export function formatTime(timeStr: string | undefined): string {
if (!timeStr) return '--:--';
return timeStr.slice(0, 5);
}

export function getLocalDate(): string {
const now = new Date();
const y = now.getFullYear();
const m = String(now.getMonth() + 1).padStart(2, '0');
const d = String(now.getDate()).padStart(2, '0');
return `${y}-${m}-${d}`;
}

export function getLocalTime(): string {
const now = new Date();
return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
}

export function getStatusColor(status: string) {
switch (status) {
case 'present': return { text: '#00E676', bg: 'rgba(0,230,118,0.12)' };
case 'late': return { text: '#FFD600', bg: 'rgba(255,214,0,0.12)' };
case 'absent': return { text: '#FF5252', bg: 'rgba(255,82,82,0.12)' };
case 'approved': return { text: '#00E676', bg: 'rgba(0,230,118,0.12)' };
case 'rejected': return { text: '#FF5252', bg: 'rgba(255,82,82,0.12)' };
case 'pending': return { text: '#FFD600', bg: 'rgba(255,214,0,0.12)' };
case 'paid': return { text: '#00DCFF', bg: 'rgba(0,220,255,0.12)' };
case 'draft': return { text: 'rgba(255,255,255,0.5)', bg: 'rgba(255,255,255,0.06)' };
default: return { text: 'rgba(255,255,255,0.5)', bg: 'rgba(255,255,255,0.06)' };
}
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
