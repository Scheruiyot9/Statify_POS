class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;         // machine-readable e.g. 'INVALID_CREDENTIALS'
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, code)    { return new AppError(message, 400, code); }
  static unauthorized(message, code)  { return new AppError(message, 401, code || 'UNAUTHORIZED'); }
  static forbidden(message, code)     { return new AppError(message, 403, code || 'FORBIDDEN'); }
  static notFound(resource)           { return new AppError(`${resource} not found`, 404, 'NOT_FOUND'); }
  static conflict(message, code)      { return new AppError(message, 409, code || 'CONFLICT'); }
  static unprocessable(message, code) { return new AppError(message, 422, code); }
  static internal(message)            { return new AppError(message, 500, 'INTERNAL_ERROR'); }
}

module.exports = AppError;
