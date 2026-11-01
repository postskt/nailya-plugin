# V7.1.1 开发日志（冗余清理与优化）

## 扫描方法
自写扫描器（scan_redundancy.cjs）：749 个定义逐个统计引用数 → 疑似零引用人工复核 → 删除后重扫（连带暴露孤儿函数再清）→ 直至归零。

## 清理内容
1. 删除死函数 analyzeDialogueContext（3.7KB）、getBriefCnLabels（2.6KB）——历史遗留，无任何引用
2. 连带孤儿：hashStringSeed、getCompiledCnIndex（只被上述死函数调用）一并删除
3. 删除 buildWhereabouts 里声明未使用的 hhmm 局部变量
4. 抽取重复代码：Vis固化块与DeepSeek追加块的"资产→图片代码"构建逐字重复 → 抽成 nyBuildImageCode 共用
5. getFastContext 快速通道窗口 400ms→1500ms：记账耗时1~2s总会击穿旧窗口，导致每轮多发 3~4 次 RisuAI 上下文查询；聊天切换实际耗时远大于 1.5s，安全

## 结果
- 文件 383KB→380KB，行数 5334→5143，定义 749→720，零引用归零
- 单元回归 117 项 ×3 轮全过；SOPHIA 真实卡 2 轮联调通过（分账/状态卡/选图全正常）
