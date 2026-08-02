const FAST2SMS_API_URL = 'https://www.fast2sms.com/dev/bulkV2';

// Fast2SMS "Quick SMS" route (q) needs no DLT template registration, but
// only reliably delivers to Indian mobile numbers.
async function sendSms(mobile, message) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    console.warn(`FAST2SMS_API_KEY not set — skipping SMS to ${mobile}`);
    return { skipped: true };
  }

  const params = new URLSearchParams({
    authorization: apiKey,
    message,
    language: 'english',
    route: 'q',
    numbers: mobile
  });

  const response = await fetch(`${FAST2SMS_API_URL}?${params.toString()}`);
  const data = await response.json();

  if (!data.return) {
    throw new Error(Array.isArray(data.message) ? data.message.join(', ') : (data.message || 'SMS send failed'));
  }
  return data;
}

module.exports = { sendSms };
