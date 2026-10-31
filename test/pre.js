// ---- 测试夹具：Risuai API 与 DOM 桩（在插件源码之前加载） ----
const __storage = {};
const __captured = { handlers: [], replacers: [] };
const __testCharObj = {
  chaId: 'char1', name: '测试卡',
  emotionImages: [
    ['yuna_normal_smile.png'], ['yuna_kiss_shy.png'], ['yuna_hug_happy.png'],
    ['yuna_bath_towel_calm.png'], ['yuna_swim_beach.png'], ['yuna_nude_missionary_sex.png'],
    ['yuna_sleep_pajamas.png'], ['yuna_wedding_bride.png']
  ],
  description: '测试用角色卡'
};
globalThis.__testChat = { uuid: 'chat-abc', message: [] };
globalThis.Risuai = {
  registerButton: async () => ({ id: 'btn' }),
  registerSetting: async () => ({ id: 'set' }),
  unregisterUIPart: async () => {},
  onUnload: async () => {},
  addRisuScriptHandler: async (mode, fn) => { __captured.handlers.push([mode, fn]); },
  addRisuReplacer: async (tag, fn) => { __captured.replacers.push(fn); },
  requestPluginPermission: async () => true,
  pluginStorage: {
    getItem: async (k) => (k in __storage ? __storage[k] : null),
    setItem: async (k, v) => { __storage[k] = v; },
    removeItem: async (k) => { delete __storage[k]; },
    keys: async () => Object.keys(__storage),
    length: async () => Object.keys(__storage).length,
    clear: async () => {}
  },
  getCurrentCharacterIndex: async () => 0,
  getCurrentChatIndex: async () => 0,
  getChatFromIndex: async () => globalThis.__testChat,
  getCharacter: async () => __testCharObj,
  getDatabase: async () => ({ modules: [], enabledModules: [], personas: [], selectedPersona: 0 }),
  nativeFetch: async () => { throw new Error('测试环境无网络'); },
  showContainer: async () => {}, hideContainer: async () => {}
};
globalThis.__captured = __captured;
globalThis.__storage = __storage;
const __mkEl = () => ({ style: {}, dataset: {}, classList: { add(){}, remove(){}, toggle(){} }, innerHTML: '', textContent: '', value: '', appendChild(){}, removeChild(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }, addEventListener(){}, setAttribute(){}, focus(){}, select(){}, remove(){}, click(){} });
globalThis.document = {
  getElementById(){ return null; },
  createElement(){ return __mkEl(); },
  createDocumentFragment(){ return { appendChild(){} }; },
  body: { appendChild(){}, removeChild(){}, innerHTML: '' }
};
globalThis.window = { getSelection(){ return null; } };
globalThis.alert = () => {}; globalThis.prompt = () => null; globalThis.confirm = () => false;
if (typeof btoa === 'undefined') globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
