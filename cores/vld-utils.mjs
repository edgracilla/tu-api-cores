/* eslint-disable no-await-in-loop */

import Ajv from 'ajv';
import lodash from 'lodash';
import mongoose from 'mongoose';
import MongoQS from 'mongo-querystring';
import ApiError from './api-error.mjs';

const ajv = new Ajv({
  keywords: ['prereq'],
  allErrors: true,
});

export const makeMongoQS = (params) => {
  const whiteParams = params
    .filter(Boolean)
    .reduce((accum, key) => {
      accum[key] = true;
      return accum;
    }, {});

  return new MongoQS({
    whitelist: whiteParams,
    blacklist: {
      page: true,
      sort: true,
      limit: true,
      near: true,
      search: true,
    },
  });
};

const stripperSlave = (obj, ret) => {
  const keys = Object.keys(obj);

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const val = obj[key];

    if (key !== 'required') {
      if (typeof val === 'object' && !Array.isArray(val)) {
        ret[key] = {};
        stripperSlave(val, ret[key]);
      } else {
        ret[key] = val;
      }
    }
  }
};

export const stripSchemaRequired = (schema) => {
  const newObj = {};
  stripperSlave(schema, newObj);
  return newObj;
};

export function makeValidationSchemas(body, query) {
  return {
    body,
    postSchema: { schema: { body } },
    getSchema: { schema: { querystring: query } },
    patchSchema: { schema: { body: stripSchemaRequired(body) } },
  };
}

export function getPrereqs(body, version) {
  const props = body.properties;
  const fields = Object.keys(props || {});

  const ret = fields.map((field) => {
    const model = lodash.get(props, `${field}.prereq`);
    return model ? [field, `${version}-${model}`] : null;
  });

  return ret.filter(Boolean);
}

export async function prereqExists(body, prereqs) {
  const errBag = [];

  for (let i = 0; i < prereqs.length; i += 1) {
    const field = prereqs[i][0];
    const model = prereqs[i][1];
    const _id = body[field];

    if (_id) {
      const exist = await mongoose
        .model(model)
        .countDocuments({ _id }, { limit: 1 });

      if (!exist) {
        errBag.push(`${field} '${_id}' does not exist.`);
      }
    }
  }

  if (errBag.length) {
    throw new ApiError(400, 'Missing prerequisite record.', errBag);
  }
}

export function CustomAjvError(from, ajvErrs) {
  const errMsgs = ajvErrs.map((err) => `${from} ${err.message}`);
  const err = new Error(errMsgs.join(', '));
  err.statusCode = 400;

  return err;
}

export function makeServiceCallValidator(from, schema) {
  const ajvCompiled = ajv.compile(schema);

  return async (data) => {
    if (!ajvCompiled(data)) {
      throw CustomAjvError(from, ajvCompiled.errors);
    }
  };
}

export default {};
