const http = require('http');
const ODOO_URL = 'http://115.246.240.218:369';
const DB = 'shan1';
function jsonRpc(url, params) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params });
    const urlObj = new URL(url);
    const options = { hostname: urlObj.hostname, port: urlObj.port, path: urlObj.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } };
    if (jsonRpc._cookies) options.headers['Cookie'] = jsonRpc._cookies;
    const req = http.request(options, (res) => {
      if (res.headers['set-cookie']) jsonRpc._cookies = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Parse')); } });
    });
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject); req.write(data); req.end();
  });
}
async function call(model, method, args, kwargs = {}) {
  const res = await jsonRpc(`${ODOO_URL}/web/dataset/call_kw`, { model, method, args, kwargs });
  if (res.error) throw new Error(res.error.data?.message || JSON.stringify(res.error).substring(0, 300));
  return res.result;
}
async function main() {
  await jsonRpc(`${ODOO_URL}/web/session/authenticate`, { db: DB, login: 'admin', password: 'admin' });

  // List ALL payments - no filters
  console.log('=== ALL account.payment records ===');
  const all = await call('account.payment', 'search_read', [[]], {
    fields: ['id', 'name', 'partner_id', 'amount', 'date', 'state', 'payment_type', 'partner_type', 'journal_id', 'company_id', 'is_internal_transfer'],
    order: 'id desc', limit: 20,
  });
  console.log(`Total: ${all.length}`);
  all.forEach(p => {
    console.log(`ID:${p.id} | ${p.name} | ${p.partner_id?.[1] || 'N/A'} | ${p.amount} | ${p.state} | type:${p.payment_type} | partner_type:${p.partner_type} | company:${p.company_id?.[1]} | internal:${p.is_internal_transfer}`);
  });
}
main().catch(e => console.error(e));
