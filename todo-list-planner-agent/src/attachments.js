'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function extensionFromKey(key) {
  const ext = path.extname(String(key || '')).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) return ext;
  return '.jpg';
}

async function writeResponseToFile(resp, filePath) {
  if (resp && typeof resp.writeFile === 'function') {
    await resp.writeFile(filePath);
    return filePath;
  }

  if (resp && typeof resp.getReadableStream === 'function') {
    await new Promise((resolve, reject) => {
      const input = resp.getReadableStream();
      const output = fs.createWriteStream(filePath);
      input.on('error', reject);
      output.on('error', reject);
      output.on('finish', resolve);
      input.pipe(output);
    });
    return filePath;
  }

  const data = resp && (resp.data || resp.rawData || resp);
  if (Buffer.isBuffer(data)) {
    fs.writeFileSync(filePath, data);
    return filePath;
  }

  if (data instanceof ArrayBuffer) {
    fs.writeFileSync(filePath, Buffer.from(data));
    return filePath;
  }

  throw new Error('Unsupported Feishu resource response shape.');
}

async function fetchImageResource(client, messageId, imageKey, filePath) {
  if (client.im && client.im.v1 && client.im.v1.messageResource && client.im.v1.messageResource.get) {
    const resp = await client.im.v1.messageResource.get({
      path: {
        message_id: messageId,
        file_key: imageKey
      },
      params: {
        type: 'image'
      }
    });
    return writeResponseToFile(resp, filePath);
  }

  const encodedMessageId = encodeURIComponent(messageId);
  const encodedFileKey = encodeURIComponent(imageKey);
  const resp = await client.request({
    method: 'GET',
    url: `/open-apis/im/v1/messages/${encodedMessageId}/resources/${encodedFileKey}`,
    params: { type: 'image' },
    responseType: 'arraybuffer'
  });
  return writeResponseToFile(resp, filePath);
}

async function downloadImages(client, message, imageKeys, config) {
  ensureDir(config.attachmentDir);
  const saved = [];
  const failed = [];
  const messageId = message.message_id;

  for (const key of imageKeys) {
    const name = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}${extensionFromKey(key)}`;
    const filePath = path.join(config.attachmentDir, name);
    try {
      await fetchImageResource(client, messageId, key, filePath);
      saved.push(filePath);
    } catch (error) {
      failed.push({ key, error: error.message });
    }
  }

  return { saved, failed };
}

module.exports = {
  downloadImages,
  fetchImageResource,
  extensionFromKey
};
