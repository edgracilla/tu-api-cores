import mongoose from 'mongoose';
import fastifyPlugin from 'fastify-plugin';

mongoose.set('strictQuery', false);

function inject(fastify, options, next) {
  const logger = fastify.log;
  const dbURL = options.dbURL || 'mongodb://localhost:27017';

  const mongoConfig = {
    ...options,
    serverSelectionTimeoutMS: 1000 * 8,
    useUnifiedTopology: true,
    useNewUrlParser: true,
  };

  delete mongoConfig.dbURL;
  let isRegistered = false;

  mongoose
    .connect(dbURL, mongoConfig)
    .then((db) => {
      logger.info(`Connected to MongoDB (${options.dbName})`);

      db.connection.on('disconnected', () => {
        logger.info('Diconnected from MongoDB.');
      });

      db.connection.on('reconnected', () => {
        logger.info('Reconnected to MongoDB.');
      });

      if (!isRegistered) {
        isRegistered = true;

        fastify
          .decorate('mongo', db)
          .addHook('onClose', async () => {
            await db.connection.close();
          });
      }

      next();
    })
    .catch((err) => {
      logger.info(err.message);
      next(err);
    });
}

export default fastifyPlugin(inject);
