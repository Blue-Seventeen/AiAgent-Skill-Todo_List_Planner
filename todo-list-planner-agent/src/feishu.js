'use strict';

const lark = require('@larksuiteoapi/node-sdk');

function createFeishuClient(config) {
  return new lark.Client({
    appId: config.feishu.appId,
    appSecret: config.feishu.appSecret,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu
  });
}

function createWsClient(config) {
  return new lark.WSClient({
    appId: config.feishu.appId,
    appSecret: config.feishu.appSecret,
    loggerLevel: lark.LoggerLevel.info
  });
}

async function replyText(client, messageId, text) {
  const content = JSON.stringify({ text: String(text || '') });

  if (client.im && client.im.v1 && client.im.v1.message && client.im.v1.message.reply) {
    return client.im.v1.message.reply({
      path: { message_id: messageId },
      data: {
        msg_type: 'text',
        content
      }
    });
  }

  return client.request({
    method: 'POST',
    url: `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`,
    data: {
      msg_type: 'text',
      content
    }
  });
}

async function replyCard(client, messageId, card) {
  const content = JSON.stringify(card);

  if (client.im && client.im.v1 && client.im.v1.message && client.im.v1.message.reply) {
    return client.im.v1.message.reply({
      path: { message_id: messageId },
      data: {
        msg_type: 'interactive',
        content
      }
    });
  }

  return client.request({
    method: 'POST',
    url: `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`,
    data: {
      msg_type: 'interactive',
      content
    }
  });
}

async function startLongConnection(config, handler, cardActionHandler) {
  const client = createFeishuClient(config);
  const wsClient = createWsClient(config);
  const handlers = { 'im.message.receive_v1': handler };
  if (cardActionHandler) handlers['card.action.trigger'] = cardActionHandler;
  const dispatcher = new lark.EventDispatcher({}).register(handlers);
  await wsClient.start({ eventDispatcher: dispatcher });
  return { client, wsClient };
}

module.exports = {
  createFeishuClient,
  createWsClient,
  replyCard,
  replyText,
  startLongConnection
};
