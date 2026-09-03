export type BluetoothDeviceKind = 'bloodPressure' | 'glucose';
export type BluetoothVitalType = BluetoothDeviceKind;

export interface DeviceProfile {
  readonly kind: BluetoothDeviceKind;
  readonly label: string;
  readonly serviceUuid: number;
  readonly measurementUuid: number;
  readonly batteryUuid: number;
  readonly supportsBattery: boolean;
}

export const BLOOD_PRESSURE_SERVICE_UUID = 0x1810;
export const BLOOD_PRESSURE_MEASUREMENT_UUID = 0x2a35;

export const GLUCOSE_SERVICE_UUID = 0x1808;
export const GLUCOSE_MEASUREMENT_UUID = 0x2a18;

export const BATTERY_SERVICE_UUID = 0x180f;
export const BATTERY_LEVEL_UUID = 0x2a19;

export const DEVICE_PROFILES: Record<BluetoothDeviceKind, DeviceProfile> = {
  bloodPressure: {
    kind: 'bloodPressure',
    label: 'Blood pressure monitor',
    serviceUuid: BLOOD_PRESSURE_SERVICE_UUID,
    measurementUuid: BLOOD_PRESSURE_MEASUREMENT_UUID,
    batteryUuid: BATTERY_LEVEL_UUID,
    supportsBattery: true,
  },
  glucose: {
    kind: 'glucose',
    label: 'Glucometer',
    serviceUuid: GLUCOSE_SERVICE_UUID,
    measurementUuid: GLUCOSE_MEASUREMENT_UUID,
    batteryUuid: BATTERY_LEVEL_UUID,
    supportsBattery: true,
  },
};

export const ALL_DEVICE_PROFILES: DeviceProfile[] = Object.values(DEVICE_PROFILES);

export type BluetoothUUID = string | number;

export interface BluetoothRequestOptions {
  filters: Array<{ services: BluetoothUUID[] }>;
}

export function requestOptionsFor(kind: BluetoothDeviceKind): BluetoothRequestOptions {
  return { filters: [{ services: [DEVICE_PROFILES[kind].serviceUuid] }] };
}
