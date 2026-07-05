function parsePaymentEmail(message) {
  const headers = message.payload.headers || [];
  const subject = headers.find((h) => h.name === 'Subject')?.value || '';
  const from = headers.find((h) => h.name === 'From')?.value || '';
  const date = headers.find((h) => h.name === 'Date')?.value || null;

  const bodyParts = [];
  function collectParts(part) {
    if (part.parts) {
      part.parts.forEach(collectParts);
    } else if (part.body && part.body.data) {
      bodyParts.push(part.body.data);
    }
  }
  collectParts(message.payload);

  const rawBody = bodyParts.map((part) => Buffer.from(part, 'base64').toString('utf8')).join('\n');

  const amountMatch = rawBody.match(/\$?([0-9]+(?:\.[0-9]{2})?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : null;

  return {
    email_id: message.id,
    sender: from,
    amount,
    transaction_date: date ? new Date(date).toISOString() : null,
    subject,
    raw_body: rawBody,
  };
}

module.exports = {
  parsePaymentEmail,
};
