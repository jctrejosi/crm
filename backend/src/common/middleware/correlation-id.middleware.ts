import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { storage } from '../../utils/logger';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private readonly headerName = 'x-request-id';

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Importar uuid dinámicamente
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { v4: uuidv4 }: { v4: () => string } = await import('uuid');

    // Buscar el ID en el header o generar uno nuevo
    const correlationId = (req.headers[this.headerName] as string) || uuidv4();

    // Almacenar en el request para uso posterior
    req.correlationId = correlationId;

    // Añadir al response header para que el cliente lo reciba
    res.setHeader(this.headerName, correlationId);

    // Almacenar en el contexto de AsyncLocalStorage para logs
    storage.run(new Map([['correlationId', correlationId]]), () => {
      next();
    });
  }
}
