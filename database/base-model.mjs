import lodash from 'lodash';
import serialize from 'fast-safe-stringify';
import { detailedDiff } from 'deep-object-diff';

import { customAlphabet } from 'nanoid';
import { basename, resolve } from 'path';

const { cloneDeep, isEqual, get } = lodash;

class BaseModel {
  /** init */

  static _init(fastify) {
    const { config } = fastify;

    this.cache = config.cache;
    this.namespace = config.env;

    this.resource = this.collection.name;
    this.redis = fastify.redis[this.namespace];
  }

  /** create */

  static async _create(data, options = { cache: true }) {
    const { cache } = options;
    const model = new this();

    let doc = await model.set(data).save();

    doc = doc.toObject();

    if (this.cache && cache) {
      const key = this._genKey(doc._id);
      await this.redis.set(key, serialize(doc));
    }

    doc.changeLog = { created: true };

    return doc;
  }

  /** read */

  static async _read(_id) {
    let doc = null;

    if (!_id) return null;

    if (typeof _id === 'object') {
      const ret = await this.findOne(_id).exec();
      return ret;
    }

    if (this.cache) {
      const key = this._genKey(_id);
      const strDoc = await this.redis.get(key);

      doc = JSON.parse(strDoc || 'null');
    }

    if (!doc) {
      doc = await this.findOne({ _id }).exec();
      if (!doc) return doc;

      doc = doc.toObject();

      if (this.cache) {
        const key = this._genKey(doc._id);
        await this.redis.set(key, serialize(doc));
      }
    }

    return doc;
  }

  /** update */

  static async _update(query, update, hard = false) {
    const doc = await this.findOne(query).exec();
    if (!doc) return null;

    const updKeys = Object.keys(update);

    const plainDoc = doc.toObject();
    const oldDoc = cloneDeep(plainDoc);

    const mergeUnique = (arr1, arr2) => {
      const result = arr1.concat(arr2).reduce((accum, item) => {
        for (let i = 0; i < accum.length; i += 1) {
          if (isEqual(accum[i], item)) return accum;
        }

        return [...accum, item];
      }, []);

      return result;
    };

    if (hard) {
      // hard update (if array, overwrite array values with new ones)
      updKeys.forEach((key) => { doc[key] = get(update, key); });
    } else {
      // soft update (if array, append new items to existing array)
      const updClone = cloneDeep(update);

      updKeys.forEach((key) => {
        doc[key] = Array.isArray(doc[key])
          ? mergeUnique(plainDoc[key], updClone[key])
          : updClone[key];
      });
    }

    const modifieds = doc.modifiedPaths();
    let updDoc = await doc.save();

    updDoc = updDoc.toObject();

    if (this.cache) {
      const key = this._genKey(updDoc._id);
      await this.redis.set(key, serialize(updDoc));
    }

    if (modifieds.length) {
      updDoc.changeLog = detailedDiff(oldDoc, updDoc);
      updDoc.modifieds = modifieds;
    }

    return updDoc;
  }

  /** delete */

  static async _delete(_id) {
    const filter = typeof _id === 'object' ? _id : { _id };
    const doc = await this.findOne(filter).exec();

    if (!doc) return null;

    await doc.remove();

    if (this.cache) {
      const key = this._genKey(doc._id);
      await this.redis.del(key);
    }

    return true;
  }

  static async _deleteMany(query) {
    let docs = [];

    if (this.cache) {
      docs = await this.find(query).select('_id').exec();
    }

    const ret = await this.deleteMany(query);

    if (this.cache && ret.deletedCount) {
      const pipe = this.redis.pipeline();
      const keys = docs.map((item) => this._genKey(item._id));

      await pipe.del(keys).exec();
    }

    return true;
  }

  /** list */

  static async _list(filter, options, hasNear = false) {
    let { sort, page, limit } = options || {};

    sort = sort || '';
    page = +(page || 1);
    limit = +(limit || 25);

    const query = this.find(filter);
    const cquery = this.find(filter);

    query.lean();
    query.limit(limit);
    query.skip(limit * (page > 0 ? page - 1 : 0));

    if (sort) {
      query.collation({ locale: 'en' });
      query.sort(sort);
    }

    const docs = await query.exec();

    const count = hasNear
      ? await cquery.count() // deprecated but working with $near query
      : await cquery.countDocuments(); // throws Invalid context err if it has $near

    return {
      page,
      count,
      limit,
      pages: Math.ceil(count / limit),
      records: docs,
    };
  }

  /** helper */

  static _genKey(_id) {
    return `${this.namespace}:${this.resource}:${_id}`;
  }

  static async _exists(query) {
    const exist = await this.countDocuments(query, { limit: 1 });
    return !!exist;
  }
}

// -- dumping it here as these will be used in models only

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
export const nanoidCustom = (len = 21) => customAlphabet(alphabet, len)();

export const getPathInfo = (metaUrl) => {
  const resource = basename(resolve(metaUrl, '..'));
  const version = basename(resolve(metaUrl, '../../..'));
  const modelName = `${version}-${resource}`;

  return { resource, version, modelName };
};

export default BaseModel;
