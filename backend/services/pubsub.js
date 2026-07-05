const { PubSub } = require('@google-cloud/pubsub');
const dotenv = require('dotenv');

dotenv.config();

const pubsub = new PubSub();

async function pullMessages(subscriptionName, timeoutSeconds = 10) {
  const subscription = pubsub.subscription(subscriptionName);
  const [messages] = await subscription.pull({ maxMessages: 10, returnImmediately: false });
  const ackIds = messages.map((message) => message.ackId);
  if (ackIds.length) {
    await subscription.ack(ackIds);
  }
  return messages.map((message) => ({ id: message.id, data: message.data.toString(), attributes: message.attributes }));
}

module.exports = {
  pullMessages,
};
