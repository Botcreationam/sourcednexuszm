// ============================================================================
// PostgREST-compatible shim over a REAL Postgres (test use only).
//
// The production server code talks to Supabase through plain REST calls
// (lib/payza-shared.mjs -> supabaseRest). This shim answers exactly those calls
// from a real Postgres database, so tests exercise the REAL migration: real
// tables, real foreign keys, real CHECK constraints, real cascades.
//
// It implements only what the app uses:
//   GET    ?select=a,b &col=eq.v &col=in.(a,b) &order=col.asc|desc &limit=n
//   POST   single object or array, Prefer: return=representation|minimal
//   PATCH  ?col=eq.v  (body = columns to set)
//   DELETE ?col=eq.v
//   Unknown columns return HTTP 400 like PostgREST (code 42703), which lets the
//   tests prove the "migration not applied yet" fallback paths.
//
// Requires the `pg` package (installed in the throwaway ./pgtest folder, NOT in
// the project's dependencies).
// ============================================================================
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(process.env.PG_MODULE_ROOT ? `${process.env.PG_MODULE_ROOT}/` : import.meta.url);
const { Client } = require('pg');

const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error(`bad identifier ${s}`);
  return `"${s}"`;
};

function filterSql(params, values, skip = ['select', 'order', 'limit']) {
  const where = [];
  for (const [key, raw] of params) {
    if (skip.includes(key)) continue;
    const m = String(raw).match(/^(eq|in|neq|is|gt|gte|lt|lte)\.(.*)$/s);
    if (!m && key === 'or') continue; // not used by the pages under test
    if (!m) throw new Error(`unsupported filter ${key}=${raw}`);
    const [, op, val] = m;
    if (op === 'eq') { values.push(val); where.push(`${ident(key)}::text = $${values.length}`); }
    else if (op === 'neq') { values.push(val); where.push(`${ident(key)}::text <> $${values.length}`); }
    else if (op === 'in') {
      const list = val.replace(/^\(|\)$/g, '').split(',').map((v) => v.trim()).filter(Boolean);
      values.push(list);
      where.push(`${ident(key)}::text = any($${values.length}::text[])`);
    } else if (op === 'is') {
      where.push(`${ident(key)} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`);
    } else {
      const sym = { gt: '>', gte: '>=', lt: '<', lte: '<=' }[op];
      values.push(val); where.push(`${ident(key)} ${sym} $${values.length}`);
    }
  }
  return where.length ? ` where ${where.join(' and ')}` : '';
}

export async function startPgShim({ port, pg }) {
  const client = new Client(pg);
  await client.connect();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Expose-Headers': 'Content-Range',
    };
    const wantsObject = String(req.headers.accept || '').includes('vnd.pgrst.object');
    const send = (code, data) => {
      res.writeHead(code, { 'Content-Type': 'application/json', ...cors });
      if (data === undefined) return res.end('');
      // supabase-js .single()/.maybeSingle(): one object instead of an array
      if (wantsObject && Array.isArray(data) && code === 200) {
        if (data.length === 0) { res.writeHead; return res.end(JSON.stringify(null)); }
        return res.end(JSON.stringify(data[0]));
      }
      res.end(JSON.stringify(data));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        if (url.pathname === '/auth/v1/user') {
          const t = (req.headers.authorization || '').replace('Bearer ', '');
          const m = t.match(/^tok-(.+)$/);
          if (!m) return send(401, {});
          const r = await client.query('select id,email from auth.users where id::text = $1', [m[1]]);
          return r.rows[0] ? send(200, r.rows[0]) : send(401, {});
        }
        if (url.pathname.startsWith('/rest/v1/rpc/')) return send(200, null);
        if (url.pathname.startsWith('/auth/v1/')) return send(200, {});
        if (!url.pathname.startsWith('/rest/v1/')) return send(404, {});
        const table = url.pathname.replace('/rest/v1/', '');
        const payload = body ? JSON.parse(body) : null;
        const prefer = String(req.headers.prefer || '');
        const params = [...url.searchParams.entries()];
        const values = [];

        if (req.method === 'GET') {
          const sel = (url.searchParams.get('select') || '*').split(',').map((c) => (c.trim() === '*' ? '*' : ident(c.trim()))).join(', ');
          let q = `select ${sel} from public.${ident(table)}${filterSql(params, values)}`;
          const order = url.searchParams.get('order');
          if (order) {
            q += ' order by ' + order.split(',').map((o) => {
              const [c, d] = o.split('.');
              return `${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}`;
            }).join(', ');
          }
          if (url.searchParams.get('limit')) q += ` limit ${Number(url.searchParams.get('limit'))}`;
          const r = await client.query(q, values);
          return send(200, r.rows);
        }

        if (req.method === 'POST') {
          const rows = Array.isArray(payload) ? payload : [payload];
          const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
          const typeRes = await client.query(
            "select column_name from information_schema.columns where table_schema='public' and table_name=$1 and data_type in ('jsonb','json')", [table]);
          const jsonCols = new Set(typeRes.rows.map((x) => x.column_name));
          const vals = [];
          const tuples = rows.map((r) => `(${cols.map((c) => {
            const v = r[c];
            // jsonb columns need JSON text; real text[] columns need a JS array. Ask
            // Postgres which kind the column is (cached) so both behave like PostgREST.
            vals.push(v === undefined ? null : (v !== null && typeof v === 'object' && jsonCols.has(c)) ? JSON.stringify(v) : v);
            return `$${vals.length}`;
          }).join(', ')})`);
          const q = `insert into public.${ident(table)} (${cols.map(ident).join(', ')}) values ${tuples.join(', ')} returning *`;
          const r = await client.query(q, vals);
          // PostgREST returns rows in insertion order; so does Postgres for a single multi-row INSERT.
          return send(201, prefer.includes('return=representation') ? r.rows : undefined);
        }

        if (req.method === 'PATCH') {
          const cols = Object.keys(payload);
          const typeRes = await client.query(
            "select column_name from information_schema.columns where table_schema='public' and table_name=$1 and data_type in ('jsonb','json')", [table]);
          const jsonCols = new Set(typeRes.rows.map((x) => x.column_name));
          const vals = cols.map((c) => (payload[c] !== null && typeof payload[c] === 'object' && jsonCols.has(c) ? JSON.stringify(payload[c]) : payload[c]));
          const sets = cols.map((c, i) => `${ident(c)} = $${i + 1}`);
          values.push(...vals);
          const where = filterSql(params, values);
          // placeholder numbering: filter params come after the SET params
          const r = await client.query(`update public.${ident(table)} set ${sets.join(', ')}${where} returning *`, values);
          return send(200, r.rows);
        }

        if (req.method === 'DELETE') {
          await client.query(`delete from public.${ident(table)}${filterSql(params, values)}`, values);
          return send(204);
        }
        send(405, {});
      } catch (err) {
        // Mirror PostgREST: a bad column / constraint is a 4xx with a pg error code.
        const code = err.code || 'XX000';
        const status = code === '23505' ? 409 : code.startsWith('23') || code === '42703' || code === '42P01' ? 400 : 500;
        send(status, { code, message: err.message });
      }
    });
  });
  await new Promise((r) => server.listen(port, r));
  return { server, client, close: async () => { server.close(); await client.end(); } };
}
