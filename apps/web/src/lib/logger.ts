import pino from 'pino';

export const logger = pino({
  browser: {
    asObject: import.meta.env.PROD,
  },
  level: import.meta.env.DEV ? 'debug' : 'info',
});
