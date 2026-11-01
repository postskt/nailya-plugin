  // ============================================================
  // 自动化测试（运行在插件闭包内，可直接访问内部函数）
  // ============================================================
  await new Promise(r => setTimeout(r, 200)); // 等初始化完成
  console.log('PROBE in-closure typeof:', typeof getFastContext, typeof parseImageStructure, typeof matchStdKeysByChinese, typeof handleAiOutputAndMilestones, typeof updatePhysiology, typeof getCachedCardReport, typeof findBestImageForVisTag);
  const __results = [];
  const T = (name, cond, extra) => { __results.push([cond ? 'PASS' : 'FAIL', name, extra == null ? '' : String(extra)]); };
  const mkProf = () => ({ name: '尤娜', origName: 'yuna', age: 20, favor: 20, relationshipTag: '暗恋的同学', pregnancyStatus: '未孕', pregnancyRisk: 0, cycleDay: 14, month: 1, day: 1, gestationDays: null, postpartumDays: null });

  try {
    // ===== 1. 中文触发词反查 =====
    T('中文反查:接吻→action.kiss', matchStdKeysByChinese('接吻', 'action').has('kiss'));
    T('中文反查:婚纱→outfit.wedding', matchStdKeysByChinese('婚纱', 'outfit').has('wedding'));
    T('中文反查:常服→outfit.normal', matchStdKeysByChinese('常服', 'outfit').has('normal'));

    // ===== 2. 文件名解析 =====
    const p1 = parseImageStructure('yuna_kiss_blush_v2.png', 'character', 't', 'yuna');
    T('解析:charToken=yuna', p1.charToken === 'yuna', p1.charToken);
    T('解析:action=kiss', p1.action.includes('kiss'), p1.action.join(','));
    T('解析:expression=shy', p1.expression.includes('shy'), p1.expression.join(','));
    T('解析:非NSFW', !p1.isNsfw);
    const p2 = parseImageStructure('yuna_nude_missionary_sex.png', 'character', 't', 'yuna');
    T('解析:NSFW识别', p2.isNsfw);

    // ===== 3. 选图引擎 =====
    const ctx = await getFastContext(true);
    const report = await getCachedCardReport(ctx, true);
    T('资产扫描:13张立绘(含差分+特征)', report.assets.length === 13, 'got ' + report.assets.length);
    T('前缀识别:yuna', report.knownCharTokens.includes('yuna'), report.knownCharTokens.join(','));
    const pick1 = findBestImageForVisTag(ctx.key, '尤娜', '接吻', '害羞', '常服', report, {}, favorProfiles, ctx);
    T('选图:接吻→kiss图', !!pick1 && pick1.baseName.includes('kiss'), pick1 && pick1.baseName);
    const pick2 = findBestImageForVisTag(ctx.key, '尤娜', '洗澡', '平静', '浴巾', report, {}, favorProfiles, ctx);
    T('选图:洗澡→浴巾图而非全裸', !!pick2 && pick2.baseName.includes('towel'), pick2 && pick2.baseName);
    const pick3 = findBestImageForVisTag(ctx.key, '尤娜', '做爱', '动情', '全裸', report, {}, favorProfiles, ctx);
    T('选图:做爱→NSFW图', !!pick3 && pick3.isNsfw, pick3 && pick3.baseName);
    const pick4 = findBestImageForVisTag(ctx.key, '尤娜', '睡觉', '平静', '睡衣', report, {}, favorProfiles, ctx);
    T('选图:睡觉→睡衣图', !!pick4 && pick4.baseName.includes('pajamas'), pick4 && pick4.baseName);
    const s1 = findBestImageForVisTag(ctx.key, '尤娜', '站立', '微笑', '常服', report, {}, favorProfiles, ctx);
    const s2 = findBestImageForVisTag(ctx.key, '尤娜', '站立', '微笑', '常服', report, {}, favorProfiles, ctx);
    T('选图:同标签结果稳定(粘性)', !!s1 && !!s2 && s1.baseName === s2.baseName, s1 && s2 && (s1.baseName + ' vs ' + s2.baseName));

    // ===== 3b. V6.7.0 三段式选图 =====
    const pickE = findBestImageForVisTag(ctx.key, '尤娜', '接吻', '开心', '常服', report, {}, favorProfiles, ctx);
    T('三段式:日常表情优先于动作(开心+常服不被接吻压死)', !!pickE && !pickE.baseName.includes('kiss'), pickE && pickE.baseName);
    const pickP = findBestImageForVisTag(ctx.key, '尤娜', '后入', '害羞', '全裸', report, {}, favorProfiles, ctx);
    T('三段式:做爱体位决定性(后入→doggy)', !!pickP && pickP.baseName.includes('doggy'), pickP && pickP.baseName);
    const pickM = findBestImageForVisTag(ctx.key, '尤娜', '传教士', '动情', '全裸', report, {}, favorProfiles, ctx);
    T('三段式:做爱体位决定性(传教士→missionary)', !!pickM && pickM.baseName.includes('missionary'), pickM && pickM.baseName);
    const pickB = findBestImageForVisTag(ctx.key, '尤娜', '捆绑', '平静', '常服', report, {}, favorProfiles, ctx);
    T('三段式:捆绑→NSFW池', !!pickB && pickB.isNsfw, pickB && pickB.baseName);
    const pickN = findBestImageForVisTag(ctx.key, '尤娜', '无', '微笑', '常服', report, {}, favorProfiles, ctx);
    T('三段式:槽1填无不扣分(微笑+常服→normal图)', !!pickN && pickN.baseName.includes('normal'), pickN && pickN.baseName);
    const d1 = findBestImageForVisTag(ctx.key, '尤娜', '接吻', '害羞', '常服', report, {}, favorProfiles, ctx);
    const d2 = findBestImageForVisTag(ctx.key, '尤娜', '接吻', '害羞', '常服', report, {}, favorProfiles, ctx);
    T('差分轮换:同标签连续两次不重复', !!d1 && !!d2 && d1.baseName !== d2.baseName, d1 && d2 && (d1.baseName + ' vs ' + d2.baseName));
    // ===== 3c. V6.9.0 特征词 =====
    const pickSp = findBestImageForVisTag(ctx.key, '尤娜', '蜘蛛做爱', '动情', '全裸', report, {}, favorProfiles, ctx);
    T('特征词:蜘蛛做爱→选中蜘蛛图', !!pickSp && pickSp.baseName.includes('spider'), pickSp && pickSp.baseName);
    const pickNoFeat = findBestImageForVisTag(ctx.key, '尤娜', '后入', '害羞', '全裸', report, {}, favorProfiles, ctx);
    T('特征词:未提特征→不被蜘蛛/飞虫污染', !!pickNoFeat && !pickNoFeat.baseName.includes('spider') && !pickNoFeat.baseName.includes('fly'), pickNoFeat && pickNoFeat.baseName);
    T('特征词:报告已提取特征词表', (report.byCharToken['yuna'] && (report.byCharToken['yuna'].featureTokens || []).includes('spider')) === true, JSON.stringify(report.byCharToken['yuna'] && report.byCharToken['yuna'].featureTokens));

    // ===== 4. 怀孕当场结算 =====
    const prof1 = mkProf();
    updatePhysiology(prof1, 0, '无套内射');
    T('怀孕:排卵期无套→风险上涨或当场受孕', prof1.pregnancyRisk > 0 || prof1.pregnancyStatus === '已孕', 'risk=' + prof1.pregnancyRisk + ' status=' + prof1.pregnancyStatus);
    const prof2 = mkProf();
    let conceived = false, tries = 0;
    for (let i = 0; i < 60 && !conceived; i++) { tries++; updatePhysiology(prof2, 0, '无套内射'); conceived = prof2.pregnancyStatus === '已孕'; }
    T('怀孕:反复无套→60回合内必受孕', conceived, 'tries=' + tries);
    if (conceived) {
      const g0 = prof2.gestationDays || 0;
      updatePhysiology(prof2, 5, '');
      T('怀孕:孕期随时间推进+5天', prof2.gestationDays === g0 + 5, 'gestation=' + prof2.gestationDays);
      updatePhysiology(prof2, 0, '无套内射');
      T('怀孕:已孕后不再累积风险', prof2.gestationDays === g0 + 5);
    }
    const prof3 = mkProf();
    updatePhysiology(prof3, 0, '戴套做爱');
    T('怀孕:戴套→风险≈3%或直接受孕', (prof3.pregnancyRisk <= 3.1 && prof3.pregnancyStatus === '未孕') || prof3.pregnancyStatus === '已孕', 'risk=' + prof3.pregnancyRisk + ' status=' + prof3.pregnancyStatus);
    const profP = mkProf(); profP.cycleDay = 2; updatePhysiology(profP, 0, '无套内射');
    T('怀孕:经期(安全期)→风险不涨', profP.pregnancyRisk === 0);
    const profL = mkProf(); profL.cycleDay = 20; updatePhysiology(profL, 0, '无套内射');
    T('怀孕:黄体期(安全期)→风险不涨', profL.pregnancyRisk === 0);
    T('避孕:生病吃药不再误判为避孕药', protectionOf('她生病吃了药').label !== '避孕药', protectionOf('她生病吃了药').label);
    T('避孕:裸辞不再误判为无防护', protectionOf('他裸辞了工作').coef === 1.0 && protectionOf('他裸辞了工作').label === '未识别(按无防护)');
    T('性行为词:发生了关系→命中', SEX_ACT_REGEX.test('那天晚上我们发生了关系'));
    T('性行为词:走进房间→不误判', !SEX_ACT_REGEX.test('他走进房间坐下'));

    // 周期推进 / 产后恢复
    const prof4 = mkProf();
    updatePhysiology(prof4, 20, '');
    T('周期:推进20天正确回绕(14+20→6)', prof4.cycleDay === 6, 'cycleDay=' + prof4.cycleDay);
    const prof5 = mkProf(); prof5.pregnancyStatus = '产后'; prof5.postpartumDays = 40;
    updatePhysiology(prof5, 3, '');
    T('产后:43天恢复未孕+周期重置', prof5.pregnancyStatus === '未孕' && prof5.cycleDay === 1, JSON.stringify({s:prof5.pregnancyStatus, c:prof5.cycleDay}));

    // ===== 4b. V6.9.0 好感数值规则 =====
    const pFD = mkProf(); pFD.favor = 63;
    applyFavorDelta(pFD, 5);
    T('好感规则:单次加封顶2', pFD.favor === 65, 'favor=' + pFD.favor);
    applyFavorDelta(pFD, 0.05);
    T('好感规则:最低步进0.1', pFD.favor === 65.1, 'favor=' + pFD.favor);
    applyFavorDelta(pFD, -3);
    T('好感规则:单次扣封顶0.5', pFD.favor === 64.6, 'favor=' + pFD.favor);
    const pF2 = mkProf(); pF2.favor = 80.5; applyFavorDelta(pF2, -2);
    T('好感规则:80线不跌破(0.5递减到线即停)', pF2.favor === 80, 'favor=' + pF2.favor);
    const pF3 = mkProf(); pF3.favor = 50.5; applyFavorDelta(pF3, -2);
    T('好感规则:50线不跌破(0.5递减到线即停)', pF3.favor === 50, 'favor=' + pF3.favor);
    const pF4 = mkProf(); pF4.favor = 140; applyFavorDelta(pF4, -2);
    T('好感规则:135线完全不减', pF4.favor === 140, 'favor=' + pF4.favor);
    const pF5 = mkProf(); pF5.favor = 40;
    for (let i = 0; i < 20; i++) applyFavorDelta(pF5, -2);
    T('好感规则:每日累计扣≤5', pF5.favor === 35, 'favor=' + pF5.favor);
    nyRollForward(ensureGameTime(pF5), 60 * 25); // 推进25小时跨天
    applyFavorDelta(pF5, -2);
    T('好感规则:跨天扣分额度重置', pF5.favor === 34.5, 'favor=' + pF5.favor);
    applyFavorDelta(pF5, 3, { milestone: true });
    T('好感规则:大事件单次≤4', pF5.favor === 37.5, 'favor=' + pF5.favor);

    // ===== 5. output 管线：AI叙事受孕 + 时间标签 + 里程碑 =====
    favorProfiles['char1'] = { 'chat-abc#尤娜': mkProf() };
    const out1 = await handleAiOutputAndMilestones('他缓缓进入她的身体，无套内射了。<时间推进>2</时间推进>');
    const profOut = favorProfiles['char1']['chat-abc#尤娜'];
    T('AI叙事:性行为被结算(风险或受孕)', profOut.pregnancyRisk > 0 || profOut.pregnancyStatus === '已孕', 'risk=' + profOut.pregnancyRisk + ' status=' + profOut.pregnancyStatus);
    T('AI叙事:一次行为只结算一次(风险≤60)', profOut.pregnancyRisk <= 60, 'risk=' + profOut.pregnancyRisk);
    T('时间:<时间推进>标签被清除', !out1.includes('<时间推进>'));
    T('时间:推进2天(1→3日)', profOut.day === 3, 'day=' + profOut.day);
    T('时间:周期同步推进(14→16)', profOut.cycleDay === 16, 'cycleDay=' + profOut.cycleDay);
    const out2 = await handleAiOutputAndMilestones('她红着脸答应了。<好感度事件>{"name":"尤娜","confirm":"relation"}</好感度事件>');
    T('告白:AI事件确认成功', profOut.relationConfirmed === true);
    T('告白:好感墙解除(favor→51)', profOut.favor === 51, 'favor=' + profOut.favor);
    T('告白:关系定位更新', /恋/.test(profOut.relationshipTag || ''), profOut.relationshipTag);
    T('告白:事件标签被清除', !out2.includes('<好感度事件>'));

    // ===== 5b. V6.8.0 可见时间条 =====
    const profT = favorProfiles['char1']['chat-abc#尤娜'];
    profT.year = 2003; profT.month = 4; profT.day = 1; profT.hour = 14; profT.minute = 30; profT.timeUnset = false;
    const outT = await handleAiOutputAndMilestones('他们聊了一会天。');
    T('时间条:普通回复自动+10分钟(14:40)', profT.hour === 14 && profT.minute === 40, `h=${profT.hour} m=${profT.minute}`);
    T('时间条:纯文字标记已追加', /<NyTime>2003年4月1日\|14:40<\/NyTime>/.test(outT), outT.slice(-60));
    const outT2 = await handleAiOutputAndMilestones('过了几个小时。<游戏时间>2003年4月1日 20时05分</游戏时间>');
    T('时间条:AI上报绝对时刻被采纳', profT.hour === 20 && profT.minute === 5 && profT.year === 2003, `h=${profT.hour} m=${profT.minute}`);
    T('时间条:游戏时间标签已清除', !outT2.includes('<游戏时间>'));
    await handleAiOutputAndMilestones('回到早上的场景。<游戏时间>2002年1月1日 08时00分</游戏时间>');
    T('时间条:时间倒流被拒绝', profT.year === 2003 && profT.hour === 20, `y=${profT.year} h=${profT.hour}`);
    const dispFnT = (__captured.handlers.find(h => h[0] === 'display') || [])[1];
    const dispT = await dispFnT('<NyTime>2003年4月1日|20:05</NyTime>');
    T('时间条:蓝天徽章渲染(右上角+时分)', dispT.includes('float:right') && dispT.includes('20:05') && !dispT.includes('<NyTime>'), dispT.slice(0, 80));

    // ===== 5c. V6.9.0 DeepSeek 辅助记账（假API通道） =====
    const origNF = globalThis.Risuai.nativeFetch;
    globalThis.Risuai.nativeFetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"favorDeltas":{"尤娜":1.5},"milestone":{"尤娜":"无"},"newTime":{"year":2003,"month":4,"day":2,"hour":10,"minute":0},"physioEvents":[],"imagePick":{}}' } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    pluginConfig.enableAiAccounting = true;
    pluginConfig.apiKey = 'test-key';
    pluginConfig.apiUrl = 'https://api.deepseek.com/chat/completions';
    pluginConfig.apiModel = 'deepseek-chat';
    const profA = favorProfiles['char1']['chat-abc#尤娜'];
    profA.timeUnset = false; profA.year = 2003; profA.month = 4; profA.day = 1; profA.hour = 9; profA.minute = 0;
    const favorBeforeA = profA.favor;
    await handleAiOutputAndMilestones('她陪你聊了一整轮天。');
    T('记账:好感+1.5被采纳', profA.favor === favorBeforeA + 1.5, `favor=${profA.favor}`);
    T('记账:时间推进到次日10:00', profA.hour === 10 && profA.minute === 0 && profA.day === 2, `d${profA.day} ${profA.hour}:${profA.minute}`);
    T('记账:记账成功时+10兜底被跳过', profA.minute === 0);
    globalThis.Risuai.nativeFetch = async () => new Response('{"error":"boom"}', { status: 500 });
    const favorB = profA.favor; const mB = profA.minute;
    await handleAiOutputAndMilestones('随便聊两句。');
    T('记账:API失败回退本地+10分钟', profA.minute === (mB + 10) % 60 && profA.favor === favorB, `m=${profA.minute} favor=${profA.favor}`);
    globalThis.Risuai.nativeFetch = origNF;
    pluginConfig.enableAiAccounting = false;
    pluginConfig.apiKey = '';

    // ===== 5d. V6.9.0 方案A固化 + 提示词瘦身 =====
    const outBake = await handleAiOutputAndMilestones('正文前奏\n<Vis:尤娜>接吻|害羞|常服</Vis>\n完');
    T('固化:输出层Vis已替换为图片代码', !outBake.includes('<Vis:') && /<img:yuna_/.test(outBake), outBake.slice(-60));
    const dispBake = await dispFnT(outBake);
    T('固化:已固化文本显示层无残留Vis', !dispBake.includes('<Vis:'), dispBake.slice(-40));
    pluginConfig.enableAiAccounting = true; pluginConfig.apiKey = 'test-key';
    const msgsSlim = await __captured.replacers[0]([{ role: 'user', content: '瘦身测试' }]);
    const joinedSlim = msgsSlim.map(m => m.content).join('|');
    T('瘦身:记账开启时视觉指令退役', !joinedSlim.includes('视觉分镜指令'), '');
    T('瘦身:记账开启时时间上报指令退役', !joinedSlim.includes('<游戏时间>'), '');
    pluginConfig.enableAiAccounting = false; pluginConfig.apiKey = '';

    // ===== 5e. V6.9.0 DeepSeek 选图落地 =====
    pluginConfig.enableAiAccounting = true; pluginConfig.apiKey = 'test-key';
    globalThis.Risuai.nativeFetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"favorDeltas":{},"newTime":{"year":2003,"month":4,"day":3,"hour":11,"minute":0},"physioEvents":[],"imagePick":{"尤娜":"yuna_kiss_shy"}}' } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    const outPick = await handleAiOutputAndMilestones('她凑过来轻轻亲了你的脸颊。');
    T('选图落地:DeepSeek选图已追加为图片代码', /yuna_kiss_shy/.test(outPick) && !outPick.includes('<Vis:'), outPick.slice(-60));
    globalThis.Risuai.nativeFetch = origNF;
    pluginConfig.enableAiAccounting = false; pluginConfig.apiKey = '';
    // ===== 5f. V7.0.0 行为引擎 =====
    const profB = favorProfiles['char1']['chat-abc#尤娜'];
    profB.personality = '傲娇，其实很怕孤独';
    profB.personalityTags = null; profB.petPhrase = '哼'; profB.taboos = ['被当小孩'];
    const tagsB = nyTagsOf(profB);
    T('行为:性格标签兜底反查', tagsB.includes('傲娇'), tagsB.join(','));
    profB.mood = { type: '愤怒', intensity: 6 };
    nyRollForward(ensureGameTime(profB), 120);
    T('行为:情绪随游戏时间衰减(2小时-2)', profB.mood.intensity === 4, JSON.stringify(profB.mood));
    const cardB = buildStateCard(profB);
    T('行为:状态卡已合成', cardB.includes('演出状态卡') && cardB.includes('傲娇') && cardB.includes('接受度'), cardB.slice(0, 60));
    T('行为:状态卡含雷点与口癖', cardB.includes('被当小孩') && cardB.includes('哼'), '');
    const accB = nyAcceptanceOf(profB);
    T('行为:接受度含性格修正', accB.includes('牵手✓'), accB);
    pluginConfig.enableAiAccounting = true; pluginConfig.apiKey = 'test-key';
    globalThis.Risuai.nativeFetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"favorDeltas":{},"newTime":{"year":2003,"month":4,"day":4,"hour":12,"minute":0},"physioEvents":[],"imagePick":{},"emotion":{"尤娜":"害羞3"}}' } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    await handleAiOutputAndMilestones('她的耳朵红了。');
    T('行为:记账情绪落档案', profB.mood && profB.mood.type === '害羞' && profB.mood.intensity === 3, JSON.stringify(profB.mood));
    globalThis.Risuai.nativeFetch = origNF;
    pluginConfig.enableAiAccounting = false; pluginConfig.apiKey = '';

    // ===== 5g. V7.1.0 历法/日程/记忆/场外事件/NPC =====
    ensureGameTime(profB);
    T('历法:星期几可计算', ['周一','周二','周三','周四','周五','周六','周日'].includes(nyWeekdayOf(profB)), nyWeekdayOf(profB));
    profB.importedProfile = { 日程模板: { 周一: [{ 时段: '00:00-23:59', 活动: '上课', 地点: '教室' }], 周二: [{ 时段: '00:00-23:59', 活动: '上课', 地点: '教室' }], 周三: [{ 时段: '00:00-23:59', 活动: '上课', 地点: '教室' }], 周四: [{ 时段: '00:00-23:59', 活动: '上课', 地点: '教室' }], 周五: [{ 时段: '00:00-23:59', 活动: '上课', 地点: '教室' }], 周六: [{ 时段: '00:00-23:59', 活动: '补课', 地点: '教室' }], 周日: [{ 时段: '00:00-23:59', 活动: '休息', 地点: '宿舍' }] } };
    const wbB = buildWhereabouts(profB);
    T('日程:按星期查活动地点', wbB.length > 0 && (wbB.includes('上课') || wbB.includes('补课') || wbB.includes('休息')), wbB);
    nyAddMemory(profB, '答应周末一起去看海', 5, '对话记忆点');
    T('记忆:已写入并召回', nyRecallMemories(profB).some(m => m.text.includes('看海')), '');
    const memCap = { isNpc: true, memories: [] };
    for (let i = 0; i < 30; i++) nyAddMemory(memCap, 'npc记忆' + i, 1);
    T('记忆:NPC配额减半(25)', memCap.memories.length === 25, 'len=' + memCap.memories.length);
    pluginConfig.enableAiAccounting = true; pluginConfig.apiKey = 'test-key';
    globalThis.Risuai.nativeFetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"favorDeltas":{"尤娜":0.5},"newTime":{"year":2003,"month":4,"day":6,"hour":9,"minute":0},"physioEvents":[],"imagePick":{},"emotion":{"尤娜":"开心2"},"whereabouts":{"尤娜":"在教室自习｜教室"},"memoryNotes":[{"name":"尤娜","text":"她把你的承诺写进了日记","weight":4}],"offEvents":[{"name":"尤娜","text":"周末她独自去了海边，性格变得开朗了一些","major":true}]}' } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    await handleAiOutputAndMilestones('新的一天开始了。');
    T('场外:跨天事件写入记忆', (profB.memories || []).some(m => m.text.includes('海边')), 'n=' + (profB.memories || []).length);
    T('场外:重大事件写入性格外围', (profB.growthNotes || []).some(g => g.includes('海边')), JSON.stringify(profB.growthNotes || []));
    T('日程:AI填报 whereabouts 已存', profB.whereabouts.includes('教室'), profB.whereabouts);
    T('记忆:AI记忆点已写入', (profB.memories || []).some(m => m.text.includes('日记')), '');
    const npcIn = JSON.stringify({ 名字: '小林', 身份: '同班同学', 性格一句话: '热心', 对主角的称呼: '同学', 日常在做什么: '打球', 常出没地点: '球场', 雷点: '', 情绪倾向: '开朗', 重要度: '一般配角' });
    globalThis.Risuai.nativeFetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"favorDeltas":{"小林":1,"尤娜":0},"newTime":{"year":2003,"month":4,"day":6,"hour":10,"minute":0},"physioEvents":[],"imagePick":{},"emotion":{},"whereabouts":{},"memoryNotes":[],"offEvents":[]}' } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    npcProfiles['char1'] = { 小林: JSON.parse(npcIn) };
    await handleAiOutputAndMilestones('小林也来打招呼。');
    T('NPC:好感分账生效', npcProfiles['char1']['小林'].favor === 1, 'favor=' + npcProfiles['char1']['小林'].favor);
    globalThis.Risuai.nativeFetch = origNF;
    pluginConfig.enableAiAccounting = false; pluginConfig.apiKey = '';

    // ===== 6. 注入器 + 顶部时间 =====
    const replacerFn = __captured.replacers[0];
    T('注入器:beforeRequest已注册', typeof replacerFn === 'function');
    const msgs = await replacerFn([{ role: 'user', content: '你好呀' }]);
    T('注入器:顶部时间消息存在', !!msgs[0] && msgs[0].content.includes('游戏内时间'), msgs[0] && msgs[0].content.slice(0, 30));
    T('注入器:顶部时间含周期/孕期状态', msgs[0].content.includes('周期 Day') || msgs[0].content.includes('孕期'));
    T('注入器:顶部含视觉分镜指令', msgs[0].content.includes('视觉分镜提醒') && msgs[0].content.includes('<Vis:尤娜>'));
    const joined = msgs.map(m => m.content).join('\n');
    T('注入器:好感墙说明书已注入', joined.includes('好感度墙'));
    T('注入器:视觉指令已注入', joined.includes('<Vis:'));
    T('注入器:里程碑上报指令已注入', joined.includes('好感度事件'));
    T('注入器:时间上报指令已注入', joined.includes('游戏时间'));
    const msgsStrip = await replacerFn([{ role: 'user', content: '你好\n<NyTime>2003年4月1日|14:40</NyTime>' }]);
    T('时间条:发送前已剥离标记', msgsStrip.every(m => !String(m.content).includes('<NyTime>')));
    T('注入器:原用户消息保留', msgs.some(m => m.role === 'user' && m.content === '你好呀'));
    T('注入器:systemNotes非空(push修复)', msgs.length >= 3, 'total=' + msgs.length);

    // ===== 7. display handler 图片替换 =====
    const displayFn = (__captured.handlers.find(h => h[0] === 'display') || [])[1];
    T('display:handler已注册', typeof displayFn === 'function');
    const disp1 = await displayFn('正文内容\n<Vis:尤娜>接吻|害羞|常服</Vis>');
    T('display:Vis标签替换为图片代码', !disp1.includes('<Vis:') && /yuna_kiss/.test(disp1), disp1.slice(-50));
    const disp2raw = '他们紧紧拥抱着，气氛温馨。';
    const disp2 = await displayFn(disp2raw);
    T('display:无Vis时保持原文(V5.5.7语义)', disp2 === disp2raw, JSON.stringify(disp2.slice(-40)));
    const disp3 = await displayFn('正文一\n{{raw::yuna_hug_happy.png}}\n完');
    T('display:已含图片代码不再重复补图', (disp3.match(/\{\{raw::/g) || []).length === 1, disp3);
    const disp4 = await displayFn('无任何标签的普通对话，随便聊聊天。');
    T('display:平淡对话不补图', disp4 === '无任何标签的普通对话，随便聊聊天。', JSON.stringify(disp4));

    // ===== 8. 好感墙钳制 =====
    const prof6 = mkProf(); prof6.favor = 40;
    prof6.favor += 30;
    for (const w of FAVOR_WALLS) { if (!prof6[w.flag] && prof6.favor > w.at) prof6.favor = w.at; }
    T('好感墙:未确认时钳制在50', prof6.favor === 50, 'favor=' + prof6.favor);
    prof6.relationConfirmed = true;
    prof6.favor += 10;
    T('好感墙:确认后可越过', prof6.favor === 60, 'favor=' + prof6.favor);
  } catch (e) {
    __results.push(['FAIL', '测试执行异常', (e.stack || e.message).split('\n').slice(0, 6).join(' | ')]);
  }

  // ===== 9. 临时简档防呆机制（V6.3.0）=====
  try {
    const replacerFn9 = __captured.replacers[0];
    delete favorProfiles['char1']; // 清空档案，模拟"从未建档"的卡
    delete cardAiCache['char1']; // 同时清掉AI缓存，否则会被缓存自动恢复
    const msgs9 = await replacerFn9([{ role: 'user', content: '回归测试' }]);
    const prof9 = (favorProfiles['char1'] && Object.values(favorProfiles['char1'])[0]) || null;
    T('临时简档:空档案自动创建', !!prof9 && prof9.临时建档 === true, prof9 && ('name=' + prof9.name + ' favor=' + prof9.favor));
    T('临时简档:周期/年龄有默认值', !!prof9 && prof9.cycleDay === 14 && (prof9.age || 0) >= 18);
    const joined9 = msgs9.map(m => m.content).join('\n');
    T('临时简档:顶部时间照常注入', !!msgs9[0] && msgs9[0].content.includes('游戏内时间'));
    T('临时简档:视觉强制令照常注入', joined9.includes('视觉分镜指令'));
    T('临时简档:搭车建档指令每轮注入', joined9.includes('插件初始化指令'));
    await new Promise(r => setTimeout(r, 450)); // 等防抖保存落盘
    T('临时简档:已持久化到存储', (() => { try { return (globalThis.__storage['fpm_profiles_v3'] || '').includes('临时建档'); } catch (_) { return false; } })());
    // 再触发一次，确认不会重复创建第二个临时槽
    await replacerFn9([{ role: 'user', content: '回归测试2' }]);
    const slotCount = Object.keys(favorProfiles['char1']).length;
    T('临时简档:不重复建槽', slotCount === 1, '槽数=' + slotCount);
  } catch (e) {
    __results.push(['FAIL', '临时简档测试异常', (e.stack || e.message).split('\n').slice(0, 4).join(' | ')]);
  }



  // ===== 11. 保底出图（V6.5.1）=====
  try {
    const dispFn11 = __captured.handlers.find(h => h[0] === 'display')[1];
    // 标签里的动作/服装在卡片图片标签中完全无匹配——旧逻辑全部负分返回空（标签被吞），新逻辑必须保底出图
    const dispC = await dispFn11('测试正文\n<Vis:尤娜>开飞船|沉思|太空服</Vis>\n结束');
    T('保底出图:标签无任何匹配时仍选图', /yuna_/.test(dispC) && !dispC.includes('<Vis:'), dispC.slice(-45));
  } catch (e) {
    __results.push(['FAIL', '保底出图测试异常', String(e.message).slice(0, 80)]);
  }


  // ===== 12. 标签菜单（V6.6.0）=====
  try {
    const replacerFn12 = __captured.replacers[0];
    const msgs12 = await replacerFn12([{ role: 'user', content: '菜单测试' }]);
    const joined12 = msgs12.map(m => m.content).join('|');
    T('标签菜单:已注入到说明书', joined12.includes('可用标签菜单'), joined12.includes('可用标签菜单'));
    T('标签菜单:含图包实际服装词', joined12.includes('泳衣') || joined12.includes('睡衣'), '');
    T('标签菜单:含图包实际表情词', joined12.includes('害羞') || joined12.includes('开心'), '');
    T('标签菜单:体位区已独立注入', joined12.includes('- 体位：'), '');
    T('标签菜单:槽3含裸体状态词', joined12.includes('裸体') || joined12.includes('浴巾'), '');
    T('图片清单:完整图片名清单已注入', joined12.includes('完整图片清单') && joined12.includes('yuna_'), '');
  } catch (e) {
    __results.push(['FAIL', '标签菜单测试异常', String(e.message).slice(0, 80)]);
  }

  let pass = 0, fail = 0;
  console.log('\n========== 奈亚V7.1.1 自动化测试报告 ==========');
  for (const [st, name, extra] of __results) {
    if (st === 'PASS') pass++; else fail++;
    console.log(`[${st}] ${name}${extra ? '  → ' + extra : ''}`);
  }
  console.log(`========== 结果: ${pass} 通过 / ${fail} 失败 ==========`);
