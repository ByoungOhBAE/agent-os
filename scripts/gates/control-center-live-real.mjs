import { chromium } from "@playwright/test";
const PC="http://127.0.0.1:3100", CO="db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const OUT=process.argv[2];
const projects=await (await fetch(`${PC}/api/companies/${CO}/projects`)).json();
const issues=await (await fetch(`${PC}/api/companies/${CO}/issues?limit=1000`)).json();
const p=projects.filter(x=>!x.archivedAt).find(x=>issues.some(i=>i.projectId===x.id));
const b=await chromium.launch();
const out={};
for (const w of [1440,768,390]) {
  const ctx=await b.newContext({viewport:{width:w,height:w===390?844:900},locale:"ko-KR",timezoneId:"Asia/Seoul",colorScheme:"dark"});
  const page=await ctx.newPage(); const writes=[];
  page.on("request",r=>{ if(!["GET","HEAD","OPTIONS"].includes(r.method())) writes.push(r.method()+" "+r.url()); });
  await page.goto(`${PC}/HER/project-hub?project=${p.id}&tab=control`,{waitUntil:"networkidle"});
  await page.waitForTimeout(2500);
  const tabs=await page.locator('[role="tab"], button, a').allInnerTexts();
  const hasTab=tabs.some(t=>t.trim()==="관제센터");
  const h2=await page.locator("h2, h3").allInnerTexts();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  await page.screenshot({path:`${OUT}/live-real-${w}.png`,fullPage:true});
  out[w]={hasTab,headings:h2.filter(Boolean).slice(0,8),overflowPx:overflow,writes:writes.length};
  await ctx.close();
}
await b.close();
console.log(JSON.stringify(out,null,1));
const ok=Object.values(out).every(o=>o.hasTab&&o.overflowPx<=0&&o.writes===0);
console.log(ok?"LIVE_REAL_OK":"LIVE_REAL_FAIL"); process.exit(ok?0:1);
