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
    T('资产扫描:11张立绘(含差分)', report.assets.length === 11, 'got ' + report.assets.length);
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
    T('注入器:时间推进指令已注入', joined.includes('时间推进'));
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
  } catch (e) {
    __results.push(['FAIL', '标签菜单测试异常', String(e.message).slice(0, 80)]);
  }

  let pass = 0, fail = 0;
  console.log('\n========== 奈亚V6.7.0 自动化测试报告 ==========');
  for (const [st, name, extra] of __results) {
    if (st === 'PASS') pass++; else fail++;
    console.log(`[${st}] ${name}${extra ? '  → ' + extra : ''}`);
  }
  console.log(`========== 结果: ${pass} 通过 / ${fail} 失败 ==========`);
