import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

interface CurrentUserRequest extends Request {
  user?: Record<string, unknown>;
}

/**
 * Decorador para obtener el usuario actual de la request
 * @example
 * @Get('profile')
 * getProfile(@CurrentUser() user: any) {
 *   return user;
 * }
 *
 * // Obtener solo un campo específico
 * @Get('profile')
 * getUserId(@CurrentUser('id') userId: number) {
 *   return userId;
 * }
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<CurrentUserRequest>();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
