import { logger } from './sys-logger.mjs';
import ApiError from './api-error.mjs';

function send(reply, content) {
  return reply
    .code(content.statusCode)
    .send(content);
}

export function errHandler(err, req, reply) {
  const { statusCode } = err;

  const content = {
    statusCode,
    name: err.name,
    message: err.message,
  };

  if (err instanceof ApiError) {
    if (err.data.length) content.data = err.data;
    return send(reply, content);
  }

  if (['TokenExpiredError', 'JsonWebTokenError'].includes(err.name)) {
    content.statusCode = 401;
    return send(reply, content);
  }

  if (statusCode === 400) {
    content.name = 'ValidationError';
    return send(reply, content);
  }

  if (statusCode === 429) {
    content.name = 'Too Many Requests';
    return send(reply, content);
  }

  if (/^Firebase|^Decoding Firebase/.test(err.message)) {
    return send(reply, {
      statusCode: 401,
      name: 'FirebaseError',
      message: err.message,
    });
  }

  logger.warn('---- DEBUG START DEBUG ----');
  logger.error(err); // TODO: to stackdriver, sentry or alike
  logger.warn('---- DEBUG END DEBUG ----');

  // eslint-disable-next-line no-console
  console.log(err);

  return send(reply, {
    statusCode: 500,
    name: 'Internal server error.',
    message: 'An unexpected error has occurred. Kindly contact support.',
  });
}

export function apiResponse(reply, data, code = 200) {
  if (!data) {
    return reply
      .code(404)
      .send({
        statusCode: 404,
        name: 'NotFoundError',
        message: 'Either resource not found or you are not authorized to perform the operation.',
      });
  }

  if (code === 204) {
    return reply.code(code).send();
  }

  return reply.code(code).send(data);
}
