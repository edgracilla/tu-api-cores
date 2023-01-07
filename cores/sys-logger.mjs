import pino from 'pino';
import { Publisher } from 'zeromq';

export const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { translateTime: true },
  },
});

export class AuditLogger {
  constructor(host) {
    this.sock = new Publisher();
    this.sock.connect(host);

    logger.info(`Log publisher connected to '${host}'`);
  }

  async publish(req, res, payload) {
    const { userId, accessId } = req.meta || {};
    const { method, url } = req.raw;
    const { statusCode } = res;

    const log = {
      method,
      statusCode,
      url,
      log: undefined,
      apiVer: url.substring(1, 3),
      docId: req.params._id,
      access: accessId,
      user: userId,
    };

    if ([400, 401, 500].includes(statusCode)) {
      switch (method) {
        case 'POST': { log.log = payload; break; }
        case 'PATCH': { log.log = req.body?.patchMap || req.body; break; }
        case 'DELETE': { log.log = { message: payload?.message }; break; }
        default: log.log = req.body;
      }
    }

    this.sock.send(['log.audits', JSON.stringify(log)]);
  }

  close() {
    this.sock.close();
  }
}
