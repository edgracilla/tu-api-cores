import pino from 'pino';
import { Publisher } from 'zeromq';

export const pinoLog = pino({
  transport: {
    target: 'pino-pretty',
    options: { translateTime: true },
  },
});

export class ZMQLogger {
  constructor(host) {
    this.sock = new Publisher();
    this.sock.connect(host);

    pinoLog.info(`Log publisher connected to '${host}'`);
  }

  async publish(req, res, payload) {
    const { userId, accessId } = req.meta || {};
    const { method, url } = req.raw;
    const { statusCode } = res;

    const log = {
      method,
      statusCode,
      url,
      log: undefined, // preserving order
      apiVer: url.substring(1, 3),
      docId: req.params._id,
      access: accessId,
      user: userId,
    };

    if ([400, 401, 500].includes(statusCode) || ['POST', 'PATCH'].includes(method)) {
      log.log = method === 'POST' ? payload : payload.changeLog || req.body;
    }

    this.sock.send(['log.audits', JSON.stringify(log)]);
  }
}
