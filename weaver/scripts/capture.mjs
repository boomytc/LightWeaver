#!/usr/bin/env node
import fs from 'node:fs';
import { chromium } from 'playwright';
const job=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const url=new URL(job.url);
if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('截图需要明确的 HTTP(S) 地址');
const browser=await chromium.launch({headless:true,executablePath:process.env.LIGHTWEAVER_CHROME||(fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)});
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await browser.close();process.exit(1);});
try{const page=await browser.newPage({viewport:{width:job.width,height:job.height},deviceScaleFactor:1});await page.goto(url.toString(),{waitUntil:'networkidle',timeout:30000});if(job.selector)await page.locator(job.selector).screenshot({path:job.dest});else await page.screenshot({path:job.dest});process.stdout.write(JSON.stringify({file:job.dest})+'\n');}finally{await browser.close();}
