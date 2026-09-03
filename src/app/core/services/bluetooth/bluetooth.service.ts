import { Injectable, inject, signal } from '@angular/core';
import { WebSocketClient, WsEnvelope } from '../ws/websocket.client';
import { isDemoMode } from '../../api/demo.mode';
import { demoBluetoothFactory } from './bluetooth-demo';
import {
  DEVICE_PROFILES,
  requestOptionsFor,
  BluetoothDeviceKind,
  BluetoothUUID,
  BluetoothRequestOptions,
  BATTERY_SERVICE_UUID,
  BATTERY_LEVEL_UUID,
} from './device-profiles';
import { parseFrame, ParsedVitalReading } from './gatt-parsers';
import { VitalType } from '../../features/health-record/vitals.store';

const isDevMode =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export interface BluetoothCharacteristicLike {
  readonly uuid: string;
  readonly value: DataView | null;
  startNotifications(): Promise<unknown>;
  readValue(): Promise<unknown>;
  addEventListener(type: 'characteristicvaluechanged', listener: (ev: Event) => unknown): void;
  removeEventListener(type: 'characteristicvaluechanged', listener: (ev: Event) => unknown): void;
}

export interface BluetoothServiceLike {
  getCharacteristic(uuid: BluetoothUUID): Promise<BluetoothCharacteristicLike>;
}

export interface BluetoothGattServerLike {
  readonly connected: boolean;
  connect(): Promise<unknown>;
  disconnect(): void;
  getPrimaryService(uuid: BluetoothUUID): Promise<BluetoothServiceLike>;
  addEventListener(type: 'gattserverdisconnected', listener: (ev: Event) => unknown): void;
}

export interface BluetoothDeviceLike {
  readonly id: string;
  readonly name: string | null;
  readonly gatt: BluetoothGattServerLike | null;
  addEventListener(type: 'gattserverdisconnected', listener: (ev: Event) => unknown): void;
  removeEventListener(type: 'gattserverdisconnected', listener: (ev: Event) => unknown): void;
}

export interface BluetoothAPI {
  requestDevice(options: BluetoothRequestOptions): Promise<BluetoothDeviceLike>;
  getDevices(): Promise<BluetoothDeviceLike[]>;
}

export type BluetoothAPIFactory = () => BluetoothAPI | null;

export function browserBluetooth(): BluetoothAPI | null {
  if (typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
    return (navigator as { bluetooth?: BluetoothAPI }).bluetooth ?? null;
  }
  return null;
}

const MAX_RECONNECT_RETRIES = 3;
const RECONNECT_DELAY_MS = 2000;

@Injectable({ providedIn: 'root' })
export class BluetoothService {
  bluetoothFactory: BluetoothAPIFactory = isDemoMode() ? demoBluetoothFactory : browserBluetooth;

  private readonly ws: WebSocketClient = inject(WebSocketClient);

  private readonly _available = signal(false);
  private readonly _secureContext = signal(false);
  private readonly _connecting = signal(false);
  private readonly _connected = signal(false);
  private readonly _deviceName = signal<string | null>(null);
  private readonly _deviceKind = signal<BluetoothDeviceKind | null>(null);
  private readonly _error = signal('');
  private readonly _lastReading = signal<ParsedVitalReading | null>(null);
  private readonly _batteryLevel = signal<number | null>(null);

  readonly available = this._available.asReadonly();
  readonly secureContext = this._secureContext.asReadonly();
  readonly connecting = this._connecting.asReadonly();
  readonly connected = this._connected.asReadonly();
  readonly deviceName = this._deviceName.asReadonly();
  readonly deviceKind = this._deviceKind.asReadonly();
  readonly error = this._error.asReadonly();
  readonly lastReading = this._lastReading.asReadonly();
  readonly batteryLevel = this._batteryLevel.asReadonly();

  private device: BluetoothDeviceLike | null = null;
  private server: BluetoothGattServerLike | null = null;
  private measurementChar: BluetoothCharacteristicLike | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.checkSupport();
    this.ws.messages$.subscribe((envelope) => this.handleWsEnvelope(envelope));
  }

  checkSupport(): void {
    this._secureContext.set(this.isSecureContext());
    const api = this.bluetoothFactory();
    this._available.set(this.isSecureContext() && api !== null);
  }

  isSecureContext(): boolean {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.isSecureContext === true || window.location.hostname === 'localhost';
  }

  isSupported(): boolean {
    return this._available();
  }

  async connect(kind: BluetoothDeviceKind): Promise<void> {
    this.reconnectAttempts = 0;
    this._connecting.set(true);
    this._error.set('');
    this._lastReading.set(null);

    const api = this.bluetoothFactory();
    if (!api) {
      if (isDemoMode()) {
        this.connectViaWs(kind);
        return;
      }
      this._error.set('Web Bluetooth is not supported in this browser or context.');
      this._connecting.set(false);
      return;
    }

    if (!this.isSecureContext()) {
      this._error.set('Web Bluetooth requires a secure context (HTTPS or localhost).');
      this._connecting.set(false);
      return;
    }

    try {
      const options = requestOptionsFor(kind);
      const device = await api.requestDevice(options);
      await this.connectGatt(kind, device);
    } catch (err) {
      this._error.set((err as Error)?.message ?? 'Failed to connect to the device.');
      this._connecting.set(false);
    }
  }

  private connectViaWs(kind: BluetoothDeviceKind): void {
    this._connecting.set(false);
    this._connected.set(true);
    this._deviceName.set('Demo device');
    this._deviceKind.set(kind);
    this._error.set('');
    const sent = this.ws.send({ type: 'bluetooth.start', payload: { kind } });
    if (!sent) {
      this._error.set('Could not start the simulated device stream.');
    }
  }

  private async connectGatt(kind: BluetoothDeviceKind, device: BluetoothDeviceLike): Promise<void> {
    this.device = device;
    this._deviceName.set(device.name ?? 'Unknown device');
    this._deviceKind.set(kind);
    this._error.set('');

    try {
      const gatt = device.gatt;
      if (!gatt) {
        throw new Error('Device has no GATT server.');
      }
      await gatt.connect();
      this.server = gatt;
      this._connected.set(true);
      this._connecting.set(false);

      const profile = DEVICE_PROFILES[kind];
      const service = await gatt.getPrimaryService(profile.serviceUuid);
      this.measurementChar = await service.getCharacteristic(profile.measurementUuid);

      this.measurementChar.addEventListener('characteristicvaluechanged', this.handleCharacteristicChanged);
      await this.measurementChar.startNotifications();

      device.addEventListener('gattserverdisconnected', this.handleDisconnect);

      if (this.reconnectAttempts > 0) {
        this._error.set('');
        this.reconnectAttempts = 0;
      }

      void this.readBatteryLevel();
    } catch (err) {
      this._error.set((err as Error)?.message ?? 'Failed to set up GATT notifications.');
      this._connecting.set(false);
      this._connected.set(false);
    }
  }

  private handleCharacteristicChanged = (event: Event): void => {
    void event;
    const char = this.measurementChar;
    const kind = this._deviceKind();
    if (!char || !char.value || !kind) {
      return;
    }
    const bytes = new Uint8Array(char.value.buffer, char.value.byteOffset, char.value.byteLength);
    const reading = parseFrame(bytes, kind, Date.now());
    if (reading) {
      this._lastReading.set(reading);
      if (reading.implausible) {
        this._error.set('Implausible reading received — verify the device placement.');
      }
    } else {
      if (isDevMode) {
        console.debug('[bluetooth] raw GATT frame:', Array.from(bytes));
      }
      this._error.set('Could not parse data from the device.');
    }
  };

  private handleDisconnect = (): void => {
    this._connected.set(false);
    this._deviceName.set(null);
    this._batteryLevel.set(null);
    this.measurementChar = null;
    this.server = null;
    this.device = null;

    if (this.reconnectAttempts < MAX_RECONNECT_RETRIES) {
      this.reconnectAttempts += 1;
      this._error.set(`Connection lost. Reconnecting (${this.reconnectAttempts}/${MAX_RECONNECT_RETRIES})…`);
      this.reconnectTimer = setTimeout(() => {
        const kind = this._deviceKind();
        if (kind) {
          void this.reconnectToRemembered(kind);
        }
      }, RECONNECT_DELAY_MS);
    } else {
      this._error.set('Connection lost. Please reconnect your device.');
      this.reconnectAttempts = 0;
    }
  };

  private async reconnectToRemembered(kind: BluetoothDeviceKind): Promise<void> {
    const api = this.bluetoothFactory();
    if (!api) {
      this._error.set('Bluetooth adapter not available for reconnection.');
      return;
    }
    try {
      const devices = await api.getDevices();
      if (devices.length > 0) {
        await this.connectGatt(kind, devices[0]);
      } else {
        throw new Error('No remembered devices found');
      }
    } catch {
      if (this.reconnectAttempts >= MAX_RECONNECT_RETRIES) {
        this._error.set('Connection lost. Please reconnect your device.');
        this.reconnectAttempts = 0;
      }
    }
  }

  async readBatteryLevel(): Promise<number | null> {
    if (!this.server) {
      return null;
    }
    const kind = this._deviceKind();
    if (!kind) {
      return null;
    }
    if (!DEVICE_PROFILES[kind].supportsBattery) {
      return null;
    }
    try {
      const batteryService = await this.server.getPrimaryService(BATTERY_SERVICE_UUID);
      const batteryChar = await batteryService.getCharacteristic(BATTERY_LEVEL_UUID);
      await batteryChar.readValue();
      if (batteryChar.value) {
        const bytes = new Uint8Array(batteryChar.value.buffer, batteryChar.value.byteOffset, batteryChar.value.byteLength);
        const level = bytes[0];
        this._batteryLevel.set(level);
        return level;
      }
    } catch {
      // Battery service/characteristic not available on this device
    }
    return null;
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;

    if (this.measurementChar) {
      this.measurementChar.removeEventListener('characteristicvaluechanged', this.handleCharacteristicChanged);
      this.measurementChar = null;
    }
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.handleDisconnect);
      this.device = null;
    }
    if (this.server) {
      this.server.disconnect();
      this.server = null;
    }
    if (this._deviceKind() !== null) {
      this.ws.send({ type: 'bluetooth.stop', payload: {} });
    }

    this._connected.set(false);
    this._connecting.set(false);
    this._deviceName.set(null);
    this._deviceKind.set(null);
    this._error.set('');
  }

  clearReading(): void {
    this._lastReading.set(null);
  }

  confirmReading(): { type: VitalType; value: number; value2: number | null; measuredAtMs: number } | null {
    const reading = this._lastReading();
    if (!reading) {
      return null;
    }
    this._lastReading.set(null);
    return {
      type: reading.type,
      value: reading.value,
      value2: reading.value2,
      measuredAtMs: reading.measuredAtMs,
    };
  }

  private handleWsEnvelope(envelope: WsEnvelope): void {
    if (envelope.type !== 'bluetooth.reading') {
      return;
    }
    this.handleWsReading(envelope.payload);
  }

  private handleWsReading(payload: Record<string, unknown> | undefined): void {
    if (!payload) {
      return;
    }
    const rawType = payload['type'] ?? payload['kind'];
    if (rawType !== 'bloodPressure' && rawType !== 'glucose') {
      return;
    }
    const type = rawType as VitalType;
    const value = Number(payload['value'] ?? 0);
    const value2 = payload['value2'] == null ? null : Number(payload['value2']);
    const battery = payload['batteryLevel'] == null ? null : Number(payload['batteryLevel']);

    this._batteryLevel.set(battery);
    this._connected.set(true);
    this._deviceName.set(this._deviceName() ?? 'Demo device');
    this._lastReading.set({
      type,
      value,
      value2,
      measuredAtMs: Date.now(),
      deviceKind: type === 'bloodPressure' ? 'bloodPressure' : 'glucose',
      batteryLevel: battery,
      implausible: false,
    });
  }
}
