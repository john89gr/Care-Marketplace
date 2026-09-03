import { isDemoMode } from '../../api/demo.mode';
import { DEVICE_PROFILES, BATTERY_SERVICE_UUID, BATTERY_LEVEL_UUID, BluetoothDeviceKind } from './device-profiles';
import { parseBloodPressureMeasurement, parseGlucoseMeasurement } from './gatt-parsers';
import { VitalType } from '../../features/health-record/vitals.store';
import type { BluetoothAPI, BluetoothDeviceLike, BluetoothGattServerLike, BluetoothServiceLike, BluetoothCharacteristicLike } from './bluetooth.service';
import { encodeSfloat, parseBloodPressureMeasurement, parseGlucoseMeasurement } from './gatt-parsers';
import { VitalType } from '../../features/health-record/vitals.store';

export interface SimulatedReading {
  kind: BluetoothDeviceKind;
  systolic: number;
  diastolic: number;
  map: number;
  pulseRate: number | null;
  glucoseMgPerDl: number;
}

const SIMULATED_BP_READINGS: SimulatedReading[] = [
  { kind: 'bloodPressure', systolic: 120, diastolic: 80, map: 93, pulseRate: 72, glucoseMgPerDl: 0 },
  { kind: 'bloodPressure', systolic: 122, diastolic: 82, map: 95, pulseRate: 74, glucoseMgPerDl: 0 },
  { kind: 'bloodPressure', systolic: 118, diastolic: 78, map: 91, pulseRate: 69, glucoseMgPerDl: 0 },
  { kind: 'bloodPressure', systolic: 125, diastolic: 84, map: 96, pulseRate: 70, glucoseMgPerDl: 0 },
  { kind: 'bloodPressure', systolic: 165, diastolic: 100, map: 122, pulseRate: 88, glucoseMgPerDl: 0 },
];

const SIMULATED_GLUCOSE_READINGS: SimulatedReading[] = [
  { kind: 'glucose', systolic: 0, diastolic: 0, map: 0, pulseRate: null, glucoseMgPerDl: 102 },
  { kind: 'glucose', systolic: 0, diastolic: 0, map: 0, pulseRate: null, glucoseMgPerDl: 98 },
  { kind: 'glucose', systolic: 0, diastolic: 0, map: 0, pulseRate: null, glucoseMgPerDl: 110 },
  { kind: 'glucose', systolic: 0, diastolic: 0, map: 0, pulseRate: null, glucoseMgPerDl: 145 },
];

function buildBpFrame(r: SimulatedReading, sequence = 0): Uint8Array {
  const flags = 0x00;
  const sys = encodeSfloat(r.systolic);
  const dia = encodeSfloat(r.diastolic);
  const map = encodeSfloat(r.map);
  const pulse = encodeSfloat(r.pulseRate ?? 0);
  const bytes = [flags, sys[0], sys[1], dia[0], dia[1], map[0], map[1]];
  void pulse;
  void sequence;
  if (r.pulseRate != null) {
    bytes.push(pulse[0], pulse[1]);
  }
  return new Uint8Array(bytes);
}

function buildGlucoseFrame(r: SimulatedReading, sequence = 0): Uint8Array {
  const flags = 0x00;
  const seq = [sequence & 0xff, (sequence >> 8) & 0xff];
  const year = [0xe8, 0x07];
  const month = 1;
  const day = 15;
  const hours = 10;
  const minutes = 30;
  const seconds = 0;
  const glucose = encodeSfloat(r.glucoseMgPerDl);
  return new Uint8Array([
    flags,
    seq[0],
    seq[1],
    year[0],
    year[1],
    month,
    day,
    hours,
    minutes,
    seconds,
    glucose[0],
    glucose[1],
  ]);
}

export function buildSimulatedFrame(r: SimulatedReading, sequence = 0): Uint8Array {
  return r.kind === 'bloodPressure' ? buildBpFrame(r, sequence) : buildGlucoseFrame(r, sequence);
}

export function nextBpReading(index: number): SimulatedReading {
  return SIMULATED_BP_READINGS[index % SIMULATED_BP_READINGS.length];
}

export function nextGlucoseReading(index: number): SimulatedReading {
  return SIMULATED_GLUCOSE_READINGS[index % SIMULATED_GLUCOSE_READINGS.length];
}

function toDataView(bytes: Uint8Array): DataView {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new DataView(buffer);
}

class DemoGattCharacteristic implements BluetoothCharacteristicLike {
  readonly uuid: string;
  private _value: DataView | null = null;
  private listeners: ((ev: Event) => unknown)[] = [];
  private frameGenerator: (() => Uint8Array) | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(uuid: string) {
    this.uuid = uuid;
  }

  setStaticValue(bytes: Uint8Array): void {
    this._value = toDataView(bytes);
  }

  setFrameGenerator(generator: () => Uint8Array): void {
    this.frameGenerator = generator;
  }

  get value(): DataView | null {
    return this._value;
  }

  async startNotifications(): Promise<this> {
    if (this.frameGenerator && this.intervalId === null) {
      this.intervalId = setInterval(() => {
        this._value = toDataView(this.frameGenerator!());
        const event = new Event('characteristicvaluechanged');
        this.listeners.forEach((l) => l(event));
      }, 2000);
    }
    return this;
  }

  async readValue(): Promise<this> {
    return this;
  }

  addEventListener(type: string, listener: (ev: Event) => unknown): void {
    if (type === 'characteristicvaluechanged') {
      this.listeners.push(listener);
    }
  }

  removeEventListener(type: string, listener: (ev: Event) => unknown): void {
    if (type === 'characteristicvaluechanged') {
      this.listeners = this.listeners.filter((l) => l !== listener);
    }
  }

  stopEmitting(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

class DemoGattService implements BluetoothServiceLike {
  private characteristics = new Map<string, DemoGattCharacteristic>();

  addCharacteristic(uuid: string, char: DemoGattCharacteristic): void {
    this.characteristics.set(uuid, char);
  }

  async getCharacteristic(uuid: string | number): Promise<DemoGattCharacteristic> {
    const key = String(uuid);
    const char = this.characteristics.get(key);
    if (!char) {
      throw new Error(`Characteristic ${key} not found`);
    }
    return char;
  }
}

class DemoGattServer implements BluetoothGattServerLike {
  connected = false;
  private services = new Map<string, DemoGattService>();
  private disconnectListeners: ((ev: Event) => unknown)[] = [];

  addService(uuid: string | number, service: DemoGattService): void {
    this.services.set(String(uuid), service);
  }

  async connect(): Promise<this> {
    this.connected = true;
    return this;
  }

  disconnect(): void {
    this.connected = false;
    this.disconnectListeners.forEach((l) => l(new Event('gattserverdisconnected')));
  }

  async getPrimaryService(uuid: string | number): Promise<DemoGattService> {
    const key = String(uuid);
    const service = this.services.get(key);
    if (!service) {
      throw new Error(`Service ${key} not found`);
    }
    return service;
  }

  addEventListener(type: string, listener: (ev: Event) => unknown): void {
    if (type === 'gattserverdisconnected') {
      this.disconnectListeners.push(listener);
    }
  }
}

export class DemoBluetoothDevice implements BluetoothDeviceLike {
  readonly id: string;
  readonly name: string | null;
  readonly gatt: DemoGattServer;
  private disconnectListeners: ((ev: Event) => unknown)[] = [];

  constructor(id: string, name: string | null) {
    this.id = id;
    this.name = name;
    this.gatt = new DemoGattServer();
  }

  addEventListener(type: string, listener: (ev: Event) => unknown): void {
    if (type === 'gattserverdisconnected') {
      this.disconnectListeners.push(listener);
    }
  }

  removeEventListener(type: string, listener: (ev: Event) => unknown): void {
    if (type === 'gattserverdisconnected') {
      this.disconnectListeners = this.disconnectListeners.filter((l) => l !== listener);
    }
  }

  triggerDisconnect(): void {
    this.disconnectListeners.forEach((l) => l(new Event('gattserverdisconnected')));
  }
}

export class DemoBluetoothAPI implements BluetoothAPI {
  private sequenceCounter = 0;
  private batteryLevels = new Map<string, number>();

  requestDevice(_options: { filters: Array<{ services: (string | number)[] }> }): Promise<DemoBluetoothDevice> {
    const device = this.createDevice();
    return Promise.resolve(device);
  }

  getDevices(): Promise<DemoBluetoothDevice[]> {
    const device = this.createDevice();
    return Promise.resolve([device]);
  }

  private createDevice(): DemoBluetoothDevice {
    const id = `demo-${Math.random().toString(36).slice(2, 8)}`;
    const device = new DemoBluetoothDevice(id, 'Demo Device');
    const seq = this.sequenceCounter++;

    for (const profile of Object.values(DEVICE_PROFILES)) {
      const service = new DemoGattService();
      const measurementChar = new DemoGattCharacteristic(profile.measurementUuid.toString());

      const generator = (): Uint8Array => {
        const reading: SimulatedReading =
          profile.kind === 'bloodPressure'
            ? { ...nextBpReading(seq), kind: 'bloodPressure' }
            : { ...nextGlucoseReading(seq), kind: 'glucose' };
        return buildSimulatedFrame(reading, this.sequenceCounter++);
      };
      measurementChar.setFrameGenerator(generator);
      service.addCharacteristic(profile.measurementUuid.toString(), measurementChar);

      const batteryChar = new DemoGattCharacteristic(profile.batteryUuid.toString());
      const frame = new Uint8Array([80 + seq]);
      batteryChar.setStaticValue(frame);
      this.batteryLevels.set(id, 80 + seq);
      service.addCharacteristic(profile.batteryUuid.toString(), batteryChar);

      device.gatt.addService(profile.serviceUuid.toString(), service);
    }

    const batteryService = new DemoGattService();
    const batteryChar = new DemoGattCharacteristic(BATTERY_LEVEL_UUID.toString());
    batteryChar.setStaticValue(new Uint8Array([85]));
    batteryService.addCharacteristic(BATTERY_LEVEL_UUID.toString(), batteryChar);
    device.gatt.addService(BATTERY_SERVICE_UUID.toString(), batteryService);

    return device;
  }
}

export function demoBluetoothFactory(): BluetoothAPI | null {
  return new DemoBluetoothAPI();
}

export function isBluetoothDemoAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
    return true;
  }
  return isDemoMode();
}

export function simulatedReadingForWs(kind: BluetoothDeviceKind): { type: VitalType; value: number; value2: number | null; batteryLevel: number } {
  if (kind === 'bloodPressure') {
    const idx = Math.floor(Math.random() * SIMULATED_BP_READINGS.length);
    const r = SIMULATED_BP_READINGS[idx];
    return { type: 'bloodPressure', value: r.systolic, value2: r.diastolic, batteryLevel: Math.floor(80 + Math.random() * 20) };
  }
  const idx = Math.floor(Math.random() * SIMULATED_GLUCOSE_READINGS.length);
  const r = SIMULATED_GLUCOSE_READINGS[idx];
  return { type: 'glucose', value: r.glucoseMgPerDl, value2: null, batteryLevel: Math.floor(80 + Math.random() * 20) };
}
