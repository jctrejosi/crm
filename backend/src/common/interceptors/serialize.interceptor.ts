import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  UseInterceptors,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { plainToInstance } from 'class-transformer';
import type { ClassConstructor } from 'class-transformer';

// Definir el tipo para respuestas paginadas
interface PaginatedResponse<T> {
  data?: T[];
  users?: T[];
  total: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export function Serialize<T>(dto: ClassConstructor<T>) {
  return UseInterceptors(new SerializeInterceptor(dto));
}

@Injectable()
export class SerializeInterceptor<T> implements NestInterceptor<
  T,
  T | T[] | PaginatedResponse<T>
> {
  constructor(private readonly dto: ClassConstructor<T>) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<T | T[] | PaginatedResponse<T>> {
    return next.handle().pipe(
      map((data: T | T[] | PaginatedResponse<T>) => {
        // Si es un array, transformar cada elemento
        if (Array.isArray(data)) {
          return data.map((item) =>
            plainToInstance(this.dto, item, {
              excludeExtraneousValues: true,
            }),
          );
        }

        // Si es un objeto con paginación (users o data)
        if (data && typeof data === 'object') {
          // Verificar si tiene la propiedad 'users' (para UserListResponse)
          if ('users' in data && Array.isArray(data.users)) {
            const paginatedData = data;
            return {
              ...paginatedData,
              users: paginatedData.users?.map((user: T) =>
                plainToInstance(this.dto, user, {
                  excludeExtraneousValues: true,
                }),
              ),
            };
          }

          // Verificar si tiene la propiedad 'data' (para otras respuestas paginadas)
          if ('data' in data && Array.isArray(data.data)) {
            const paginatedData = data;
            return {
              ...paginatedData,
              data: paginatedData.data?.map((item: T) =>
                plainToInstance(this.dto, item, {
                  excludeExtraneousValues: true,
                }),
              ),
            };
          }
        }

        // Objeto simple
        return plainToInstance(this.dto, data as T, {
          excludeExtraneousValues: true,
        });
      }),
    );
  }
}
