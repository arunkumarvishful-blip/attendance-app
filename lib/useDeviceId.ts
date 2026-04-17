import { useEffect, useState } from 'react';
import * as Device from 'expo-device';

export function useDeviceId() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);

  useEffect(() => {
    // Get device identifier
    const id = Device.deviceId;
    const name = `${Device.manufacturer} ${Device.modelName}`;
    
    console.log('📱 Device detected:', { id, name });
    
    if (id) {
      setDeviceId(id);
      setDeviceName(name);
    }
  }, []);

  return { deviceId, deviceName };
}
