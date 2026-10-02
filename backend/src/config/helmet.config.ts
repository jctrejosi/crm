import { registerAs } from '@nestjs/config';
import {
  HelmetConfig,
  CrossOriginResourcePolicy,
  CrossOriginOpenerPolicy,
  ReferrerPolicy,
} from './types';

export default registerAs('helmet', (): HelmetConfig => ({
  crossOriginResourcePolicy: {
    policy:
      (process.env
        .HELMET_CROSS_ORIGIN_RESOURCE_POLICY as CrossOriginResourcePolicy) ||
      'cross-origin',
  },
  crossOriginOpenerPolicy: {
    policy:
      (process.env
        .HELMET_CROSS_ORIGIN_OPENER_POLICY as CrossOriginOpenerPolicy) ||
      'unsafe-none',
  },
  crossOriginEmbedderPolicy:
    process.env.HELMET_CROSS_ORIGIN_EMBEDDER_POLICY === 'true' || false,
  referrerPolicy: process.env.HELMET_REFERRER_POLICY
    ? { policy: process.env.HELMET_REFERRER_POLICY as ReferrerPolicy }
    : undefined,
}));
