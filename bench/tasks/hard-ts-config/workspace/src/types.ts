export type LogConfig = { level: 'debug' | 'info' | 'warn' | 'error'; pretty: boolean };

export type Config = {
  port: number;
  host: string;
  log: LogConfig;
  features: string[];
};

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };
