// All contact with the payment provider lives in this one file.
// mock mode = nothing real happens. To go live, fill in the "REAL" parts
// using your provider's API docs and the keys they give you.
const MODE = process.env.PROVIDER || 'mock';

async function quote(amount) {
  if (MODE === 'mock') {
    const fee = +(amount * 0.01).toFixed(2); // demo fee 1%
    return { fee, rate: 1, receive: +(amount - fee).toFixed(2) };
  }
  // REAL: call provider's quote/rate API here and return { fee, rate, receive }
  throw new Error('Provider not configured yet (see provider.js)');
}

async function createTransfer({ amount, bankId, account, recipientName, reference }) {
  if (MODE === 'mock') {
    return { providerId: 'MOCK-' + reference, status: 'demo-completed' };
  }
  // REAL: send payout request to provider using process.env.PROVIDER_API_KEY
  // Return { providerId: <their transfer id>, status: <their status> }
  throw new Error('Provider not configured yet (see provider.js)');
}

module.exports = { quote, createTransfer, MODE };
