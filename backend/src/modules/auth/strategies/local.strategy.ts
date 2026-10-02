import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy as PassportLocalStrategy,
  IStrategyOptions,
} from 'passport-local';
import { AuthService } from '../auth.service';

const LocalPassportStrategy = PassportLocalStrategy as unknown as new (
  options: IStrategyOptions,
  verify?: (...args: any[]) => any,
) => any;

@Injectable()
export class LocalStrategy extends PassportStrategy(LocalPassportStrategy) {
  constructor(private readonly authService: AuthService) {
    super({
      usernameField: 'username',
      passwordField: 'password',
    });
  }

  async validate(username: string, password: string): Promise<any> {
    const user = await this.authService.validateUser(username, password);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return user;
  }
}
