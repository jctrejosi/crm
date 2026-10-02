import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Decorador para requerir roles específicos en una ruta
 * @example
 * @Roles('admin', 'manager')
 * @Delete(':id')
 * deleteUser() { ... }
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
