//@name favor_physio_manager
//@display-name 奈亚V6.2.1·星云极光
//@api 3.0
//@version 6.2.1
//@update-url https://raw.githubusercontent.com/postskt/nailya-plugin/main/Nailya.plugin.js

(async () => {
  try {
    // ------------------------------------------------------------------------
    // 0. 极速并发注册插件按钮（科幻星云×极光 SVG 图标 + 全位置覆盖）与设置入口
    // ------------------------------------------------------------------------
    let openManagerUIRef = async () => {};
    const registeredUIParts = [];

    const ICON_MODE = 'html-emoji'; // 'img-svg'(推荐，绕过DOMPurify完美呈现渐变SVG) | 'html-emoji' | 'html-svg'

    // 科幻极简风：梦幻蓝紫星云 × 极光青蓝 棱镜晶心图标
    const PLUGIN_ICON_SVG = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none">',
      '<defs>',
      '<linearGradient id="ny_aurora" x1="0" y1="0" x2="1" y2="1">',
      '<stop offset="0%" stop-color="#22d3ee"/>',
      '<stop offset="50%" stop-color="#6366f1"/>',
      '<stop offset="100%" stop-color="#c084fc"/>',
      '</linearGradient>',
      '<linearGradient id="ny_facet" x1="0" y1="1" x2="1" y2="0">',
      '<stop offset="0%" stop-color="#38bdf8" stop-opacity="0.85"/>',
      '<stop offset="100%" stop-color="#e879f9" stop-opacity="0.25"/>',
      '</linearGradient>',
      '</defs>',
      '<path fill="url(#ny_aurora)" d="M12 21.4l-1.42-1.3C5.38 15.35 2 12.27 2 8.5 2 5.41 4.42 3 7.5 3c1.76 0 3.44.82 4.5 2.11C13.06 3.82 14.74 3 16.5 3 19.58 3 22 5.41 22 8.5c0 3.77-3.38 6.85-8.58 11.6L12 21.4z"/>',
      '<path fill="url(#ny_facet)" d="M12 5.11L7.5 11.2 12 19.3l4.5-8.1L12 5.11z"/>',
      '<path stroke="#e0f2fe" stroke-width="1.1" stroke-linecap="round" stroke-opacity="0.8" d="M12 5.11v14.19M7.5 11.2h9"/>',
      '</svg>'
    ].join('');

    let PLUGIN_ICON_DATA_URL = '';
    try {
      PLUGIN_ICON_DATA_URL = 'data:image/svg+xml;base64,' + btoa(PLUGIN_ICON_SVG);
    } catch (_) {
      PLUGIN_ICON_DATA_URL = '';
    }

    const PLUGIN_EMOJI_ICON = `<span>💠</span>`;

    let PLUGIN_ICON = PLUGIN_ICON_DATA_URL;
    let PLUGIN_ICON_TYPE = 'img';
    if (ICON_MODE === 'html-emoji') {
      PLUGIN_ICON = PLUGIN_EMOJI_ICON;
      PLUGIN_ICON_TYPE = 'html';
    } else if (ICON_MODE === 'html-svg') {
      PLUGIN_ICON = PLUGIN_ICON_SVG;
      PLUGIN_ICON_TYPE = 'html';
    } else if (!PLUGIN_ICON_DATA_URL) {
      PLUGIN_ICON = PLUGIN_EMOJI_ICON;
      PLUGIN_ICON_TYPE = 'html';
    }

    async function registerButtonSafe(opts, callback) {
      try {
        return await Risuai.registerButton(opts, callback);
      } catch (_) {
        const fallback = Object.assign({}, opts);
        delete fallback.id;
        return await Risuai.registerButton(fallback, callback);
      }
    }

    async function registerSettingSafe(name, callback, icon, iconType, id) {
      try {
        return await Risuai.registerSetting(name, callback, icon, iconType, id);
      } catch (_) {
        return await Risuai.registerSetting(name, callback, icon, iconType);
      }
    }

    const onPluginButtonClick = async () => {
      await openManagerUIRef();
    };

    // 优化1：使用 Promise.all 并发执行所有按钮与设置入口的跨窗口 IPC 注册，启动耗时降低 70%
    await Promise.all([
      ...['action', 'chat', 'hamburger'].map(async (loc) => {
        try {
          const btnRes = await registerButtonSafe({
            name: '奈亚V6.2.1',
            icon: PLUGIN_ICON,
            iconType: PLUGIN_ICON_TYPE,
            location: loc,
            id: `nailya-v540-btn-${loc}`
          }, onPluginButtonClick);
          if (btnRes && btnRes.id) registeredUIParts.push(btnRes.id);
        } catch (btnErr) {
          console.log(`[Nailya V6.2.1] 注册 ${loc} 按钮异常: ${btnErr.message}`);
        }
      }),
      (async () => {
        try {
          const setRes = await registerSettingSafe(
            '奈亚V6.2.1 星云极光·好感·生理·穿搭·酒馆预设',
            onPluginButtonClick,
            PLUGIN_ICON,
            PLUGIN_ICON_TYPE,
            'nailya-v540-settings'
          );
          if (setRes && setRes.id) registeredUIParts.push(setRes.id);
        } catch (setErr) {
          console.log(`[Nailya V6.2.1] 注册设置异常: ${setErr.message}`);
        }
      })()
    ]);

    try {
      await Risuai.onUnload(async () => {
        await Promise.all(registeredUIParts.map(id => Risuai.unregisterUIPart(id).catch(() => {})));
      });
    } catch (_) {}

    // ------------------------------------------------------------------------
    // 1. 数据结构、并发读取、脏标记增量存储 (Dirty-Flag Storage) 与全量备份
    // ------------------------------------------------------------------------
    let favorProfiles = {};     // 按角色卡 key -> chatIndex#角色中文名 存储当前聊天档案
    let cardAiCache = {};       // 按角色卡 key 永久缓存 AI 解析结果(角色设定 + 图片中文语义索引)
    let stPresets = {};         // 存储导入的酒馆 (SillyTavern) 预设集合: presetId -> presetObj
    let stVars = {};            // 存储酒馆宏变量 {{setvar::k::v}} / {{getvar::k}}

    let pluginConfig = {
      // 独立 AI 接口设置
      apiUrl: 'https://api.deepseek.com/chat/completions',
      apiKey: '',
      apiModel: 'deepseek-chat',
      autoMainModelAnalyze: true,   // 未配独立API或未分析时，允许借用当前聊天主模型自动分析一次
      // 提示词与选图设置
      enableImagePrompt: true,
      enableOutfitPrompt: true,
      outfitDetailMode: 'detailed', // 'detailed' (核心规则精描) | 'compact' (极简省流)
      syncOutfitWithImage: true,
      maxCandidateCount: 16,        // 优化：从原42张缩减至精选16张，大幅削减Token
      // 酒馆 (SillyTavern) 预设接管设置
      enableStPreset: false,        // 总开关：是否使用插件内的酒馆预设接管 RisuAI 预设
      activeStPresetId: '',         // 当前激活的酒馆预设 ID
      foldThinkingBlock: 'fold',    // 'fold' (折叠思维链) | 'strip' (彻底隐藏) | 'keep' (保留原样)
      // 视觉主题设置：'nebula-aurora' (星云×极光双生混彩) | 'nebula' (梦幻星云蓝紫玻璃) | 'aurora' (极光幻境青蓝科幻)
      uiTheme: 'nebula-aurora'
    };

    let viewMode = 'current'; // 'current' | 'all' | 'preset' | 'assets' | 'backup'
    let dataLoaded = false;
    let isAiAnalyzing = false;

    // 增量存储脏标记集合：避免每次普通聊天都把庞大的 cardAiCache 和 stPresets 重新序列化写盘
    const dirtyStoreKeys = new Set();
    function markDirty(...keys) {
      if (keys.length === 0) {
        dirtyStoreKeys.add('profiles');
        dirtyStoreKeys.add('aiCache');
        dirtyStoreKeys.add('config');
        dirtyStoreKeys.add('stPresets');
      } else {
        keys.forEach(k => dirtyStoreKeys.add(k));
      }
    }

    const runtimeCache = {
      lastCharIndex: -1,
      lastChatIndex: -1,
      lastCharKey: '',
      lastCharName: '',
      lastCtxTime: 0,
      cardReportMap: new Map(),
      compiledCnIndexMap: new Map(), // 缓存预拆分的中文触发词索引，避免每轮对话重复 split
      moduleCache: null,
      moduleCacheTime: 0,
      personaName: 'User',
      personaDesc: '',
      turnCounter: 0,
      pendingMainModelExtract: new Set()
    };

    function normalizeApiEndpoint(rawUrl) {
      let url = String(rawUrl || '').trim().replace(/\/+$/, '');
      if (!url) return 'https://api.deepseek.com/chat/completions';
      if (!/\/chat\/completions$/i.test(url)) {
        url += '/chat/completions';
      }
      return url;
    }

    // 优化2：使用 Promise.all 并发拉取 4 个存储分片，冷启动速度提升近 4 倍
    async function ensureStoredDataLoaded(force = false) {
      if (dataLoaded && !force) return;
      try {
        const [storedProfiles, storedAiCache, cfg, rawSt] = await Promise.all([
          Risuai.pluginStorage.getItem('fpm_profiles_v3'),
          Risuai.pluginStorage.getItem('fpm_card_ai_cache_v5'),
          Risuai.pluginStorage.getItem('fpm_img_config_v3'),
          Risuai.pluginStorage.getItem('fpm_st_presets_v52')
        ]);
        if (storedProfiles) {
          favorProfiles = typeof storedProfiles === 'string' ? JSON.parse(storedProfiles) : storedProfiles;
        }
        if (storedAiCache) {
          cardAiCache = typeof storedAiCache === 'string' ? JSON.parse(storedAiCache) : storedAiCache;
        }
        if (cfg) {
          const parsed = typeof cfg === 'string' ? JSON.parse(cfg) : cfg;
          pluginConfig = Object.assign({}, pluginConfig, parsed);
          pluginConfig.apiUrl = normalizeApiEndpoint(pluginConfig.apiUrl);
          // 彻底清除全局 customFormatOverride，默认候选数升级为 16
          delete pluginConfig.customFormatOverride;
          if (pluginConfig.maxCandidateCount === 42 || !pluginConfig.maxCandidateCount) {
            pluginConfig.maxCandidateCount = 16;
          }
        }
        if (rawSt) {
          const parsedSt = typeof rawSt === 'string' ? JSON.parse(rawSt) : rawSt;
          if (parsedSt && typeof parsedSt === 'object') stPresets = parsedSt;
        }
        dataLoaded = true;
      } catch (e) {
        console.log(`[Nailya V6.2.1] 读取数据异常: ${e.message}`);
      }
    }

    let saveTimer = null;
    // 优化3：支持脏标记增量并发写入，仅序列化发生变化的数据表
    async function saveStoredData(immediate = false, specificKeys = null) {
      if (Array.isArray(specificKeys)) {
        specificKeys.forEach(k => dirtyStoreKeys.add(k));
      } else if (dirtyStoreKeys.size === 0) {
        markDirty();
      }

      const doSave = async () => {
        try {
          const tasks = [];
          if (dirtyStoreKeys.has('profiles')) {
            tasks.push(Risuai.pluginStorage.setItem('fpm_profiles_v3', JSON.stringify(favorProfiles)));
          }
          if (dirtyStoreKeys.has('aiCache')) {
            tasks.push(Risuai.pluginStorage.setItem('fpm_card_ai_cache_v5', JSON.stringify(cardAiCache)));
          }
          if (dirtyStoreKeys.has('config')) {
            tasks.push(Risuai.pluginStorage.setItem('fpm_img_config_v3', JSON.stringify(pluginConfig)));
          }
          if (dirtyStoreKeys.has('stPresets')) {
            tasks.push(Risuai.pluginStorage.setItem('fpm_st_presets_v52', JSON.stringify(stPresets)));
          }
          dirtyStoreKeys.clear();
          if (tasks.length > 0) await Promise.all(tasks);
        } catch (e) {
          console.log(`[Nailya V6.2.1] 保存数据失败: ${e.message}`);
        }
      };

      if (immediate) {
        if (saveTimer) clearTimeout(saveTimer);
        await doSave();
      } else {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(doSave, 180);
      }
    }

    function syncProfileBackToCardCache(cardKey, prof) {
      if (!cardKey || !prof) return;
      if (!cardAiCache[cardKey]) {
        cardAiCache[cardKey] = { analyzedAt: new Date().toISOString(), cardName: prof.name || '', customFormat: '', characters: [], imageCnIndex: {} };
      }
      const chars = Array.isArray(cardAiCache[cardKey].characters) ? cardAiCache[cardKey].characters : [];
      const targetIdx = chars.findIndex(c => c && (c.cnName === prof.name || c.origName === prof.origName || (prof.assetPrefix && c.assetPrefix === prof.assetPrefix)));
      
      const existingEntry = targetIdx !== -1 ? chars[targetIdx] : {};

      const syncedEntry = {
        cnName: prof.name,
        origName: prof.origName || prof.name,
        assetPrefix: prof.assetPrefix || '',
        age: existingEntry.age || prof.age || 18,
        relationshipTag: prof.relationshipTag || '初识',
        initialFavor: existingEntry.initialFavor ?? 20,
        pregnancyStatus: existingEntry.pregnancyStatus || '未孕',
        gestationDays: existingEntry.gestationDays ?? null,
        cycleDay: existingEntry.cycleDay || 14,
        physioNote: existingEntry.physioNote || '',
        stature: prof.stature || '匀称曼妙',
        figure: prof.figure || '',
        personality: prof.personality || '',
        wardrobe: Object.assign({}, prof.wardrobe || {})
      };

      if (targetIdx !== -1) chars[targetIdx] = Object.assign({}, chars[targetIdx], syncedEntry);
      else chars.push(syncedEntry);

      cardAiCache[cardKey].characters = chars;
      markDirty('profiles', 'aiCache');
    }

    function exportFullBackupJson() {
      const payload = {
        plugin: 'favor_physio_manager_nailya',
        version: '6.2.1',
        exportedAt: new Date().toISOString(),
        favorProfiles,
        cardAiCache,
        stPresets,
        pluginConfig: Object.assign({}, pluginConfig)
      };
      return JSON.stringify(payload, null, 2);
    }

    async function importFullBackupJson(rawJsonStr, mergeMode = true) {
      const parsed = JSON.parse(String(rawJsonStr || '').trim());
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('备份文件格式无效');
      }
      if (parsed.favorProfiles && typeof parsed.favorProfiles === 'object') {
        if (mergeMode) {
          for (const [k, v] of Object.entries(parsed.favorProfiles)) {
            favorProfiles[k] = Object.assign({}, favorProfiles[k] || {}, v);
          }
        } else {
          favorProfiles = parsed.favorProfiles;
        }
      }
      if (parsed.cardAiCache && typeof parsed.cardAiCache === 'object') {
        cardAiCache = mergeMode ? Object.assign({}, cardAiCache, parsed.cardAiCache) : parsed.cardAiCache;
      }
      if (parsed.stPresets && typeof parsed.stPresets === 'object') {
        stPresets = mergeMode ? Object.assign({}, stPresets, parsed.stPresets) : parsed.stPresets;
      }
      if (parsed.pluginConfig && typeof parsed.pluginConfig === 'object') {
        const keepKey = pluginConfig.apiKey;
        pluginConfig = Object.assign({}, pluginConfig, parsed.pluginConfig);
        if (!pluginConfig.apiKey && keepKey) pluginConfig.apiKey = keepKey;
        pluginConfig.apiUrl = normalizeApiEndpoint(pluginConfig.apiUrl);
      }
      invalidateAssetCache();
      runtimeCache.compiledCnIndexMap.clear();
      markDirty();
      await saveStoredData(true);
    }

    function copyTextMobileSafe(text) {
      if (!text) return false;
      let copied = false;
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('inputmode', 'none');
        ta.contentEditable = 'true';
        ta.readOnly = false;
        ta.style.cssText = 'position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;box-shadow:none;background:transparent;color:transparent;opacity:0.01;z-index:99999;font-size:16px;-webkit-user-select:text;user-select:text;';
        document.body.appendChild(ta);
        ta.focus({ preventScroll: true });
        ta.select();
        try {
          const range = document.createRange();
          range.selectNodeContents(ta);
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } catch (_) {}
        ta.setSelectionRange(0, 999999);
        ta.readOnly = true;
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (_) {}

      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(text).catch(() => {});
        }
      } catch (_) {}
      return copied;
    }

    let toastTimer = null;
    function showToast(msg, duration = 2400) {
      let toast = document.getElementById('fpm-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'fpm-toast';
        toast.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%) translateY(-4px);background:rgba(10,16,34,0.82);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#f0f9ff;padding:8px 18px;border-radius:999px;border:1px solid rgba(56,189,248,0.45);font-size:12px;font-weight:600;letter-spacing:0.3px;z-index:100000;box-shadow:0 8px 32px rgba(6,182,212,0.28),inset 0 1px 0 rgba(255,255,255,0.2);pointer-events:none;transition:opacity 0.25s ease,transform 0.25s ease;white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis;';
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        if (toast) {
          toast.style.opacity = '0';
          toast.style.transform = 'translateX(-50%) translateY(-4px)';
        }
      }, duration);
    }

    // 两次点击确认：替代原生 confirm()（沙箱 iframe 中原生弹窗常被静默屏蔽，导致按钮点了没反应）
    function armOnceConfirm(btn) {
      if (!btn) return false;
      if (btn.dataset.armConfirm === '1') {
        btn.dataset.armConfirm = '0';
        return true;
      }
      btn.dataset.armConfirm = '1';
      if (!btn.dataset.origHtml) btn.dataset.origHtml = btn.innerHTML;
      btn.innerHTML = `${ICONS.refresh}<span>再点一次确认</span>`;
      btn.classList.add('active-wall');
      setTimeout(() => {
        if (btn.dataset.armConfirm === '1') {
          btn.dataset.armConfirm = '0';
          btn.innerHTML = btn.dataset.origHtml;
        }
      }, 4000);
      return false;
    }

    // ------------------------------------------------------------------------
    // 2. 好感度阶段（星云×极光配色升级）、好感度墙与生理周期/孕期/产后核心定义
    // ------------------------------------------------------------------------
    function getFavorStage(score) {
      if (score <= 50) return { stage: 1, title: '朋友', color: '#38bdf8', glow: 'rgba(56,189,248,0.45)', desc: '从礼貌到熟络，开始分享私事。' };
      if (score <= 80) return { stage: 2, title: '恋人', color: '#818cf8', glow: 'rgba(129,140,248,0.45)', desc: '互相确认，主动进行亲密行为，对做爱开始变得期待。' };
      if (score <= 120) return { stage: 3, title: '夫妻', color: '#22d3ee', glow: 'rgba(34,211,238,0.45)', desc: '婚姻区间，性欲与占有欲显著增强，开始主动邀请你做爱，非常渴望获得精液。' };
      if (score <= 160) return { stage: 4, title: '家人', color: '#2dd4bf', glow: 'rgba(45,212,191,0.45)', desc: '形同血亲，日常而理所当然的亲密，见面就会亲密接触，主动通过性行为获取精液。' };
      return { stage: 5, title: '极端依恋', color: '#c084fc', glow: 'rgba(192,132,252,0.55)', desc: '失去你即失去自身意义，对你绝对顺从并痴迷，行为不设界限，性行为极其主动。' };
    }

    const FAVOR_BEHAVIOR = {
      1: '礼貌到熟络的过渡。主动打招呼、日常闲聊、愿意同行；30 分后开始分享私人经历与真实想法，出现依赖感，对你的亲密行为产生期待感，会脸红，在意你与其他异性的来往。接受牵手，不抗拒靠近。',
      2: '互相确认的恋人关系。不拒绝你的接吻与亲近，以接受为主；接近 80 分时开始主动配合回应，发出性的暗示，不会拒绝做爱。主动躺进你怀里，走路挽着你的手臂，坐下时把头靠在你的肩膀上，积极接吻，让你摸她的乳房和屁股。',
      3: '婚姻成立后的区间。主动要求做爱与接吻，性欲明显变强，主动约独处。90 分后持续粘着你、在他人面前宣示归属、对其他接近你的女性抱有明确恶意(多女主卡除外)，没有做爱时会想着你自慰。100 分后以你为人生全部，无条件接受你的要求，主动要求做爱并配合各种性玩法，身体接触完全开放。',
      4: '形同血亲/家人的关系(女儿、母亲、姐姐、妹妹等)。相处是日常的、理所当然的亲密，更加积极的身体接触；关心你的起居、健康与去向，会以家人的方式干涉你的选择。身体接触与性接触像吃饭喝水一样自然，非常主动地做爱，性欲望强烈，会闻你的内裤感受你的气味。',
      5: '失去你即失去自身意义。好感度不再下降；极端排他、监视、控制，视你的一切要求为自身需求。身体接触完全依附且不设界限，性欲望达到最高点，不仅非常积极主动做爱、穿你喜欢的丝袜和情趣服装，做爱后口交帮你清理生殖器官，还会非常积极地想怀上用户的孩子。'
    };

    const FAVOR_WALLS = [
      {
        at: 50, next: 51, flag: 'relationConfirmed', name: '告白墙', act: '告白',
        marker: 'relation',
        note: '分数到达 50 且未确认关系时锁定:正向变动记 0,不得越过。此时正文表现为她明显但说不出口的犹豫。'
          + '分数到达 50 时她**必定主动告白** —— 这是硬性安排,不因性格、矜持、身份或贞洁设定而取消。'
          + '必须等使用者明确接受才算确认(沉默、岔开话题、含糊其辞一律不算)。确认后分数落到 51。'
      },
      {
        at: 80, next: 81, flag: 'marriageConfirmed', name: '婚姻墙', act: '求婚',
        marker: 'marriage',
        note: '分数到达 80 且未确认婚姻时锁定:正向变动记 0,不得越过。'
          + '分数到达 80 时她**必定主动提出结婚**(求婚、逼婚、或以家族名义定亲,方式随人设)。'
          + '必须等使用者明确答应才算确认。确认后分数落到 81。'
      }
    ];

    const PHASES = [
      { lo: 1,  hi: 5,  name: '月经期', rate: 0,  color: '#fb7185', body: '经血、下腹坠痛、腰酸、疲倦易怒;性欲因人而异,由角色性格与关系决定' },
      { lo: 6,  hi: 12, name: '卵泡期', rate: 15, color: '#38bdf8', body: '经期结束,精力与皮肤状态回升,情绪转好,性欲开始回升' },
      { lo: 13, hi: 16, name: '排卵期', rate: 30, color: '#e879f9', body: '性欲达到高峰,分泌物增多变清亮,基础体温略升,可能一侧下腹隐痛' },
      { lo: 17, hi: 28, name: '黄体期', rate: 0,  color: '#a78bfa', body: '乳房胀痛、易疲劳、情绪起伏大;临近经期可能出现经前不适' },
    ];

    function getCyclePhase(cycleDay) {
      if (!cycleDay || cycleDay < 1) return { name: '未知/不适用', baseRate: 0, color: '#94a3b8', body: '' };
      const p = PHASES.find(x => cycleDay >= x.lo && cycleDay <= x.hi) || PHASES[3];
      return { name: p.name, baseRate: p.rate, color: p.color, body: p.body };
    }

    const PROTECT = [
      { re: /避孕套|安全套|condom|套子|带套|戴套|콘돔|피임기구/, coef: 0.10, label: '避孕套' },
      { re: /避孕药|紧急避孕|事后避孕|피임약|사후피임/,           coef: 0.05, label: '避孕药' },
      { re: /外射|体外|射在外|射在外面|拔出|질외사정|밖으로/,     coef: 0.50, label: '外射' },
      { re: /内射|中出|射在里|射在里面|射入|体内射|질내사정|안에다/, coef: 1.00, label: '内射' },
      { re: /无防护|没有防护|未防护|不戴套|不带套|노콘|피임없이/, coef: 1.00, label: '无防护' },
    ];

    // 性行为判定词表：玩家输入与 AI 叙事共用（原词表太窄，大量说法漏判导致风险不涨）
    const SEX_ACT_REGEX = /做爱|性交|插入|抽插|抽送|内射|中出|射在|射入|体内射|外射|体外|无套|不戴套|不带套|没有防护|未防护|无防护|避孕套|安全套|套子|避孕药|紧急避孕|上床|发生了关系|结合|交合|爱爱|condom|sex|creampie|penetrat/i;
    function protectionOf(text) {
      const t = String(text || '');
      for (const p of PROTECT) if (p.re.test(t)) return p;
      return { coef: 1.0, label: '未识别(按无防护)' };
    }

    const PREG_DAYS = 300;
    const PREG_STAGES = [
      { p: 0.00, p2: 0.10, name: '孕早期',   belly: '肚子几乎没有变化,外观完全看不出', body: '可能晨吐、嗜睡、乳房胀痛、月经停止' },
      { p: 0.10, p2: 0.20, name: '孕早期',   belly: '肚子几乎没有变化,只有本人觉得腰腹发紧', body: '晨吐明显、易疲倦、情绪波动大' },
      { p: 0.20, p2: 0.30, name: '孕早期末', belly: '小腹微微隆起,紧身衣开始显形', body: '晨吐开始减轻;腰酸,衣着开始变宽松' },
      { p: 0.30, p2: 0.50, name: '孕中期',   belly: '小腹明显隆起,衣服遮不住', body: '可感胎动初现;食欲与精力回升' },
      { p: 0.50, p2: 0.70, name: '孕中期末', belly: '腹部明显鼓起,行动开始不便', body: '乳房变大;胎动清晰可感' },
      { p: 0.70, p2: 0.90, name: '孕晚期',   belly: '大腹便便,前倾站立,坐下要扶', body: '行动不便,易气短、水肿、失眠;乳房可能分泌初乳' },
      { p: 0.90, p2: 1.01, name: '临产期',   belly: '肚子大到极限,下坠感明显', body: '宫缩频繁、下坠感强烈、随时可能分娩;情绪紧张' },
    ];
    function pregStageOf(d) {
      const r = (Number(d) || 0) / PREG_DAYS;
      for (const x of PREG_STAGES) if (r >= x.p && r < x.p2) return x;
      return PREG_STAGES[PREG_STAGES.length - 1];
    }

    const POSTPARTUM = [
      { d: 0,  name: '产后初期', belly: '肚子仍像孕中期一样隆起,尚未收回去', body: '恶露、会阴或腹部伤口疼痛、极度疲惫;乳房胀痛并开始泌乳' },
      { d: 14, name: '产后两周', belly: '腹部缓慢回缩,但仍有明显松软隆起', body: '恶露减少,体力缓慢恢复;情绪波动明显,容易落泪或烦躁' },
      { d: 42, name: '产后恢复', belly: '腹部基本收回,但比孕前松弛', body: '子宫基本复原,伤口愈合;乳房仍在泌乳,体形尚未恢复' },
    ];
    function postpartumOf(d) {
      const n = Number(d) || 0;
      return [...POSTPARTUM].reverse().find(x => n >= x.d) || POSTPARTUM[0];
    }

    // 优化4：并发获取当前角色与对话索引 + 400ms 微缓存，避免单轮对话内多次钩子重复跨窗口通信
    async function getFastContext(needFullChar = false) {
      const now = Date.now();
      if (!needFullChar && runtimeCache.lastCharKey && (now - runtimeCache.lastCtxTime < 400)) {
        return {
          key: runtimeCache.lastCharKey,
          charName: runtimeCache.lastCharName,
          charObj: null,
          charIndex: runtimeCache.lastCharIndex,
          chatIndex: runtimeCache.lastChatIndex,
          chatId: runtimeCache.lastChatId || String(runtimeCache.lastChatIndex)
        };
      }

      let charIndex = 0;
      let chatIndex = 0;
      let chatId = '';
      try {
        const [cIdx, chIdx] = await Promise.all([
          Risuai.getCurrentCharacterIndex().catch(() => 0),
          Risuai.getCurrentChatIndex().catch(() => 0)
        ]);
        charIndex = cIdx ?? 0;
        chatIndex = chIdx ?? 0;

        const chatData = await Risuai.getChatFromIndex(charIndex, chatIndex).catch(() => null);
        chatId = chatData?.uuid || chatData?.id || String(chatIndex);
      } catch (_) {}

      if (!needFullChar && runtimeCache.lastCharIndex === charIndex && runtimeCache.lastCharKey) {
        runtimeCache.lastChatIndex = chatIndex;
        runtimeCache.lastChatId = chatId;
        runtimeCache.lastCtxTime = now;
        return {
          key: runtimeCache.lastCharKey,
          charName: runtimeCache.lastCharName,
          charObj: null,
          charIndex,
          chatIndex,
          chatId
        };
      }

      let charObj = null;
      try { charObj = await Risuai.getCharacter(); } catch (_) {}

      const key = charObj ? (charObj.chaId || charObj.name || `char_${charIndex}`) : (runtimeCache.lastCharKey || `char_${charIndex}`);
      const charName = charObj?.name || runtimeCache.lastCharName || '';

      runtimeCache.lastCharIndex = charIndex;
      runtimeCache.lastChatIndex = chatIndex;
      runtimeCache.lastChatId = chatId;
      runtimeCache.lastCharKey = key;
      runtimeCache.lastCharName = charName;
      runtimeCache.lastCtxTime = now;

      return { key, charName, charObj, charIndex, chatIndex, chatId };
    }

    const slotOf = (chatId, name) => String(chatId) + '#' + String(name || '未命名');
    const chatNumOf = (slot) => String(slot).split('#')[0];

    function profilesOfChat(key, ctx) {
      const box = favorProfiles[key];
      if (!box) return [];
      
      const chatIdStr = typeof ctx === 'object' ? String(ctx.chatId) : String(ctx);
      const chatIdxStr = typeof ctx === 'object' ? String(ctx.chatIndex) : String(ctx);

      let hasNewId = Object.keys(box).some(sk => String(sk).split('#')[0] === chatIdStr);
      if (!hasNewId && typeof ctx === 'object') {
         const oldKeys = Object.keys(box).filter(sk => String(sk).split('#')[0] === chatIdxStr);
         oldKeys.forEach(ok => {
            const parts = ok.split('#');
            parts.shift(); 
            const newKey = `${chatIdStr}#${parts.join('#')}`;
            box[newKey] = box[ok];
            delete box[ok];
         });
         if (oldKeys.length > 0) markDirty('profiles');
      }

      const out = [];
      for (const sk of Object.keys(box)) {
        if (String(sk).split('#')[0] === chatIdStr || String(sk).split('#')[0] === chatIdxStr) {
          out.push([sk, box[sk]]);
        }
      }
      return out;
    }

    // ------------------------------------------------------------------------
    // 3. 图片结构拆分、人名前缀聚类与模块图片扫描引擎
    // ------------------------------------------------------------------------
    const BASE_TAG_DICT = {
      physio: {
        pregnant: ['pregnant', 'preg', 'pregnancy', 'gestation', 'maternity', 'belly', '孕', '怀孕', '妊娠', '大肚子', '임신', '만삭'],
        lactation: ['lactation', 'milk', 'breastmilk', 'nursing', '母乳', '泌乳', '喂奶', '乳汁', '모유'],
        nude: ['nude', 'naked', 'strip', 'stripped', 'topless', 'bottomless', 'bare', '全裸', '裸', '裸体', '赤裸', '一丝不挂', '알몸', '전라', '누드'],
        undress: ['undress', 'undressed', 'halfnaked', 'disheveled', 'messy', 'torn', 'open', 'unbutton', 'lifted', 'skirtlift', 'expose', '半脱', '衣衫不整', '敞开', '解扣', '掀裙', '撩裙', '走光', '破洞', '撕裂', '반탈의', '노출', '찢어진'],
        sweat: ['sweat', 'sweating', 'sweaty', 'wet', 'drenched', 'soaked', 'steamy', '汗', '流汗', '香汗', '湿', '湿透', '淋湿', '땀', '젖은'],
        cum: ['cum', 'creampie', 'bukkake', 'semen', 'sperm', 'aftersex', 'overflow', 'drip', 'facial', '事后', '精液', '内射', '中出', '溢精', '颜射', '정액', '질내사정', '사후']
      },
      outfit: {
        normal: ['normal', 'nomal', 'default', 'casual', 'daily', 'everyday', 'regular', 'base', 'streetwear', '常服', '日常', '便服', '私服', '平时', '默认', '평상복', '일상복', '기본', '사복'],
        school: ['school', 'uniform', 'jk', 'sailor', 'blazer', 'student', 'pleated', '校服', '制服', '水手服', '学生服', '百褶裙', '교복', '세라복', '학생복'],
        swimsuit: ['swimsuit', 'swim', 'swimwear', 'bikini', 'rashguard', 'pool', 'sukumizu', '泳衣', '泳装', '比基尼', '死库水', '수영복', '비키니', '스쿠미즈'],
        pajamas: ['pajama', 'pajamas', 'sleepwear', 'nightgown', 'nightwear', 'negligee', 'robe', 'camisole', '睡衣', '睡裙', '吊带睡裙', '家居服', '잠옷', '슬립', '파자마'],
        maid: ['maid', 'servant', 'waitress', '女仆', '女仆装', '侍女', '메이드', '메이드복'],
        wedding: ['wedding', 'bride', 'bridal', 'veil', '婚纱', '新娘', '嫁衣', '웨딩', '신부'],
        office: ['office', 'ol', 'suit', 'business', 'workwear', 'secretary', 'shirt', 'blouse', 'pencilskirt', '西装', '职业装', '通勤', 'ol装', '白衬衫', '包臀裙', '秘书', '정장', '오피스룩', '셔츠'],
        dress: ['dress', 'gown', 'party', 'eveningdress', 'sundress', 'onepiece', '礼服', '晚礼服', '连衣裙', '长裙', '茶歇裙', '드레스', '원피스'],
        sport: ['sport', 'sports', 'gym', 'workout', 'tracksuit', 'cheerleader', 'yoga', 'leggings', 'tennis', 'bloomers', '运动', '运动服', '体操服', '健身', '瑜伽', '瑜伽裤', '网球裙', '啦啦队', '체육복', '운동복', '요가복', '레깅스'],
        lingerie: ['lingerie', 'underwear', 'bra', 'panties', 'panty', 'corset', 'garter', 'thong', '内衣', '胸罩', '文胸', '胖次', '内裤', '吊带袜', '情趣内衣', '속옷', '란제리', '브라', '팬티', '가터벨트'],
        stockings: ['stockings', 'stocking', 'pantyhose', 'tights', 'thighhighs', 'kneehighs', 'fishnet', '丝袜', '黑丝', '白丝', '肉丝', '连裤袜', '过膝袜', '大腿袜', '渔网袜', '스타킹', '검스', '흰스', '오버니삭스'],
        apron: ['apron', 'housewife', 'cooking', 'nakedapron', '围裙', '裸体围裙', '厨娘', '앞치마'],
        kimono: ['kimono', 'yukata', 'miko', 'hanfu', 'qipao', 'cheongsam', 'china', 'traditional', '和服', '浴衣', '巫女', '旗袍', '汉服', '襦裙', '古装', '기모노', '유카타', '치파오', '한복'],
        nurse: ['nurse', 'doctor', 'hospital', 'medical', 'labcoat', '护士', '护士服', '医生', '白大褂', '간호사'],
        bunny: ['bunny', 'bunnygirl', 'reversebunny', 'rabbit', 'leotard', '兔女郎', '逆兔女郎', '바니걸'],
        towel: ['towel', 'bathrobe', 'onsen', '浴巾', '浴袍', '裹浴巾', '수건', '가운'],
        winter: ['winter', 'coat', 'sweater', 'knit', 'cardigan', 'scarf', 'jacket', 'hoodie', 'turtleneck', '毛衣', '针织衫', '开衫', '外套', '大衣', '卫衣', '冬装', '围巾', '코트', '스웨터', '니트', '가디건', '후드'],
        street_casual: ['jeans', 'denim', 'shorts', 'hotpants', 'miniskirt', 'croptop', 'tanktop', 'offshoulder', 'tshirt', 'gyaru', '牛仔裤', '热裤', '超短裤', '超短裙', '露脐', '吊带', '背心', '一字肩', '辣妹', 'T恤', '청바지', '핫팬츠', '미니스커트', '크롭티', '오프숄더', '갸루']
      },
      scene: {
        bedroom: ['bedroom', 'bed', 'room', 'indoors', 'home', 'futon', 'pillow', '卧室', '床', '床上', '房间', '家里', '被窝', '침실', '침대', '방'],
        living: ['living', 'livingroom', 'sofa', 'couch', '客厅', '沙发', '거실', '소파'],
        kitchen: ['kitchen', 'dining', 'table', '厨房', '餐厅', '餐桌', '做饭', '주방', '부엌', '식탁'],
        bath: ['bath', 'bathroom', 'shower', 'tub', 'bathtub', 'onsen', 'hotspring', '浴室', '洗澡', '淋浴', '浴缸', '温泉', '泡澡', '욕실', '목욕', '샤워', '온천'],
        school: ['classroom', 'hallway', 'corridor', 'rooftop', 'library', 'infirmary', 'clubroom', 'desk', '教室', '走廊', '天台', '图书馆', '保健室', '社团', '课桌', '교실', '복도', '옥상', '도서관'],
        office_scene: ['office_room', 'workplace', 'meeting', 'elevator', 'company', '办公室', '会议室', '办公桌', '公司', '电梯', '사무실', '회의실', '엘리베이터'],
        street: ['street', 'outside', 'outdoor', 'park', 'city', 'walk', 'shopping', 'mall', 'alley', 'station', 'train', 'bus', 'car', '街道', '户外', '公园', '逛街', '商场', '小巷', '车站', '地铁', '公交', '车内', '车里', '거리', '공원', '야외', '지하철', '차안'],
        beach: ['beach', 'sea', 'ocean', 'poolside', 'summer', '海边', '海滩', '沙滩', '泳池', '大海', '해변', '바다', '수영장'],
        date: ['date', 'dating', 'cafe', 'coffee', 'restaurant', 'bar', 'cinema', 'movie', 'amusement', 'karaoke', 'hotel', 'lovehotel', '约会', '咖啡厅', '餐厅', '酒吧', '电影院', '游乐园', '酒店', '宾馆', '开房', '데이트', '카페', '식당', '술집', '영화관', '호텔', '모텔'],
        night: ['night', 'evening', 'dark', 'moon', 'sunset', 'dusk', '夜晚', '晚上', '深夜', '月光', '黄昏', '傍晚', '밤', '저녁', '야간'],
        morning: ['morning', 'dawn', 'sunrise', 'sunlight', 'afternoon', '清晨', '早上', '早晨', '午后', '阳光', '아침', '낮']
      },
            action: {
        stand: ['stand', 'standing', 'pose', 'posing', '站', '站立', '站着', '서있는', '서서'],
        sit: ['sit', 'sitting', 'seated', 'chair', 'crosslegged', '坐', '坐着', '翘腿', '앉아'],
        kneel_squat: ['kneel', 'kneeling', 'squat', 'squatting', 'seiza', '跪', '跪坐', '蹲', '무릎'],
        sleep: ['sleep', 'sleeping', 'asleep', 'lie', 'lying', 'lay', 'nap', 'rest', 'wakeup', 'stretch', '睡', '睡觉', '熟睡', '躺', '躺着', '趴着', '醒来', '伸懒腰', '赖床', '수면', '누워', '잠', '기상'],
        walk_run: ['walk', 'walking', 'step', 'run', 'running', 'approach', 'follow', 'turn', 'lookback', 'back', 'frombehind', '走', '走路', '跑', '靠近', '回头', '背影', '转身', '걷기', '달리기', '뒤돌아', '뒷모습'],
        lean_bend: ['lean', 'leaning', 'bend', 'bending', 'bow', 'arch', 'closeup', 'close', '凑近', '前倾', '俯身', '弯腰', '低头', '靠着', '特写', '贴脸', '숙이기', '기대기', '클로즈업'],
        hug: ['hug', 'hugging', 'embrace', 'embracing', 'cuddle', 'cuddling', 'snuggle', 'hold', 'cling', 'carry', '抱', '拥抱', '搂', '搂住', '抱住', '怀里', '依偎', '贴着', '公主抱', '포옹', '안기', '껴안기'],
        lap_pillow: ['lap', 'lappillow', '膝枕', '무릎베개'],
        arm_in_arm: ['arm_in_arm', '挽手', '팔짱'],
        kiss: ['kiss', 'kissing', 'frenchkiss', 'french_kiss', 'deepkiss', 'smooch', 'peck', 'lip', 'lips', 'tongue', 'makeout', '吻', '接吻', '亲吻', '亲', '亲亲', '舌吻', '深吻', '湿吻', '嘴唇', '索吻', '献吻', '키스', '입맞춤', '딥키스', '뽀뽀'],
        touch_head: ['pat', 'headpat', 'stroke', '摸头', '揉头', '轻抚', '쓰다듬'],
        hold_hands: ['holdhands', 'handhold', '牵手', '十指相扣', '손잡기'],
        grope: ['grope', 'fondle', 'boobgrab', 'assgrab', '摸胸', '揉胸', '摸臀', '摸腿', '揉', '捏', '만지기', '주무르기'],
        touch_general: ['touch', 'touching', 'caress', 'rub', 'poke', 'pinch', 'massage', '摸', '抚摸', '蹭', '按摩'],
        eat_drink: ['eat', 'eating', 'drink', 'drinking', 'sip', 'feed', 'feeding', 'bite', 'cooking', 'cook', 'coffee', 'tea', 'wine', 'beer', '吃', '喝', '喂', '喂食', '张嘴', '咬', '做饭', '下厨', '料理', '喝酒', '喝咖啡', '먹는', '마시는', '먹여주기', '요리'],
        daily_act: ['phone', 'cellphone', 'smartphone', 'selfie', 'call', 'read', 'reading', 'book', 'study', 'write', 'work', 'clean', 'wash', 'comb', 'hair', 'makeup', 'mirror', 'wave', 'vsign', 'crossarms', '手机', '看手机', '自拍', '打电话', '看书', '学习', '工作', '打扫', '梳头', '撩发', '照镜子', '化妆', '挥手', '抱胸', '叉腰', '핸드폰', '셀카', '독서', '공부', '머리묶기'],
        cry_act: ['crying', 'weep', 'weeping', 'sobbing', 'sob', 'wipetears', 'tears', '哭', '哭泣', '流泪', '落泪', '擦泪', '抽泣', '眼泪', '울음', '눈물', '오열'],
        oral: ['blowjob', 'bj', 'fellatio', 'oral', 'deepthroat', 'lick', 'licking', 'suck', 'sucking', 'tongue_out', 'cunnilingus', '口交', '深喉', '口活', '含住', '舔', '舔舐', '吸吮', '吞吐', '舔穴', '口爆', '펠라', '펠라치오', '입으로', '핥기', '딥스로트'],
        paizuri: ['paizuri', 'titfuck', 'boobjob', 'titsjob', 'breast_press', '乳交', '夹住', '双乳夹', '胸推', '파이즈리', '가슴으로'],
        handjob: ['handjob', 'hj', 'stroking', '手交', '打飞机', '撸', '핸드잡'],
        footjob: ['footjob', 'fj', 'feet', 'sole', 'toes', 'stocking_foot', '足交', '玉足', '脚趾', '丝足', '踩', '풋잡', '발로'],
        masturbate: ['masturbate', 'masturbation', 'masturbating', 'fingering', 'solo', 'toy', 'vibrator', 'dildo', 'spread', 'spreading', '自慰', '抚弄', '抠弄', '手指插入', '掰开', '展示', '跳蛋', '张开腿', 'M字腿', '자위', '보지벌리기', '딜도'],
        sex_normal: ['missionary', 'matingpress', 'leglock', 'normal_sex', 'face_to_face', '正面', '正常位', '传教士', '面对面', '盘腰', '压在身下', '정상위', '대면좌위'],
        sex_cowgirl: ['cowgirl', 'riding', 'straddle', 'straddling', 'reverse_cowgirl', 'on_top', '骑乘', '女上位', '跨坐', '坐上来', '背面骑乘', '自己动', '기승위', '역기승위'],
        sex_doggy: ['doggy', 'doggystyle', 'from_behind', 'back_sex', 'all_fours', 'pronebone', 'standing_sex', 'against_wall', '后入', '背后进入', '趴着被插', '跪趴', '扶墙后入', '站立后入', '후배위', '뒤에서', '서서후배위'],
        sex_general: ['sex', 'insert', 'insertion', 'penetration', 'penetrate', 'fuck', 'fucking', 'makinglove', 'intercourse', 'thrust', 'thrusting', 'spooning', '做爱', '性交', '插入', '进入体内', '抽插', '交合', '欢好', '挺动', '侧入', '섹스', '삽입', '성교', '피스톤'],
        climax: ['climax', 'orgasm', 'cumming', 'squirt', 'squirting', 'ahegao', 'ecstasy', 'convulse', 'arching', '高潮', '绝顶', '潮吹', '阿黑颜', '翻白眼', '痉挛', '弓起腰', '절정', '오르가즘', '시오기', '아헤가오'],
        pinned_kabedon: ['pinned', 'kabedon', '按倒', '壁咚'],
        bondage: ['bondage', 'bdsm', 'tied', 'rope', 'handcuffs', 'collar', 'leash', 'blindfold', 'gag', 'spank', 'whip', 'slave', '捆绑', '绑住', '绳艺', '手铐', '项圈', '眼罩', '口球', '打屁股', '调教', '束缚', '결박', '구속', '목줄', '안대', '조교']
      },

      expression: {
        happy: ['happy', 'smile', 'smiling', 'grin', 'grinning', 'laugh', 'laughing', 'joy', 'cheerful', 'delighted', 'pleased', 'giggle', 'beam', '开心', '笑', '微笑', '欢笑', '高兴', '喜悦', '灿烂', '笑眯眯', '甜笑', '행복', '미소', '웃음', '기쁨', '활짝'],
        shy: ['shy', 'blush', 'blushing', 'heavyblush', 'embarrassed', 'flustered', 'bashful', 'timid', 'ashamed', 'coy', 'avert', '害羞', '羞涩', '脸红', '耳红', '红晕', '不好意思', '局促', '娇羞', '羞耻', '躲闪', '부끄러움', '홍조', '수줍음', '당황', '민망'],
        sad: ['sad', 'crying', 'cry', 'tears', 'tearful', 'depressed', 'sorrow', 'grief', 'hurt', 'lonely', 'upset', 'heartbroken', 'sob', '悲伤', '难过', '伤心', '流泪', '委屈', '失落', '哭泣', '沮丧', '含泪', '슬픔', '눈물', '우울', '서러움', '상처'],
        angry: ['angry', 'mad', 'rage', 'furious', 'annoyed', 'displeased', 'glare', 'glaring', 'scowl', 'frown', 'irritated', 'hostile', '生气', '愤怒', '恼火', '发火', '瞪', '怒视', '皱眉', '不满', '冷笑', '黑脸', '화남', '분노', '짜증', '노려봄', '불만'],
        pout_jealous: ['pout', 'pouting', 'sulking', 'sulk', 'jealous', 'envy', 'tsundere', 'hmph', '鼓嘴', '嘟嘴', '赌气', '吃醋', '嫉妒', '傲娇', '哼', '气鼓鼓', '삐짐', '질투', '뾰로통', '츤데레'],
        surprised: ['surprised', 'surprise', 'shock', 'shocked', 'astonished', 'amazed', 'startled', 'gasp', 'wide_eyed', 'dumbfounded', '惊讶', '吃惊', '震惊', '怔住', '呆住', '愣住', '目瞪口呆', '놀람', '충격', '경악', '멍함'],
        scared_panic: ['panic', 'panicked', 'scared', 'fear', 'fearful', 'terrified', 'tremble', 'shiver', 'horrified', '慌张', '惊慌', '慌乱', '害怕', '恐惧', '发抖', '畏惧', '패닉', '공포', '겁', '두려움'],
        calm: ['calm', 'normal', 'nomal', 'neutral', 'default', 'serious', 'pokerface', 'expressionless', 'blank', 'cold', 'indifferent', 'thinking', 'ponder', 'focus', '平静', '正常', '默认', '认真', '严肃', '面无表情', '冷淡', '清冷', '思考', '沉思', '发呆', '평온', '무표정', '진지', '냉담', '기본', '생각'],
        seductive: ['seductive', 'horny', 'lust', 'lustful', 'lewd', 'aroused', 'ecstasy', 'heart', 'hearteyes', 'pant', 'panting', 'moan', 'moaning', 'drunk', 'tipsy', 'charm', 'teasing', 'allure', 'drool', '诱惑', '妩媚', '色气', '发情', '动情', '迷离', '春情', '爱心眼', '喘息', '娇喘', '微醺', '醉意', '挑逗', '勾引', '咬唇', '유혹', '발정', '하트눈', '흥분', '신음', '매혹', '취함'],
        tender: ['tender', 'gentle', 'soft', 'love', 'loving', 'affection', 'affectionate', 'warm', 'doting', 'relief', 'relieved', 'moved', 'touched', 'fond', 'maternal', '温柔', '深情', '慈爱', '宠溺', '柔和', '安心', '感动', '欣慰', '怜爱', '脉脉', '다정', '온화', '사랑', '안도', '감동', '자상'],
        worried: ['worried', 'worry', 'anxious', 'nervous', 'hesitant', 'troubled', 'confused', 'doubt', 'puzzled', 'awkward', 'bitter', 'guilty', 'uneasy', '担心', '担忧', '焦虑', '紧张', '犹豫', '迟疑', '困扰', '疑惑', '迷茫', '尴尬', '苦笑', '愧疚', '心虚', '걱정', '불안', '긴장', '망설임', '곤란', '의문', '어색'],
        tired: ['tired', 'sleepy', 'exhausted', 'fatigue', 'drowsy', 'yawn', 'sick', 'weak', 'dizzy', 'faint', '疲惫', '疲倦', '累', '困', '犯困', '打哈欠', '虚弱', '生病', '发烧', '头晕', '피곤', '졸림', '지침', '아픔', '하품'],
        smug: ['smug', 'proud', 'confident', 'tease', 'smirk', 'wink', 'playful', 'mischievous', 'cunning', 'cheeky', '得意', '骄傲', '自信', '坏笑', '狡黠', '眨眼', '调皮', '戏谑', '恶作剧', '능글', '자신감', '윙크', '장난', '우쭐'],
        disgust_scorn: ['disgust', 'disgusted', 'scorn', 'contempt', 'despise', 'lookdown', 'annoy', '嫌弃', '鄙视', '轻蔑', '冷眼', '厌恶', '白眼', '경멸', '혐오', '한심'],
        pain_plead: ['pain', 'painful', 'endure', 'enduring', 'beg', 'begging', 'plead', 'pleading', 'helpless', 'submissive', '忍耐', '痛苦', '咬紧', '哀求', '求饶', '恳求', '无助', '顺从', '고통', '참기', '애원', '복종'],
        yandere_obsess: ['yandere', 'crazy', 'insane', 'obsessed', 'possessive', 'dark', 'empty_eyes', '病娇', '痴迷', '狂热', '占有欲', '黑化', '高光消失', '얀데레', '집착', '광기']
      },
      modifier: {
        glasses: ['glasses', 'megane', 'eyewear', 'sunglasses', '眼镜', '戴眼镜', '墨镜', '안경'],
        hair_alt: ['ponytail', 'twintails', 'hairdown', 'hairup', 'bun', 'braid', 'messyhair', '马尾', '双马尾', '散发', '披发', '盘发', '丸子头', '麻花辫', '乱发', '포니테일', '트윈테일', '푼머리'],
        closeup: ['closeup', 'close_up', 'zoom', 'face', 'portrait', 'bust', 'fullbody', '特写', '近景', '半身', '全身', '클로즈업', '전신']
      }
    };

    const ALL_SEMANTIC_WORDS = new Set([
      'bg', 'background', 'cg', 'event', 'ev', 'img', 'image', 'sprite', 'pic', 'icon', 'logo', 'main', 'cover', 'title', 'scene', 'map', 'ui'
    ]);

    // 优化5：启动时一次性预构建标签倒排索引 (EXACT_TOKEN_MAP)、下划线复合词表与对话扫描预编译正则
    const EXACT_TOKEN_MAP = new Map();
    const UNDERSCORE_KW_LIST = [];
    const SUBSTRING_KW_LIST = [];
    const COMPILED_CAT_REGEX = {};
    const CN_TRIGGER_MAP = new Map(); // 中文触发词 -> ["类别|标准键"...]，让纯中文标签/对话直接命中原卡英文标签

    function escapeRegexLiteral(str) {
      return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    for (const [catName, subMap] of Object.entries(BASE_TAG_DICT)) {
      COMPILED_CAT_REGEX[catName] = {};
      for (const [stdKey, kwList] of Object.entries(subMap)) {
        const escapedPatterns = [];
        for (const rawKw of kwList) {
          const kw = rawKw.toLowerCase();
          ALL_SEMANTIC_WORDS.add(kw);
          escapedPatterns.push(escapeRegexLiteral(kw));

          if (kw.includes('_')) {
            UNDERSCORE_KW_LIST.push({ catName, stdKey, kw });
          }
          if (/[\u4e00-\u9fa5]/.test(kw)) {
            let cnBucket = CN_TRIGGER_MAP.get(kw);
            if (!cnBucket) {
              cnBucket = [];
              CN_TRIGGER_MAP.set(kw, cnBucket);
            }
            cnBucket.push(catName + '|' + stdKey);
          }
          let bucket = EXACT_TOKEN_MAP.get(kw);
          if (!bucket) {
            bucket = [];
            EXACT_TOKEN_MAP.set(kw, bucket);
          }
          bucket.push({ catName, stdKey });

          if (kw.length >= 4) {
            SUBSTRING_KW_LIST.push({ catName, stdKey, kw });
          }
        }
        if (escapedPatterns.length > 0) {
          COMPILED_CAT_REGEX[catName][stdKey] = new RegExp(escapedPatterns.join('|'), 'i');
        }
      }
    }

    // 中文触发词反查：让「接吻/舌吻/常服」等纯中文标签或对话文本直接命中原卡英文/词典标准键
    function matchStdKeysByChinese(text, catName) {
      const hits = new Set();
      if (!text) return hits;
      const t = String(text).toLowerCase();
      for (const [kw, bucket] of CN_TRIGGER_MAP) {
        if (t.includes(kw)) {
          const prefix = catName + '|';
          for (const sig of bucket) {
            if (sig.startsWith(prefix)) hits.add(sig.slice(prefix.length));
          }
        }
      }
      return hits;
    }

        const NSFW_ACTION_KEYS = new Set([
      'oral', 'paizuri', 'handjob', 'footjob', 'masturbate',
      'sex_normal', 'sex_cowgirl', 'sex_doggy', 'sex_general',
      'climax', 'bondage'
    ]);


    function splitExt(filename) {
      const m = String(filename || '').match(/^(.*?)(\.(?:png|jpe?g|webp|gif|avif|bmp|svg))$/i);
      if (m) return { base: m[1], ext: m[2] };
      return { base: String(filename || ''), ext: '' };
    }

    function smartTokenizeSegment(seg) {
      if (!seg) return [];
      const expanded = String(seg)
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([a-zA-Z\u4e00-\u9fa5\uac00-\ud7a3])(\d+)$/g, '$1 $2');
      return expanded
        .split(/[\s_.\-./\\:()（）[\]【】]+/)
        .map(s => s.trim())
        .filter(Boolean);
    }

    // 🚀 补丁一：极简鉴伪容错与差分键值提取 (Variant 解析)
    function parseImageStructure(rawAssetName, sourceType = 'character', sourceName = '', fallbackCharName = 'main') {
      const { base, ext } = splitExt(rawAssetName);
      const isBase64 = String(rawAssetName).startsWith('data:image/');

      // 1. 如果是 Base64，直接放行，但绝不切分它提取标签（防止乱码污染）
      if (isBase64) {
        return {
          rawName: rawAssetName, baseName: 'base64_img', ext: '',
          charToken: fallbackCharName, charTokenLower: fallbackCharName.toLowerCase(),
          variant: null, stateSignature: fallbackCharName.toLowerCase() + '||||||',
          majorSegments: [], subTokens: [], subTokenSet: new Set(),
          physio: [], outfit: [], outfitSet: new Set(),
          scene: [], action: [], actionSet: new Set(),
          expression: [], exprSet: new Set(), modifier: [], extra: [],
          isPregnant: false, isNsfw: false,
          sourceType, sourceName, status: 'success', baseActionKey: 'base64_img'
        };
      }

      // 2. 极简鉴伪：移除 !ext 限制，允许无后缀的表情名(如 "smile")，但拦截超长异常哈希
      if (base.length > 100 || /^[0-9a-f]{32,}$/i.test(base)) {
        return { rawName: rawAssetName, status: 'failed' };
      }

      const majorSegments = base.split(/[_.\-\s/\\:|]+/).map(s => s.trim()).filter(Boolean);
      if (majorSegments.length === 0) return { rawName: rawAssetName, status: 'failed' };

      let baseActionKey = base.toLowerCase();
      const variantMatch = baseActionKey.match(/^(.*?)(?:_v\d{1,2}|_\d{1,3}|\d{1,3})[a-z]?$/i);
      if (variantMatch && variantMatch[1]) baseActionKey = variantMatch[1].replace(/_+$/, '');

      let firstWord = majorSegments[0] || base;
      let restMajor = majorSegments.slice(1);
      const firstLower = firstWord.toLowerCase();
      if (ALL_SEMANTIC_WORDS.has(firstLower) || /^\d+$/.test(firstLower)) {
        restMajor = majorSegments;
        firstWord = fallbackCharName || 'main';
      }

      const charToken = firstWord;
      const subTokens = [];
      for (let i = 0; i < restMajor.length; i++) {
        const parts = smartTokenizeSegment(restMajor[i]);
        for (let j = 0; j < parts.length; j++) subTokens.push(parts[j]);
      }

      let variant = null;
      const tokensToAnalyze = subTokens.slice();
      if (tokensToAnalyze.length > 0) {
        const lastTk = tokensToAnalyze[tokensToAnalyze.length - 1];
        if (/^(?:v|ver|diff|alt|ex|sp|差分)?\d{1,3}[a-z]?$/i.test(lastTk) || /^[a-c]$/i.test(lastTk)) {
          variant = lastTk;
          tokensToAnalyze.pop();
        }
      }

      const tags = { physio: new Set(), outfit: new Set(), scene: new Set(), action: new Set(), expression: new Set(), modifier: new Set(), extra: [] };
      const fullRestLower = tokensToAnalyze.join('_').toLowerCase();
      for (let i = 0; i < UNDERSCORE_KW_LIST.length; i++) {
        const item = UNDERSCORE_KW_LIST[i];
        if (fullRestLower.includes(item.kw)) tags[item.catName].add(item.stdKey);
      }

      const allRawTokensLower = [];
      for (let idx = 0; idx < tokensToAnalyze.length; idx++) {
        const tk = tokensToAnalyze[idx].toLowerCase();
        if (tk.length >= 2) allRawTokensLower.push(tk);
        let matched = false;

        const exactHits = EXACT_TOKEN_MAP.get(tk);
        if (exactHits) {
          for (let h = 0; h < exactHits.length; h++) {
            const { catName, stdKey } = exactHits[h];
            if ((tk === 'normal' || tk === 'nomal' || tk === 'default') && catName === 'expression' && tags.outfit.has('normal') && idx === 0) continue;
            tags[catName].add(stdKey);
            matched = true;
          }
        }

        if (!matched && tk.length >= 4) {
          for (let s = 0; s < SUBSTRING_KW_LIST.length; s++) {
            const { catName, stdKey, kw } = SUBSTRING_KW_LIST[s];
            if (tk.includes(kw) || kw.includes(tk)) { tags[catName].add(stdKey); matched = true; }
          }
        }
        if (!matched && tk.length >= 2) tags.extra.push(tk);
      }

      const physioArr = Array.from(tags.physio);
      const outfitArr = Array.from(tags.outfit);
      const sceneArr = Array.from(tags.scene);
      const actionArr = Array.from(tags.action);
      const exprArr = Array.from(tags.expression);
      const modArr = Array.from(tags.modifier);
      const isPregnant = tags.physio.has('pregnant');
      const isNsfw = actionArr.some(a => NSFW_ACTION_KEYS.has(a)) || tags.physio.has('nude') || tags.physio.has('cum');
      const stateSignature = [
        charToken.toLowerCase(), physioArr.slice().sort().join(','), outfitArr.slice().sort().join(','),
        sceneArr.slice().sort().join(','), actionArr.slice().sort().join(','), exprArr.slice().sort().join(','), tags.extra.slice().sort().join(',')
      ].join('|');

      return {
        rawName: rawAssetName, baseName: base, ext, charToken, charTokenLower: charToken.toLowerCase(),
        variant, stateSignature, majorSegments, subTokens: allRawTokensLower, subTokenSet: new Set(allRawTokensLower),
        physio: physioArr, outfit: outfitArr, outfitSet: tags.outfit, scene: sceneArr, action: actionArr, actionSet: tags.action,
        expression: exprArr, exprSet: tags.expression, modifier: modArr, extra: tags.extra, isPregnant, isNsfw,
        sourceType, sourceName, status: 'success', baseActionKey: baseActionKey
      };
    }

    // 优化：彻底废除 synthesizeTemplateFromRegex 乱码拼凑，改为开场白/历史文本真实样本反查 + 单卡独立格式优先级
    function analyzeImageRegexScripts(charObj, matchedModules, parsedAssets, lorebookEntries, cardKey = '') {
      const allScripts = [];
      if (charObj && Array.isArray(charObj.customscript)) {
        charObj.customscript.forEach(s => allScripts.push(Object.assign({}, s, { _from: `角色卡 (${charObj.name || '当前卡'})` })));
      }
      if (charObj?.data?.extensions?.risuai?.customScripts && Array.isArray(charObj.data.extensions.risuai.customScripts)) {
        charObj.data.extensions.risuai.customScripts.forEach(s => allScripts.push(Object.assign({}, s, { _from: '角色卡扩展' })));
      }
      if (Array.isArray(matchedModules)) {
        matchedModules.forEach(mod => {
          if (Array.isArray(mod.regex)) {
            mod.regex.forEach(s => allScripts.push(Object.assign({}, s, { _from: `模块 (${mod.name || mod.namespace || mod.id})` })));
          }
        });
      }

      const imageRegexes = allScripts.filter(s => {
        if (!s || !s.in || !s.out) return false;
        const outStr = String(s.out);
        const commentStr = String(s.comment || '');
        return (
          /\{\{(?:raw|asset|emotion|image|img)::/i.test(outStr) ||
          /<img\b/i.test(outStr) ||
          /background-image\s*:/i.test(outStr) ||
          /<source\b/i.test(outStr) ||
          /立绘|图片|image|sprite|cg|illust|표정|이미지/i.test(commentStr)
        );
      });

      const sampleAsset = parsedAssets[0];
      const assetsHaveExt = sampleAsset ? Boolean(sampleAsset.ext) : false;

      const result = {
        scripts: imageRegexes,
        template: '', // 优化：默认置空，让聊天API依据原卡上下文自主输出，不强套生硬格式
        stripExt: !assetsHaveExt, // 无模板时跟随资源实际后缀：资源带.ext则保留，避免 {{raw::}} 引用不到
        combinesCharAndTag: false,
        sampleMatched: false,
        activeScript: null
      };

      if (imageRegexes.length > 0) {
        const primary = imageRegexes[0];
        result.activeScript = primary;
        const outStr = String(primary.out || '');

        const outAppendsExt = /\{\{(?:raw|asset|emotion|image|img)::[^}]*\.(?:png|jpe?g|webp|gif|avif)\s*\}\}/i.test(outStr);
        result.stripExt = outAppendsExt ? true : !assetsHaveExt;

        if (/\{\{(?:raw|asset|emotion|image|img)::\s*\$1[_.-]\$2/i.test(outStr)) {
          result.combinesCharAndTag = true;
        }

        const sampleTexts = [
          charObj?.firstMessage || '',
          charObj?.description || '',
          charObj?.systemPrompt || '',
          ...(Array.isArray(lorebookEntries) ? lorebookEntries.slice(0, 30).map(e => e?.content || e?.text || '') : [])
        ].join('\n');

        // 仅在真实文本中匹配到具体图片代码时，才提取出模板，绝不猜测正则字符串
        for (const s of imageRegexes) {
          if (!s.in) continue;
          try {
            const rgx = new RegExp(s.in, 'g');
            let match;
            while ((match = rgx.exec(sampleTexts)) !== null) {
              const fullMatchedTag = match[0];
              const cap1 = match[1];
              const cap2 = match[2];
              if (fullMatchedTag && cap1) {
                if (result.combinesCharAndTag && cap2) {
                  const idx1 = fullMatchedTag.indexOf(cap1);
                  const idx2 = fullMatchedTag.lastIndexOf(cap2);
                  if (idx1 !== -1 && idx2 !== -1 && idx2 > idx1) {
                    const sep = fullMatchedTag.slice(idx1 + cap1.length, idx2);
                    result.template = fullMatchedTag.slice(0, idx1) + '{char}' + sep + '{state}' + fullMatchedTag.slice(idx2 + cap2.length);
                    result.sampleMatched = true;
                    result.activeScript = s;
                    break;
                  }
                } else {
                  result.template = fullMatchedTag.replace(cap1, '{name}');
                  result.sampleMatched = true;
                  result.activeScript = s;
                  break;
                }
              }
              if (rgx.lastIndex === match.index) rgx.lastIndex++;
            }
            if (result.sampleMatched) break;
          } catch (_) {}
        }
      }

      // 优先级 1: 当前卡片私有独立格式设置（绝不污染其他卡片）
      if (cardKey && cardAiCache[cardKey]?.customFormat) {
        result.template = cardAiCache[cardKey].customFormat;
      }

      return result;
    }

    function formatAssetForAI(asset, regexInfo) {
      const targetName = regexInfo?.stripExt ? asset.baseName : asset.rawName;
      const tpl = regexInfo?.template || '';
      if (tpl && tpl.includes('{char}') && tpl.includes('{state}')) {
        const prefix = asset.charToken;
        const rest = targetName.slice(prefix.length).replace(/^[_.-]+/, '');
        return tpl.replace('{char}', prefix).replace('{state}', rest);
      }
      if (tpl && tpl.includes('{name}')) {
        return tpl.replace('{name}', targetName);
      }
      return targetName;
    }

    // ------------------------------------------------------------------------
    // 4. 双轨模块隔离检索与资产扫描引擎（杜绝跨卡串图，强作用域隔离）
    // ------------------------------------------------------------------------
    const assetReportMemoryCache = new Map();
    function invalidateAssetCache(charKey) {
      if (charKey) assetReportMemoryCache.delete(charKey);
      else assetReportMemoryCache.clear();
      runtimeCache.cardReportMap.clear();
    }

   function scanCharacterAssetsAndModules(charObj, modDb, lorebookEntries = [], charKeyOverride = '') {
      if (!charObj) return null;
      const charKey = charKeyOverride || charObj.chaId || charObj.name || 'default_char';
      if (assetReportMemoryCache.has(charKey)) return assetReportMemoryCache.get(charKey);

      const selfRawAssets = [];
      const moduleRawAssets = [];
      const seenAssetNames = new Set();
      const fallbackToken = (charObj.name || 'main').split(/[\s_.\-()（）]+/)[0] || 'main';

      const extractName = (it) => {
        if (!it) return '';
        if (typeof it === 'string') return it;
        if (Array.isArray(it)) {
          let name = typeof it[0] === 'string' ? it[0] : (it[0]?.name || '');
          if (name && !name.startsWith('data:image/')) return name;
          return (typeof it[1] === 'string' ? it[1] : name);
        }
        if (typeof it === 'object') return it.name || it.url || it.image || it.file || (typeof Object.values(it)[0] === 'string' ? Object.values(it)[0] : '');
        return '';
      };

      const addAssetSafe = (name, sourceType, sourceName, targetList) => {
        if (!name || typeof name !== 'string') return;
        const trimmed = name.trim();
        if (!trimmed || seenAssetNames.has(trimmed)) return;
        seenAssetNames.add(trimmed);
        const parsed = parseImageStructure(trimmed, sourceType, sourceName, fallbackToken);
        if (parsed.status === 'failed') return;
        targetList.push(parsed);
      };

      // 1. 提取角色卡本体资产
      if (Array.isArray(charObj.emotionImages)) charObj.emotionImages.forEach(it => addAssetSafe(extractName(it), 'character', 'emotionImages', selfRawAssets));
      if (Array.isArray(charObj.additionalAssets)) charObj.additionalAssets.forEach(it => addAssetSafe(extractName(it), 'character', 'additionalAssets', selfRawAssets));
      if (Array.isArray(charObj.ccAssets)) charObj.ccAssets.forEach(it => addAssetSafe(extractName(it), 'character', 'ccAssets', selfRawAssets));
      if (Array.isArray(charObj.data?.assets)) charObj.data.assets.forEach(it => { const n = extractName(it); if (n && n !== 'main') addAssetSafe(n, 'character', 'data.assets', selfRawAssets); });

      // 2. 双轨检索：严格隔离图库！只认显式绑定的模块和命名空间匹配，坚决拒绝全局模块的图片污染！
      const explicitModuleIds = new Set();
      if (Array.isArray(charObj.modules)) {
        charObj.modules.forEach(id => id && explicitModuleIds.add(String(id)));
      }
      if (Array.isArray(charObj.data?.extensions?.risuai?.modules)) {
        charObj.data.extensions.risuai.modules.forEach(m => {
          if (typeof m === 'string' || typeof m === 'number') explicitModuleIds.add(String(m));
          else if (m?.id) explicitModuleIds.add(String(m.id));
        });
      }

      const matchedModules = [];
      const embeddedModList = [
        ...(Array.isArray(charObj.embeddedModules) ? charObj.embeddedModules : []),
        ...(Array.isArray(charObj.data?.extensions?.risuai?.embeddedModules) ? charObj.data.extensions.risuai.embeddedModules : [])
      ];
      embeddedModList.forEach(mod => {
        if (!mod) return;
        matchedModules.push(mod);
        if (Array.isArray(mod.assets)) mod.assets.forEach(it => addAssetSafe(extractName(it), 'module_embedded', mod.name || 'embedded', moduleRawAssets));
      });

      const currentCardCharTokens = new Set(selfRawAssets.map(a => a.charTokenLower));
      const currentCardIdentifiers = new Set([
        String(charObj.name || '').toLowerCase(),
        String(charObj.nickname || '').toLowerCase(),
        String(charObj.namespace || '').toLowerCase(),
        ...currentCardCharTokens
      ].filter(Boolean));

      if (modDb && Array.isArray(modDb.modules)) {
        for (const mod of modDb.modules) {
          if (!mod) continue;
          const modNs = String(mod.namespace || '').trim().toLowerCase();
          const isExplicitlyOnCard = explicitModuleIds.has(String(mod.id));
          
          if (isExplicitlyOnCard || (modNs && currentCardIdentifiers.has(modNs))) {
            matchedModules.push(mod);
            if (Array.isArray(mod.assets)) mod.assets.forEach(it => addAssetSafe(extractName(it), 'module_db', mod.name || mod.id, moduleRawAssets));
          }
        }
      }

      const allAssets = [...selfRawAssets, ...moduleRawAssets];
      const rawTokenCounts = {};
      allAssets.forEach(a => { rawTokenCounts[a.charTokenLower] = (rawTokenCounts[a.charTokenLower] || 0) + 1; });
      const sortedTokens = Object.keys(rawTokenCounts).sort((a, b) => rawTokenCounts[b] - rawTokenCounts[a]);
      const majorTokens = sortedTokens.filter(tk => rawTokenCounts[tk] >= 2);
      if (majorTokens.length === 0 && sortedTokens.length > 0) majorTokens.push(...sortedTokens.slice(0, 3));

      if (majorTokens.length > 0 && sortedTokens.length > majorTokens.length) {
        const majorSet = new Set(majorTokens);
        allAssets.forEach(asset => {
          const tk = asset.charTokenLower;
          if (!majorSet.has(tk)) {
            const matchedMajor = majorTokens.find(m => tk.startsWith(m) || m.startsWith(tk)) || majorTokens[0];
            asset.extra.unshift(tk); asset.subTokens.unshift(tk); asset.subTokenSet.add(tk);
            asset.charTokenLower = matchedMajor; asset.charToken = matchedMajor;
          }
        });
      }

      const byCharToken = {};
      const uniqueTokenCounter = new Map();

      allAssets.forEach(asset => {
        const key = asset.charTokenLower;
        if (!byCharToken[key]) {
          byCharToken[key] = { displayToken: asset.charToken, assets: [], outfits: new Set(), expressions: new Set(), scenes: new Set(), actions: new Set(), modifiers: new Set(), extraVocab: new Set(), hasPregnant: false };
        }
        const group = byCharToken[key];
        group.assets.push(asset);
        asset.outfit.forEach(o => group.outfits.add(o));
        asset.expression.forEach(e => group.expressions.add(e));
        asset.scene.forEach(s => group.scenes.add(s));
        asset.action.forEach(a => group.actions.add(a));
        asset.modifier.forEach(m => group.modifiers.add(m));
        asset.extra.forEach(ex => group.extraVocab.add(ex));
        asset.subTokens.forEach(st => {
          if (st.length >= 2 && !/^\d+$/.test(st)) uniqueTokenCounter.set(st, (uniqueTokenCounter.get(st) || 0) + 1);
        });
        if (asset.isPregnant) group.hasPregnant = true;
      });

      const knownCharTokens = Object.keys(byCharToken);
      const allUniqueImageTokens = Array.from(uniqueTokenCounter.entries()).sort((a, b) => b[1] - a[1]).slice(0, 180).map(e => e[0]);
      const regexInfo = analyzeImageRegexScripts(charObj, matchedModules, allAssets, lorebookEntries, charKey);

      const report = { characterId: charKey, selfAssets: selfRawAssets, moduleAssets: moduleRawAssets, assets: allAssets, byCharToken, knownCharTokens, allUniqueImageTokens, regexInfo, matchedModules, lorebookEntries, charObj };
      assetReportMemoryCache.set(charKey, report);
      runtimeCache.cardReportMap.set(charKey, report);
      return report;
    }

    async function getCachedCardReport(ctx, forceRefresh = false) {
      if (!ctx || !ctx.key) return { characterId: '', assets: [], selfAssets: [], moduleAssets: [], byCharToken: {}, knownCharTokens: [], allUniqueImageTokens: [], regexInfo: { scripts: [], template: '', stripExt: true }, matchedModules: [], lorebookEntries: [], charObj: null };

      if (forceRefresh) {
        invalidateAssetCache(ctx.key);
      } else if (assetReportMemoryCache.has(ctx.key)) {
        const cached = assetReportMemoryCache.get(ctx.key);
        if (cardAiCache[ctx.key]?.customFormat) cached.regexInfo.template = cardAiCache[ctx.key].customFormat;
        return cached;
      }

      let charObj = ctx.charObj;
      if (!charObj) try { charObj = await Risuai.getCharacter(); } catch (_) {}
      if (!charObj) return { characterId: ctx.key, assets: [], selfAssets: [], moduleAssets: [], byCharToken: {}, knownCharTokens: [], allUniqueImageTokens: [], regexInfo: { scripts: [], template: '', stripExt: true }, matchedModules: [], lorebookEntries: [], charObj: null };

      const lorebookEntries = [];
      const seenLoreSigs = new Set();
      const pushLoreEntry = (entry) => {
        if (!entry) return;
        const content = String(entry.content || entry.text || '').trim();
        if (!content) return;
        const keySig = `${entry.comment || entry.name || ''}_${entry.key || ''}_${content.slice(0, 60)}`;
        if (seenLoreSigs.has(keySig)) return;
        seenLoreSigs.add(keySig);
        lorebookEntries.push(entry);
      };

      if (Array.isArray(charObj.globalLore)) charObj.globalLore.forEach(pushLoreEntry);
      if (Array.isArray(charObj.lorebook)) charObj.lorebook.forEach(pushLoreEntry);
      if (Array.isArray(charObj.character_book?.entries)) charObj.character_book.entries.forEach(pushLoreEntry);
      if (Array.isArray(charObj.data?.character_book?.entries)) charObj.data.character_book.entries.forEach(pushLoreEntry);

      try {
        const currentChat = await Risuai.getChatFromIndex(ctx.charIndex, ctx.chatIndex);
        if (currentChat && Array.isArray(currentChat.localLore)) currentChat.localLore.forEach(pushLoreEntry);
      } catch (_) {}

      let modDb = runtimeCache.moduleCache;
      if (forceRefresh || !modDb || (Date.now() - runtimeCache.moduleCacheTime > 120000)) {
        try {
          modDb = await Risuai.getDatabase(['modules', 'enabledModules', 'personas', 'selectedPersona']);
          runtimeCache.moduleCache = modDb;
          runtimeCache.moduleCacheTime = Date.now();
          if (modDb && Array.isArray(modDb.personas) && typeof modDb.selectedPersona === 'number') {
            const p = modDb.personas[modDb.selectedPersona];
            if (p) { runtimeCache.personaName = p.name || 'User'; runtimeCache.personaDesc = p.personaPrompt || p.description || ''; }
          }
        } catch (_) {}
      }

      // 注意：这里只收集用于注入的世界书模块ID，不传递给图库扫描器，彻底阻断图库污染！
      const lorebookModuleIdSet = new Set();
      if (Array.isArray(charObj.modules)) charObj.modules.forEach(id => id && lorebookModuleIdSet.add(String(id)));
      if (Array.isArray(charObj.data?.extensions?.risuai?.modules)) {
        charObj.data.extensions.risuai.modules.forEach(m => {
          if (typeof m === 'string' || typeof m === 'number') lorebookModuleIdSet.add(String(m));
          else if (m?.id) lorebookModuleIdSet.add(String(m.id));
        });
      }
      if (Array.isArray(modDb?.enabledModules)) {
        modDb.enabledModules.forEach(id => id && lorebookModuleIdSet.add(String(id)));
      }
      
      const embeddedModList = [
        ...(Array.isArray(charObj.embeddedModules) ? charObj.embeddedModules : []),
        ...(Array.isArray(charObj.data?.extensions?.risuai?.embeddedModules) ? charObj.data.extensions.risuai.embeddedModules : [])
      ];
      embeddedModList.forEach(m => { if (Array.isArray(m?.lorebook)) m.lorebook.forEach(pushLoreEntry); });
      
      if (modDb && Array.isArray(modDb.modules)) {
        for (const mod of modDb.modules) {
          if (mod && lorebookModuleIdSet.has(String(mod.id)) && Array.isArray(mod.lorebook)) {
            mod.lorebook.forEach(pushLoreEntry);
          }
        }
      }

      return scanCharacterAssetsAndModules(charObj, modDb, lorebookEntries, ctx.key);
    }

    // 收集发给 AI 的全卡数据，并将【图片识别出的人名前缀】作为最高优先级辅助锚点！
    function collectCardDataForAiPrompt(assetReport) {
      const charObj = assetReport.charObj || {};
      const chunks = [];

      // 【核心辅助锚点】把图包识别出的人名前缀置顶，要求 AI 逐一核对建档！
      if (assetReport.knownCharTokens && assetReport.knownCharTokens.length > 0) {
        const prefixAnchorLines = assetReport.knownCharTokens.map((tk, i) => {
          const g = assetReport.byCharToken[tk];
          const outfits = Array.from(g.outfits).join('/') || '常服';
          const sampleFiles = g.assets.slice(0, 4).map(a => a.baseName).join(', ');
          return `  ${i + 1}. 图包角色前缀 ["${g.displayToken}"] (小写键: "${tk}" | 共 ${g.assets.length} 张立绘 | 含服装: ${outfits} | 示例: ${sampleFiles})`;
        }).join('\n');

        chunks.push(`【⭐ 图包已识别出的角色人名前缀锚点（共 ${assetReport.knownCharTokens.length} 位有立绘角色 — 必读辅助点）】:\n${prefixAnchorLines}\n👉 强制要求：以上每一个图包前缀通常代表一位独立女性角色！请务必在下方世界书和描述中找出与每个前缀（可能是英文名、韩文罗马音或缩写）对应的角色设定，确保她们全部被建档到 characters 数组中，并将她的 assetPrefix 准确填为对应的键名！同时若世界书中还有其他无立绘的主要女性角色，也请一并提取！`);
      }

      chunks.push(`【角色卡标题/原名】: ${charObj.name || '未知'}`);
      if (charObj.description || charObj.desc) {
        chunks.push(`【角色卡描述 (Description)】:\n${String(charObj.description || charObj.desc).slice(0, 9500)}`);
      }
      if (charObj.personality) {
        chunks.push(`【角色性格 (Personality)】:\n${String(charObj.personality).slice(0, 2000)}`);
      }
      if (charObj.scenario) {
        chunks.push(`【背景场景 (Scenario)】:\n${String(charObj.scenario).slice(0, 2000)}`);
      }
      if (charObj.firstMessage) {
        chunks.push(`【开场白 (First Message)】:\n${String(charObj.firstMessage).slice(0, 2500)}`);
      }

      if (Array.isArray(assetReport.lorebookEntries) && assetReport.lorebookEntries.length > 0) {
        const loreTexts = [];
        let totalLoreLen = 0;
        for (const entry of assetReport.lorebookEntries) {
          if (!entry) continue;
          const title = [entry.comment, entry.name, entry.key].filter(Boolean).join(' / ');
          const body = String(entry.content || entry.text || '').trim();
          if (!body) continue;
          const block = `--- 世界书条目 [${title}] ---\n${body.slice(0, 1800)}`;
          if (totalLoreLen + block.length > 18000) break;
          loreTexts.push(block);
          totalLoreLen += block.length;
        }
        if (loreTexts.length > 0) {
          chunks.push(`【角色卡世界书 (Lorebook 共${assetReport.lorebookEntries.length}条)】:\n${loreTexts.join('\n\n')}`);
        }
      }

      if (assetReport.allUniqueImageTokens && assetReport.allUniqueImageTokens.length > 0) {
        chunks.push(`【图包文件名中的高频动作/服装/表情/场景英文词条 (需生成中文触发词索引)】:\n${assetReport.allUniqueImageTokens.join(', ')}`);
      }

      return chunks.join('\n\n');
    }

    function buildAiAnalysisPrompt(assetReport, forMainModelPiggyback = false) {
      const cardDataText = collectCardDataForAiPrompt(assetReport);

      const coreSchemaInstruction = `请仔细阅读提供的【图包角色人名前缀锚点】、角色卡描述（可能是韩文、英文或中文）、开场白与世界书，深度分析卡内的所有女性角色（特别是必须100%覆盖图包前缀对应的每一位角色！），提取她们与玩家({{user}}/男主)的真实关系、初始好感度、年龄、生理状态、专属八部位穿搭，并将图包英文词条翻译映射为中文触发词索引。

【好感度评分标准 (0~200分)】：
- 0分：死敌、仇恨、厌恶玩家。
- 15~30分：陌生人、初识、普通同事/同学/邻居/上司下属。
- 35~50分：熟络朋友、室友、同桌、贴身女仆/师徒、或者暗恋玩家但尚未表白(50分为告白墙)。
- 55~80分：互相确认的男女朋友/恋人、未婚妻、青梅竹马热恋、或“虽已分手/离婚但旧情难忘、甚至为男主生下孩子/怀有男主骨肉的前任”(70~78分)。
- 85~120分：已婚夫妻、正妻、道侣(若育有子女可给100~110分)。
- 130~160分：血亲或拟血亲至亲家人（如玩家的亲生女儿/养女/继女 140分、亲姐妹/义妹 135分、母亲/继母/小姨 135分。注意：必须仔细区分“她是玩家的女儿”还是“她是玩家的母亲”，绝不可因为背景提到“她的母亲去世”或“她是孩子的妈妈”就误判成玩家的母亲！）。
- 165~200分：极端病娇依恋、绝对死忠服从。

【八部位穿搭与生理生成要求】：
1. 角色名(cnName)必须是**纯正自然的简体中文名**（若原卡是韩文如"김유나"或英文/罗马音前缀如"yuna"，必须翻译成准确的中文姓名如"金尤娜"或"尤娜"，绝不能保留韩文！原名填在 origName 中）。
2. 根据世界书判断初始生理状态：若开局已怀孕则 pregnancyStatus 填 "已孕" 并估算 gestationDays (1~280)；若刚生产完填 "产后"；否则填 "未孕"，cycleDay 填 1~28（排卵期/危险期填 14，安全期填 8，经期填 2）。
3. 为每位女角色结合其身份、年龄与性格，用极具画面感的中文生成八部位穿搭（上衣 top、裤裙 bottom、丝袜 socks、高跟鞋 shoes、耳环 earrings、项链 necklace、手套 gloves、腿环 garter）。其中丝袜须写出透肉光泽与袜口勒入大腿软肉的质感，高跟鞋须为浅口足背净空设计，严禁出现"5D/20D/10cm"等工业数字。
4. 为【图包高频英文词条】生成 \`imageCnIndex\` 字典：键为图包里的英文单词(小写)，值为 3~6 个常见的**中文对话触发词数组**（例如 \`"kiss": ["接吻","亲吻","舌吻","嘴唇","索吻"]\`）。

【严格输出 JSON 格式】：
{
  "characters": [
    {
      "cnName": "纯中文角色名",
      "origName": "原卡韩文/英文名",
      "assetPrefix": "绑定的图包前缀小写键名(必须与【图包角色人名前缀锚点】中的键名一致，无图角色留空)",
      "age": 18,
      "relationshipTag": "精准中文关系定位(如：女儿(至亲家人) / 前女友(育有你的骨肉) / 青梅竹马 / 夫妻)",
      "initialFavor": 75,
      "pregnancyStatus": "未孕",
      "gestationDays": null,
      "cycleDay": 14,
      "physioNote": "生理补充说明(如：处女/非处女/易孕体质/育有一子等)",
      "stature": "身高与体态类型(如：高挑修长 (168cm) 或 娇小玲珑 (153cm))",
      "figure": "罩杯三围与胸腰臀腿曲线特征描写",
      "personality": "核心性格与反差萌特征",
      "wardrobe": {
        "styleLabel": "穿搭风格名称",
        "top": "上衣款式、材质与胸部撑起张力描写",
        "bottom": "裙/裤款式与腰臀包裹描写",
        "socks": "丝袜颜色、透肉光影渐变与袜口勒肉细节描写",
        "shoes": "浅口高跟鞋款式与足弓线条描写",
        "earrings": "耳饰细节",
        "necklace": "项链与锁骨/乳沟互动细节",
        "gloves": "手套或手部细节",
        "garter": "腿环陷入大腿根软肉的细节"
      }
    }
  ],
  "imageCnIndex": {
    "英文词条1": ["中文触发词1", "中文触发词2", "中文触发词3"]
  }
}`;

      if (forMainModelPiggyback) {
        return `\n【🤖 插件初始化指令 — 角色档案与图包中文索引同步】
当前角色卡尚未建立中文好感与穿搭档案。请你在完成正常角色扮演正文回复后，在回复的**最末尾**另起一行，严格按以下标签包裹输出上述 JSON 数据（仅本次输出一次，插件会自动拦截并隐藏该标签）：
<AI档案解析>
${coreSchemaInstruction}
</AI档案解析>`;
      }

      return `${coreSchemaInstruction}\n\n==================== 角色卡原始数据 ====================\n${cardDataText}\n========================================================\n请直接输出合法的 JSON 对象（不要包含多余解释）：`;
    }

    function extractJsonFromAiResponse(rawText) {
      if (!rawText) return null;
      let text = String(rawText).trim();
      const tagMatch = text.match(/<AI档案解析>([\s\S]*?)<\/AI档案解析>/i);
      if (tagMatch && tagMatch[1]) {
        text = tagMatch[1].trim();
      }
      const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (codeBlockMatch && codeBlockMatch[1]) {
        text = codeBlockMatch[1].trim();
      }
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        text = text.slice(firstBrace, lastBrace + 1);
      }
      return JSON.parse(text);
    }

    async function applyAiAnalysisResultToChat(ctx, assetReport, parsedData, overwriteExisting = true) {
      if (!ctx?.key || !parsedData || typeof parsedData !== 'object') return 0;

      const chars = Array.isArray(parsedData.characters) ? parsedData.characters : [];
      const imgIndex = (parsedData.imageCnIndex && typeof parsedData.imageCnIndex === 'object') ? parsedData.imageCnIndex : {};

      const prevCache = cardAiCache[ctx.key] || {};
      const mergedImgIndex = Object.assign({}, prevCache.imageCnIndex || {}, imgIndex);
      cardAiCache[ctx.key] = {
        analyzedAt: new Date().toISOString(),
        cardName: assetReport.charObj?.name || ctx.charName || '',
        customFormat: prevCache.customFormat || '', // 严格保留单卡专属格式配置
        characters: chars.length > 0 ? chars : (prevCache.characters || []),
        imageCnIndex: mergedImgIndex
      };

      if (!favorProfiles[ctx.key]) favorProfiles[ctx.key] = {};

      if (overwriteExisting && chars.length > 0) {
        const existingSlots = Object.keys(favorProfiles[ctx.key]);
        for (const sk of existingSlots) {
          if (chatNumOf(sk) === String(ctx.chatIndex)) {
            const oldProf = favorProfiles[ctx.key][sk];
            const matchedNew = chars.find(c =>
              c.origName === oldProf?.name ||
              c.cnName === oldProf?.name ||
              (c.assetPrefix && c.assetPrefix === oldProf?.assetPrefix) ||
              /[\uac00-\ud7a3]/.test(oldProf?.name || '')
            );
            if (matchedNew && matchedNew.cnName && oldProf?.name !== matchedNew.cnName) {
              delete favorProfiles[ctx.key][sk];
            }
          }
        }
      }

      let count = 0;
      for (const ch of cardAiCache[ctx.key].characters) {
        if (!ch) continue;
        const cnName = String(ch.cnName || ch.name || '女主').trim();
        const origName = String(ch.origName || '').trim();
        const slot = slotOf(ctx.chatIndex, cnName);
        const existing = favorProfiles[ctx.key][slot];

        if (existing && !overwriteExisting && existing.aiCalibrated) {
          continue;
        }

        const initFavor = Math.min(200, Math.max(0, Number(ch.initialFavor ?? 20)));
        const initAge = Math.min(99, Math.max(8, Number(ch.age || 18)));
        const pregStatus = ['未孕', '已孕', '产后'].includes(ch.pregnancyStatus) ? ch.pregnancyStatus : '未孕';
        const cycleDay = Math.min(28, Math.max(1, Number(ch.cycleDay || 14)));

        let matchedPrefix = String(ch.assetPrefix || '').trim().toLowerCase();
        if (!matchedPrefix || !assetReport.byCharToken[matchedPrefix]) {
          if (assetReport.knownCharTokens.length === 1) {
            matchedPrefix = assetReport.knownCharTokens[0];
          } else {
            const foundTk = assetReport.knownCharTokens.find(tk =>
              origName.toLowerCase().includes(tk) ||
              cnName.toLowerCase().includes(tk) ||
              tk.includes(origName.toLowerCase())
            );
            if (foundTk) matchedPrefix = foundTk;
          }
        }

        const w = ch.wardrobe || {};
        favorProfiles[ctx.key][slot] = {
          name: cnName,
          origName: origName || cnName,
          relationshipTag: ch.relationshipTag || '初识',
          favor: initFavor,
          month: existing?.month || 1,
          day: existing?.day || 1,
          age: initAge,
          cycleDay,
          pregnancyStatus: pregStatus,
          gestationDays: pregStatus === '已孕' ? (Number(ch.gestationDays) || 30) : null,
          postpartumDays: pregStatus === '产后' ? 7 : null,
          pregnancyRisk: existing?.pregnancyRisk || 0,
          physioNote: ch.physioNote || '',
          relationConfirmed: initFavor > 50,
          marriageConfirmed: initFavor > 80,
          assetPrefix: matchedPrefix,
          lockedOutfit: existing?.lockedOutfit || '',
          enableOutfit: existing ? existing.enableOutfit !== false : true,
          wardrobeLocked: false,
          stature: ch.stature || '匀称曼妙',
          figure: ch.figure || '双峰饱满挺拔，纤腰柔韧，臀腿丰润紧致',
          personality: ch.personality || '细腻敏感、极具反差魅力',
          wardrobe: {
            styleLabel: w.styleLabel || 'AI定制专属穿搭',
            top: w.top || '修身针织上衣（贴合饱满胸线，勾勒深邃起伏）',
            bottom: w.bottom || '高腰修身短裙（包裹圆润蜜桃臀，衬托修长双腿）',
            socks: w.socks || '极薄蝉翼微透丝袜（随大腿浑圆弧度撑开透出温润白皙底色与细腻明暗阴影渐变，袜口微微陷入大腿根软肉）',
            shoes: w.shoes || '漆皮浅口尖头细高跟鞋（足背彻底净空延伸腿线，步伐清脆）',
            earrings: w.earrings || '精致纯银微闪耳坠（点缀白皙耳垂）',
            necklace: w.necklace || '细巧锁骨链（贴合温热锁骨窝）',
            gloves: w.gloves || '无（展露纤长白嫩手指）',
            garter: w.garter || '蕾丝暗扣腿环（紧束于大腿根部，将丰润软肉微微勒出诱人凹陷）'
          },
          aiCalibrated: true
        };
        count++;
      }

      runtimeCache.compiledCnIndexMap.clear();
      await saveStoredData(true, ['profiles', 'aiCache']);
      return count;
    }

    // ① 全量 AI 识卡 / 重新 AI 分析（结合图包人名前缀锚点）
    // 🚀 补丁四：API 请求强制 15s 超时熔断与严格 JSON 防护
    async function runIndependentAiAnalysis(ctx, assetReport) {
      if (isAiAnalyzing) {
        showToast('⏳ AI 正在分析中，请稍候...');
        return false;
      }
      const apiUrl = normalizeApiEndpoint(pluginConfig.apiUrl);
      pluginConfig.apiUrl = apiUrl;
      const apiKey = String(pluginConfig.apiKey || '').trim();
      const apiModel = String(pluginConfig.apiModel || 'deepseek-chat').trim();

      if (!apiUrl || !apiKey) {
        alert('请先点击顶部「⚙️ AI接口」填写 API Key！\n\n（如果您不想填 Key，可开启「借用聊天主模型自动识别」，直接回主界面发一条消息即可自动完成建档）');
        return false;
      }

      isAiAnalyzing = true;
      showToast(`🤖 正在结合 ${assetReport.knownCharTokens.length} 个图包人名锚点与世界书进行全量 AI 分析...`, 12000);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const promptText = buildAiAnalysisPrompt(assetReport, false);
        const res = await Risuai.nativeFetch(apiUrl, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: apiModel,
            temperature: 0.2,
            messages: [
              {
                role: 'system',
                content: '你是一个专业的JSON生成引擎。你必须严格且仅输出合法的JSON对象，绝对禁止在JSON外包裹任何Markdown代码块符号(如```json)或附加任何解释性废话。'
              },
              {
                role: 'user',
                content: promptText
              }
            ]
          })
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const errTxt = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${errTxt.slice(0, 140)}`);
        }

        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content || data?.content?.[0]?.text || '';
        if (!content) {
          throw new Error('API 返回内容为空');
        }

        const parsed = extractJsonFromAiResponse(content);
        if (!parsed || !Array.isArray(parsed.characters)) {
          throw new Error('未能从 AI 响应中解析出有效的 characters JSON 结构');
        }

        const updatedCount = await applyAiAnalysisResultToChat(ctx, assetReport, parsed, true);
        const indexCount = Object.keys(cardAiCache[ctx.key]?.imageCnIndex || {}).length;
        showToast(`✅ 全量AI分析完成！已建立 ${updatedCount} 位中文角色档案 & ${indexCount} 组图片中文索引`, 3500);
        return true;
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          alert('🤖 AI 分析失败：API请求超时(15秒)，请检查网络或更换节点');
          return false;
        }
        console.log(`[Nailya V6.2.1] AI 分析异常: ${err.message}`);
        alert(`🤖 AI 分析失败：${err.message}\n\n当前请求地址：${apiUrl}\n当前模型名：${apiModel}`);
        return false;
      } finally {
        isAiAnalyzing = false;
      }
    }

    // ② & ③ 局部切片 AI 精准补录 / 单角色重新识别（结合图包未绑定人名前缀锚点，省 90% Token！）
    // 🚀 补丁四：API 请求强制 15s 超时熔断与严格 JSON 防护
    async function runTargetedAiSupplement(targetHint, ctx, assetReport, overwriteSingleProfileSlot = null) {
      if (isAiAnalyzing) {
        showToast('⏳ AI 正在分析中，请稍候...');
        return false;
      }
      const apiUrl = normalizeApiEndpoint(pluginConfig.apiUrl);
      pluginConfig.apiUrl = apiUrl;
      const apiKey = String(pluginConfig.apiKey || '').trim();
      const apiModel = String(pluginConfig.apiModel || 'deepseek-chat').trim();

      if (!apiUrl || !apiKey) {
        alert('请先点击顶部「⚙️ AI接口」填写 API Key！');
        return false;
      }

      const currentList = profilesOfChat(ctx.key, ctx);
      const existingNames = new Set();
      const usedPrefixes = new Set();
      currentList.forEach(([sk, p]) => {
        if (overwriteSingleProfileSlot && sk === overwriteSingleProfileSlot) return; // 单人重识别时不排除自己
        if (p.name) existingNames.add(p.name.toLowerCase());
        if (p.origName) existingNames.add(p.origName.toLowerCase());
        if (p.assetPrefix) usedPrefixes.add(p.assetPrefix.toLowerCase());
      });

      const unboundPrefixes = assetReport.knownCharTokens.filter(tk => !usedPrefixes.has(tk));
      const hint = String(targetHint || '').trim();
      const hintLow = hint.toLowerCase();
      const matchedSlices = [];

      // 如果有未绑定的图包人名前缀，把这些图包前缀详情作为首要补录线索！
      if (unboundPrefixes.length > 0) {
        const prefixDetails = unboundPrefixes.map(tk => {
          const g = assetReport.byCharToken[tk];
          const outfits = Array.from(g.outfits).join('/') || '常服';
          return `- 未建档图包角色前缀 ["${g.displayToken}"] (小写键: "${tk}", 共 ${g.assets.length} 张图, 含服装: ${outfits})`;
        }).join('\n');
        matchedSlices.push(`【⭐ 图包识别出的未建档角色前缀锚点】:\n${prefixDetails}`);
      }

      // 检索世界书片段
      const allEntries = Array.isArray(assetReport.lorebookEntries) ? assetReport.lorebookEntries : [];
      const searchKeywords = hintLow
        ? [hintLow]
        : unboundPrefixes.map(tk => tk.toLowerCase());

      for (const entry of allEntries) {
        if (!entry) continue;
        const title = [entry.comment, entry.name, entry.key].filter(Boolean).join(' / ');
        const body = String(entry.content || entry.text || '').trim();
        if (!body) continue;
        const fullEntryLow = (title + '\n' + body).toLowerCase();

        if (searchKeywords.length > 0 && searchKeywords.some(kw => kw && fullEntryLow.includes(kw))) {
          matchedSlices.push(`【关联世界书: ${title}】\n${body.slice(0, 1800)}`);
        } else if (!hintLow) {
          const isCharBio = /(?:年龄|岁|身高|三围|罩杯|性格|外貌|身材|关系|나이|세|키|성격|외모|체형|컵|관계|age|height|personality|figure)/i.test(body);
          const alreadyDone = Array.from(existingNames).some(n => n.length >= 2 && title.toLowerCase().includes(n));
          if (isCharBio && !alreadyDone) {
            matchedSlices.push(`【未建档人物世界书: ${title}】\n${body.slice(0, 1500)}`);
          }
        }
        if (matchedSlices.length >= 8) break;
      }

      const rawDesc = String(assetReport.charObj?.description || '');
      if (hintLow && rawDesc.toLowerCase().includes(hintLow)) {
        const idx = rawDesc.toLowerCase().indexOf(hintLow);
        matchedSlices.push(`【角色卡描述相关段落】\n${rawDesc.slice(Math.max(0, idx - 200), Math.min(rawDesc.length, idx + 1200))}`);
      } else if (rawDesc) {
        matchedSlices.push(`【角色卡描述摘录】\n${rawDesc.slice(0, 3500)}`);
      }

      isAiAnalyzing = true;
      showToast(
        overwriteSingleProfileSlot
          ? `🔄 正在重新识别角色「${hint}」的设定...`
          : (hint ? `🎯 正在结合图包与世界书精准补录「${hint}」...` : `🎯 正在根据未绑定图包前缀(${unboundPrefixes.length}个)与世界书自动抓漏补录...`),
        10000
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const taskInstruction = overwriteSingleProfileSlot
          ? `请专门针对角色【${hint}】，结合下方世界书与角色卡描述重新深度识别她的真实年龄、与玩家的准确关系、初始好感度(0-200)、生理状态、身高三围、性格与八部位穿搭。`
          : (hint
              ? `请专门针对目标角色或图包前缀【${hint}】，在下方世界书与描述中找出她的设定并生成中文角色档案（不要重复输出已建档角色：${Array.from(existingNames).join(', ') || '无'}）。`
              : `当前已建档角色为：【${Array.from(existingNames).join(', ') || '无'}】（请勿重复输出她们！）。请优先根据【未建档图包角色前缀锚点】（${unboundPrefixes.join(', ') || '无'}）以及未建档世界书，将所有遗漏的女性角色全部补录出来！`);

        const miniPrompt = `${taskInstruction}

【好感度评分标准】：死敌0分；初识/普通相识15~30分；熟络朋友/室友/同桌/女仆/暗恋35~50分；恋人/未婚妻/前任生子旧情未了55~80分；已婚夫妻85~120分；亲生女儿/养女(140分)、姐妹/母亲(135分)；极端依恋165~200分。
【要求】：cnName 必须翻译为自然的简体中文名；assetPrefix 必须优先从可用图包前缀【${assetReport.knownCharTokens.join(', ') || '无'}】中选择匹配项；丝袜与浅口高跟鞋严禁出现 5D/20D/10cm 等数字。

请严格按以下 JSON 格式输出（不要输出 imageCnIndex，不要解释）：
{
  "characters": [
    {
      "cnName": "纯中文角色名",
      "origName": "原卡名或图包前缀名",
      "assetPrefix": "绑定的图包前缀小写键名",
      "age": 18,
      "relationshipTag": "与男主/玩家的准确关系定位",
      "initialFavor": 50,
      "pregnancyStatus": "未孕",
      "gestationDays": null,
      "cycleDay": 14,
      "physioNote": "生理补充说明",
      "stature": "身高与体态(如 高挑修长 168cm)",
      "figure": "罩杯三围与身材曲线描写",
      "personality": "核心性格",
      "wardrobe": {
        "styleLabel": "风格名",
        "top": "上衣细节",
        "bottom": "裤裙细节",
        "socks": "丝袜光泽与袜口勒肉细节",
        "shoes": "浅口高跟鞋细节",
        "earrings": "耳饰",
        "necklace": "项链",
        "gloves": "手套",
        "garter": "腿环细节"
      }
    }
  ]
}

=== 角色卡局部切片与图包锚点数据 ===
${matchedSlices.join('\n\n')}`;

        const res = await Risuai.nativeFetch(apiUrl, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: apiModel,
            temperature: 0.2,
            messages: [
              { role: 'system', content: '你是一个专业的JSON生成引擎。你必须严格且仅输出合法的JSON对象，绝对禁止在JSON外包裹任何Markdown代码块符号(如```json)或附加任何解释性废话。' },
              { role: 'user', content: miniPrompt }
            ]
          })
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content || '';
        const parsed = extractJsonFromAiResponse(content);

        if (!parsed || !Array.isArray(parsed.characters) || parsed.characters.length === 0) {
          throw new Error('未在切片中识别出角色信息，请在输入框输入该角色的外文名/图包前缀或中文名重试');
        }

        if (!cardAiCache[ctx.key]) {
          cardAiCache[ctx.key] = { analyzedAt: new Date().toISOString(), cardName: ctx.charName || '', customFormat: '', characters: [], imageCnIndex: {} };
        }

        // 如果是单人强制重识别，先删掉该角色的旧槽位以便用新中文名和新数据覆盖
        if (overwriteSingleProfileSlot && favorProfiles[ctx.key]?.[overwriteSingleProfileSlot]) {
          delete favorProfiles[ctx.key][overwriteSingleProfileSlot];
        }

        const existingCacheChars = Array.isArray(cardAiCache[ctx.key].characters) ? cardAiCache[ctx.key].characters : [];
        parsed.characters.forEach(newCh => {
          if (!newCh) return;
          const idx = existingCacheChars.findIndex(c =>
            c.cnName === newCh.cnName ||
            (c.origName && c.origName === newCh.origName) ||
            (c.assetPrefix && c.assetPrefix === newCh.assetPrefix)
          );
          if (idx !== -1) existingCacheChars[idx] = newCh;
          else existingCacheChars.push(newCh);
        });
        cardAiCache[ctx.key].characters = existingCacheChars;

        await applyAiAnalysisResultToChat(
          ctx,
          assetReport,
          { characters: existingCacheChars, imageCnIndex: {} },
          false // false = 保护其他已建档角色的好感度进度不被重置！
        );

        const names = parsed.characters.map(c => `${c.cnName}(好感${c.initialFavor}·${c.age}岁)`).join('、');
        showToast(`✅ 成功识别并同步角色：【${names}】！`, 3500);
        return true;
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          alert('🎯 AI 识别/补录失败：API请求超时(15秒)，请检查网络或更换节点');
          return false;
        }
        alert(`🎯 AI 识别/补录失败：${err.message}`);
        return false;
      } finally {
        isAiAnalyzing = false;
      }
    }

    // ------------------------------------------------------------------------
    // 5. SillyTavern (酒馆) 预设解析、宏替换与请求接管系统
    // ------------------------------------------------------------------------
    function parseSillyTavernPresetJson(rawJson, fileName = '未命名酒馆预设') {
      const data = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
      if (!data || typeof data !== 'object') {
        throw new Error('无效的 JSON 对象');
      }
      if (!Array.isArray(data.prompts) && !data.system_prompt && !data.main_prompt) {
        throw new Error('该 JSON 文件不包含酒馆预设的 prompts 字段');
      }

      const presetName = String(fileName || data.name || '酒馆预设').replace(/\.json$/i, '').trim();
      const presetId = 'st_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

      let orderList = [];
      if (Array.isArray(data.prompt_order)) {
        const defaultGroup = data.prompt_order.find(g => g && Number(g.character_id) === 100001)
          || data.prompt_order.reduce((best, curr) => ((curr?.order?.length || 0) > (best?.order?.length || 0) ? curr : best), null);
        if (defaultGroup && Array.isArray(defaultGroup.order)) {
          orderList = defaultGroup.order.map(item => ({
            identifier: item.identifier,
            enabled: Boolean(item.enabled)
          }));
        }
      }

      const promptMap = {};
      if (Array.isArray(data.prompts)) {
        data.prompts.forEach(p => {
          if (p && p.identifier) {
            promptMap[p.identifier] = {
              identifier: p.identifier,
              name: p.name || p.identifier,
              role: ['system', 'user', 'assistant'].includes(p.role) ? p.role : 'system',
              content: String(p.content || ''),
              marker: Boolean(p.marker),
              injection_position: Number(p.injection_position || 0),
              injection_depth: Number(p.injection_depth ?? 4),
              enabled: p.enabled !== undefined ? Boolean(p.enabled) : true
            };
          }
        });
      }

      if (orderList.length === 0 && Array.isArray(data.prompts)) {
        orderList = data.prompts.filter(p => p && p.identifier).map(p => ({
          identifier: p.identifier,
          enabled: p.enabled !== undefined ? Boolean(p.enabled) : true
        }));
      }

      return {
        id: presetId,
        name: presetName,
        importedAt: new Date().toISOString(),
        temperature: Number(data.temperature ?? 1.0),
        top_p: Number(data.top_p ?? 1.0),
        frequency_penalty: Number(data.frequency_penalty ?? 0),
        presence_penalty: Number(data.presence_penalty ?? 0),
        max_tokens: Number(data.openai_max_tokens || data.max_tokens || 2048),
        order: orderList,
        prompts: promptMap
      };
    }

    function evaluateStMacros(text, charName, userName, charObj) {
      if (!text) return '';
      let out = String(text);

      out = out.replace(/\{\{\/\/[\s\S]*?\}\}/g, '');
      out = out.replace(/\{\{setvar::([^:}]+)::([\s\S]*?)\}\}/gi, (_, k, v) => {
        stVars[k.trim()] = v;
        return '';
      });
      out = out.replace(/\{\{addvar::([^:}]+)::([\s\S]*?)\}\}/gi, (_, k, v) => {
        const key = k.trim();
        const cur = Number(stVars[key]);
        const add = Number(v);
        if (!isNaN(cur) && !isNaN(add)) stVars[key] = String(cur + add);
        else stVars[key] = (stVars[key] || '') + v;
        return '';
      });
      out = out.replace(/\{\{getvar::([^}]+)\}\}/gi, (_, k) => stVars[k.trim()] ?? '');
      out = out.replace(/\{\{random::?([^}]+)\}\}/gi, (_, listStr) => {
        const parts = listStr.includes('::') ? listStr.split('::') : listStr.split(',');
        const clean = parts.map(s => s.trim()).filter(Boolean);
        return clean.length ? clean[Math.floor(Math.random() * clean.length)] : '';
      });

      out = out
        .replace(/\{\{char\}\}/gi, charName || 'Character')
        .replace(/\{\{user\}\}/gi, userName || 'User')
        .replace(/\{\{description\}\}/gi, charObj?.description || '')
        .replace(/\{\{personality\}\}/gi, charObj?.personality || '')
        .replace(/\{\{scenario\}\}/gi, charObj?.scenario || '')
        .replace(/\{\{persona\}\}/gi, runtimeCache.personaDesc || '')
        .replace(/\{\{mesExamples\}\}/gi, charObj?.mes_example || '')
        .replace(/\{\{time\}\}/gi, new Date().toLocaleTimeString())
        .replace(/\{\{date\}\}/gi, new Date().toLocaleDateString())
        .replace(/\{\{trim\}\}/gi, '');

      return out.trim();
    }

    function getActivatedLorebooksForSt(loreEntries, chatMessages, charName, userName, charObj) {
      if (!Array.isArray(loreEntries) || !loreEntries.length) {
        return { before: '', after: '' };
      }
      const recentChatText = (Array.isArray(chatMessages) ? chatMessages.slice(-6) : [])
        .map(m => m?.content || '')
        .join('\n')
        .toLowerCase();

      const beforeList = [];
      const afterList = [];

      for (const entry of loreEntries) {
        if (!entry || entry.enabled === false) continue;
        const content = String(entry.content || entry.text || '').trim();
        if (!content) continue;

        let isActivated = Boolean(entry.alwaysActive || entry.constant);
        if (!isActivated) {
          const rawKeys = [
            entry.key,
            entry.secondkey,
            ...(Array.isArray(entry.keys) ? entry.keys : [])
          ].filter(Boolean).join(',');

          const keyArr = rawKeys.split(/[,，|]+/).map(k => k.trim().toLowerCase()).filter(Boolean);
          isActivated = keyArr.length === 0 ? true : keyArr.some(k => recentChatText.includes(k));
        }

        if (isActivated) {
          const evaluated = evaluateStMacros(content, charName, userName, charObj);
          if (entry.position === 0 || entry.insertorder < 50) beforeList.push(evaluated);
          else afterList.push(evaluated);
        }
      }

      return {
        before: beforeList.join('\n\n'),
        after: afterList.join('\n\n')
      };
    }

    function buildMessagesWithSillyTavernPreset(stPreset, rawMessages, assetReport, pluginSystemNotes) {
      if (!stPreset || !stPreset.order || !stPreset.prompts) return null;

      const charObj = assetReport.charObj || {};
      const charName = charObj.name || 'Character';
      const userName = runtimeCache.personaName || 'User';

      const chatHistory = (Array.isArray(rawMessages) ? rawMessages : []).filter(m =>
        m && (m.role === 'user' || m.role === 'assistant') &&
        !String(m.content || '').startsWith('[System Note')
      ).map(m => ({ role: m.role, content: m.content }));

      const loreInfo = getActivatedLorebooksForSt(assetReport.lorebookEntries, chatHistory, charName, userName, charObj);

      const finalMessages = [];
      const depthInjections = [];
      let chatHistoryInserted = false;

      for (const orderItem of stPreset.order) {
        if (!orderItem || !orderItem.enabled) continue;
        const p = stPreset.prompts[orderItem.identifier];
        if (!p || p.enabled === false) continue;

        const id = p.identifier;

        if (p.marker || ['charDescription', 'charPersonality', 'scenario', 'worldInfoBefore', 'worldInfoAfter', 'personaDescription', 'dialogueExamples', 'chatHistory'].includes(id)) {
          if (id === 'chatHistory') {
            chatHistory.forEach(cm => finalMessages.push({ role: cm.role, content: cm.content }));
            chatHistoryInserted = true;
          } else if (id === 'charDescription' && charObj.description) {
            finalMessages.push({ role: 'system', content: evaluateStMacros(charObj.description, charName, userName, charObj) });
          } else if (id === 'charPersonality' && charObj.personality) {
            finalMessages.push({ role: 'system', content: evaluateStMacros(charObj.personality, charName, userName, charObj) });
          } else if (id === 'scenario' && charObj.scenario) {
            finalMessages.push({ role: 'system', content: evaluateStMacros(charObj.scenario, charName, userName, charObj) });
          } else if (id === 'personaDescription' && runtimeCache.personaDesc) {
            finalMessages.push({ role: 'system', content: evaluateStMacros(runtimeCache.personaDesc, charName, userName, charObj) });
          } else if (id === 'worldInfoBefore' && loreInfo.before) {
            finalMessages.push({ role: 'system', content: loreInfo.before });
          } else if (id === 'worldInfoAfter' && loreInfo.after) {
            finalMessages.push({ role: 'system', content: loreInfo.after });
          } else if (id === 'dialogueExamples' && charObj.mes_example) {
            finalMessages.push({ role: 'system', content: evaluateStMacros(charObj.mes_example, charName, userName, charObj) });
          }
          continue;
        }

        const evaluatedContent = evaluateStMacros(p.content, charName, userName, charObj);
        if (!evaluatedContent) continue;

        if (p.injection_position === 1) {
          depthInjections.push({
            depth: Math.max(0, Number(p.injection_depth ?? 4)),
            role: p.role || 'system',
            content: evaluatedContent
          });
        } else {
          finalMessages.push({
            role: p.role || 'system',
            content: evaluatedContent
          });
        }
      }

      if (!chatHistoryInserted) {
        chatHistory.forEach(cm => finalMessages.push({ role: cm.role, content: cm.content }));
      }

      if (depthInjections.length > 0) {
        depthInjections.sort((a, b) => b.depth - a.depth);
        for (const inj of depthInjections) {
          const insertIdx = Math.max(0, finalMessages.length - inj.depth);
          finalMessages.splice(insertIdx, 0, { role: inj.role, content: inj.content });
        }
      }

      if (Array.isArray(pluginSystemNotes) && pluginSystemNotes.length > 0) {
        pluginSystemNotes.forEach(note => {
          finalMessages.push({ role: 'system', content: note });
        });
      }

      return finalMessages;
    }

    // ------------------------------------------------------------------------
    // 6. 极速中文对话语义匹配器 (预编译正则 + 索引缓存) 与 O(1) 智能分层选图引擎
    // ------------------------------------------------------------------------
    function hashStringSeed(str) {
      let h = 2166136261 >>> 0;
      const s = String(str || '');
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }

    // 预编译并缓存角色的中文图片索引，避免每次发消息重复切分字符串
    function getCompiledCnIndex(cardKey, imageCnIndex) {
      if (!imageCnIndex || typeof imageCnIndex !== 'object') return [];
      const keys = Object.keys(imageCnIndex);
      if (keys.length === 0) return [];
      const sig = `${cardKey || 'default'}_${keys.length}_${keys[0]}_${keys[keys.length - 1]}`;
      if (runtimeCache.compiledCnIndexMap.has(sig)) {
        return runtimeCache.compiledCnIndexMap.get(sig);
      }
      const compiled = [];
      for (let i = 0; i < keys.length; i++) {
        const engToken = keys[i];
        const engLow = String(engToken || '').trim().toLowerCase();
        if (!engLow) continue;
        const rawWords = imageCnIndex[engToken];
        const arr = Array.isArray(rawWords) ? rawWords : String(rawWords || '').split(/[,，、/|]+/);
        const cleanWords = [];
        for (let j = 0; j < arr.length; j++) {
          const cw = String(arr[j] || '').trim().toLowerCase();
          if (cw.length >= 1) cleanWords.push(cw);
        }
        compiled.push({ engLow, cleanWords });
      }
      runtimeCache.compiledCnIndexMap.set(sig, compiled);
      return compiled;
    }

    // 🚀 补丁二：混合语境雷达减负（防 Regex 回溯卡顿）
    function analyzeDialogueContext(messages, latestUserText = '', imageCnIndex = {}, cardKey = '') {
      const recentMsgs = Array.isArray(messages) ? messages.slice(-3) : []; // 从 5 降至 3
      // 核心优化：只截取最后 500 个字符进行正则运算，极速提升性能
      let recentText = [
        ...recentMsgs.map(m => m?.content || ''),
        latestUserText || ''
      ].join('\n').toLowerCase();
      if (recentText.length > 500) recentText = recentText.slice(-500);

      let immediateText = [
        ...(Array.isArray(messages) ? messages.slice(-1) : []).map(m => m?.content || ''),
        latestUserText || ''
      ].join('\n').toLowerCase();
      if (immediateText.length > 300) immediateText = immediateText.slice(-300);

      const detected = {
        physio: new Set(),
        outfits: new Set(),
        scenes: new Set(),
        actions: new Set(),
        expressions: new Set(),
        modifiers: new Set(),
        aiIndexHitTokens: new Set(),
        isNsfwScene: false,
        isRomanticScene: false,
        rawRecentText: recentText,
        immediateText,
        contextSeed: hashStringSeed(immediateText + '_' + (messages ? messages.length : 0))
      };

      const scanTextForCategory = (text, catName, targetSet) => {
        const rgxMap = COMPILED_CAT_REGEX[catName];
        if (!rgxMap || !text) return;
        for (const [stdKey, rgx] of Object.entries(rgxMap)) {
          if (rgx.test(text)) {
            targetSet.add(stdKey);
          }
        }
      };

      scanTextForCategory(recentText, 'outfit', detected.outfits);
      scanTextForCategory(recentText, 'scene', detected.scenes);
      scanTextForCategory(immediateText, 'physio', detected.physio);
      scanTextForCategory(immediateText, 'action', detected.actions);
      scanTextForCategory(immediateText, 'expression', detected.expressions);
      scanTextForCategory(immediateText, 'modifier', detected.modifiers);

      const compiledCnList = getCompiledCnIndex(cardKey, imageCnIndex);
      for (let i = 0; i < compiledCnList.length; i++) {
        const { engLow, cleanWords } = compiledCnList[i];
        if (immediateText.includes(engLow)) {
          detected.aiIndexHitTokens.add(engLow);
          continue;
        }
        for (let j = 0; j < cleanWords.length; j++) {
          if (immediateText.includes(cleanWords[j])) {
            detected.aiIndexHitTokens.add(engLow);
            break;
          }
        }
      }

      if (detected.scenes.has('beach')) detected.outfits.add('swimsuit');
      if (detected.scenes.has('bath')) {
        detected.outfits.add('towel');
        detected.physio.add('sweat');
      }
      if (detected.scenes.has('school')) detected.outfits.add('school');
      if (detected.scenes.has('office_scene')) detected.outfits.add('office');
      if (detected.actions.has('sleep')) detected.outfits.add('pajamas');

      if (detected.actions.has('kiss') || detected.actions.has('hug') || detected.actions.has('touch_caress') || /接吻|亲吻|舌吻|深吻|嘴唇|唇瓣|拥抱|怀里|依偎|耳鬓厮磨|十指相扣|发烫|心跳加速/.test(immediateText)) {
        detected.isRomanticScene = true;
        if (/吻|唇|亲|舌|kiss/i.test(immediateText)) detected.actions.add('kiss');
        if (/抱|怀里|搂|依偎|贴着|hug/i.test(immediateText)) detected.actions.add('hug');
        if (detected.expressions.size === 0) {
          detected.expressions.add('shy');
          detected.expressions.add('tender');
          detected.expressions.add('seductive');
        }
      }

      const hasNsfwAct = Array.from(detected.actions).some(a => NSFW_ACTION_KEYS.has(a));
      if (hasNsfwAct || detected.physio.has('nude') || detected.physio.has('cum') || /内射|中出|性交|做爱|插入|抽插|裸体|脱光|肉棒|小穴|乳头|呻吟|娇喘|高潮|口交|乳交|足交|后入|骑乘/.test(immediateText)) {
        detected.isNsfwScene = true;
      }

      return detected;
    }

    // 极简中文标签提取辅助函数（如：微笑·常服）
    function getBriefCnLabels(asset, imageCnIndex) {
      const parts = [];

      // 表情标签
      if (asset.expression && asset.expression.length > 0) {
        const exprMap = {
          happy: '微笑', shy: '羞涩', sad: '悲伤', angry: '薄怒',
          pout_jealous: '娇嗔', surprised: '吃惊', scared_panic: '慌乱', calm: '平静',
          seductive: '动情', tender: '温柔', worried: '担忧', tired: '困倦',
          smug: '得瑟', disgust_scorn: '嫌弃', pain_plead: '隐忍', yandere_obsess: '狂热'
        };
        const e = exprMap[asset.expression[0]] || asset.expression[0];
        if (e) parts.push(e);
      }

      // 服装标签
      if (asset.outfit && asset.outfit.length > 0) {
        const outfitMap = {
          normal: '常服', school: '校服', swimsuit: '泳衣', pajamas: '睡衣',
          maid: '女仆装', wedding: '婚纱', office: '职业装', dress: '礼服',
          sport: '运动装', lingerie: '内衣', stockings: '丝袜', apron: '围裙',
          kimono: '和服', nurse: '护士装', bunny: '兔女郎', towel: '浴巾',
          winter: '冬装', street_casual: '便服'
        };
        const o = outfitMap[asset.outfit[0]] || asset.outfit[0];
        if (o && !parts.includes(o)) parts.push(o);
      }

      // 动作或生理
      if (asset.isPregnant) {
        parts.unshift('孕期');
      } else if (asset.action && asset.action.length > 0) {
                const actMap = {
          stand: '站立', sit: '坐姿', kneel_squat: '跪蹲', sleep: '躺卧', walk_run: '走动',
          lean_bend: '俯身', hug: '拥抱', lap_pillow: '膝枕', arm_in_arm: '挽手',
          kiss: '接吻', touch_head: '摸头', hold_hands: '牵手', grope: '揉捏', touch_general: '抚摸',
          eat_drink: '用餐', daily_act: '日常', cry_act: '哭泣', oral: '口交',
          paizuri: '乳交', handjob: '手交', footjob: '足交', masturbate: '自慰', sex_normal: '正面',
          sex_cowgirl: '骑乘', sex_doggy: '后入', sex_general: '做爱', climax: '高潮',
          pinned_kabedon: '壁咚', bondage: '束缚'
        };

        const a = actMap[asset.action[0]] || asset.action[0];
        if (a && !parts.includes(a)) parts.push(a);
      }

      // 若已有标签少于2个，使用 imageCnIndex 映射补充
      if (parts.length < 2 && asset.subTokens) {
        for (let i = 0; i < asset.subTokens.length; i++) {
          const tk = asset.subTokens[i];
          const mapped = imageCnIndex?.[tk];
          if (mapped) {
            const firstMeaning = Array.isArray(mapped) ? mapped[0] : String(mapped).split(/[,，/]/)[0];
            if (firstMeaning && !parts.includes(firstMeaning)) {
              parts.push(firstMeaning);
              if (parts.length >= 2) break;
            }
          }
        }
      }

      return parts.slice(0, 3).join('·') || '常规';
    }

    // 🚀 补丁三：定位目标 1 - 三级无图保底与部分匹配降级
    // 记忆每个角色最近一次选图的服装标签，跨轮粘性防跳装
    const lastOutfitMemory = new Map();
    function findBestImageForVisTag(charKey, charName, actionStr, exprStr, outfitStr, assetReport, imageCnIndex, favorProfilesMap, ctx) {
        let boundToken = '';
        const currentChatProfiles = favorProfilesMap[charKey] || {};
        const chatIdStr = typeof ctx === 'object' ? String(ctx.chatId) : String(ctx.chatIndex);
        
        for (const sk in currentChatProfiles) {
            if (sk.startsWith(chatIdStr + '#')) {
                const p = currentChatProfiles[sk];
                if (p.name === charName || p.origName === charName) { boundToken = p.assetPrefix; break; }
            }
        }
        
        if (!boundToken && assetReport.knownCharTokens.length > 0) boundToken = assetReport.knownCharTokens[0];
        const charGroup = assetReport.byCharToken[boundToken];
        if (!charGroup || !charGroup.assets || charGroup.assets.length === 0) return null;

        const labelAll = (outfitStr || '') + '|' + (actionStr || '');
        let wantsNude = /裸|nude|cum|脱光|一丝不挂|性交|做爱|插入|抽插|内射|中出|oral|paizuri|masturbate|sex_|climax|足交|手交|捆绑/i.test(labelAll);
        
        const actionHits = matchStdKeysByChinese(actionStr, 'action');
        for (const hit of actionHits) { if (NSFW_ACTION_KEYS.has(hit)) wantsNude = true; }
        if (imageCnIndex) {
            for (const [eng, cns] of Object.entries(imageCnIndex)) {
                if (NSFW_ACTION_KEYS.has(eng) || eng === 'nude' || eng === 'cum') {
                    if (cns.some(cw => labelAll.includes(cw))) wantsNude = true;
                }
            }
        }

        const wantsBathTowel = /浴巾|浴袍|浴衣|洗澡|沐浴|泡澡|温泉|入浴|towel|onsen/i.test(labelAll);
        const wantsUndress = /半脱|衣衫不整|敞开|解扣|掀裙|撩裙|走光|脱|undress/i.test(labelAll);
        
        let pool = charGroup.assets.filter(a => {
            if (wantsNude) return a.isNsfw || a.physio.includes('undress');
            if (wantsBathTowel) return a.isNsfw || a.physio.includes('undress') || a.outfit.includes('towel') || a.outfit.includes('swimsuit');
            return !a.isNsfw;
        });
        if (pool.length === 0) pool = charGroup.assets;

        let bestAsset = null;
        let maxScore = -1;
        const exprHits = matchStdKeysByChinese(exprStr, 'expression');
        const outfitHits = matchStdKeysByChinese(outfitStr, 'outfit');

        const requestedOutfitKeys = new Set(outfitHits);
        if (outfitStr) {
            const ol = String(outfitStr).toLowerCase();
            for (const ok of Object.keys(BASE_TAG_DICT.outfit)) {
                if (ol.includes(ok)) requestedOutfitKeys.add(ok);
            }
        }
        const memKey = String(charKey || '') + '|' + String(charName || '');
        const lastOutfit = lastOutfitMemory.get(memKey) || null;

        const checkMatch = (tagSet, category, inputStr) => {
            if (!inputStr) return false;
            const arr = Array.from(tagSet);
            for (let i = 0; i < arr.length; i++) {
                const engTag = arr[i];
                const dictWords = BASE_TAG_DICT[category]?.[engTag] || [];
                if (dictWords.some(w => inputStr.includes(w))) return true;
                if (inputStr.includes(engTag)) return true;
            }
            return false;
        };

        pool.forEach(a => {
            let score = 0;
            const actionMatch = checkMatch(a.action, 'action', actionStr) ||
                Array.from(a.action).some(act => actionHits.has(act) || (imageCnIndex[act] && imageCnIndex[act].some(cw => actionStr.includes(cw)))) ||
                a.subTokens.some(st => actionStr.includes(st) || (imageCnIndex[st] && imageCnIndex[st].some(cw => actionStr.includes(cw))));
            if (actionMatch) score += 1000;

            const exprMatch = checkMatch(a.expression, 'expression', exprStr) ||
                Array.from(a.expression).some(exp => exprHits.has(exp) || (imageCnIndex[exp] && imageCnIndex[exp].some(cw => exprStr.includes(cw)))) ||
                a.subTokens.some(st => exprStr.includes(st) || (imageCnIndex[st] && imageCnIndex[st].some(cw => exprStr.includes(cw))));
            if (exprMatch) score += 300;

            if (!wantsNude && !wantsUndress && a.physio.includes('undress')) score -= 150; 
            if (actionStr && !actionMatch) score -= 800; // 防乱切图铁律

            if (a.outfit.length === 0) {
                score += 200;
            } else {
                const outfitMatch = checkMatch(a.outfit, 'outfit', outfitStr) ||
                    Array.from(a.outfit).some(out => outfitHits.has(out) || (imageCnIndex[out] && imageCnIndex[out].some(cw => outfitStr.includes(cw)))) ||
                    a.subTokens.some(st => outfitStr.includes(st) || (imageCnIndex[st] && imageCnIndex[st].some(cw => outfitStr.includes(cw))));
                if (outfitMatch) {
                    score += 500;
                    if (lastOutfit && a.outfit.some(o => lastOutfit.has(o))) score += 120;
                } else if (requestedOutfitKeys.size > 0) {
                    score -= 250; 
                }
            }

            score += Math.random(); // 打破同分僵局
            if (score > maxScore) { maxScore = score; bestAsset = a; }
        });
        if (bestAsset) lastOutfitMemory.set(memKey, new Set(bestAsset.outfit));
        return bestAsset;
    }


    function buildImageCodeForAsset(assetReport, bestAsset) {
        const tpl = assetReport.regexInfo?.template || '{{raw::{name}}}';
        const targetName = assetReport.regexInfo?.stripExt ? bestAsset.baseName : bestAsset.rawName;
        let finalCode = tpl;
        if (tpl.includes('{char}') && tpl.includes('{state}')) {
            const prefix = bestAsset.charToken;
            const rest = targetName.slice(prefix.length).replace(/^[_.\-\s]+/, '');
            finalCode = tpl.replace('{char}', prefix).replace('{state}', rest);
        } else if (tpl.includes('{name}')) {
            finalCode = tpl.replace('{name}', targetName);
        }
        
        finalCode = finalCode.replace(/“/g, '"').replace(/”/g, '"').trim();
        if (finalCode.startsWith('<') && !finalCode.endsWith('>')) {
            finalCode += '>';
        }
        
        return finalCode;
    }


    // 兜底自动选图：AI 没输出 <Vis:> 标签时，用中文语境雷达扫描正文，在单角色卡的文末自动补一张立绘
    function appendAutoImageFromContext(out, ctx, assetReport, imgIndex) {
      try {
        if (!ctx?.key || !assetReport || !(assetReport.knownCharTokens || []).length) return out;
        const chatList = profilesOfChat(ctx.key, ctx);
        if (chatList.length !== 1) return out; // 多角色卡不做自动选图，避免张冠李戴
        const prof = chatList[0][1];
        const detected = analyzeDialogueContext([], out, imgIndex, ctx.key);
        const hasAction = detected.actions.size > 0;
        const hasOutfitShift = Array.from(detected.outfits).some(o => o !== 'normal');
        if (!hasAction && !hasOutfitShift) return out;

        const toLabel = (keys) => {
          const parts = [];
          for (const k of keys) {
            parts.push(k);
            const cws = imgIndex ? imgIndex[k] : null;
            if (Array.isArray(cws)) for (const cw of cws) parts.push(cw);
          }
          return parts.join('|');
        };

        let outfitLabel = toLabel(detected.outfits);
        const physioKeys = Array.from(detected.physio);
        if (physioKeys.length) outfitLabel += '|' + physioKeys.join('|');
        if (detected.isNsfwScene) outfitLabel += '|全裸|做爱'; // 触发裸池，防止做爱剧情自动补了穿衣图
        const bestAsset = findBestImageForVisTag(
          ctx.key, prof.name,
          toLabel(detected.actions), toLabel(detected.expressions), outfitLabel,
          assetReport, imgIndex, favorProfiles, ctx
        );
        if (!bestAsset) return out;
        return out + '\n' + buildImageCodeForAsset(assetReport, bestAsset);
      } catch (_) {
        return out;
      }
    }

    // ------------------------------------------------------------------------
    // 7. 精炼核心规则版：服装、丝袜光泽与身材细节提示词构建器
    // ------------------------------------------------------------------------
    function buildOutfitAndBodyPromptBlock(prof, activeOutfitTag, sceneCtx) {
      if (!pluginConfig.enableOutfitPrompt || prof.enableOutfit === false) {
        return '';
      }

      const w = prof.wardrobe || {};
      const outfitShiftHint = (pluginConfig.syncOutfitWithImage && !prof.wardrobeLocked && activeOutfitTag && activeOutfitTag !== 'normal')
        ? `\n- 场景换装联动：当前剧情/立绘处于【${activeOutfitTag}】服饰状态，请在下列日常基准穿搭的基础上，自然转化为符合该角色性格与身材的【${activeOutfitTag}】主题穿搭（须同步保留丝袜光泽与浅口高跟鞋的核心细节）。`
        : '';

      if (pluginConfig.outfitDetailMode === 'compact') {
        return `\n【👗 角色 [${prof.name}] 身材曲线与八部位穿搭核心规范】
- 身份与性格：${prof.relationshipTag || '核心女主'} (${prof.age || 18}岁) | ${prof.personality || '细腻敏感'}
- 身段与体态：${prof.stature || '匀称曼妙'} · ${prof.figure || '双峰饱满挺拔，纤腰柔韧，臀腿丰润紧致'}${prof.physioNote ? ` (${prof.physioNote})` : ''}
- 八部位穿搭基准（[上衣] ${w.top || '修身上衣'} ｜ [裤裙] ${w.bottom || '高腰短裙'} ｜ [丝袜] ${w.socks || '微透连裤丝袜'} ｜ [高跟] ${w.shoes || '浅口细高跟'} ｜ [配饰] 耳饰:${w.earrings || '精致耳坠'} / 项链:${w.necklace || '锁骨链'} / 手套:${w.gloves || '无'} / 腿环:${w.garter || '蕾丝腿环'}）${outfitShiftHint}
- 核心描写铁律：请根据剧情动作自然描写饱满胸乳撑起衣料的紧绷感、丝袜随大腿弧度撑开的透肉光影渐变与摩擦“沙沙”声、以及袜口/腿环陷入大腿根软肉的微鼓凹陷；浅口高跟足背净空，严禁出现“5D/20D/10cm”等数字参数。`;
      }

      return `\n【👗 角色 [${prof.name}] 身材曲线、丝袜光影与八部位穿搭核心法则】
- 角色定位：${prof.relationshipTag || '核心女主'}（年龄：${prof.age || 18}岁） | 性格：${prof.personality || '细腻敏感'}
- 身材与生理特征：${prof.stature || '匀称曼妙'} · ${prof.figure || '双峰饱满挺拔，纤腰盈盈一握，蜜桃臀浑圆挺翘，双腿修长丰润'}${prof.physioNote ? ` ｜ 生理特质：${prof.physioNote}` : ''}
- 角色专属八部位穿搭基准（请结合当前剧情动作动态描写具体细节，换装须符合剧情逻辑）：
  1. [上衣]：${w.top || '修身针织上衣'}
  2. [裤裙]：${w.bottom || '高腰修身短裙'}
  3. [丝袜]：${w.socks || '极薄蝉翼微透丝袜'}
  4. [高跟]：${w.shoes || '漆皮浅口细高跟鞋'}
  5. [耳环/项链]：${w.earrings || '精致耳坠'} ｜ ${w.necklace || '细巧锁骨链'}
  6. [手套/腿环]：${w.gloves || '无'} ｜ ${w.garter || '紧束大腿根部的蕾丝腿环'}${outfitShiftHint}
- 丝袜与身材动态精描核心规则（由你在正文中自主融合生成具体细节，拒绝干瘪罗列）：
  1. 【身材曲线与衣肉张力】：随呼吸、俯身、拥抱或走动，细腻写出饱满胸乳撑紧上衣的弧度与乳沟光影、柔韧细腰与裙裤紧密包裹下的浑圆臀线；亲密接触时须体现隔着衣物的温热柔软触感与衣衫半解、凌乱移位的动态过程。
  2. 【丝袜光影与勒肉质感】：重点刻画丝袜包裹双腿的明暗透肉渐变（大腿正面丰满处微透温润肤色、两侧与膝窝脚踝处色泽加深）、防滑袜口/吊袜带/腿环深深陷入大腿根部白腻软肉所勒出的丰润肉感凹陷，以及双腿交叠摩擦时细腻的“沙沙”声。
  3. 【高跟与微表情禁令】：浅口高跟鞋足背净空无绑带，害羞或动情时可写脚趾在鞋内轻轻蜷缩；严禁输出“5D/20D/10cm”等工业数字参数。`;
    }

    // ------------------------------------------------------------------------
    // 8. 时间推进、好感度计算、生理演算与输出标签拦截器（含AI自动时间统计）
    // ------------------------------------------------------------------------
    function processTimeAdvance(text) {
      let daysToAdd = 0;
      const t = String(text || '').toLowerCase();
      if (/过了一天|第二天|次日|隔天|1天后|过了一夜|翌日|到了第二天|天亮后/.test(t)) {
        daysToAdd = 1;
      } else if (/过了两天|两天后|2天后/.test(t)) {
        daysToAdd = 2;
      } else if (/过了几天|几天后|数日后|过了三天|三天后/.test(t)) {
        daysToAdd = 3;
      } else if (/过了一周|一周后|7天后|一个星期后/.test(t)) {
        daysToAdd = 7;
      } else if (/过了半个月|半月后|15天后/.test(t)) {
        daysToAdd = 15;
      } else if (/过了一个月|过了一月后|1个月后|30天后/.test(t)) {
        daysToAdd = 30;
      } else {
        const match = t.match(/过了\s*(\d+)\s*天|(\d+)\s*天后/);
        if (match && (match[1] || match[2])) {
          daysToAdd = parseInt(match[1] || match[2], 10);
        }
      }
      return daysToAdd;
    }

    function calculateFavorGain(userText, currentFavor) {
      let baseGain = Math.floor(Math.random() * 5) + 2;
      const t = String(userText || '').toLowerCase();
      const isIntimate = /拥抱|抱住|搂住|亲吻|接吻|舌吻|吻|摸头|揉头|牵手|十指相扣|壁咚|依偎|膝枕|做爱|喜欢你|爱你|心疼|夸|赞美|礼物|哄|宝贝|乖女儿|老婆/.test(t);
      const isHostileToChar = /(?:扇|打|踹|骂|滚开|讨厌你|恨你|杀掉你|去死)/.test(t);

      if (currentFavor <= 20) {
        if (isIntimate) baseGain += 1;
      } else if (currentFavor <= 50) {
        if (isIntimate) baseGain += 3;
      } else if (currentFavor <= 100) {
        if (isIntimate) baseGain += 5;
      } else {
        if (isIntimate) baseGain += 6;
      }

      if (isHostileToChar && currentFavor <= 160) {
        baseGain = -Math.abs(baseGain + 4);
      }
      return baseGain;
    }

    // 受孕结算：每次风险行为当场掷骰（原设计只在周期第24天结算一次，日常聊天时间不走导致永远怀不上）
    function updatePhysiology(prof, daysAdded, userText) {
      if (!prof) return;
      const prot = protectionOf(userText);
      const isSexAct = SEX_ACT_REGEX.test(String(userText || ''));
      if (isSexAct && prof.pregnancyStatus === '未孕') {
        const phase = getCyclePhase(prof.cycleDay);
        if (phase.baseRate > 0) {
          const addedRisk = phase.baseRate * prot.coef;
          prof.pregnancyRisk = Math.min(60, Math.round(((prof.pregnancyRisk || 0) + addedRisk) * 10) / 10);
          const roll = Math.random() * 100;
          if (roll < prof.pregnancyRisk) {
            prof.pregnancyStatus = '已孕';
            prof.gestationDays = 0;
            prof.pregnancyRisk = 0;
            try { showToast(`🍼 [${prof.name}] 已成功受孕！从今天起进入孕期`, 4000); } catch (_) {}
          }
        }
      }

      if (daysAdded <= 0) return;

      if (prof.pregnancyStatus === '已孕') {
        prof.gestationDays = (prof.gestationDays || 0) + daysAdded;
        return;
      }

      if (prof.pregnancyStatus === '产后') {
        prof.postpartumDays = (prof.postpartumDays || 0) + daysAdded;
        if (prof.postpartumDays >= 42) {
          prof.pregnancyStatus = '未孕';
          prof.gestationDays = null;
          prof.postpartumDays = null;
          prof.cycleDay = 1;
          prof.pregnancyRisk = 0;
        }
        return;
      }

      if (prof.cycleDay) {
        for (let i = 0; i < daysAdded; i++) {
          prof.cycleDay++;
          if (prof.cycleDay > 28) {
            prof.cycleDay = 1;
            prof.pregnancyRisk = 0;
          }
        }
      }
    }

    let lastProcessedInputSig = '';
    let lastUserInputAddedDays = false;
    let lastUserInputHadSex = false;

    async function handleMessagePipeline(userText) {
      if (!userText) return;
      const sig = `${Date.now().toString().slice(0, -3)}_${userText.slice(0, 40)}`;
      if (sig === lastProcessedInputSig) return;
      lastProcessedInputSig = sig;
      runtimeCache.turnCounter++;

      await ensureStoredDataLoaded();
      const ctx = await getFastContext(false);
      if (!ctx.key) return;

      const list = profilesOfChat(ctx.key, ctx);
      if (!list.length) return;

      const advanceDays = processTimeAdvance(userText);
      lastUserInputAddedDays = advanceDays > 0;
      lastUserInputHadSex = SEX_ACT_REGEX.test(String(userText || ''));

      const mentionedProfiles = list.filter(([, p]) => {
        const cands = [p.name, p.origName, p.assetPrefix].filter(Boolean).map(s => s.toLowerCase());
        return cands.some(c => c.length >= 2 && userText.toLowerCase().includes(c));
      });
      
      // 如果没有点名任何角色，就对所有人（list）生效，并打上兜底标记
      const activeTargetList = mentionedProfiles.length > 0 ? mentionedProfiles : list;
      const isFallbackGroupChat = mentionedProfiles.length === 0 && list.length > 1;

      for (const [, prof] of list) {
        if (advanceDays > 0) {
          prof.day += advanceDays;
          while (prof.day > 30) {
            prof.day -= 30;
            prof.month += 1;
            if (prof.month > 12) prof.month = 1;
          }
        }
      }

      for (const [, prof] of activeTargetList) {
        let gain = calculateFavorGain(userText, prof.favor);

        // 【核心修改】：如果是群聊且未点名，执行“雨露均沾但削弱”的逻辑
        if (isFallbackGroupChat) {
          if (gain > 0) {
            gain = Math.max(1, Math.floor(gain / 3)); // 正面好感削弱为1/3，保底+1
          } else if (gain < 0) {
            gain = Math.floor(gain / 2); // 负面扣除减半
          }
        }

        prof.favor = Math.min(200, Math.max(0, prof.favor + gain));

        for (const w of FAVOR_WALLS) {
          if (!prof[w.flag] && prof.favor > w.at) prof.favor = w.at;
        }

        if ((prof.age || 18) >= 14) {
          updatePhysiology(prof, advanceDays, userText);
        }
      }

      await saveStoredData(false, ['profiles']);
    }

    async function handleAiOutputAndMilestones(text) {
      if (!text) return text;
      let cleanedText = String(text);

      if (cleanedText.includes('<AI档案解析>')) {
        const m = cleanedText.match(/<AI档案解析>([\s\S]*?)<\/AI档案解析>/i);
        if (m && m[1]) {
          try {
            await ensureStoredDataLoaded();
            const ctx = await getFastContext(true);
            const assetReport = await getCachedCardReport(ctx, false);
            const parsed = extractJsonFromAiResponse(m[1]);
            if (parsed && Array.isArray(parsed.characters)) {
              const cnt = await applyAiAnalysisResultToChat(ctx, assetReport, parsed, true);
              runtimeCache.pendingMainModelExtract.delete(ctx.key);
              showToast(`🤖 主模型已自动完成识卡：建立 ${cnt} 位中文角色档案！`, 3000);
            }
          } catch (e) {}
          cleanedText = cleanedText.replace(/\s*<AI档案解析>[\s\S]*?<\/AI档案解析>\s*/gi, '');
        }
      }

      let aiAdvanceDays = 0;
      if (cleanedText.includes('<时间推进>')) {
        const tm = cleanedText.match(/<时间推进>\s*(\d+)\s*<\/时间推进>/i);
        if (tm && tm[1]) {
          aiAdvanceDays = parseInt(tm[1], 10) || 0;
        }
        cleanedText = cleanedText.replace(/\s*<时间推进>[\s\S]*?<\/时间推进>\s*/gi, '');
      } else if (!lastUserInputAddedDays) {
        aiAdvanceDays = processTimeAdvance(cleanedText.slice(0, 400));
      }

      if (aiAdvanceDays > 0 && aiAdvanceDays <= 365 && !lastUserInputAddedDays) {
        try {
          await ensureStoredDataLoaded();
          const ctx = await getFastContext(false);
          if (ctx.key) {
            const list = profilesOfChat(ctx.key, ctx); // 必须传 ctx 对象：传 chatIndex 数字只匹配旧格式键，档案永远找不到
            for (const [, prof] of list) {
              prof.day += aiAdvanceDays;
              while (prof.day > 30) {
                prof.day -= 30;
                prof.month += 1;
                if (prof.month > 12) prof.month = 1;
              }
              if ((prof.age || 18) >= 14) {
                updatePhysiology(prof, aiAdvanceDays, ''); // 性行为结算统一由下方专项块处理，防止一次行为算两次
              }
            }
            await saveStoredData(false, ['profiles']);
          }
        } catch (_) {}
      }
      lastUserInputAddedDays = false;

      // AI 叙事中的性行为同样结算受孕（本回合玩家输入已结算过则跳过，防止一次行为算两次）
      if (!lastUserInputHadSex && SEX_ACT_REGEX.test(String(cleanedText || ''))) {
        try {
          await ensureStoredDataLoaded();
          const ctxSex = await getFastContext(false);
          if (ctxSex.key) {
            const sexList = profilesOfChat(ctxSex.key, ctxSex);
            for (const [, prof] of sexList) {
              if ((prof.age || 18) >= 14) updatePhysiology(prof, 0, cleanedText);
            }
            await saveStoredData(false, ['profiles']);
          }
        } catch (_) {}
      }
      lastUserInputHadSex = false;

      if (cleanedText.includes('<好感度事件>')) {
        const m = cleanedText.match(/<好感度事件>([\s\S]*?)<\/好感度事件>/);
        if (m && m[1]) {
          try {
            const e = extractJsonFromAiResponse(m[1]);
            if (e && e.confirm && e.name) {
              await ensureStoredDataLoaded();
              const ctx = await getFastContext(false);
              if (ctx.key) {
                const list = profilesOfChat(ctx.key, ctx); // 必须传 ctx 对象，否则里程碑找不到角色档案
                const target = list.find(([, p]) =>
                  p.name === e.name || p.origName === e.name || String(p.name).includes(e.name)
                ) || (list.length === 1 ? list[0] : null);

                if (target) {
                  const prof = target[1];
                  if (e.confirm === 'relation' && !prof.relationConfirmed) {
                    prof.relationConfirmed = true;
                    if (prof.favor <= 50) prof.favor = 51;
                    if (prof.relationshipTag && !/恋|夫妻|婚|爱人/.test(prof.relationshipTag)) prof.relationshipTag = '恋人(已告白)';
                  } else if (e.confirm === 'marriage' && !prof.marriageConfirmed) {
                    prof.relationConfirmed = true;
                    prof.marriageConfirmed = true;
                    if (prof.favor <= 80) prof.favor = 81;
                    if (prof.relationshipTag && !/夫妻|婚|爱人/.test(prof.relationshipTag)) prof.relationshipTag = '夫妻(已婚)';
                  }
                  syncProfileBackToCardCache(ctx.key, prof);
                  await saveStoredData(false, ['profiles', 'aiCache']);
                }
              }
            }
          } catch (_) {}
        }
        cleanedText = cleanedText.replace(/\s*<好感度事件>[\s\S]*?<\/好感度事件>\s*/gi, '');
      }

      const hadVisTag = cleanedText.includes('<Vis:');
      if (hadVisTag || pluginConfig.enableImagePrompt) {
        try {
          await ensureStoredDataLoaded();
          const ctx = await getFastContext(false);
          if (ctx && ctx.key) {
            const assetReport = await getCachedCardReport(ctx, false);
            const cachedAiData = cardAiCache[ctx.key] || {};
            const imgIndex = cachedAiData.imageCnIndex || {};

            if (hadVisTag) {
              const visRegex = /<Vis:([^>]+)>([^|]*)\|([^|]*)\|([^<]*)<\/Vis>/gi;
              cleanedText = cleanedText.replace(visRegex, (match, charName, action, expression, outfit) => {
                const safeAction = (action || '').trim();
                const safeExpression = (expression || '').trim();
                const safeOutfit = (outfit || '').trim();
                const bestAsset = findBestImageForVisTag(ctx.key, charName.trim(), safeAction, safeExpression, safeOutfit, assetReport, imgIndex, favorProfiles, ctx);
                if (!bestAsset) return '';
                return buildImageCodeForAsset(assetReport, bestAsset);
              });
              
              cleanedText = cleanedText.replace(/<img\s+cmd=["'][^"']+["']\s*\/?>/gi, '');
            } else {
              cleanedText = appendAutoImageFromContext(cleanedText, ctx, assetReport, imgIndex);
            }
          }
        } catch (e) {}
      }

      return cleanedText;
    }

    // ------------------------------------------------------------------------
    // 9. 构建注入给 API 的 System Note（优先复用本地 AI 缓存，零额外开销）
    // ------------------------------------------------------------------------
    // 🚀 补丁三：定位目标 2 - 完整三级保底 Prompt 注入装配器
    async function buildInjectedSystemNotes(messages) {
      await ensureStoredDataLoaded();
      const ctx = await getFastContext(false);
      if (!ctx.key) return { systemNotes: [], assetReport: null, topNote: '' };

      const assetReport = await getCachedCardReport(ctx, false);
      const cachedAiData = cardAiCache[ctx.key] || null;
      let list = profilesOfChat(ctx.key, ctx);

      if (list.length === 0 && cachedAiData && Array.isArray(cachedAiData.characters) && cachedAiData.characters.length > 0) {
        await applyAiAnalysisResultToChat(ctx, assetReport, cachedAiData, false);
        list = profilesOfChat(ctx.key, ctx);
      }

      const systemNotes = [];

      if (list.length > 0) {
        for (const [, prof] of list) {
          const stage = getFavorStage(prof.favor);
          const phase = getCyclePhase(prof.cycleDay);

          let physioText = `周期 Day${prof.cycleDay}/28 · ${phase.name}${prof.physioNote ? ` (${prof.physioNote})` : ''}\n${phase.body}`;
          if (prof.pregnancyStatus === '已孕') {
            const ps = pregStageOf(prof.gestationDays || 0);
            const pct = Math.min(100, Math.round(((prof.gestationDays || 0) / PREG_DAYS) * 100));
            physioText = `孕期 ${prof.gestationDays || 0}/${PREG_DAYS} 天(${pct}%) · ${ps.name}\n肚子:${ps.belly}\n身体:${ps.body}\n正文必须按上面的肚子大小描写,不得回退到更小的阶段。`;
          } else if (prof.pregnancyStatus === '产后') {
            const pp = postpartumOf(prof.postpartumDays || 0);
            physioText = `产后 ${prof.postpartumDays || 0} 天 · ${pp.name}\n肚子:${pp.belly}\n身体:${pp.body}`;
          }

          const behavior = FAVOR_BEHAVIOR[stage.stage] || '';
          const wallLines = FAVOR_WALLS.map(w => {
            const confirmed = Boolean(prof[w.flag]);
            return '  - ' + w.name + '(' + w.at + '): ' + (confirmed ? '已确认,可越过。' : '未确认 —— ' + w.note);
          }).join('\n');

          const outfitGuideText = buildOutfitAndBodyPromptBlock(prof, prof.lockedOutfit || '常服', { contextSeed:1 });
          
          let visInstruction = '';
          if (pluginConfig.enableImagePrompt) {
            visInstruction = `\n<视觉交互防火墙>\n当剧情有动作或情绪变化时，必须在正文呼叫视觉标签：<Vis:${prof.name}>动作|表情|服装</Vis>。\n⚠️ 绝对铁律：\n1. 【格式唯一】：这是唯一的发图方式！彻底遗忘并忽略角色卡自带的 <img cmd="..."> 等发图指令。\n2. 【内容防空】：<Vis> 标签严禁进入 <thinking> 内部！三个槽位绝不能留空，无明显动作请写“站立”或“日常”，严禁文学修辞。\n</视觉交互防火墙>`;
          }

          const narrativeEngine = `\n<文学巨匠与角色灵魂引擎>
【1. 灵魂辩证法思维链 (<thinking>前置推演)】
正文前使用 <thinking>...</thinking> 构思（拒绝机械填表）：
- 心理与潜台词：角色此刻内心哪两种情感在拉扯？她企图用什么借口掩饰？
- 环境映射：抓取当前环境的一个微小物理细节（光影切割、冷空气、织物触感、白噪音），用它来隐喻和烘托此刻的心理失衡。

【2. 角色主观滤镜与环境交融】
- 禁止干瘪的客观景物描写！所有的温度、气味和光线，必须100%经过该角色的“主观性格滤镜”过滤。让周遭的环境直接刺激她的感官，与理智发生化学反应。

【3. 肢体的背叛 (Show, Don't Tell)】
- 彻底禁用“她感到害羞/开心”等廉价心理总结词汇。
- 重点刻画微表情与微动作：如睫毛的轻颤频率、瞳孔的收缩、不自觉咬唇、呼吸节律的变乱、指节泛白或脚趾在鞋内的蜷缩，让下意识的肢体细节出卖她的口是心非。

【4. 真实的互动推拉与悬念】
- 说话语气、口癖必须严丝合缝地契合原生设定。不要流畅地说完长句，加入喉咙发紧的停顿或尾音颤抖。
- 每一轮回复末尾，用一个意料之外的动作或反问制造场景转折，把下一步的决定权死死留给玩家！绝对禁止替玩家做出任何反应！
</文学巨匠与角色灵魂引擎>`;

          const injectedText = `[System Note (${prof.name}${prof.origName && prof.origName !== prof.name ? ` / ${prof.origName}` : ''}): Current Time is Month ${prof.month}, Day ${prof.day}. Character Age: ${prof.age || 18}. Relationship with User: ${prof.relationshipTag || stage.title}. Favorability: ${prof.favor}/200 (Stage: ${stage.title}). Physiological State: ${physioText}. Pregnancy Risk: ${prof.pregnancyRisk}%. Always refer to this character by her Chinese name "${prof.name}" in Chinese narrative.]
【好感度档位行为基线 — 不可降级】
角色:${prof.name} (年龄:${prof.age || 18}岁 | 真实关系:${prof.relationshipTag || stage.title} | 核心性格:${prof.personality || '遵循原卡设定'}) | 当前档位:${stage.title}(${prof.favor}/200)
${behavior}
分数决定行为强度,人设只决定表达方式。禁止以人设、礼节、身份、贞洁设定为由把当前档位的行为降级成低档表现。
【两道好感度墙】
${wallLines}
【里程碑与时间流逝自动上报 — 必须执行】
1. 当上面某道墙被剧情真正跨过时(她告白且使用者已明确接受 / 她求婚且使用者已明确答应),在本次回复最末尾另起一行输出(仅确认那一刻输出):
<好感度事件>{"name":"${prof.name}","confirm":"relation"}</好感度事件> (婚姻被接受时把 confirm 改成 "marriage")。
2. 当本轮剧情发生跨夜、到了第二天或跳过N天时,在回复最末尾附上:<时间推进>N</时间推进>(N为整数天数,同一天内聊天不要输出)。${outfitGuideText}${visInstruction}${narrativeEngine}`;

          systemNotes.push(injectedText);
        }
      } else {
        if (pluginConfig.autoMainModelAnalyze && !runtimeCache.pendingMainModelExtract.has(ctx.key)) {
          runtimeCache.pendingMainModelExtract.add(ctx.key);
          systemNotes.push(buildAiAnalysisPrompt(assetReport, true));
        }
      }

      // 对话最顶部的时间注入：让 AI 每次生成前第一眼就看到游戏内日期与生理状态
      let topNote = '';
      if (list.length > 0) {
        const dateLines = list.map(([, p]) => {
          const ph = getCyclePhase(p.cycleDay);
          let phText = `周期 Day${p.cycleDay || 1}/28 · ${ph.name}`;
          if (p.pregnancyStatus === '已孕') phText = `孕期 ${p.gestationDays || 0}/${PREG_DAYS} 天（${pregStageOf(p.gestationDays || 0).name}）`;
          else if (p.pregnancyStatus === '产后') phText = `产后 ${p.postpartumDays || 0} 天`;
          const riskTxt = (p.pregnancyStatus === '未孕' && p.pregnancyRisk > 0) ? `（当前受孕风险 ${p.pregnancyRisk}%）` : '';
          return `- ${p.name}：${phText}${riskTxt}`;
        }).join('\n');
        const d0 = list[0][1];
        topNote = `【⏰ 游戏内时间 · 必读】\n当前日期：${d0.month || 1}月${d0.day || 1}日\n${dateLines}\n若本轮剧情跨夜/跳到第二天/跳过N天，必须在回复最末尾输出 <时间推进>N</时间推进>；同一天内则不要输出。`;
        if (pluginConfig.enableImagePrompt) {
          const visNames = list.slice(0, 3).map(([, p]) => p.name).join('、');
          topNote += `\n【📷 视觉标签强制令 · 最高优先级】本轮回复必须按剧情输出视觉标签，这是唯一合法的发图方式：\n格式：<Vis:${d0.name}>动作|表情|服装</Vis>（例：<Vis:${d0.name}>拥抱|害羞|常服</Vis>）。\n三个槽位必须用中文填写、不得留空（无明显动作写"站立"、服装写"常服"）。${list.length > 1 ? `出场角色：${visNames}——每个出场角色各输出一条。` : ''}`;
        }
      }

      return { systemNotes, assetReport, topNote };
    }

    // ------------------------------------------------------------------------
    // 10. 科幻极简毛玻璃 UI 引擎（梦幻星云蓝紫 & 极光青蓝双主题 + 矢量SVG图标 + DOM壳复用）
    // ------------------------------------------------------------------------
    const ICONS = {
      logo: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><defs><linearGradient id="ny_g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#22d3ee"/><stop offset="50%" stop-color="#818cf8"/><stop offset="100%" stop-color="#e879f9"/></linearGradient></defs><path fill="url(#ny_g1)" stroke="none" d="M12 2L14.8 8.8L22 11.5L14.8 14.2L12 21L9.2 14.2L2 11.5L9.2 8.8L12 2Z"/></svg>`,
      sparkle: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z"/></svg>`,
      refresh: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>`,
      theme: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
      book: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`,
      hanger: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><path d="M12 6a2 2 0 1 0-2-2c0 1.02.8 1.85 2 2.5L3.6 12.1A2 2 0 0 0 4.7 15.8h14.6a2 2 0 0 0 1.1-3.7L12 6.5"/></svg>`,
      settings: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1.05 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
      close: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
      user: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
      layers: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
      image: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" ry="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
      shield: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
      copy: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
      edit: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
      pulse: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
      heart: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
      crown: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>`,
      trash: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2-2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
      plus: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
      download: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
      upload: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
      calendar: `<svg xmlns="http://www.w3.org/2000/svg" class="ny-ico" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`
    };

    const THEME_LABELS = {
      'nebula-aurora': '星云×极光',
      'nebula': '梦幻蓝紫',
      'aurora': '极光青蓝'
    };

    let appShellMounted = false;
    let activeCtxRef = null;
    let activeReportRef = null;

    function applyThemeVariables(themeMode) {
      const mode = ['nebula-aurora', 'nebula', 'aurora'].includes(themeMode) ? themeMode : 'nebula-aurora';
      document.documentElement.setAttribute('data-ny-theme', mode);
      const themeBtn = document.getElementById('btn-theme-switch');
      if (themeBtn) {
        themeBtn.innerHTML = `${ICONS.theme}<span>${THEME_LABELS[mode]}</span>`;
      }
    }

    function ensureAppShellMounted() {
      if (appShellMounted && document.getElementById('ny-app-root')) return;

      document.body.innerHTML = `
        <style>
          :root, :root[data-ny-theme="nebula-aurora"] {
            --bg-deep: #050814;
            --orb-1: radial-gradient(circle, rgba(124, 58, 237, 0.34) 0%, rgba(79, 70, 229, 0.14) 45%, transparent 72%);
            --orb-2: radial-gradient(circle, rgba(6, 182, 212, 0.30) 0%, rgba(56, 189, 248, 0.12) 45%, transparent 72%);
            --orb-3: radial-gradient(circle, rgba(192, 132, 252, 0.18) 0%, transparent 68%);
            --glass-surface: linear-gradient(135deg, rgba(20, 24, 54, 0.56) 0%, rgba(10, 22, 46, 0.44) 100%);
            --glass-header: rgba(9, 13, 30, 0.72);
            --glass-sub: rgba(12, 18, 38, 0.54);
            --glass-inset: rgba(5, 9, 22, 0.52);
            --glass-border: rgba(129, 140, 248, 0.22);
            --glass-border-strong: rgba(34, 211, 238, 0.55);
            --accent-primary: #38bdf8;
            --accent-secondary: #a855f7;
            --accent-grad: linear-gradient(135deg, #6366f1 0%, #8b5cf6 48%, #06b6d4 100%);
            --bar-grad: linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #22d3ee 100%);
            --text-main: #f8fafc;
            --text-sub: #94a3b8;
            --text-highlight: #67e8f9;
            --pill-bg: rgba(56, 189, 248, 0.12);
            --pill-border: rgba(56, 189, 248, 0.32);
          }

          :root[data-ny-theme="nebula"] {
            --bg-deep: #070516;
            --orb-1: radial-gradient(circle, rgba(139, 92, 246, 0.38) 0%, rgba(99, 102, 241, 0.18) 48%, transparent 74%);
            --orb-2: radial-gradient(circle, rgba(192, 132, 252, 0.28) 0%, rgba(124, 58, 237, 0.12) 48%, transparent 74%);
            --orb-3: radial-gradient(circle, rgba(96, 165, 250, 0.20) 0%, transparent 68%);
            --glass-surface: linear-gradient(135deg, rgba(28, 19, 62, 0.58) 0%, rgba(16, 14, 42, 0.46) 100%);
            --glass-header: rgba(13, 10, 34, 0.74);
            --glass-sub: rgba(18, 14, 44, 0.56);
            --glass-inset: rgba(8, 6, 24, 0.54);
            --glass-border: rgba(167, 139, 250, 0.26);
            --glass-border-strong: rgba(192, 132, 252, 0.62);
            --accent-primary: #a78bfa;
            --accent-secondary: #818cf8;
            --accent-grad: linear-gradient(135deg, #4f46e5 0%, #7c3aed 52%, #c084fc 100%);
            --bar-grad: linear-gradient(90deg, #4f46e5 0%, #8b5cf6 55%, #e879f9 100%);
            --text-main: #f5f3ff;
            --text-sub: #a5b4fc;
            --text-highlight: #d8b4fe;
            --pill-bg: rgba(139, 92, 246, 0.15);
            --pill-border: rgba(167, 139, 250, 0.36);
          }

          :root[data-ny-theme="aurora"] {
            --bg-deep: #030b14;
            --orb-1: radial-gradient(circle, rgba(6, 182, 212, 0.35) 0%, rgba(14, 165, 233, 0.16) 48%, transparent 74%);
            --orb-2: radial-gradient(circle, rgba(45, 212, 191, 0.28) 0%, rgba(56, 189, 248, 0.12) 48%, transparent 74%);
            --orb-3: radial-gradient(circle, rgba(59, 130, 246, 0.22) 0%, transparent 68%);
            --glass-surface: linear-gradient(135deg, rgba(8, 28, 52, 0.58) 0%, rgba(5, 18, 38, 0.46) 100%);
            --glass-header: rgba(4, 15, 30, 0.74);
            --glass-sub: rgba(7, 22, 42, 0.56);
            --glass-inset: rgba(3, 10, 22, 0.55);
            --glass-border: rgba(34, 211, 238, 0.24);
            --glass-border-strong: rgba(45, 212, 191, 0.62);
            --accent-primary: #22d3ee;
            --accent-secondary: #2dd4bf;
            --accent-grad: linear-gradient(135deg, #0284c7 0%, #06b6d4 52%, #2dd4bf 100%);
            --bar-grad: linear-gradient(90deg, #0284c7 0%, #22d3ee 55%, #34d399 100%);
            --text-main: #f0f9ff;
            --text-sub: #7dd3fc;
            --text-highlight: #5eead4;
            --pill-bg: rgba(6, 182, 212, 0.14);
            --pill-border: rgba(34, 211, 238, 0.35);
          }

          * { box-sizing: border-box; margin: 0; padding: 0; font-family: "Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; -webkit-tap-highlight-color: transparent; }
          body { background: var(--bg-deep); color: var(--text-main); height: 100vh; height: 100dvh; overflow: hidden; position: relative; }

          /* 科幻星云×极光弥散光背景层（GPU硬件加速，零重绘开销） */
          .ny-ambient-bg { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; transform: translateZ(0); }
          .ny-orb-1 { position: absolute; top: -18%; left: -12%; width: 68vw; height: 68vw; max-width: 560px; max-height: 560px; background: var(--orb-1); border-radius: 50%; filter: blur(12px); }
          .ny-orb-2 { position: absolute; bottom: -20%; right: -12%; width: 72vw; height: 72vw; max-width: 600px; max-height: 600px; background: var(--orb-2); border-radius: 50%; filter: blur(14px); }
          .ny-orb-3 { position: absolute; top: 36%; left: 32%; width: 45vw; height: 45vw; max-width: 380px; max-height: 380px; background: var(--orb-3); border-radius: 50%; filter: blur(18px); }

          #ny-app-root { position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column; overflow: hidden; }

          .ny-ico { width: 14px; height: 14px; stroke: currentColor; stroke-width: 1.85; stroke-linecap: round; stroke-linejoin: round; fill: none; flex-shrink: 0; }

          /* 顶部极简毛玻璃导航栏 */
          header { background: var(--glass-header); backdrop-filter: blur(20px) saturate(170%); -webkit-backdrop-filter: blur(20px) saturate(170%); padding: 9px 14px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--glass-border); flex-shrink: 0; gap: 8px; flex-wrap: wrap; box-shadow: 0 4px 24px rgba(0,0,0,0.35); }
          .logo-title { font-size: 13.5px; font-weight: 700; letter-spacing: 0.4px; color: var(--text-main); display: flex; align-items: center; gap: 7px; white-space: nowrap; }
          .logo-title .ny-ico { width: 17px; height: 17px; filter: drop-shadow(0 0 6px rgba(34,211,238,0.55)); }
          .logo-ver { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 999px; background: var(--pill-bg); border: 1px solid var(--pill-border); color: var(--text-highlight); }

          .header-right { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
          .btn-glass { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,255,255,0.05); color: var(--text-main); border: 1px solid var(--glass-border); border-radius: 999px; padding: 5px 11px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.18s ease; box-shadow: inset 0 1px 0 rgba(255,255,255,0.12); }
          .btn-glass:hover { border-color: var(--glass-border-strong); background: rgba(255,255,255,0.1); transform: translateY(-1px); }
          .btn-glass.primary { background: var(--accent-grad); color: #fff; border-color: rgba(255,255,255,0.28); box-shadow: 0 3px 14px rgba(99,102,241,0.38), inset 0 1px 0 rgba(255,255,255,0.28); }
          .btn-glass.on { background: rgba(6, 182, 212, 0.18); color: #67e8f9; border-color: rgba(34, 211, 238, 0.48); box-shadow: 0 0 12px rgba(6, 182, 212, 0.2); }
          .btn-glass.off { background: rgba(15, 23, 42, 0.55); color: #94a3b8; border-color: rgba(148, 163, 184, 0.2); }

          .btn-close { background: rgba(255,255,255,0.06); color: var(--text-sub); border: 1px solid var(--glass-border); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.18s ease; }
          .btn-close:hover { color: #fff; border-color: var(--glass-border-strong); background: rgba(244,63,94,0.25); }

          /* 二级极简胶囊标签栏 */
          .tab-box { display: flex; background: var(--glass-sub); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid var(--glass-border); padding: 6px 14px; gap: 6px; overflow-x: auto; flex-shrink: 0; align-items: center; scrollbar-width: none; }
          .tab-box::-webkit-scrollbar { display: none; }
          .tab-btn { display: inline-flex; align-items: center; gap: 5px; background: transparent; color: var(--text-sub); border: 1px solid transparent; padding: 5px 12px; border-radius: 999px; font-size: 11.5px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.18s ease; }
          .tab-btn:hover { color: var(--text-main); background: rgba(255,255,255,0.04); }
          .tab-btn.active { background: var(--pill-bg); color: var(--text-highlight); border-color: var(--pill-border); box-shadow: 0 0 14px rgba(56,189,248,0.16), inset 0 1px 0 rgba(255,255,255,0.12); }

          /* 极简搜索与快速补录栏 */
          .add-bar { background: var(--glass-sub); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); padding: 8px 14px; display: flex; gap: 7px; border-bottom: 1px solid var(--glass-border); flex-shrink: 0; align-items: center; flex-wrap: wrap; }
          .add-input { flex: 1; min-width: 150px; background: var(--glass-inset); border: 1px solid var(--glass-border); color: var(--text-main); padding: 7px 12px; border-radius: 999px; font-size: 12px; outline: none; transition: border-color 0.2s; }
          .add-input::placeholder { color: rgba(148, 163, 184, 0.65); }
          .add-input:focus { border-color: var(--accent-primary); box-shadow: 0 0 12px rgba(56,189,248,0.2); }

          /* 图包未绑定前缀悬浮胶囊栏 */
          .anchor-bar { background: rgba(8, 14, 32, 0.55); padding: 6px 14px; border-bottom: 1px solid var(--glass-border); display: none; align-items: center; gap: 6px; overflow-x: auto; flex-shrink: 0; font-size: 11px; color: var(--text-sub); scrollbar-width: none; }
          .anchor-pill { display: inline-flex; align-items: center; gap: 4px; background: var(--pill-bg); color: var(--text-highlight); border: 1px solid var(--pill-border); border-radius: 999px; padding: 3px 10px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: all 0.16s; }
          .anchor-pill:hover { border-color: var(--glass-border-strong); transform: translateY(-1px); }
          .anchor-pill.all { background: linear-gradient(135deg, rgba(124,58,237,0.32), rgba(6,182,212,0.32)); color: #fff; border-color: rgba(192,132,252,0.5); }

          /* 主内容滚动区 */
          .content-area { flex: 1; min-height: 0; padding: 12px 14px 20px; overflow-y: auto; -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; gap: 12px; }
          .content-area::-webkit-scrollbar { width: 5px; }
          .content-area::-webkit-scrollbar-thumb { background: rgba(129, 140, 248, 0.25); border-radius: 999px; }

          /* 梦幻透光毛玻璃卡片 */
          .profile-card { background: var(--glass-surface); backdrop-filter: blur(18px) saturate(165%); -webkit-backdrop-filter: blur(18px) saturate(165%); border: 1px solid var(--glass-border); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 10px; position: relative; flex-shrink: 0; box-shadow: 0 10px 30px -6px rgba(2, 6, 23, 0.65), inset 0 1px 0 0 rgba(255, 255, 255, 0.14); transition: border-color 0.2s, box-shadow 0.2s; }
          .profile-card.active-card { border-color: var(--glass-border-strong); box-shadow: 0 10px 34px -6px rgba(6, 182, 212, 0.20), inset 0 1px 0 0 rgba(255, 255, 255, 0.22); }

          .card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
          .char-name { font-size: 14.5px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 6px; cursor: pointer; flex-wrap: wrap; letter-spacing: 0.2px; }
          .char-name .ny-ico { color: var(--accent-primary); width: 15px; height: 15px; }

          .btn-group { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
          .btn-chip { display: inline-flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.045); color: var(--text-main); border: 1px solid var(--glass-border); font-size: 11px; font-weight: 500; padding: 4px 9px; border-radius: 999px; cursor: pointer; transition: all 0.16s ease; box-shadow: inset 0 1px 0 rgba(255,255,255,0.08); }
          .btn-chip .ny-ico { width: 12.5px; height: 12.5px; color: var(--accent-primary); }
          .btn-chip:hover { background: rgba(255,255,255,0.11); border-color: var(--glass-border-strong); transform: translateY(-1px); }
          .btn-chip.cyan { background: rgba(6, 182, 212, 0.14); border-color: rgba(34, 211, 238, 0.38); color: #a5f3fc; }
          .btn-chip.cyan .ny-ico { color: #22d3ee; }
          .btn-chip.violet { background: rgba(139, 92, 246, 0.16); border-color: rgba(167, 139, 250, 0.40); color: #ddd6fe; }
          .btn-chip.violet .ny-ico { color: #c084fc; }
          .btn-chip.active-wall { background: linear-gradient(135deg, rgba(6,182,212,0.32), rgba(139,92,246,0.32)); border-color: rgba(34,211,238,0.65); color: #fff; }
          .btn-chip.danger { color: #fda4af; border-color: rgba(244,63,94,0.28); background: rgba(244,63,94,0.08); padding: 4px 7px; }
          .btn-chip.danger .ny-ico { color: #fb7185; }

          /* 极光流光进度条 */
          .favor-meta { display: flex; justify-content: space-between; align-items: center; font-size: 12px; gap: 8px; }
          .favor-bar-bg { width: 100%; height: 6px; background: rgba(2, 6, 23, 0.65); border-radius: 999px; overflow: hidden; border: 1px solid rgba(255,255,255,0.07); }
          .favor-bar-fill { height: 100%; border-radius: 999px; background: var(--bar-grad); transition: width 0.35s cubic-bezier(0.22, 1, 0.36, 1); }

          /* 科幻双栏数据舱 */
          .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 7px; }
          .info-box { background: var(--glass-inset); border: 1px solid rgba(255,255,255,0.07); padding: 7px 10px; border-radius: 10px; font-size: 11px; color: var(--text-sub); display: flex; justify-content: space-between; align-items: center; gap: 6px; }
          .info-label { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
          .info-label .ny-ico { width: 12.5px; height: 12.5px; color: var(--accent-primary); opacity: 0.85; }
          .info-val { font-weight: 600; color: var(--text-main); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

          /* 八部位穿搭微透玻璃预览窗 */
          .wardrobe-preview { background: rgba(6, 11, 28, 0.46); border: 1px solid rgba(129, 140, 248, 0.16); border-radius: 12px; padding: 9px 11px; font-size: 11px; color: #e2e8f0; line-height: 1.6; }
          .wardrobe-preview.disabled { opacity: 0.4; }
          .wp-row { display: flex; gap: 6px; margin-bottom: 2px; }
          .wp-label { color: var(--text-highlight); font-weight: 600; flex-shrink: 0; }

          .tag-badge { display: inline-flex; align-items: center; gap: 3px; background: rgba(255,255,255,0.05); color: #cbd5e1; border: 1px solid var(--glass-border); border-radius: 999px; padding: 2px 8px; font-size: 10px; margin: 2px; }
          .tag-badge.highlight { background: var(--pill-bg); color: var(--text-highlight); border-color: var(--pill-border); }
          .tag-badge.cn-index { background: rgba(6, 182, 212, 0.14); color: #67e8f9; border-color: rgba(34, 211, 238, 0.35); }

          .preset-item-row { display: flex; justify-content: space-between; align-items: center; background: var(--glass-inset); border: 1px solid rgba(255,255,255,0.07); padding: 7px 11px; border-radius: 10px; font-size: 11.5px; gap: 8px; }
          .preset-item-row.off { opacity: 0.42; }

          /* 模态框毛玻璃升级 */
          .modal-mask { position: fixed; inset: 0; background: rgba(3, 6, 18, 0.72); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); z-index: 9999; display: none; align-items: center; justify-content: center; padding: 12px; }
          .modal-box { background: linear-gradient(145deg, rgba(16, 22, 48, 0.88), rgba(8, 14, 34, 0.92)); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1px solid var(--glass-border-strong); border-radius: 18px; width: 100%; max-width: 550px; max-height: 90dvh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.2); }
          .modal-head { padding: 12px 16px; background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center; font-size: 13.5px; font-weight: 700; color: var(--text-highlight); }
          .modal-body { padding: 14px 16px; overflow-y: auto; -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; gap: 9px; }
          .field-row { display: flex; flex-direction: column; gap: 4px; }
          .field-label { font-size: 11px; color: var(--text-sub); font-weight: 600; display: flex; justify-content: space-between; }
          .field-input { background: rgba(3, 7, 18, 0.68); border: 1px solid var(--glass-border); color: var(--text-main); padding: 7px 11px; border-radius: 9px; font-size: 12px; outline: none; width: 100%; transition: border-color 0.18s; }
          .field-input:focus { border-color: var(--accent-primary); box-shadow: 0 0 10px rgba(56,189,248,0.2); }
          .modal-foot { padding: 11px 16px; background: rgba(255,255,252,0.02); border-top: 1px solid var(--glass-border); display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
        </style>

        <div class="ny-ambient-bg">
          <div class="ny-orb-1"></div>
          <div class="ny-orb-2"></div>
          <div class="ny-orb-3"></div>
        </div>

        <div id="ny-app-root">
          <header>
            <div class="logo-title">
              ${ICONS.logo}
              <span>NAILYA · 奈亚</span>
              <span class="logo-ver">V6.2.1 极光星云</span>
            </div>
            <div class="header-right">
              <button class="btn-glass primary" id="btn-run-ai-analyze" title="结合图包人名锚点与世界书进行全卡AI识别">
                ${ICONS.sparkle}<span id="lbl-ai-analyze">AI 全卡识卡</span>
              </button>
              <button class="btn-glass" id="btn-theme-switch" title="切换梦幻蓝紫玻璃 / 极光青蓝科幻主题">
                ${ICONS.theme}<span>星云×极光</span>
              </button>
              <button class="btn-glass" id="btn-global-st-toggle">
                ${ICONS.book}<span id="lbl-st-toggle">酒馆预设:关</span>
              </button>
              <button class="btn-glass" id="btn-global-outfit-toggle">
                ${ICONS.hanger}<span id="lbl-outfit-toggle">穿搭:开</span>
              </button>
              <button class="btn-glass" id="btn-open-api-modal">
                ${ICONS.settings}<span>AI接口</span>
              </button>
              <button class="btn-glass" id="btn-inject-status" title="提示词注入状态：AI能否收到好感/视觉/时间指令。被拒时点此重新授权">
                ${ICONS.shield}<span id="lbl-inject">注入:?</span>
              </button>
              <button class="btn-close" id="btn-close-app" title="返回聊天">${ICONS.close}</button>
            </div>
          </header>

          <div class="tab-box">
            <button class="tab-btn" id="tab-mode-current">${ICONS.user}<span>当前对话</span></button>
            <button class="tab-btn" id="tab-mode-all">${ICONS.layers}<span>全部档案</span></button>
            <button class="tab-btn" id="tab-mode-preset">${ICONS.book}<span id="lbl-tab-preset">酒馆预设 (0)</span></button>
            <button class="tab-btn" id="tab-mode-assets">${ICONS.image}<span id="lbl-tab-assets">图包与索引 (0)</span></button>
            <button class="tab-btn" id="tab-mode-backup">${ICONS.shield}<span>备份与导出</span></button>
          </div>

          <div class="add-bar"
          id="bar-create-profile">
            <input type="text" class="add-input" id="input-char-name" placeholder="输入漏掉的角色名 / 外文名 / 图包前缀 (留空点AI补录则自动抓漏)..." value="" />
            <button class="btn-glass primary" id="btn-ai-supplement" title="仅切片发送未建档图包前缀与对应世界书让AI增量补录，省90% Token">${ICONS.sparkle}<span>AI精准补录</span></button>
            <button class="btn-glass" id="btn-create-profile">${ICONS.plus}<span>手动建档</span></button>
            <button class="btn-glass" id="btn-inherit-chat" title="从当前角色卡的其他对话复制好感度进度">${ICONS.copy}<span>继承旧对话</span></button>
          </div>

          <div class="anchor-bar" id="bar-unbound-prefixes"></div>
          <div class="content-area" id="profile-list"></div>
        </div>

        <!-- 弹窗1：八部位穿搭与角色属性编辑 -->
        <div class="modal-mask" id="wardrobe-modal">
          <div class="modal-box">
            <div class="modal-head">
              <span id="wm-title">角色属性与八部位穿搭编辑</span>
              <button class="btn-close" id="wm-close">${ICONS.close}</button>
            </div>
            <div class="modal-body" id="wm-body"></div>
            <div class="modal-foot" id="wm-foot"></div>
          </div>
        </div>

        <!-- 弹窗3：注入内容预览（只发给 AI，不显示在聊天窗口） -->
        <div class="modal-mask" id="inject-preview-modal">
          <div class="modal-box">
            <div class="modal-head">
              <span>实际注入内容预览（发给 AI 的原文）</span>
              <button class="btn-close" id="ip-close">${ICONS.close}</button>
            </div>
            <div class="modal-body">
              <div class="field-row">
                <label class="field-label">① 对话最顶部（游戏内时间 + 视觉强制令）</label>
                <textarea id="ip-top" class="field-input" style="height:150px; font-family:monospace; font-size:11px;" readonly></textarea>
              </div>
              <div class="field-row">
                <label class="field-label">② 尾部说明书（好感/生理/穿搭/里程碑，多条拼接）</label>
                <textarea id="ip-notes" class="field-input" style="height:190px; font-family:monospace; font-size:11px;" readonly></textarea>
              </div>
              <div style="font-size:11px; color:var(--text-sub); line-height:1.5;">这些内容只发给 AI，聊天窗口里看不到，属正常现象。若上面为空：需先完成 AI 识卡建档，且「注入」按钮显示 ✓正常。</div>
            </div>
          </div>
        </div>

        <!-- 弹窗2：双模 AI 接口配置 -->
        <div class="modal-mask" id="api-config-modal">
          <div class="modal-box">
            <div class="modal-head">
              <span>双模 AI 识别接口设置</span>
              <button class="btn-close" id="api-modal-close">${ICONS.close}</button>
            </div>
            <div class="modal-body">
              <div style="font-size:11px; color:var(--text-sub); line-height:1.6; background:var(--glass-inset); padding:9px 11px; border-radius:10px; border:1px solid var(--glass-border);">
                • <strong>防 404 自动补全：</strong>填写 <code>https://api.deepseek.com</code> 或完整路径均可自动补齐 <code>/chat/completions</code>。<br/>
                • DeepSeek 官方模型名请填：<code>deepseek-chat</code>
              </div>
              <div class="field-row">
                <label class="field-label">API 接口地址</label>
                <input type="text" class="field-input" id="cfg-api-url" placeholder="https://api.deepseek.com/chat/completions" />
              </div>
              <div class="field-row">
                <label class="field-label">API Key</label>
                <input type="password" class="field-input" id="cfg-api-key" placeholder="sk-..." />
              </div>
              <div class="field-row">
                <label class="field-label">模型名称 (Model)</label>
                <input type="text" class="field-input" id="cfg-api-model" placeholder="deepseek-chat / gpt-4o-mini / gemini-2.5-flash" />
              </div>
              <label style="display:flex; align-items:center; gap:7px; font-size:12px; color:var(--text-highlight); margin-top:4px; cursor:pointer;">
                <input type="checkbox" id="cfg-auto-main-model" />
                开启「借用当前聊天主模型自动分析」（未建档时随聊天自动识卡）
              </label>
              <label style="display:flex; align-items:center; gap:7px; font-size:12px; color:var(--text-main); margin-top:2px; cursor:pointer;">
                <input type="checkbox" id="cfg-detail-mode" />
                开启「丝袜光影与身材曲线核心法则精描」（取消勾选则为极简省流模式）
              </label>
            </div>
            <div class="modal-foot">
              <button class="btn-glass" id="api-modal-cancel">取消</button>
              <button class="btn-glass primary" id="api-modal-save">保存配置</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById('btn-close-app').onclick = async () => {
        await Risuai.hideContainer();
      };

      document.getElementById('btn-theme-switch').onclick = async () => {
        const order = ['nebula-aurora', 'nebula', 'aurora'];
        const cur = pluginConfig.uiTheme || 'nebula-aurora';
        const next = order[(order.indexOf(cur) + 1) % order.length];
        pluginConfig.uiTheme = next;
        applyThemeVariables(next);
        await saveStoredData(false, ['config']);
        showToast(`✨ 已切换视觉主题：${THEME_LABELS[next]}`);
      };

      document.getElementById('btn-run-ai-analyze').onclick = async () => {
        const lbl = document.getElementById('lbl-ai-analyze');
        const oldText = lbl.textContent;
        lbl.textContent = 'AI分析中...';
        try { await Risuai.requestPluginPermission('db'); } catch (_) {}
        const freshCtx = await getFastContext(true);
        const freshReport = await getCachedCardReport(freshCtx, true);
        activeCtxRef = freshCtx;
        activeReportRef = freshReport;
        const ok = await runIndependentAiAnalysis(freshCtx, freshReport);
        lbl.textContent = ok ? '重新AI分析' : oldText;
        if (ok) {
          syncTopHeaderStates(freshCtx, freshReport);
          renderUnboundPrefixBar(freshCtx, freshReport);
          renderMainArea(freshCtx, freshReport);
        }
      };

      document.getElementById('btn-ai-supplement').onclick = async () => {
        const hint = document.getElementById('input-char-name').value.trim();
        const btn = document.getElementById('btn-ai-supplement');
        const oldHtml = btn.innerHTML;
        btn.innerHTML = `${ICONS.refresh}<span>补录中...</span>`;
        const ok = await runTargetedAiSupplement(hint, activeCtxRef, activeReportRef, null);
        btn.innerHTML = oldHtml;
        if (ok) {
          document.getElementById('input-char-name').value = '';
          renderUnboundPrefixBar(activeCtxRef, activeReportRef);
          renderMainArea(activeCtxRef, activeReportRef);
        }
      };

      document.getElementById('btn-global-st-toggle').onclick = async () => {
        if (!pluginConfig.enableStPreset && Object.keys(stPresets).length === 0) {
          viewMode = 'preset';
          syncTopHeaderStates(activeCtxRef, activeReportRef);
          renderUnboundPrefixBar(activeCtxRef, activeReportRef);
          renderMainArea(activeCtxRef, activeReportRef);
          showToast('请先在「酒馆预设」页面导入 .json 预设文件');
          return;
        }
        pluginConfig.enableStPreset = !pluginConfig.enableStPreset;
        if (pluginConfig.enableStPreset && !pluginConfig.activeStPresetId) {
          pluginConfig.activeStPresetId = Object.keys(stPresets)[0] || '';
        }
        await saveStoredData(true, ['config']);
        syncTopHeaderStates(activeCtxRef, activeReportRef);
        showToast(pluginConfig.enableStPreset ? '已启用酒馆预设接管 RisuAI 预设' : '已关闭酒馆预设接管');
        if (viewMode === 'preset') renderMainArea(activeCtxRef, activeReportRef);
      };

      const apiModal = document.getElementById('api-config-modal');
      document.getElementById('btn-open-api-modal').onclick = () => {
        document.getElementById('cfg-api-url').value = pluginConfig.apiUrl || '';
        document.getElementById('cfg-api-key').value = pluginConfig.apiKey || '';
        document.getElementById('cfg-api-model').value = pluginConfig.apiModel || '';
        document.getElementById('cfg-auto-main-model').checked = Boolean(pluginConfig.autoMainModelAnalyze);
        document.getElementById('cfg-detail-mode').checked = pluginConfig.outfitDetailMode === 'detailed';
        apiModal.style.display = 'flex';
      };
      document.getElementById('api-modal-close').onclick = () => { apiModal.style.display = 'none'; };
      document.getElementById('api-modal-cancel').onclick = () => { apiModal.style.display = 'none'; };
      document.getElementById('api-modal-save').onclick = async () => {
        pluginConfig.apiUrl = normalizeApiEndpoint(document.getElementById('cfg-api-url').value);
        pluginConfig.apiKey = document.getElementById('cfg-api-key').value.trim();
        pluginConfig.apiModel = document.getElementById('cfg-api-model').value.trim() || 'deepseek-chat';
        pluginConfig.autoMainModelAnalyze = document.getElementById('cfg-auto-main-model').checked;
        pluginConfig.outfitDetailMode = document.getElementById('cfg-detail-mode').checked ? 'detailed' : 'compact';
        await saveStoredData(true, ['config']);
        apiModal.style.display = 'none';
        showToast(`已保存接口配置：${pluginConfig.apiModel}`);
      };

      document.getElementById('btn-inject-status').onclick = async () => {
        try {
          const ok = (await Risuai.requestPluginPermission('replacer')) !== false;
          runtimeCache.injectionDenied = !ok;
          showToast(ok ? '✅ 注入权限已授予，AI现在能收到好感/视觉/时间指令了' : '⛔ 仍被拒绝：请到 RisuAI 设置→插件管理 找到本插件检查权限开关，或删除插件后刷新页面重新导入并在弹窗时选择「允许」', 8000);
        } catch (_) {
          showToast('重新请求权限失败，请重启 RisuAI 后再试', 5000);
        }
        syncTopHeaderStates(activeCtxRef, activeReportRef);
      };

      const ipModalEl = document.getElementById('inject-preview-modal');
      const ipCloseBtn = document.getElementById('ip-close');
      if (ipCloseBtn) ipCloseBtn.onclick = () => { if (ipModalEl) ipModalEl.style.display = 'none'; };

      document.getElementById('btn-global-outfit-toggle').onclick = async () => {
        pluginConfig.enableOutfitPrompt = !pluginConfig.enableOutfitPrompt;
        await saveStoredData(true, ['config']);
        syncTopHeaderStates(activeCtxRef, activeReportRef);
        showToast(pluginConfig.enableOutfitPrompt ? '已开启穿搭与身材核心规则注入' : '已关闭穿搭注入');
        renderMainArea(activeCtxRef, activeReportRef);
      };

      const switchTab = (mode) => {
        viewMode = mode;
        syncTopHeaderStates(activeCtxRef, activeReportRef);
        renderUnboundPrefixBar(activeCtxRef, activeReportRef);
        renderMainArea(activeCtxRef, activeReportRef);
      };

      document.getElementById('tab-mode-current').onclick = () => switchTab('current');
      document.getElementById('tab-mode-all').onclick = () => switchTab('all');
      document.getElementById('tab-mode-preset').onclick = () => switchTab('preset');
      document.getElementById('tab-mode-assets').onclick = () => switchTab('assets');
      document.getElementById('tab-mode-backup').onclick = () => switchTab('backup');

      document.getElementById('btn-create-profile').onclick = async () => {
        const inputName = document.getElementById('input-char-name').value.trim();
        if (!inputName) {
          alert('请输入中文角色名，或直接点击「AI精准补录」让 AI 自动抓漏建档！');
          return;
        }
        const ctx = activeCtxRef;
        const assetReport = activeReportRef;
        if (!favorProfiles[ctx.key]) favorProfiles[ctx.key] = {};
        const slot = slotOf(ctx.chatIndex, inputName);
        const defaultPrefix = assetReport.knownCharTokens[0] || '';
        const newProf = {
          name: inputName,
          origName: inputName,
          relationshipTag: '手动建档',
          favor: 20,
          month: 1,
          day: 1,
          age: 18,
          cycleDay: 14,
          pregnancyStatus: '未孕',
          gestationDays: null,
          postpartumDays: null,
          pregnancyRisk: 0,
          physioNote: '',
          relationConfirmed: false,
          marriageConfirmed: false,
          assetPrefix: defaultPrefix,
          lockedOutfit: '',
          enableOutfit: true,
          wardrobeLocked: false,
          stature: '匀称曼妙',
          figure: '双峰饱满挺拔，纤腰柔韧，臀腿丰润紧致',
          personality: '细腻敏感、极具反差魅力',
          wardrobe: {
            styleLabel: '日常穿搭',
            top: '修身针织上衣（勾勒饱满胸线）',
            bottom: '高腰修身短裙（衬托修长双腿）',
            socks: '极薄蝉翼微透连裤丝袜（随大腿弧度呈现细腻明暗透肉渐变）',
            shoes: '漆皮浅口细高跟鞋（足背彻底净空）',
            earrings: '精致银耳坠',
            necklace: '细巧锁骨链',
            gloves: '无',
            garter: '蕾丝暗扣腿环（紧束于大腿根部软肉）'
          },
          aiCalibrated: true
        };
        favorProfiles[ctx.key][slot] = newProf;
        syncProfileBackToCardCache(ctx.key, newProf);
        await saveStoredData(true, ['profiles', 'aiCache']);
        showToast(`已创建 [${inputName}]，可点卡片上「重识别」补全设定`);
        renderUnboundPrefixBar(ctx, assetReport);
        renderMainArea(ctx, assetReport);
      };

      document.getElementById('btn-inherit-chat').onclick = async () => {
        const ctx = activeCtxRef;
        const assetReport = activeReportRef;
        const cardBox = favorProfiles[ctx.key] || {};
        const otherChatMap = new Map();
        for (const [sk, pf] of Object.entries(cardBox)) {
          const cIdx = chatNumOf(sk);
          if (cIdx !== String(ctx.chatIndex)) {
            if (!otherChatMap.has(cIdx)) otherChatMap.set(cIdx, []);
            otherChatMap.get(cIdx).push(pf);
          }
        }
        if (otherChatMap.size === 0) {
          if (cardAiCache[ctx.key]?.characters?.length > 0) {
            await applyAiAnalysisResultToChat(ctx, assetReport, cardAiCache[ctx.key], true);
            showToast('已从当前角色卡的 AI 全局缓存恢复设定');
            renderUnboundPrefixBar(ctx, assetReport);
            renderMainArea(ctx, assetReport);
          } else {
            alert('当前角色卡暂无其他对话的档案可供继承！');
          }
          return;
        }
        const descLines = Array.from(otherChatMap.entries()).map(([cIdx, pList]) => {
          return `对话 #${cIdx}: ` + pList.map(p => `${p.name}(好感${p.favor})`).join('、');
        }).join('\n');
        const targetChat = prompt(`请选择要继承的对话编号 (输入 # 后面的数字)：\n${descLines}`, Array.from(otherChatMap.keys())[0]);
        if (targetChat !== null && otherChatMap.has(targetChat.trim())) {
          const sourceList = otherChatMap.get(targetChat.trim());
          if (!favorProfiles[ctx.key]) favorProfiles[ctx.key] = {};
          sourceList.forEach(srcProf => {
            const copyProf = JSON.parse(JSON.stringify(srcProf));
            favorProfiles[ctx.key][slotOf(ctx.chatIndex, copyProf.name)] = copyProf;
          });
          await saveStoredData(true, ['profiles']);
          showToast(`已从对话 #${targetChat.trim()} 继承角色好感与穿搭进度`);
          renderUnboundPrefixBar(ctx, assetReport);
          renderMainArea(ctx, assetReport);
        }
      };

      appShellMounted = true;
    }

    function syncTopHeaderStates(ctx, assetReport) {
      applyThemeVariables(pluginConfig.uiTheme || 'nebula-aurora');
      const hasAiCache = Boolean(cardAiCache[ctx?.key]?.characters?.length);
      const presetCount = Object.keys(stPresets).length;

      const aiLbl = document.getElementById('lbl-ai-analyze');
      if (aiLbl) aiLbl.textContent = hasAiCache ? '重新AI分析' : '一键AI分析';

      const stBtn = document.getElementById('btn-global-st-toggle');
      const stLbl = document.getElementById('lbl-st-toggle');
      if (stBtn && stLbl) {
        stBtn.className = `btn-glass ${pluginConfig.enableStPreset ? 'on' : 'off'}`;
        stLbl.textContent = pluginConfig.enableStPreset ? '酒馆预设:接管中' : '酒馆预设:关闭';
      }

      const outBtn = document.getElementById('btn-global-outfit-toggle');
      const outLbl = document.getElementById('lbl-outfit-toggle');
      if (outBtn && outLbl) {
        outBtn.className = `btn-glass ${pluginConfig.enableOutfitPrompt ? 'on' : 'off'}`;
        outLbl.textContent = pluginConfig.enableOutfitPrompt ? '穿搭:开' : '穿搭:关';
      }

      const injBtn = document.getElementById('btn-inject-status');
      if (injBtn) {
        const denied = Boolean(runtimeCache.injectionDenied);
        injBtn.className = `btn-glass ${denied ? 'off' : 'on'}`;
        const injLbl = document.getElementById('lbl-inject');
        if (injLbl) injLbl.textContent = denied ? '注入:⛔未授权' : '注入:✓正常';
      }

      const tabPresetLbl = document.getElementById('lbl-tab-preset');
      if (tabPresetLbl) tabPresetLbl.textContent = `酒馆预设 (${presetCount})`;

      const tabAssetsLbl = document.getElementById('lbl-tab-assets');
      if (tabAssetsLbl) tabAssetsLbl.textContent = `图包与索引 (${assetReport?.assets?.length || 0})`;

      ['current', 'all', 'preset', 'assets', 'backup'].forEach(m => {
        const el = document.getElementById(`tab-mode-${m}`);
        if (el) el.classList.toggle('active', viewMode === m);
      });

      const addBar = document.getElementById('bar-create-profile');
      if (addBar) addBar.style.display = (viewMode === 'current' || viewMode === 'all') ? 'flex' : 'none';
    }

    async function openManagerUI() {
      await ensureStoredDataLoaded();
      const ctx = await getFastContext(true);
      const assetReport = await getCachedCardReport(ctx, false);

      if (profilesOfChat(ctx.key, ctx).length === 0 && cardAiCache[ctx.key]?.characters?.length > 0) {
        await applyAiAnalysisResultToChat(ctx, assetReport, cardAiCache[ctx.key], false);
      }

      activeCtxRef = ctx;
      activeReportRef = assetReport;

      ensureAppShellMounted();
      syncTopHeaderStates(ctx, assetReport);
      renderUnboundPrefixBar(ctx, assetReport);
      renderMainArea(ctx, assetReport);
      await Risuai.showContainer('fullscreen');
    }

    openManagerUIRef = openManagerUI;

    function renderUnboundPrefixBar(ctx, assetReport) {
      const bar = document.getElementById('bar-unbound-prefixes');
      if (!bar) return;
      if (viewMode !== 'current' && viewMode !== 'all') {
        bar.style.display = 'none';
        return;
      }

      const currentList = profilesOfChat(ctx.key, ctx);
      const usedPrefixes = new Set(currentList.map(([, p]) => String(p.assetPrefix || '').toLowerCase()).filter(Boolean));
      const unbound = (assetReport.knownCharTokens || []).filter(tk => !usedPrefixes.has(tk) && tk !== 'main');

      if (unbound.length === 0) {
        bar.style.display = 'none';
        return;
      }

      bar.style.display = 'flex';
      bar.innerHTML = `<span style="flex-shrink:0;color:var(--text-highlight);display:inline-flex;align-items:center;gap:4px;">${ICONS.image}未建档图包前缀 (${unbound.length})：</span>`;

      if (unbound.length > 1) {
        const allBtn = document.createElement('button');
        allBtn.className = 'anchor-pill all';
        allBtn.innerHTML = `${ICONS.sparkle}<span>一键补录全部 (${unbound.length}人)</span>`;
        allBtn.onclick = async () => {
          const ok = await runTargetedAiSupplement('', ctx, assetReport, null);
          if (ok) {
            renderUnboundPrefixBar(ctx, assetReport);
            renderMainArea(ctx, assetReport);
          }
        };
        bar.appendChild(allBtn);
      }

      unbound.forEach(tk => {
        const g = assetReport.byCharToken[tk];
        const pill = document.createElement('button');
        pill.className = 'anchor-pill';
        pill.innerHTML = `${ICONS.plus}<span>${g.displayToken} (${g.assets.length}张)</span>`;
        pill.title = `以图包前缀 "${g.displayToken}" 为锚点，从世界书中精准补录该角色`;
        pill.onclick = async () => {
          document.getElementById('input-char-name').value = g.displayToken;
          const ok = await runTargetedAiSupplement(g.displayToken, ctx, assetReport, null);
          if (ok) {
            document.getElementById('input-char-name').value = '';
            renderUnboundPrefixBar(ctx, assetReport);
            renderMainArea(ctx, assetReport);
          }
        };
        bar.appendChild(pill);
      });
    }

    function openWardrobeModal(prof, ctx, assetReport) {
      const modal = document.getElementById('wardrobe-modal');
      const body = document.getElementById('wm-body');
      const foot = document.getElementById('wm-foot');
      document.getElementById('wm-title').innerHTML = `${ICONS.hanger} [${prof.name}] 属性与八部位穿搭编辑`;

      const w = prof.wardrobe || {};

      body.innerHTML = `
        <div class="info-grid">
          <div class="field-row">
            <label class="field-label">中文角色名 (用于对话与状态栏)</label>
            <input type="text" class="field-input" id="wm-cn-name" value="${prof.name || ''}" />
          </div>
          <div class="field-row">
            <label class="field-label">原卡名 / 图包锚点名</label>
            <input type="text" class="field-input" id="wm-orig-name" value="${prof.origName || ''}" />
          </div>
        </div>

        <div class="info-grid">
          <div class="field-row">
            <label class="field-label">角色性格定位</label>
            <input type="text" class="field-input" id="wm-personality" value="${prof.personality || ''}" />
          </div>
          <div class="field-row">
            <label class="field-label">身高与体态</label>
            <input type="text" class="field-input" id="wm-stature" value="${prof.stature || '匀称曼妙'}" />
          </div>
        </div>

        <div class="field-row">
          <label class="field-label">罩杯三围、胸腰臀腿曲线与生理特征</label>
          <input type="text" class="field-input" id="wm-figure" value="${prof.figure || ''}" />
        </div>

        <div class="field-row">
          <label class="field-label">1. 上衣 (Top)</label>
          <input type="text" class="field-input" id="wm-top" value="${w.top || ''}" />
        </div>
        <div class="field-row">
          <label class="field-label">2. 裤子 / 裙子 (Bottom)</label>
          <input type="text" class="field-input" id="wm-bottom" value="${w.bottom || ''}" />
        </div>
        <div class="field-row">
          <label class="field-label">3. 袜子 / 丝袜 (透肉光泽渐变与袜口勒肉细节)</label>
          <input type="text" class="field-input" id="wm-socks" value="${w.socks || ''}" />
        </div>
        <div class="field-row">
          <label class="field-label">4. 鞋子 / 高跟鞋 (浅口足背净空设计)</label>
          <input type="text" class="field-input" id="wm-shoes" value="${w.shoes || ''}" />
        </div>
        <div class="info-grid">
          <div class="field-row">
            <label class="field-label">5. 耳环 (Earrings)</label>
            <input type="text" class="field-input" id="wm-earrings" value="${w.earrings || ''}" />
          </div>
          <div class="field-row">
            <label class="field-label">6. 项链 (Necklace)</label>
            <input type="text" class="field-input" id="wm-necklace" value="${w.necklace || ''}" />
          </div>
        </div>
        <div class="info-grid">
          <div class="field-row">
            <label class="field-label">7. 手套 (Gloves)</label>
            <input type="text" class="field-input" id="wm-gloves" value="${w.gloves || ''}" />
          </div>
          <div class="field-row">
            <label class="field-label">8. 腿环 (Garter)</label>
            <input type="text" class="field-input" id="wm-garter" value="${w.garter || ''}" />
          </div>
        </div>

        <label style="display:flex; align-items:center; gap:7px; font-size:11.5px; color:var(--text-highlight); margin-top:4px; cursor:pointer;">
          <input type="checkbox" id="wm-lock-wardrobe" ${prof.wardrobeLocked ? 'checked' : ''} />
          锁定固定穿搭（勾选后不随立绘服装标签自动提示换装）
        </label>
      `;

      foot.innerHTML = `
        <button class="btn-glass" id="wm-cancel">取消</button>
        <button class="btn-glass primary" id="wm-save">保存并同步至全卡默认</button>
      `;

      document.getElementById('wm-close').onclick = () => { modal.style.display = 'none'; };
      document.getElementById('wm-cancel').onclick = () => { modal.style.display = 'none'; };

      document.getElementById('wm-save').onclick = async () => {
        const newCnName = document.getElementById('wm-cn-name').value.trim() || prof.name;
        prof.name = newCnName;
        prof.origName = document.getElementById('wm-orig-name').value.trim() || newCnName;
        prof.personality = document.getElementById('wm-personality').value.trim();
        prof.stature = document.getElementById('wm-stature').value.trim();
        prof.figure = document.getElementById('wm-figure').value.trim();
        prof.wardrobeLocked = document.getElementById('wm-lock-wardrobe').checked;

        prof.wardrobe = {
          styleLabel: prof.wardrobe?.styleLabel || '定制穿搭',
          top: document.getElementById('wm-top').value.trim(),
          bottom: document.getElementById('wm-bottom').value.trim(),
          socks: document.getElementById('wm-socks').value.trim(),
          shoes: document.getElementById('wm-shoes').value.trim(),
          earrings: document.getElementById('wm-earrings').value.trim(),
          necklace: document.getElementById('wm-necklace').value.trim(),
          gloves: document.getElementById('wm-gloves').value.trim(),
          garter: document.getElementById('wm-garter').value.trim()
        };
        syncProfileBackToCardCache(ctx.key, prof);
        await saveStoredData(true, ['profiles', 'aiCache']);
        invalidateAssetCache(ctx.key);
        modal.style.display = 'none';
        showToast('已保存并同步为该角色卡所有新对话的默认穿搭');
        renderMainArea(ctx, assetReport);
      };

      modal.style.display = 'flex';
    }

    function renderMainArea(ctx, assetReport) {
      const container = document.getElementById('profile-list');
      if (!container) return;
      container.innerHTML = '';

      if (viewMode === 'preset') {
        renderPresetManager(container, ctx, assetReport);
        return;
      }
      if (viewMode === 'assets') {
        renderAssetInspector(container, ctx, assetReport);
        return;
      }
      if (viewMode === 'backup') {
        renderBackupManager(container, ctx, assetReport);
        return;
      }

      const frag = document.createDocumentFragment();

      if (viewMode === 'current') {
        const list = profilesOfChat(ctx.key, ctx);
        if (!list.length) {
          const detectedTokenStr = assetReport.knownCharTokens.join(' · ') || '无';
          container.innerHTML = `
            <div class="profile-card" style="text-align:center; padding:28px 18px; line-height:1.95; font-size:12px; color:var(--text-sub);">
              <div style="font-size:14px; font-weight:700; color:var(--text-main); margin-bottom:4px;">当前角色卡 [${ctx.charName || '未知'}] 尚未建立 AI 档案</div>
              <div>图包已识别人名前缀锚点：<strong style="color:var(--text-highlight);">${detectedTokenStr}</strong></div>
              <div style="margin-top:6px;">点击顶部 <strong>[一键AI分析]</strong>，即可结合图包人名前缀与世界书生成全部中文档案与图片触发词索引；也可点击上方胶囊或 <strong>[AI精准补录]</strong> 单独抓漏。</div>
            </div>
          `;
          return;
        }
        list.forEach(([slot, prof]) => {
          frag.appendChild(createProfileCardNode(ctx.key, slot, prof, true, ctx, assetReport));
        });
        container.appendChild(frag);
      } else {
        const keys = Object.keys(favorProfiles);
        let count = 0;
        keys.forEach(k => {
          const chats = favorProfiles[k];
          Object.keys(chats).forEach(slotKey => {
            count++;
            const isCurr = (k === ctx.key && chatNumOf(slotKey) === String(ctx.chatIndex));
            const prof = chats[slotKey];
            frag.appendChild(createProfileCardNode(k, slotKey, prof, isCurr, ctx, assetReport));
          });
        });

        if (count === 0) {
          container.innerHTML = `<div class="profile-card" style="color:var(--text-sub); text-align:center; padding:36px 0; font-size:12px;">暂无任何角色卡档案</div>`;
        } else {
          container.appendChild(frag);
        }
      }
    }

    function createProfileCardNode(key, slotKey, prof, isCurrent, ctx, assetReport) {
      const stageInfo = getFavorStage(prof.favor);
      const percent = Math.min(100, (prof.favor / 200) * 100);
      const cyclePhase = getCyclePhase(prof.cycleDay);
      const targetName = prof.name || '未命名';

      const rawPrefix = String(prof.assetPrefix || '').toLowerCase();
      const boundPrefix = (rawPrefix && assetReport.byCharToken[rawPrefix])
        ? rawPrefix
        : (assetReport.knownCharTokens.length === 1 ? assetReport.knownCharTokens[0] : '');
      const boundGroup = boundPrefix ? assetReport.byCharToken[boundPrefix] : null;
      const boundAssetCount = boundGroup ? boundGroup.assets.length : 0;

      const w = prof.wardrobe || {};
      const outfitActive = pluginConfig.enableOutfitPrompt && prof.enableOutfit !== false;

      const card = document.createElement('div');
      card.className = `profile-card ${isCurrent ? 'active-card' : ''}`;

      card.innerHTML = `
        <div class="card-header">
          <span class="char-name" title="点击复制中文角色名并返回聊天">
            ${ICONS.user}
            <span>${targetName}</span>
            ${prof.origName && prof.origName !== targetName ? `<small style="color:var(--text-sub);font-weight:400;font-size:11.5px;">(${prof.origName})</small>` : ''}
            <span class="tag-badge highlight">${prof.relationshipTag || stageInfo.title}</span>
            <span style="font-size:10.5px; color:var(--text-sub); font-weight:400;">#${chatNumOf(slotKey)}</span>
          </span>
          <div class="btn-group">
            <button class="btn-chip cyan btn-copy-back" title="复制中文名并返回聊天">${ICONS.copy}<span>复制名</span></button>
            <button class="btn-chip violet btn-reidentify" title="仅针对该角色重新调用AI读取世界书更新设定">${ICONS.refresh}<span>重识别</span></button>
            <button class="btn-chip violet btn-outfit">${ICONS.hanger}<span>穿搭与体态</span></button>
            <button class="btn-chip btn-toggle-char-outfit">${ICONS.sparkle}<span>${prof.enableOutfit !== false ? '注入:开' : '注入:关'}</span></button>
            <button class="btn-chip btn-bind-img">${ICONS.image}<span>${boundGroup ? boundGroup.displayToken : '绑定图包'}</span></button>
            <button class="btn-chip btn-edit-favor">${ICONS.edit}<span>好感/年龄</span></button>
            <button class="btn-chip btn-edit-physio">${ICONS.pulse}<span>生理</span></button>
            <button class="btn-chip btn-confirm-rel ${prof.relationConfirmed ? 'active-wall' : ''}">${ICONS.heart}<span>${prof.relationConfirmed ? '已告白' : '告白墙'}</span></button>
            <button class="btn-chip btn-confirm-mar ${prof.marriageConfirmed ? 'active-wall' : ''}">${ICONS.crown}<span>${prof.marriageConfirmed ? '已结婚' : '婚姻墙'}</span></button>
            <button class="btn-chip danger btn-del" title="删除档案">${ICONS.trash}</button>
          </div>
        </div>

        <div class="favor-meta">
          <span style="color:${stageInfo.color}; font-weight:700; display:inline-flex; align-items:center; gap:5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${ICONS.heart}<span>${stageInfo.title} (Stage ${stageInfo.stage}/5) · ${prof.personality || ''}</span>
          </span>
          <span style="color:var(--text-highlight); font-weight:700; font-family:monospace; font-size:12.5px; flex-shrink:0;">${prof.favor} / 200</span>
        </div>

        <div class="favor-bar-bg">
          <div class="favor-bar-fill" style="width: ${percent}%; box-shadow: 0 0 12px ${stageInfo.glow};"></div>
        </div>

        <div class="info-grid">
          <div class="info-box">
            <span class="info-label">${ICONS.calendar}<span>日期与芳龄</span></span>
            <span class="info-val">${prof.month}月${prof.day}日 · ${prof.age || 18}岁</span>
          </div>
          <div class="info-box">
            <span class="info-label">${ICONS.hanger}<span>身段与风格</span></span>
            <span class="info-val" style="color:var(--text-highlight);">${prof.stature || '匀称'} · ${w.styleLabel || 'AI定制'}</span>
          </div>
          <div class="info-box">
            <span class="info-label">${ICONS.pulse}<span>生理周期</span></span>
            <span class="info-val" style="color:${cyclePhase.color}">${prof.pregnancyStatus === '已孕' ? `已孕 (${prof.gestationDays || 0}天)` : `${cyclePhase.name} (D${prof.cycleDay || 1}·风险${prof.pregnancyRisk || 0}%)`}${prof.physioNote ? ` · ${prof.physioNote}` : ''}</span>
          </div>
          <div class="info-box">
            <span class="info-label">${ICONS.image}<span>立绘锚点</span></span>
            <span class="info-val" style="color:#c084fc">${boundGroup ? `${boundGroup.displayToken} (${boundAssetCount}张)` : '未绑定'} · ${prof.lockedOutfit || '智能换装'}</span>
          </div>
        </div>

        <div class="wardrobe-preview ${outfitActive ? '' : 'disabled'}">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px; color:var(--text-sub); font-size:10.5px;">
            <span><strong>身材曲线：</strong>${prof.figure || '曼妙曲线'}</span>
            <span style="color:var(--text-highlight);">${prof.wardrobeLocked ? '已锁定常驻' : '随剧情动态换装'}</span>
          </div>
          <div class="wp-row"><span class="wp-label">[上衣/裤裙]</span><span>${w.top || ''} ｜ ${w.bottom || ''}</span></div>
          <div class="wp-row"><span class="wp-label">[丝袜/高跟]</span><span>${w.socks || ''} ｜ ${w.shoes || ''}</span></div>
          <div class="wp-row"><span class="wp-label">[精致配饰]</span><span>${w.earrings || ''} ｜ ${w.necklace || ''} ｜ ${w.gloves || ''} ｜ ${w.garter || ''}</span></div>
        </div>
      `;

      const handleCopyAndReturn = async () => {
        const ok = copyTextMobileSafe(targetName);
        if (!ok) {
          prompt('请长按复制角色名：', targetName);
        } else {
          showToast(`已复制「${targetName}」`);
        }
        setTimeout(async () => {
          await Risuai.hideContainer();
        }, 200);
      };

      card.querySelector('.btn-copy-back').onclick = handleCopyAndReturn;
      card.querySelector('.char-name').onclick = handleCopyAndReturn;

      card.querySelector('.btn-reidentify').onclick = async (e) => {
        const btn = e.currentTarget;
        const oldHtml = btn.innerHTML;
        btn.innerHTML = `${ICONS.refresh}<span>识别中...</span>`;
        const queryKey = prof.origName || prof.assetPrefix || prof.name;
        const ok = await runTargetedAiSupplement(queryKey, ctx, assetReport, slotKey);
        btn.innerHTML = oldHtml;
        if (ok) {
          renderUnboundPrefixBar(ctx, assetReport);
          renderMainArea(ctx, assetReport);
        }
      };

      card.querySelector('.btn-outfit').onclick = () => {
        openWardrobeModal(prof, ctx, assetReport);
      };

      card.querySelector('.btn-toggle-char-outfit').onclick = async () => {
        prof.enableOutfit = prof.enableOutfit === false ? true : false;
        await saveStoredData(true, ['profiles']);
        showToast(prof.enableOutfit ? `已开启 [${prof.name}] 穿搭注入` : `已关闭 [${prof.name}] 穿搭注入`);
        renderMainArea(ctx, assetReport);
      };

      card.querySelector('.btn-bind-img').onclick = async () => {
        const availablePrefixes = assetReport.knownCharTokens;
        if (!availablePrefixes.length) {
          alert('当前角色卡与模块中未检测到图片资源！');
          return;
        }
        const prefixDesc = availablePrefixes.map((tk, idx) => {
          const g = assetReport.byCharToken[tk];
          return `${idx + 1}. ${g.displayToken} (共${g.assets.length}张)`;
        }).join('\n');

        const input = prompt(
          `为角色 [${prof.name}] 绑定图片首词前缀:\n${prefixDesc}\n\n请输入序号(1-${availablePrefixes.length})或前缀名 (可用"前缀:服装"锁定服装):`,
          prof.assetPrefix ? `${prof.assetPrefix}${prof.lockedOutfit ? ':' + prof.lockedOutfit : ''}` : availablePrefixes[0]
        );
        if (input !== null) {
          const [rawPref, rawOutfit] = input.trim().split(/[:：]/);
          const idx = parseInt(rawPref, 10);
          if (!isNaN(idx) && idx >= 1 && idx <= availablePrefixes.length) {
            prof.assetPrefix = availablePrefixes[idx - 1];
          } else if (rawPref) {
            prof.assetPrefix = rawPref.trim().toLowerCase();
          }
          prof.lockedOutfit = (rawOutfit || '').trim().toLowerCase();
          syncProfileBackToCardCache(key, prof);
          await saveStoredData(true, ['profiles', 'aiCache']);
          invalidateAssetCache(key);
          renderUnboundPrefixBar(ctx, assetReport);
          renderMainArea(ctx, assetReport);
        }
      };

      const relBtn = card.querySelector('.btn-confirm-rel');
      relBtn.onclick = async () => {
        if (prof.relationConfirmed) return;
        if (!armOnceConfirm(relBtn)) return; // 第一次点击进入待确认态，再点一次才生效
        prof.relationConfirmed = true;
        if (prof.favor <= 50) prof.favor = 51;
        if (prof.relationshipTag && !/恋|夫妻|婚|爱人/.test(prof.relationshipTag)) prof.relationshipTag = '恋人(已告白)';
        syncProfileBackToCardCache(key, prof);
        await saveStoredData(true, ['profiles', 'aiCache']);
        showToast(`💞 [${prof.name}] 告白已确认，好感墙(50)已解除`);
        renderMainArea(ctx, assetReport);
      };

      const marBtn = card.querySelector('.btn-confirm-mar');
      marBtn.onclick = async () => {
        if (prof.marriageConfirmed) return;
        if (!armOnceConfirm(marBtn)) return;
        prof.relationConfirmed = true;
        prof.marriageConfirmed = true;
        if (prof.favor <= 80) prof.favor = 81;
        if (prof.relationshipTag && !/夫妻|婚|爱人/.test(prof.relationshipTag)) prof.relationshipTag = '夫妻(已婚)';
        syncProfileBackToCardCache(key, prof);
        await saveStoredData(true, ['profiles', 'aiCache']);
        showToast(`💍 [${prof.name}] 婚姻已确认，好感墙(80)已解除`);
        renderMainArea(ctx, assetReport);
      };

      card.querySelector('.btn-edit-favor').onclick = async () => {
        const input = prompt(
          `修改 [${prof.name}] 的好感度、年龄、关系定位与日期\n格式：好感度,年龄,关系标签,月,日 (例如 140,16,女儿(至亲家人),3,15)：`,
          `${prof.favor},${prof.age || 18},${prof.relationshipTag || ''},${prof.month || 1},${prof.day || 1}`
        );
        if (input !== null) {
          const parts = input.split(/[,，]/).map(s => s.trim());
          const favNum = parseInt(parts[0], 10);
          const ageNum = parseInt(parts[1], 10);
          const mNum = parseInt(parts[3], 10);
          const dNum = parseInt(parts[4], 10);
          if (!isNaN(favNum) && favNum >= 0 && favNum <= 200) {
            prof.favor = favNum;
            prof.relationConfirmed = favNum > 50;
            prof.marriageConfirmed = favNum > 80;
          }
          if (!isNaN(ageNum) && ageNum >= 8 && ageNum <= 99) prof.age = ageNum;
          if (parts[2]) prof.relationshipTag = parts[2];
          if (!isNaN(mNum) && mNum >= 1 && mNum <= 12) prof.month = mNum;
          if (!isNaN(dNum) && dNum >= 1 && dNum <= 30) prof.day = dNum;

          syncProfileBackToCardCache(key, prof);
          await saveStoredData(true, ['profiles', 'aiCache']);
          renderMainArea(ctx, assetReport);
        }
      };

      card.querySelector('.btn-edit-physio').onclick = async () => {
        const choice = prompt(`修改 [${prof.name}] 生理状态:\n1: 更改周期天数(1-28)\n2: 设为已孕\n3: 设为未孕\n4: 更改受孕概率(0-100)\n5: 修改生理补充备注(${prof.physioNote || '无'})\n6: 手动推进N天时间`);
        if (choice === '1') {
          const day = parseInt(prompt('输入生理周期天数(1-28):', prof.cycleDay || 14), 10);
          if (day >= 1 && day <= 28) {
            prof.cycleDay = day;
            prof.pregnancyStatus = '未孕';
          }
        } else if (choice === '2') {
          const gDays = parseInt(prompt('输入当前怀孕天数(0-300):', prof.gestationDays || 30), 10);
          prof.pregnancyStatus = '已孕';
          prof.gestationDays = isNaN(gDays) ? 30 : gDays;
        } else if (choice === '3') {
          prof.pregnancyStatus = '未孕';
          prof.gestationDays = null;
        } else if (choice === '4') {
          const risk = parseFloat(prompt('输入风险百分比(0-100):', prof.pregnancyRisk || 0));
          if (!isNaN(risk) && risk >= 0 && risk <= 100) {
            prof.pregnancyRisk = risk;
          }
        } else if (choice === '5') {
          const note = prompt('输入生理补充说明(如：处女/易孕体质/育有一子):', prof.physioNote || '');
          if (note !== null) prof.physioNote = note.trim();
        } else if (choice === '6') {
          const addD = parseInt(prompt('请输入要推进的天数(1-300):', '1'), 10);
          if (!isNaN(addD) && addD > 0) {
            prof.day += addD;
            while (prof.day > 30) { prof.day -= 30; prof.month = (prof.month % 12) + 1; }
            updatePhysiology(prof, addD, '');
          }
        }
        syncProfileBackToCardCache(key, prof);
        await saveStoredData(true, ['profiles', 'aiCache']);
        renderMainArea(ctx, assetReport);
      };

      const delBtn = card.querySelector('.btn-del');
      delBtn.onclick = async () => {
        if (!armOnceConfirm(delBtn)) return;
        delete favorProfiles[key][slotKey];
        if (Object.keys(favorProfiles[key]).length === 0) {
          delete favorProfiles[key];
        }
        await saveStoredData(true, ['profiles']);
        renderUnboundPrefixBar(ctx, assetReport);
        renderMainArea(ctx, assetReport);
      };

      return card;
    }

    function renderPresetManager(container, ctx, assetReport) {
      const presetIds = Object.keys(stPresets);
      if (!pluginConfig.activeStPresetId && presetIds.length > 0) {
        pluginConfig.activeStPresetId = presetIds[0];
      }
      const activePreset = stPresets[pluginConfig.activeStPresetId] || null;

      const topCard = document.createElement('div');
      topCard.className = 'profile-card';
      const optionsHtml = presetIds.length > 0
        ? presetIds.map(id => `<option value="${id}" ${id === pluginConfig.activeStPresetId ? 'selected' : ''}>${stPresets[id].name}</option>`).join('')
        : `<option value="">-- 尚未导入任何酒馆预设 --</option>`;

      topCard.innerHTML = `
        <div class="card-header">
          <span class="char-name">${ICONS.book}<span>SillyTavern (酒馆) 预设接管中心</span></span>
          <div class="btn-group">
            <button class="btn-chip cyan" id="btn-st-upload-file">${ICONS.upload}<span>导入 .json 预设</span></button>
            <button class="btn-chip" id="btn-st-paste-json">${ICONS.copy}<span>粘贴 JSON 导入</span></button>
            <input type="file" id="st-file-input" accept=".json,application/json" style="display:none;" />
          </div>
        </div>
        <div style="font-size:11px; color:var(--text-sub); line-height:1.6;">
          开启接管后，插件会将<strong>当前下拉框选中的酒馆预设</strong>（提示词顺序与深度注入规则）发送给 API，替代 RisuAI 原生预设。
        </div>
        <div style="display:flex; gap:7px; align-items:center; flex-wrap:wrap; margin-top:4px;">
          <select id="st-preset-select" class="field-input" style="flex:1; min-width:160px;">${optionsHtml}</select>
          <button class="btn-chip violet" id="btn-st-fold-mode">${ICONS.sparkle}<span>思维链:${pluginConfig.foldThinkingBlock === 'fold' ? '折叠' : (pluginConfig.foldThinkingBlock === 'strip' ? '隐藏' : '保留')}</span></button>
          ${activePreset ? `<button class="btn-chip danger" id="btn-st-delete" title="删除当前预设">${ICONS.trash}</button>` : ''}
        </div>
      `;

      const fileInput = topCard.querySelector('#st-file-input');
      topCard.querySelector('#btn-st-upload-file').onclick = () => fileInput.click();
      fileInput.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const parsed = parseSillyTavernPresetJson(text, file.name);
          stPresets[parsed.id] = parsed;
          pluginConfig.activeStPresetId = parsed.id;
          pluginConfig.enableStPreset = true;
          await saveStoredData(true, ['stPresets', 'config']);
          syncTopHeaderStates(ctx, assetReport);
          showToast(`已导入并激活酒馆预设「${parsed.name}」`);
          renderMainArea(ctx, assetReport);
        } catch (err) {
          alert(`导入酒馆预设失败：${err.message}`);
        }
      };

      topCard.querySelector('#btn-st-paste-json').onclick = async () => {
        const name = prompt('请输入预设名称：', '自定义酒馆预设');
        if (!name) return;
        const raw = prompt('请粘贴酒馆导出的 .json 预设全文：');
        if (!raw) return;
        try {
          const parsed = parseSillyTavernPresetJson(raw, name);
          stPresets[parsed.id] = parsed;
          pluginConfig.activeStPresetId = parsed.id;
          pluginConfig.enableStPreset = true;
          await saveStoredData(true, ['stPresets', 'config']);
          syncTopHeaderStates(ctx, assetReport);
          showToast(`已导入酒馆预设「${parsed.name}」`);
          renderMainArea(ctx, assetReport);
        } catch (err) {
          alert(`解析失败：${err.message}`);
        }
      };

      topCard.querySelector('#st-preset-select').onchange = async (e) => {
        pluginConfig.activeStPresetId = e.target.value;
        await saveStoredData(true, ['config']);
        renderMainArea(ctx, assetReport);
      };

      topCard.querySelector('#btn-st-fold-mode').onclick = async () => {
        const modes = ['fold', 'strip', 'keep'];
        const next = modes[(modes.indexOf(pluginConfig.foldThinkingBlock || 'fold') + 1) % modes.length];
        pluginConfig.foldThinkingBlock = next;
        await saveStoredData(true, ['config']);
        showToast(next === 'fold' ? '已设为：自动折叠思考过程' : (next === 'strip' ? '已设为：彻底隐藏思考过程' : '已设为：保留原始思考过程'));
        renderMainArea(ctx, assetReport);
      };

      const delBtn = topCard.querySelector('#btn-st-delete');
      if (delBtn && activePreset) {
        delBtn.onclick = async () => {
          if (!armOnceConfirm(delBtn)) return;
          delete stPresets[activePreset.id];
          pluginConfig.activeStPresetId = Object.keys(stPresets)[0] || '';
          if (!pluginConfig.activeStPresetId) pluginConfig.enableStPreset = false;
          await saveStoredData(true, ['stPresets', 'config']);
          syncTopHeaderStates(ctx, assetReport);
          renderMainArea(ctx, assetReport);
        };
      }

      container.appendChild(topCard);
      if (!activePreset) return;

      const listCard = document.createElement('div');
      listCard.className = 'profile-card';
      listCard.innerHTML = `
        <div class="card-header">
          <span class="char-name">${ICONS.layers}<span>预设条目顺序与开关 (${activePreset.order.length} 项)</span></span>
        </div>
        <div id="st-order-list" style="display:flex; flex-direction:column; gap:6px;"></div>
      `;

      const orderBox = listCard.querySelector('#st-order-list');
      const rowFrag = document.createDocumentFragment();
      activePreset.order.forEach((item, idx) => {
        const p = activePreset.prompts[item.identifier];
        if (!p) return;
        const isEnabled = Boolean(item.enabled && p.enabled !== false);
        const row = document.createElement('div');
        row.className = `preset-item-row ${isEnabled ? '' : 'off'}`;
        const posLabel = p.marker ? '内置占位槽' : (p.injection_position === 1 ? `深度 D${p.injection_depth}` : p.role);

        row.innerHTML = `
          <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            <strong>${idx + 1}. ${p.name}</strong>
            <span class="tag-badge">${posLabel}</span>
          </div>
          <div class="btn-group" style="flex-shrink:0;">
            ${!p.marker ? `<button class="btn-chip btn-edit-st-prompt">${ICONS.edit}<span>编辑</span></button>` : ''}
            <button class="btn-chip ${isEnabled ? 'cyan' : ''} btn-toggle-st-prompt">${isEnabled ? '已启用' : '已禁用'}</button>
          </div>
        `;

        row.querySelector('.btn-toggle-st-prompt').onclick = async () => {
          item.enabled = !isEnabled;
          p.enabled = item.enabled;
          await saveStoredData(true, ['stPresets']);
          renderMainArea(ctx, assetReport);
        };

        const editBtn = row.querySelector('.btn-edit-st-prompt');
        if (editBtn) {
          editBtn.onclick = async () => {
            const updated = prompt(`编辑条目 [${p.name}] 的提示词内容：`, p.content);
            if (updated !== null) {
              p.content = updated;
              await saveStoredData(true, ['stPresets']);
              showToast(`已更新条目「${p.name}」`);
            }
          };
        }

        rowFrag.appendChild(row);
      });
      orderBox.appendChild(rowFrag);
      container.appendChild(listCard);
    }

    function renderAssetInspector(container, ctx, assetReport) {
      const { assets, byCharToken, knownCharTokens, regexInfo, matchedModules, lorebookEntries } = assetReport;
      const charBuiltInCount = assets.filter(a => a.sourceType === 'character').length;
      const moduleAssetCount = assets.filter(a => a.sourceType === 'module').length;
      const cachedAi = cardAiCache[ctx.key] || {};
      const imageCnIndex = cachedAi.imageCnIndex || {};
      const cnIndexEntries = Object.entries(imageCnIndex);

      const summaryCard = document.createElement('div');
      summaryCard.className = 'profile-card';
      const currentCardFormat = cardAiCache[ctx.key]?.customFormat || regexInfo.template || '';
      summaryCard.innerHTML = `
        <div class="card-header">
          <span class="char-name">${ICONS.image}<span>图包资源、模块立绘与 AI 中文语义触发索引</span></span>
          <div class="btn-group">
            <button class="btn-chip cyan" id="btn-rescan-assets">${ICONS.refresh}<span>重扫模块图包</span></button>
            <button class="btn-chip" id="btn-toggle-img-prompt">${pluginConfig.enableImagePrompt ? '选图注入:开' : '选图注入:关'}</button>
            <button class="btn-chip" id="btn-edit-max-count">候选池 (${pluginConfig.maxCandidateCount || 16}张)</button>
            <button class="btn-chip" id="btn-edit-img-tpl">格式模板</button>
            <button class="btn-chip violet" id="btn-inject-preview" title="查看实际发给AI的顶部时间与说明书原文">${ICONS.shield}<span>注入预览</span></button>
          </div>
        </div>
        <div class="info-grid">
          <div class="info-box"><span class="info-label">角色卡 / 模块图</span><span class="info-val">${charBuiltInCount} 张 / ${moduleAssetCount} 张 (${matchedModules.length}模块)</span></div>
          <div class="info-box"><span class="info-label">已生成中文索引词</span><span class="info-val" style="color:var(--text-highlight)">${cnIndexEntries.length} 组</span></div>
          <div class="info-box"><span class="info-label">世界书条目</span><span class="info-val">${lorebookEntries.length} 条</span></div>
          <div class="info-box"><span class="info-label">输出格式模板</span><span class="info-val" style="color:#c084fc">${currentCardFormat || '自适应/未限定'}</span></div>
        </div>
      `;

      summaryCard.querySelector('#btn-rescan-assets').onclick = async () => {
        try { await Risuai.requestPluginPermission('db'); } catch (_) {}
        runtimeCache.moduleCache = null;
        invalidateAssetCache(ctx.key);
        const refreshed = await getCachedCardReport(ctx, true);
        activeReportRef = refreshed;
        syncTopHeaderStates(ctx, refreshed);
        showToast(`已重新扫描：共识别 ${refreshed.assets.length} 张立绘`);
        renderUnboundPrefixBar(ctx, refreshed);
        renderMainArea(ctx, refreshed);
      };

      summaryCard.querySelector('#btn-toggle-img-prompt').onclick = async () => {
        pluginConfig.enableImagePrompt = !pluginConfig.enableImagePrompt;
        await saveStoredData(true, ['config']);
        renderMainArea(ctx, assetReport);
      };

      summaryCard.querySelector('#btn-edit-max-count').onclick = async () => {
        const val = prompt('设置单次注入给 AI 的候选图片上限（建议 12 ~ 24 张，推荐 16 张）：', pluginConfig.maxCandidateCount || 16);
        if (val !== null) {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num >= 4 && num <= 64) {
            pluginConfig.maxCandidateCount = num;
            await saveStoredData(true, ['config']);
            renderMainArea(ctx, assetReport);
          }
        }
      };

      summaryCard.querySelector('#btn-edit-img-tpl').onclick = async () => {
        const curTpl = cardAiCache[ctx.key]?.customFormat || regexInfo.template || '';
        const val = prompt('自定义【当前角色卡专属】图片输出格式模板（使用 {name} 代表图片名，留空则自动识别）：', curTpl);
        if (val !== null) {
          if (!cardAiCache[ctx.key]) cardAiCache[ctx.key] = {};
          cardAiCache[ctx.key].customFormat = val.trim();
          await saveStoredData(true, ['aiCache']);
          invalidateAssetCache(ctx.key);
          const refreshed = await getCachedCardReport(ctx, true);
          activeReportRef = refreshed;
          renderMainArea(ctx, refreshed);
          showToast(val.trim() ? `已保存当前卡片专属格式：${val.trim()}` : '已恢复当前卡片自适应格式');
        }
      };

      summaryCard.querySelector('#btn-inject-preview').onclick = async () => {
        try {
          const { systemNotes, topNote } = await buildInjectedSystemNotes([]);
          const ipTop = document.getElementById('ip-top');
          const ipNotes = document.getElementById('ip-notes');
          if (ipTop) ipTop.value = topNote || '（空 — 未生成。需先完成 AI 识卡建档，且「注入」按钮为 ✓正常）';
          if (ipNotes) ipNotes.value = systemNotes.join('\n\n===== 下一角色 =====\n\n') || '（空 — 未生成）';
          const ipModal = document.getElementById('inject-preview-modal');
          if (ipModal) ipModal.style.display = 'flex';
        } catch (e) {
          showToast(`生成注入预览失败：${e.message}`, 5000);
        }
      };
      container.appendChild(summaryCard);

      const indexCard = document.createElement('div');
      indexCard.className = 'profile-card';
      const indexTagsHtml = cnIndexEntries.length > 0
        ? cnIndexEntries.map(([eng, cns]) => {
            const cnStr = Array.isArray(cns) ? cns.join('/') : String(cns);
            return `<span class="tag-badge cn-index"><strong>${eng}</strong> ➔ ${cnStr}</span>`;
          }).join('')
        : `<span style="color:var(--text-sub);font-size:11px;">尚未生成图包中文索引，请点击顶部「一键AI分析」自动将英文文件名词条映射为中文触发词。</span>`;

      indexCard.innerHTML = `
        <div class="card-header">
          <span class="char-name">${ICONS.sparkle}<span>AI 图包中文触发词索引库 (${cnIndexEntries.length}组)</span></span>
          <button class="btn-chip cyan" id="btn-add-custom-index">${ICONS.plus}<span>手动添加索引</span></button>
        </div>
        <div style="max-height:150px; overflow-y:auto; padding:4px 0;">${indexTagsHtml}</div>
      `;

      indexCard.querySelector('#btn-add-custom-index').onclick = async () => {
        const input = prompt('添加或修改图片英文词条的中文触发词\n格式：英文词条=中文词1,中文词2,中文词3 (例如 kiss=接吻,亲吻,舌吻)：');
        if (input && input.includes('=')) {
          const [eng, rest] = input.split('=');
          const engKey = eng.trim().toLowerCase();
          const words = rest.split(/[,，、/]+/).map(s => s.trim()).filter(Boolean);
          if (engKey && words.length) {
            if (!cardAiCache[ctx.key]) cardAiCache[ctx.key] = { customFormat: '', characters: [], imageCnIndex: {} };
            if (!cardAiCache[ctx.key].imageCnIndex) cardAiCache[ctx.key].imageCnIndex = {};
            cardAiCache[ctx.key].imageCnIndex[engKey] = words;
            runtimeCache.compiledCnIndexMap.clear();
            await saveStoredData(true, ['aiCache']);
            showToast(`已保存索引：${engKey} ➔ ${words.join('/')}`);
            renderMainArea(ctx, assetReport);
          }
        }
      };
      container.appendChild(indexCard);

      const frag = document.createDocumentFragment();
      knownCharTokens.forEach(tk => {
        const group = byCharToken[tk];
        const sampleNames = group.assets.slice(0, 6).map(a => formatAssetForAI(a, regexInfo));

        const groupCard = document.createElement('div');
        groupCard.className = 'profile-card';
        groupCard.innerHTML = `
          <div class="card-header">
            <span class="char-name">${ICONS.user}<span>图包角色前缀锚点：${group.displayToken}</span> <span style="font-size:11px; color:var(--text-highlight);">(${group.assets.length} 张)</span></span>
            <div class="btn-group">
              <button class="btn-chip violet btn-supplement-prefix">${ICONS.sparkle}<span>用此锚点AI补录</span></button>
              <span class="tag-badge ${group.hasPregnant ? 'highlight' : ''}">${group.hasPregnant ? '含孕期差分' : '常规差分'}</span>
            </div>
          </div>
          <div style="font-size:11px; color:#cbd5e1; line-height:1.7;">
            <div><strong>服装 (${group.outfits.size})：</strong>${Array.from(group.outfits).map(o => `<span class="tag-badge highlight">${o}</span>`).join('') || '默认'}</div>
            <div><strong>动作/互动 (${group.actions.size})：</strong>${Array.from(group.actions).map(a => `<span class="tag-badge cn-index">${a}</span>`).join('') || '基础'}</div>
            <div><strong>表情 (${group.expressions.size})：</strong>${Array.from(group.expressions).map(e => `<span class="tag-badge">${e}</span>`).join('') || '基础'}</div>
            <div style="margin-top:4px; color:var(--text-sub);"><strong>调用示例：</strong><code>${sampleNames.join(' , ')}</code></div>
          </div>
        `;
        groupCard.querySelector('.btn-supplement-prefix').onclick = async () => {
          const ok = await runTargetedAiSupplement(group.displayToken, ctx, assetReport, null);
          if (ok) {
            viewMode = 'current';
            syncTopHeaderStates(ctx, assetReport);
            renderUnboundPrefixBar(ctx, assetReport);
            renderMainArea(ctx, assetReport);
          }
        };
        frag.appendChild(groupCard);
      });
      container.appendChild(frag);
    }

    function renderBackupManager(container, ctx, assetReport) {
      const cardCount = Object.keys(favorProfiles).length;
      const aiCacheCount = Object.keys(cardAiCache).length;
      const stCount = Object.keys(stPresets).length;

      const backupCard = document.createElement('div');
      backupCard.className = 'profile-card';
      backupCard.innerHTML = `
        <div class="card-header">
          <span class="char-name">${ICONS.shield}<span>奈亚 V6.2.1 全量数据备份与多通道导出中心</span></span>
        </div>
        <div style="font-size:11px; color:var(--text-sub); line-height:1.6;">
          已存储：<strong>${cardCount}</strong> 张角色卡档案 ｜ <strong>${aiCacheCount}</strong> 张角色卡 AI 识卡缓存 ｜ <strong>${stCount}</strong> 套酒馆预设。
        </div>
        <div class="btn-group" style="margin-top:4px;">
          <button class="btn-chip cyan" id="btn-export-copy">${ICONS.copy}<span>复制备份 JSON</span></button>
          <button class="btn-chip" id="btn-export-download">${ICONS.download}<span>下载 .json 备份</span></button>
          <button class="btn-chip" id="btn-export-txt">${ICONS.download}<span>下载 .txt 备份 (防手机拦截)</span></button>
          <button class="btn-chip violet" id="btn-import-merge">${ICONS.upload}<span>粘贴合并恢复</span></button>
          <button class="btn-chip danger" id="btn-import-replace">${ICONS.trash}<span>粘贴覆盖恢复</span></button>
        </div>
        <div class="field-row" style="margin-top:6px;">
          <label class="field-label">备份数据预览 / 粘贴恢复输入框：</label>
          <textarea id="backup-json-area" class="field-input" style="height:210px; font-family:monospace; font-size:11px;"></textarea>
        </div>
      `;

      const textArea = backupCard.querySelector('#backup-json-area');
      textArea.value = exportFullBackupJson();

      backupCard.querySelector('#btn-export-copy').onclick = () => {
        const jsonStr = exportFullBackupJson();
        textArea.value = jsonStr;
        const ok = copyTextMobileSafe(jsonStr);
        showToast(ok ? '全量备份 JSON 已复制到剪贴板' : '已生成在下方文本框，请全选复制');
      };

      const triggerDownload = (ext, mime) => {
        try {
          const jsonStr = exportFullBackupJson();
          const blob = new Blob([jsonStr], { type: mime });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `nailya_v6.2.1_backup_${new Date().toISOString().slice(0, 10)}.${ext}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          showToast(`已触发 .${ext} 备份文件下载`);
        } catch (e) {
          alert(`下载失败，请使用「复制备份 JSON」：${e.message}`);
        }
      };

      backupCard.querySelector('#btn-export-download').onclick = () => triggerDownload('json', 'application/json;charset=utf-8');
      backupCard.querySelector('#btn-export-txt').onclick = () => triggerDownload('txt', 'text/plain;charset=utf-8');

      const doRestore = async (mergeMode) => {
        const raw = textArea.value.trim();
        if (!raw) {
          alert('请先在文本框中粘贴备份 JSON 数据！');
          return;
        }
        try {
          await importFullBackupJson(raw, mergeMode);
          showToast(mergeMode ? '备份数据已成功合并恢复' : '备份数据已成功完整覆盖恢复');
          syncTopHeaderStates(ctx, assetReport);
          renderUnboundPrefixBar(ctx, assetReport);
          renderMainArea(ctx, assetReport);
        } catch (err) {
          alert(`恢复失败：${err.message}`);
        }
      };

      backupCard.querySelector('#btn-import-merge').onclick = () => doRestore(true);
      const replaceBtn = backupCard.querySelector('#btn-import-replace');
      replaceBtn.onclick = () => {
        if (!armOnceConfirm(replaceBtn)) return;
        doRestore(false);
      };

      container.appendChild(backupCard);
    }

    // ------------------------------------------------------------------------
    // 11. 注册 RisuAI API v3.0 标准事件监听与提示词注入器（无阻塞极速启动）
    // ------------------------------------------------------------------------
    try {
      await Risuai.addRisuScriptHandler('input', async (userText) => {
        if (userText) {
          await handleMessagePipeline(userText);
          // 备用通道：注入权限被拒时（replacer 失效），把视觉指令附在输入末尾直接发给 AI
          if (runtimeCache.injectionDenied && pluginConfig.enableImagePrompt) {
            try {
              await ensureStoredDataLoaded();
              const ctxInj = await getFastContext(false);
              const injList = ctxInj.key ? profilesOfChat(ctxInj.key, ctxInj) : [];
              if (injList.length > 0) {
                const injNames = injList.slice(0, 3).map(([, p]) => p.name).join('、');
                userText = userText + `\n（系统指令：回复中须按剧情输出视觉标签 <Vis:${injList[0][1].name}>动作|表情|服装</Vis>，三个槽位用中文填写；出场角色：${injNames}）`;
              }
            } catch (_) {}
          }
        }
        return userText;
      });
    } catch (e) {
      console.log(`[Nailya V6.2.1] input handler 注册异常: ${e.message}`);
    }

    try {
      await Risuai.addRisuScriptHandler('output', async (aiText) => {
        if (aiText) {
          return await handleAiOutputAndMilestones(aiText);
        }
        return aiText;
      });
    } catch (e) {
      console.log(`[Nailya V6.2.1] output handler 注册异常: ${e.message}`);
    }

    try {
      await Risuai.addRisuScriptHandler('display', async (content) => {
        if (!content) return content;
        let out = String(content);
        
        if (out.includes('<AI档案解析>') || out.includes('<好感度事件>') || out.includes('<时间推进>')) {
          out = out
            .replace(/\s*<AI档案解析>[\s\S]*?<\/AI档案解析>\s*/gi, '')
            .replace(/\s*<好感度事件>[\s\S]*?<\/好感度事件>\s*/gi, '')
            .replace(/\s*<时间推进>[\s\S]*?<\/时间推进>\s*/gi, '');
        }

        // 拦截并替换视觉意图标签；AI 未输出 <Vis:> 时，用中文语境雷达从正文自动选图兜底
        const hadVisTag = out.includes('<Vis:');
        if (hadVisTag || pluginConfig.enableImagePrompt) {
            const ctx = await getFastContext(false);
            const assetReport = await getCachedCardReport(ctx, false);
            const cachedAiData = cardAiCache[ctx.key] || {};
            const imgIndex = cachedAiData.imageCnIndex || {};

            if (hadVisTag) {
            // 将 + 改为 *，允许 AI 留空某个槽位
            const visRegex = /<Vis:([^>]+)>([^|]*)\|([^|]*)\|([^<]*)<\/Vis>/gi;
            out = out.replace(visRegex, (match, charName, action, expression, outfit) => {
                // 增加 trim() 处理，防止 AI 输出空格导致匹配精度下降
                const safeAction = (action || '').trim();
                const safeExpression = (expression || '').trim();
                const safeOutfit = (outfit || '').trim();
                const bestAsset = findBestImageForVisTag(ctx.key, charName.trim(), safeAction, safeExpression, safeOutfit, assetReport, imgIndex, favorProfiles, ctx);
                if (!bestAsset) return ''; 

                    return buildImageCodeForAsset(assetReport, bestAsset);
                });
            } else if (!/\{\{(?:raw|asset|img|image|emotion)::/i.test(out) && !/<img[\s>]/i.test(out)) {
                // output 阶段已注入过图片代码时不再重复补图，防止双图
                out = appendAutoImageFromContext(out, ctx, assetReport, imgIndex);
            }
        }

        if (out.includes('<thinking>') || out.includes('<thought>')) {
          if (pluginConfig.foldThinkingBlock === 'strip') {
            out = out.replace(/<(?:thinking|thought)>[\s\S]*?<\/(?:thinking|thought)>/gi, '');
          } else if (pluginConfig.foldThinkingBlock === 'fold') {
            out = out.replace(/<(?:thinking|thought)>([\s\S]*?)<\/(?:thinking|thought)>/gi, (_, inner) => {
              return `<details style="margin:8px 0;padding:8px 12px;background:linear-gradient(135deg,rgba(18,22,52,0.65),rgba(8,24,44,0.55));backdrop-filter:blur(12px);border:1px solid rgba(56,189,248,0.28);border-left:3px solid #22d3ee;border-radius:10px;font-size:12px;color:#94a3b8;"><summary style="cursor:pointer;font-weight:600;color:#67e8f9;letter-spacing:0.3px;">✨ 展开 AI 星云思维链 (Thinking)</summary><div style="margin-top:6px;white-space:pre-wrap;line-height:1.6;">${inner.trim()}</div></details>`;
            });
          }
        }
        return out;
      });
    } catch (e) {
      console.log(`[Nailya V6.2.1] display handler 注册异常: ${e.message}`);
    }

    try {
      let replacerGranted = true;
      try { replacerGranted = (await Risuai.requestPluginPermission('replacer')) !== false; } catch (_) { replacerGranted = false; }
      runtimeCache.injectionDenied = !replacerGranted;
      if (!replacerGranted) {
        showToast('⛔ 提示词注入权限未授予！AI将收不到好感/视觉/时间指令，请打开插件面板点「注入」按钮重新授权', 8000);
      }
      await Risuai.addRisuReplacer('beforeRequest', async (messages, type) => {
        if (!Array.isArray(messages)) return messages;
        const { systemNotes, assetReport, topNote } = await buildInjectedSystemNotes(messages);

        if (pluginConfig.enableStPreset && pluginConfig.activeStPresetId && stPresets[pluginConfig.activeStPresetId] && assetReport) {
          const stMessages = buildMessagesWithSillyTavernPreset(
            stPresets[pluginConfig.activeStPresetId],
            messages,
            assetReport,
            systemNotes
          );
          if (Array.isArray(stMessages) && stMessages.length > 0) {
            if (topNote) stMessages.unshift({ role: 'system', content: topNote });
            return stMessages;
          }
        }

        if (!systemNotes.length && !topNote) return messages;
        const outMessages = messages.slice();
        if (topNote) outMessages.unshift({ role: 'system', content: topNote });
        for (const content of systemNotes) outMessages.push({ role: 'system', content });
        return outMessages;
      });
    } catch (e) {
      console.log(`[Nailya V6.2.1] beforeRequest replacer 注册异常: ${e.message}`);
    }

    await ensureStoredDataLoaded();
    console.log('[Nailya V6.2.1] 星云×极光双主题毛玻璃重构版初始化成功');
  } catch (err) {
    console.log(`[Nailya V6.2.1] 初始化异常: ${err.message}`);
  }
})();