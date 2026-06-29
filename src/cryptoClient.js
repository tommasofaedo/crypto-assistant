const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const BASE_URL = 'https://api.crypto.com/exchange/v1';
const API_KEY = process.env.CRYPTO_API_KEY;
const API_SECRET = process.env.CRYPTO_API_SECRET;

let requestId = 1;

function buildSignature(method, id, params, nonce) {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map(k => `${k}${params[k]}`).join('');
  const payload = `${method}${id}${API_KEY}${paramString}${nonce}`;
  return crypto.createHmac('sha256', API_SECRET).update(payload).digest('hex');
}

async function privateRequest(method, params = {}) {
  const id = requestId++;
  const nonce = Date.now().toString();
  const sig = buildSignature(method, id, params, nonce);

  const body = {
    id,
    method,
    api_key: API_KEY,
    params,
    nonce,
    sig,
  };

  const response = await axios.post(`${BASE_URL}/${method}`, body, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (response.data.code !== 0) {
    throw new Error(`API error ${response.data.code}: ${response.data.message}`);
  }

  return response.data.result;
}

module.exports = { privateRequest };
