// CDP 驱动工具：连接 RisuAI (WebView2) 的调试端口
// 用法:
//   node cdp.mjs targets                 列出所有调试目标
//   node cdp.mjs contexts                列出主页面所有 JS 执行上下文（找插件 iframe）
//   node cdp.mjs console <秒>            监听控制台输出 N 秒
//   node cdp.mjs net <秒> [关键字]       抓取 N 秒内的网络请求（可选过滤关键字）
//   node cdp.mjs eval '<JS表达式>' [上下文名]  在指定上下文执行 JS（默认主上下文）
import fs from 'node:fs';

const PORT = 9222;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const cmd = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

if (cmd === 'targets') {
  for (const t of list) console.log(`[${t.type}] ${t.title?.slice(0, 50)} | ${t.url?.slice(0, 80)} | ${t.webSocketDebuggerUrl?.slice(0, 60)}`);
  process.exit(0);
}

const page = list.find(t => t.type === 'page') || list[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const contexts = [];
const consoleLines = [];
const netLog = [];

function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.executionContextCreated') {
    contexts.push(msg.params.context);
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
    consoleLines.push(`[${msg.params.type}] ${text}`);
  } else if (msg.method === 'Network.requestWillBeSent') {
    const r = msg.params.request;
    netLog.push({ url: r.url, method: r.method, postData: r.postData || '' });
  }
};

await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
await send('Runtime.enable');
await send('Network.enable');
await new Promise(r => setTimeout(r, 800)); // 等上下文枚举齐

async function evalInContext(expression, ctxName, timeoutMs = 15000) {
  let contextId;
  if (ctxName && ctxName !== 'main') {
    let hit;
    if (/^\d+$/.test(ctxName)) {
      hit = contexts.find(c => String(c.id) === ctxName);
    } else {
      hit = contexts.find(c => (c.name || '').toLowerCase().includes(ctxName.toLowerCase()) || (c.origin || '').toLowerCase().includes(ctxName.toLowerCase()));
    }
    if (!hit) throw new Error(`找不到上下文 "${ctxName}"。现有: ` + contexts.map(c => `[${c.id}] name=${c.name} origin=${c.origin}`).join(' ; '));
    contextId = hit.id;
  }
  const res = await send('Runtime.evaluate', {
    expression, contextId, awaitPromise: true, returnByValue: true, repl: false,
  }, undefined);
  if (res.exceptionDetails) {
    return '!! 异常: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  }
  return res.result?.value;
}

if (cmd === 'contexts') {
  console.log(contexts.map(c => `[id=${c.id}] name=${c.name} origin=${c.origin.slice(0, 70)}`).join('\n'));
} else if (cmd === 'console') {
  const secs = Number(arg1 || 8);
  await new Promise(r => setTimeout(r, secs * 1000));
  console.log(consoleLines.slice(-120).join('\n') || '(无控制台输出)');
} else if (cmd === 'net') {
  const secs = Number(arg1 || 10);
  const filter = arg2 || '';
  await new Promise(r => setTimeout(r, secs * 1000));
  const hits = netLog.filter(n => !filter || n.url.includes(filter) || n.postData.includes(filter));
  for (const n of hits) {
    console.log(`\n=== ${n.method} ${n.url.slice(0, 120)}`);
    if (n.postData) console.log('BODY(前1200字): ' + n.postData.slice(0, 1200));
  }
  if (!hits.length) console.log('(无匹配请求)');
} else if (cmd === 'netfull') {
  // node cdp.mjs netfull <秒> <输出文件> — 完整保存 LLM 请求体并解码字节数组
  const secs = Number(arg1 || 25);
  const outfile = arg2 || 'llm_capture.json';
  const caps = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Network.requestWillBeSent') {
      const r = msg.params.request;
      if (r.postData && (r.url.includes('completions') || r.url.includes('generate') || r.url.includes('ipc.localhost/plugin%3Ahttp'))) {
        caps.push({ url: r.url, postData: r.postData });
      }
    }
  });
  await new Promise(r => setTimeout(r, secs * 1000));
  // 解码 data 字节数组
  const decoded = [];
  for (const c of caps) {
    try {
      const j = JSON.parse(c.postData);
      if (j && j.clientConfig && Array.isArray(j.clientConfig.data)) {
        const text = Buffer.from(j.clientConfig.data).toString('utf8');
        decoded.push({ url: j.clientConfig.url, text });
      } else { decoded.push({ url: c.url, text: c.postData.slice(0, 200) }); }
    } catch (_) { decoded.push({ url: c.url, text: c.postData.slice(0, 200) }); }
  }
  fs.writeFileSync(outfile, JSON.stringify(decoded, null, 1));
  console.log(`已捕获 ${decoded.length} 个请求，写入 ${outfile}`);
  for (const d of decoded) {
    if (d.url.includes('completions')) {
      console.log('\n===== LLM 请求: ' + d.url.slice(0, 90));
      console.log('长度=' + d.text.length);
      for (const marker of ['游戏内时间', '视觉标签强制令', '好感度墙', 'Favorability', '<Vis:', 'affection', 'char_state', 'preg_core', 'timeOfDay', '好感度', '攻略', 'System Note']) {
        const n = d.text.split(marker).length - 1;
        if (n > 0) console.log(`  含 "${marker}" × ${n}`);
      }
    }
  }
} else if (cmd === 'eval') {
  const out = await evalInContext(arg1, arg2);
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
} else if (cmd === 'script') {
  // node cdp.mjs script <文件路径> [上下文名]
  const code = fs.readFileSync(arg1, 'utf8');
  const out = await evalInContext(code, arg2, 30000);
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
} else {
  console.log('未知命令: ' + cmd);
}
ws.close();
process.exit(0);
