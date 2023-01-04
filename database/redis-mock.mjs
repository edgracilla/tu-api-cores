import RedisMock from 'ioredis-mock';

import fastifyPlugin from 'fastify-plugin';

function inject(fastify, options, done) {
  const { namespace, url } = options;

  if (!fastify.redis) {
    fastify.decorate('redis', {});
  }

  if (fastify.redis[namespace]) {
    return done(new Error(`Redis '${namespace}' instance namespace has already been registered`));
  }

  try {
    fastify.redis[namespace] = new RedisMock({ host: url });
  } catch (err) {
    return done(err);
  }

  if (options.closeClient === true) {
    fastify.addHook('onClose', (instance, next) => {
      instance.redis[namespace].quit(next);
    });
  }

  return done();
}

export default fastifyPlugin(inject);
