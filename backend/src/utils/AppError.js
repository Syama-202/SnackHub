// An error a controller throws on purpose. The error handler turns it into the error
// envelope (doc 11): { error: { code, message, details, requestId } }.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
