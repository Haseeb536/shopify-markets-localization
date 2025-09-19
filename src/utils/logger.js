const path = require('path');
const fs = require('fs');
const winston = require('winston');

const logsDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}] ${message}${rest}`;
  })
);

const appLogPath = path.join(logsDir, 'app.log');
const errorLogPath = path.join(logsDir, 'error.log');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'shopify-localization' },
  transports: [
    new winston.transports.File({
      filename: errorLogPath,
      level: 'error',
      format: jsonFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: appLogPath,
      format: jsonFormat,
      maxsize: 20 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
});

if (process.env.NODE_ENV !== 'production' || process.env.LOG_TO_CONSOLE === 'true') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [meta]
 */
function logWebhook(event, meta = {}) {
  logger.info('webhook_received', { event, ...meta });
}

/**
 * @param {Record<string, unknown>} meta
 */
function logTranslationRequest(meta) {
  logger.info('translation_request', meta);
}

/**
 * @param {Record<string, unknown>} meta
 */
function logTranslationSuccess(meta) {
  logger.info('translation_success', meta);
}

/**
 * @param {Record<string, unknown>} meta
 */
function logTranslationFailure(meta) {
  logger.error('translation_failure', meta);
}

/**
 * @param {Record<string, unknown>} meta
 */
function logRetry(meta) {
  logger.warn('job_retry', meta);
}

module.exports = {
  logger,
  logWebhook,
  logTranslationRequest,
  logTranslationSuccess,
  logTranslationFailure,
  logRetry,
};
