/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  createLogger,
  format,
  transports,
  Logger as WinstonLogger,
  LoggerOptions,
} from 'winston';
import { AsyncLocalStorage } from 'async_hooks';

const { combine, timestamp, printf, colorize, json, errors } = format;

// AsyncLocalStorage para mantener el correlationId en el contexto de la request
export const storage = new AsyncLocalStorage<Map<string, string>>();

// Tipos para el contexto del log
interface LogContext {
  context?: string;
  stack?: string;
  correlationId?: string;
  [key: string]: unknown;
}

// Formato para consola (colorizado y legible) con Correlation ID
const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf((info) => {
    const {
      level,
      message,
      timestamp: ts,
      context,
      stack,
      correlationId,
    } = info as unknown as LogContext & {
      level: string;
      message: string;
      timestamp: string;
    };

    const ctx = context ? `[${context}]` : '';
    const cid = correlationId ? `[${correlationId}]` : '';
    const parts = [ts, level, ctx, cid, message].filter(Boolean);
    const msg = parts.join(' ');

    return stack ? `${msg}\n${stack}` : msg;
  }),
);

// Formato para archivos (JSON) con Correlation ID
const fileFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  json(),
);

// Niveles de log personalizados
const customLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Colores para los niveles
const customColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Aplicar colores
format.colorize().addColors(customColors);

// Interfaz para los métodos de logging
interface ILogger {
  error(message: string, context?: string, ...meta: unknown[]): void;
  warn(message: string, context?: string, ...meta: unknown[]): void;
  info(message: string, context?: string, ...meta: unknown[]): void;
  http(message: string, context?: string, ...meta: unknown[]): void;
  debug(message: string, context?: string, ...meta: unknown[]): void;
  child(context: string): ILogger;
}

/**
 * Obtiene el correlationId del contexto actual
 */
function getCorrelationId(): string | undefined {
  const store = storage.getStore();
  return store?.get('correlationId');
}

/**
 * Logger singleton para la aplicación
 */
class LoggerService implements ILogger {
  private logger: WinstonLogger;
  private static instance: LoggerService | null = null;

  private constructor() {
    const isProduction = process.env.NODE_ENV === 'production';

    const options: LoggerOptions = {
      levels: customLevels,
      level: isProduction ? 'info' : 'debug',
      format: fileFormat,
      transports: [
        // Transporte para consola
        new transports.Console({
          format: consoleFormat,
          level: isProduction ? 'info' : 'debug',
        }),
        // Transporte para archivo de errores
        new transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: fileFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
        // Transporte para archivo combinado
        new transports.File({
          filename: 'logs/combined.log',
          format: fileFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
      ],
    };

    this.logger = createLogger(options);

    // Si estamos en producción, añadir transporte para archivo de warnings
    if (isProduction) {
      this.logger.add(
        new transports.File({
          filename: 'logs/warn.log',
          level: 'warn',
          format: fileFormat,
          maxsize: 5242880,
          maxFiles: 5,
        }),
      );
    }
  }

  public static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  private getCorrelationId(): string | undefined {
    return getCorrelationId();
  }

  public error(message: string, context?: string, ...meta: unknown[]): void {
    const correlationId = this.getCorrelationId();
    this.logger.error(message, { context, correlationId, ...meta });
  }

  public warn(message: string, context?: string, ...meta: unknown[]): void {
    const correlationId = this.getCorrelationId();
    this.logger.warn(message, { context, correlationId, ...meta });
  }

  public info(message: string, context?: string, ...meta: unknown[]): void {
    const correlationId = this.getCorrelationId();
    this.logger.info(message, { context, correlationId, ...meta });
  }

  public http(message: string, context?: string, ...meta: unknown[]): void {
    const correlationId = this.getCorrelationId();
    this.logger.http(message, { context, correlationId, ...meta });
  }

  public debug(message: string, context?: string, ...meta: unknown[]): void {
    const correlationId = this.getCorrelationId();
    this.logger.debug(message, { context, correlationId, ...meta });
  }

  /**
   * Crea un child logger con un contexto fijo
   */
  public child(context: string): ILogger {
    const child = this.logger.child({ context });
    return {
      error: (message: string, ...meta: unknown[]) => {
        const correlationId = this.getCorrelationId();
        child.error(message, { correlationId, ...meta });
      },
      warn: (message: string, ...meta: unknown[]) => {
        const correlationId = this.getCorrelationId();
        child.warn(message, { correlationId, ...meta });
      },
      info: (message: string, ...meta: unknown[]) => {
        const correlationId = this.getCorrelationId();
        child.info(message, { correlationId, ...meta });
      },
      http: (message: string, ...meta: unknown[]) => {
        const correlationId = this.getCorrelationId();
        child.http(message, { correlationId, ...meta });
      },
      debug: (message: string, ...meta: unknown[]) => {
        const correlationId = this.getCorrelationId();
        child.debug(message, { correlationId, ...meta });
      },
      child: (newContext: string) => this.child(newContext),
    };
  }
}

// Exportar una instancia única
export const logger = LoggerService.getInstance();

// Exportar una función para crear loggers con contexto
export function createContextLogger(context: string): ILogger {
  return logger.child(context);
}

// Tipos para el middleware HTTP
interface Request {
  method: string;
  originalUrl: string;
  ip?: string;
  correlationId?: string;
}

interface Response {
  statusCode: number;
  on: (event: string, callback: () => void) => void;
  setHeader: (name: string, value: string) => void;
}

type NextFunction = () => void;

/**
 * Middleware para logging de requests HTTP con Correlation ID
 */
export function httpLoggerMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const { method, originalUrl, correlationId } = req;
      const { statusCode } = res;

      const message = `${method} ${originalUrl} ${statusCode} - ${duration}ms`;

      if (statusCode >= 500) {
        logger.error(message, 'HTTP', { correlationId });
      } else if (statusCode >= 400) {
        logger.warn(message, 'HTTP', { correlationId });
      } else {
        logger.http(message, 'HTTP', { correlationId });
      }
    });

    next();
  };
}
