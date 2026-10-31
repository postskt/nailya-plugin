const fs = require('fs');
const pre = fs.readFileSync(__dirname + '/pre.js', 'utf8');
const post = fs.readFileSync(__dirname + '/post.js', 'utf8');
let src = fs.readFileSync('F:/gemini工作区/插件/奈亚V6.2.0.js', 'utf8');
// 关键：async function 声明不会提升出 try 块（Annex B 只提升同步 function），
// 测试代码必须注入到 try 块内部（catch 之前），否则闭包外看不到 async 函数。
src = src.replace(/\}\)\(\);\s*$/, '');
src = src.replace(/\r?\n  \} catch \(err\) \{/, '\n' + post + '\n  } catch (err) {');
fs.writeFileSync(__dirname + '/combined.cjs', pre + '\n' + src + '\n})();\n');
console.log('combined built, total lines:', (pre + src).split('\n').length);
