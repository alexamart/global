const DEFAULT_ALLOWED_SENDERS = [
  'sandrawan066@gmail.com',
];

const ALLOWED_SUBJECT_PATTERNS = [
  /YAPE/i,
  /receipt/i,
];

function normalizeSender(sender) {
  return (sender || '').toLowerCase().trim();
}

function validateSender(sender, allowedSenders = []) {
  const normalized = normalizeSender(sender);
  const configuredSenders = allowedSenders.length
    ? allowedSenders.map((value) => normalizeSender(value))
    : DEFAULT_ALLOWED_SENDERS.map((value) => normalizeSender(value));
  return configuredSenders.some((allowed) => normalized.includes(allowed));
}

function validateSubject(subject) {
  const normalized = (subject || '').toLowerCase();
  return ALLOWED_SUBJECT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function parsePaymentEmail(message, allowedSenders = []) {
  const headers = message.payload.headers || [];
  const subject = headers.find((h) => h.name === 'Subject')?.value || '';
  const from = headers.find((h) => h.name === 'From')?.value || '';
  const date = headers.find((h) => h.name === 'Date')?.value || null;

  if (!validateSender(from, allowedSenders) && !validateSubject(subject)) {
    return null;
  }

  const bodyParts = [];
  function collectParts(part) {
    if (part.parts) {
      part.parts.forEach(collectParts);
    } else if (part.body && part.body.data) {
      bodyParts.push(part.body.data);
    }
  }
  collectParts(message.payload);

  const rawBody = bodyParts
    .map((part) => Buffer.from(part, 'base64').toString('utf8'))
    .join('\n');
  const bodyText = rawBody
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&amp;|&quot;|&#39;|&lt;|&gt;|&mdash;|&ndash;/gi, (entity) => {
      switch (entity.toLowerCase()) {
        case '&nbsp;': return ' ';
        case '&amp;': return '&';
        case '&quot;': return '"';
        case '&#39;': return "'";
        case '&lt;': return '<';
        case '&gt;': return '>';
        case '&mdash;': return '-';
        case '&ndash;': return '-';
        default: return ' ';
      }
    })
    .replace(/[\*'"“”]/g, ' ')
    .replace(/\r?\n+/g, '\n')
    .trim();

  function stripForwardedHeader(text) {
    const markerMatch = text.match(/-{2,}\s*Forwarded message\s*-*/i);
    if (!markerMatch) {
      return text.trim();
    }

    const afterMarker = text.slice(markerMatch.index + markerMatch[0].length).trim();
    const lines = afterMarker.split(/\r?\n/);
    let skipCount = 0;

    while (skipCount < lines.length) {
      const trimmed = lines[skipCount].trim();
      if (!trimmed) {
        skipCount += 1;
        continue;
      }
      if (/^(from|date|subject|to|cc|bcc):/i.test(trimmed)) {
        skipCount += 1;
        continue;
      }
      break;
    }

    return lines.slice(skipCount).join('\n').trim();
  }

  const bodyNoForwardHeader = stripForwardedHeader(bodyText)
    .replace(/\bFrom:\s*[^\n]+/ig, ' ')
    .replace(/\bDate:\s*[^\n]+/ig, ' ')
    .replace(/\bSubject:\s*[^\n]+/ig, ' ')
    .replace(/\bTo:\s*[^\n]+/ig, ' ')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
  const normalizedText = `${bodyNoForwardHeader}\n${subject}`;
  const normalizedTextForCustomer = bodyNoForwardHeader;
  const lines = normalizedTextForCustomer
    .split(/\r?\n/)
    .flatMap((line) => line.split(/ {2,}/))
    .map((line) => line.trim())
    .filter(Boolean);

  let amount = null;
  const amountPatterns = [
    /(?:S[\/\\]|S\.\/|S\s*\/|PEN|soles?)\s*([0-9]+(?:[.,][0-9]{1,2})?)/i,
    /(?:importe|monto recibido|monto|recibiste un|recibiste|pagaste|recibiste)\s*[:\-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)/i,
    /\$\s*([0-9]+(?:[.,][0-9]{1,2})?)/,
    /([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:soles|PEN|S[\/\\])/i,
  ];
  for (const text of [normalizedText, ...lines]) {
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        const rawAmount = match[1];
        const cleaned = rawAmount.replace(/[,]/g, '.').replace(/[^0-9.]/g, '');
        const parsed = parseFloat(cleaned);
        if (!Number.isNaN(parsed)) {
          amount = parsed;
          break;
        }
      }
    }
    if (amount !== null) break;
  }

  function normalizeCustomerValue(value) {
    if (!value) return null;
    return value
      .replace(/[*"'“”]/g, ' ')
      .replace(/----------\s*Forwarded message[\s\S]*$/i, ' ')
      .replace(/From:\s*[^\n\r]+/i, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s*(?:Monto|importe|recibiste un|recibiste|pagaste|a nombre de|por parte de|S[\/\\]|PEN|soles?)\b[\s\S]*$/i, '')
      .replace(/[\s:]+$/g, '')
      .trim();
  }

  const nameFragment = '[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+';
  const namePattern = `${nameFragment}(?:\\s+${nameFragment}){0,3}`;
  const customerLabels = [
    new RegExp(`^\\s*enviado por\\s*[:\\-]?\\s*['\"“”]?\\s*(${namePattern})\\s*$`, 'i'),
    new RegExp(`^\\s*recibiste(?: un)?[\\s\\S]{0,120}?\\bde\\s+(${namePattern})\\s*$`, 'i'),
  ];
  let parsedCustomer = null;
  for (const text of [normalizedText, ...lines]) {
    for (const pattern of customerLabels) {
      const match = text.match(pattern);
      if (match) {
        const cleaned = normalizeCustomerValue(match[1]);
        if (cleaned) {
          parsedCustomer = cleaned;
          break;
        }
      }
    }
    if (parsedCustomer) break;
  }
  if (!parsedCustomer) {
    const fromNameMatch = from.match(/^(?:"?([^"<]+)"?)\s*</);
    parsedCustomer = fromNameMatch ? fromNameMatch[1].trim() : from;
  }

  return {
    email_id: message.id,
    sender: from,
    amount,
    parsed_amount: amount,
    parsed_customer: parsedCustomer,
    raw_body: rawBody,
    transaction_date: date ? new Date(date).toISOString() : null,
    subject,
  };
}

module.exports = {
  parsePaymentEmail,
};
