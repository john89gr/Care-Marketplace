import { BluetoothDeviceKind, BluetoothVitalType } from './device-profiles';

export interface ParsedVitalReading {
  type: BluetoothVitalType;
  value: number;
  value2: number | null;
  measuredAtMs: number;
  deviceKind: BluetoothDeviceKind;
  batteryLevel: number | null;
  implausible: boolean;
}

export interface BloodPressureValues {
  systolic: number;
  diastolic: number;
  map: number;
  pulseRate: number | null;
}

export interface GlucoseValues {
  sequenceNumber: number;
  glucoseMgPerDl: number;
  typeLocation: number | null;
  sensorStatus: number | null;
}

const IMPLAUSIBLE_BP: [number, number] = [60, 300];
const IMPLAUSIBLE_DIASTOLIC: [number, number] = [30, 200];
const IMPLAUSIBLE_GLUCOSE: [number, number] = [20, 1000];

export function decodeSfloat(bytes: Uint8Array, offset: number): number | null {
  const raw = bytes[offset] | (bytes[offset + 1] << 8);
  const mantissa = raw & 0x0fff;
  const exponent = raw >> 12;
  const signedMantissa = mantissa >= 2048 ? mantissa - 4096 : mantissa;
  const signedExponent = exponent >= 8 ? exponent - 16 : exponent;
  if (signedMantissa === 0 && signedExponent === 0) {
    return 0;
  }
  if (raw === 0x0800 || raw === 0x0801 || raw === 0x0802) {
    return null;
  }
  return signedMantissa * 10 ** signedExponent;
}

export function encodeSfloat(value: number): [number, number] {
  if (value === 0) {
    return [0x00, 0x00];
  }
  let mantissa = Math.round(value);
  let exponent = 0;
  while (Math.abs(mantissa) >= 1024) {
    mantissa = Math.round(mantissa / 10);
    exponent += 1;
  }
  if (mantissa === 0) {
    return [0x00, 0x00];
  }
  const raw = ((exponent & 0x000f) << 12) | (mantissa & 0x0fff);
  return [raw & 0xff, (raw >> 8) & 0xff];
}

export function parseBloodPressureMeasurement(bytes: Uint8Array): BloodPressureValues | null {
  if (bytes.length < 7) {
    return null;
  }
  const flags = bytes[0];
  const eightBit = (flags & 0x01) !== 0;
  const pulseEightBit = (flags & 0x02) !== 0;
  const pulsePresent = (flags & 0x04) !== 0;

  let offset = 1;

  const readValue = (): number => {
    if (eightBit) {
      const v = bytes[offset];
      offset += 1;
      return v;
    }
    const v = decodeSfloat(bytes, offset) ?? 0;
    offset += 2;
    return v;
  };

  const systolic = readValue();
  const diastolic = readValue();
  const map = readValue();

  let pulseRate: number | null = null;
  if (pulsePresent) {
    if (pulseEightBit) {
      pulseRate = bytes[offset];
      offset += 1;
    } else {
      pulseRate = decodeSfloat(bytes, offset) ?? null;
      offset += 2;
    }
  }

  if (!isFinite(systolic) || !isFinite(diastolic)) {
    return null;
  }

  return { systolic, diastolic, map, pulseRate };
}

export function parseGlucoseMeasurement(bytes: Uint8Array): GlucoseValues | null {
  if (bytes.length < 11) {
    return null;
  }
  const flags = bytes[0];
  let offset = 1;

  const sequenceNumber = bytes[offset] | (bytes[offset + 1] << 8);
  offset += 2;

  const year = bytes[offset] | (bytes[offset + 1] << 8);
  const month = bytes[offset + 2];
  const day = bytes[offset + 3];
  const hours = bytes[offset + 4];
  const minutes = bytes[offset + 5];
  const seconds = bytes[offset + 6];
  offset += 7;

  void year;
  void month;
  void day;
  void hours;
  void minutes;
  void seconds;

  const typeLocationPresent = (flags & 0x80) !== 0;
  const sensorStatusPresent = (flags & 0x40) !== 0;

  let typeLocation: number | null = null;
  let sensorStatus: number | null = null;

  if (typeLocationPresent) {
    typeLocation = bytes[offset];
    offset += 1;
  }
  if (sensorStatusPresent) {
    sensorStatus = bytes[offset];
    offset += 1;
  }

  const eightBitConcentration = (flags & 0x01) !== 0;

  let glucoseMgPerDl: number;
  if (eightBitConcentration) {
    glucoseMgPerDl = bytes[offset];
    offset += 1;
  } else {
    glucoseMgPerDl = decodeSfloat(bytes, offset) ?? 0;
    offset += 2;
  }

  if (!isFinite(glucoseMgPerDl)) {
    return null;
  }

  return { sequenceNumber, glucoseMgPerDl, typeLocation, sensorStatus };
}

export function sanitizeBloodPressure(values: BloodPressureValues): { value: number; value2: number; implausible: boolean } {
  const systolic = Math.round(values.systolic);
  const diastolic = Math.round(values.diastolic);
  const implausible =
    systolic < IMPLAUSIBLE_BP[0] ||
    systolic > IMPLAUSIBLE_BP[1] ||
    diastolic < IMPLAUSIBLE_DIASTOLIC[0] ||
    diastolic > IMPLAUSIBLE_DIASTOLIC[1] ||
    diastolic >= systolic;
  return {
    value: isNaN(systolic) ? 0 : systolic,
    value2: isNaN(diastolic) ? 0 : diastolic,
    implausible,
  };
}

export function sanitizeGlucose(value: number): { value: number; implausible: boolean } {
  const glucose = Math.round(value);
  const implausible = glucose < IMPLAUSIBLE_GLUCOSE[0] || glucose > IMPLAUSIBLE_GLUCOSE[1];
  return { value: isNaN(glucose) ? 0 : glucose, implausible };
}

export function parseFrame(
  bytes: Uint8Array,
  deviceKind: BluetoothDeviceKind,
  measuredAtMs: number
): ParsedVitalReading | null {
  if (deviceKind === 'bloodPressure') {
    const parsed = parseBloodPressureMeasurement(bytes);
    if (!parsed) {
      return null;
    }
    const { value, value2, implausible } = sanitizeBloodPressure(parsed);
    return {
      type: 'bloodPressure',
      value,
      value2,
      measuredAtMs,
      deviceKind,
      batteryLevel: null,
      implausible,
    };
  }
  if (deviceKind === 'glucose') {
    const parsed = parseGlucoseMeasurement(bytes);
    if (!parsed) {
      return null;
    }
    const { value, implausible } = sanitizeGlucose(parsed.glucoseMgPerDl);
    return {
      type: 'glucose',
      value,
      value2: null,
      measuredAtMs,
      deviceKind,
      batteryLevel: null,
      implausible,
    };
  }
  return null;
}
