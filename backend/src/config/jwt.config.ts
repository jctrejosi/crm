import { registerAs } from '@nestjs/config';
import { JwtConfig } from './types';

export default registerAs('jwt', (): JwtConfig => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }

  return {
    secret,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN ?? '30d',
  };
});
