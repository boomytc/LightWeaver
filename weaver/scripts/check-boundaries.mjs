import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const problems=[];
function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','dist','generated'].includes(e.name))continue;const file=path.join(dir,e.name);if(e.isDirectory())visit(file);else if(/\.(ts|tsx|mjs)$/.test(e.name))check(file);}}
function check(file){const rel=path.relative(root,file),body=fs.readFileSync(file,'utf8');for(const match of body.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)["']([^"']+)["']/g)){const spec=match[1];
 if(rel.startsWith('weaver/src/')&&(/products\//.test(spec)||spec==='electron'||spec.startsWith('electron/')))problems.push(`${rel}: core 导入产品或 Electron ${spec}`);
 if(rel.startsWith('weaver/src/contracts/')&&(spec.startsWith('node:')||!spec.startsWith('.')&&spec!=='zod'))problems.push(`${rel}: contracts 只能依赖 Zod 与自身`);
 if(rel.startsWith('products/')&&(spec.includes('/weaver/src/')||spec.startsWith('@lightweaver/weaver')&&!['@lightweaver/weaver/app','@lightweaver/weaver/contracts'].includes(spec)))problems.push(`${rel}: 只能使用公开 app/contracts 入口`);
 if(rel.startsWith('products/studio/src/')&&(spec.startsWith('node:')||spec==='electron'||spec.startsWith('electron/')||spec==='@lightweaver/weaver/app'))problems.push(`${rel}: 浏览器不能导入 Node、Electron 或 Weaver 运行态`);
 if(rel.startsWith('products/desktop/')&&spec.includes('/weaver/src/'))problems.push(`${rel}: 桌面宿主不能导入 Weaver 源码 ${spec}`);
}if(rel.startsWith('products/')&&/\.(store|db)\b/.test(body)&&!rel.startsWith('products/desktop/'))problems.push(`${rel}: 产品不能直接操作数据库`);}
for(const dir of ['weaver/src','products/studio','products/study-films','products/desktop'])visit(path.join(root,dir));
if(problems.length){process.stderr.write(problems.join('\n')+'\n');process.exitCode=1;}else process.stdout.write('公开模块边界通过\n');
