class ApiError extends Error {
  constructor(code, message, data) {
    super(message);

    this.statusCode = code;

    if (code === 400) {
      this.name = 'ValidationError';
    } else if (code === 401) {
      this.name = 'AuthError';
    } else if (code === 403) {
      this.name = 'ForbiddenError';
    } else if (code === 404) {
      this.name = 'NotFoundError';
    } else {
      this.name = 'InternalServerError';
    }

    this.data = data || [];
  }
}

export default ApiError;
