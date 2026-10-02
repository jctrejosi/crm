import { Request } from 'express';

export interface AuthenticatedUser {
  sub: number;
  username: string;
  employeeId: number;
  role: 'admin' | 'manager' | 'employee';
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

declare global {
  interface Express {
    Request: {
      user?: AuthenticatedUser;
    };
  }
}
