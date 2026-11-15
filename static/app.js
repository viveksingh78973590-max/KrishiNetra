
const state = {
  page:"home", cropId:"wheat", lang:"en", user:null,
  savedCrops:["wheat","potato","mustard"], savedMandis:["m1","m3"],
  notifications:[
    {id:"n-1",title:"Rain Expected Tomorrow in Lucknow",category:"Weather Alerts",message:"Scattered rainfall is forecasted tomorrow. Postpone scheduled foliar pesticide and Urea sprays by 48 hours.",time:"2 hours ago",isRead:false,priority:"urgent",actionTarget:"weather"},
    {id:"n-2",title:"Wheat Price Increased by ₹40 / Quintal",category:"Mandi Price Updates",message:"Modal price of Wheat at Lucknow APMC reached ₹2,420/q today.",time:"4 hours ago",isRead:false,priority:"normal",actionTarget:"mandi"},
    {id:"n-3",title:"PM-KISAN 18th Installment Update",category:"Government Scheme Updates",message:"Ensure your Aadhaar is linked to your bank account and land records are verified.",time:"1 day ago",isRead:true,priority:"normal",actionTarget:"schemes"},
    {id:"n-4",title:"Timely Crown Root Initiation (CRI) Advisory",category:"Crop Care Reminders",message:"If your wheat was sown 21 days ago, schedule the 1st light irrigation immediately.",time:"2 days ago",isRead:true,priority:"normal",actionTarget:"crops"}
  ],
  userCrops:[
    {id:"uc-1",cropId:"wheat",cropName:"Wheat (DBW 187)",variety:"Karan Vandana (DBW 187)",sowingDate:"2026-11-10",acreage:2.5,soilType:"Alluvial Loam",expectedHarvest:"April 2027",healthStatus:"Healthy"},
    {id:"uc-2",cropId:"mustard",cropName:"Mustard (Pusa Bold)",variety:"Pusa Bold (NRCHB 101)",sowingDate:"2026-10-15",acreage:1,soilType:"Sandy Loam",expectedHarvest:"March 2027",healthStatus:"Needs Attention"},
    {id:"uc-3",cropId:"potato",cropName:"Potato (Kufri Pukhraj)",variety:"Kufri Pukhraj",sowingDate:"2026-10-22",acreage:1,soilType:"Sandy Loam",expectedHarvest:"January 2027",healthStatus:"Healthy"}
  ],
  isAuth:false, authMode:"login", modalAuth:"login", aiBusy:false
};

state.user = null;  // set by /api/auth/me or login

const PUBLIC_PAGES=["home","about","howto"];
const PRIVATE_LINKS=[["dashboard","Dashboard"],["crops","Crop Guide"],["mandi","Mandi Prices"],["weather","Weather"],["schemes","Government Schemes"],["ai-sathi","AI KrishiNetra"],["crop-doctor","Fasal Vaidya"],["soil-report","Soil Report AI"],["soil","Soil & Fertilizer"],["calendar","Farming Calendar"],["tips","Farming Tips"]];
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const arr=v=>Array.isArray(v)?v:[];
function navigate(page,cropId){if(state.user&&page==="home")page="dashboard";if(!state.user&&!PUBLIC_PAGES.includes(page)){state.pendingPage=page;state.isAuth=true;state.authMode="login";render();return}state.page=page;if(cropId)state.cropId=cropId;window.scrollTo({top:0,behavior:"smooth"});render();}
function pill(label,active,onclick){return `<button class="pill ${active?"active":""}" onclick="${onclick}">${esc(label)}</button>`}
function card(html,cls=""){return `<div class="card ${cls}">${html}</div>`}
function list(items){return `<ul class="list">${arr(items).map(x=>`<li>${esc(typeof x==="object"?JSON.stringify(x):x)}</li>`).join("")}</ul>`}
function generic(obj){return `<div class="grid">${Object.entries(obj||{}).map(([k,v])=>`<div><div class="tiny muted bold">${esc(k.replace(/([A-Z])/g," $1"))}</div>${Array.isArray(v)?list(v):(v&&typeof v==="object"?generic(v):`<div>${esc(v)}</div>`)}</div>`).join("")}</div>`}
function shell(title,hindi,content,right="",pageClass=""){return `<div class="shell farm-theme ${pageClass}"><div class="shell-head"><div><h1>${esc(title)}</h1>${hindi?`<div class="hindi">${esc(hindi)}</div>`:""}</div>${right}</div>${content}</div>`}

function navbar(){
  const out=[["home","Home"],["about","About this Project"],["howto","How to use"]];
  const links=state.user?PRIVATE_LINKS:out;
  const unread=state.notifications.filter(n=>!n.isRead).length;
  return `<div class="topbar"><div class="container"><span>🟢 Free Kisan Call Centre Helpline:</span><a href="tel:18001801551">📞 1800-180-1551 (6 AM - 10 PM)</a></div></div>
  <header class="nav"><div class="container nav-main">
    <a class="brand" href="#" onclick="navigate(state.user?'dashboard':'home');return false"><span class="brand-mark">🌾</span><span>Krishi<span>Netra</span></span></a>
    <nav class="nav-links">${links.map(([id,label])=>`<button class="${state.page===id?"active":""}" onclick="navigate('${id}')">${label}</button>`).join("")}</nav>
    <div class="nav-actions">
      ${state.user?`<button class="icon-btn" onclick="toggleNotifications()">🔔 ${unread?`<b>${unread}</b>`:""}</button>`:""}
      ${appLangSelect()}
      ${state.user?`<button class="user-btn" onclick="navigate('dashboard')">👤 ${esc(state.user.name.split(" ")[0])}</button>`
        :`<button class="icon-btn" onclick="openAuth('login')">Login</button><button class="user-btn" onclick="openAuth('signup')">Register</button>`}
      <button class="icon-btn hamb" onclick="mobileNav()">☰</button>
    </div>
  </div></header>
  <div id="notification-panel"></div>`;
}

function footer(){
 const svc=state.user?[["crops","Crop Guide & Advisory"],["mandi","Mandi Prices & Bhav"],["weather","NASA Weather Alerts"],["crop-doctor","Fasal Vaidya"],["schemes","Government Schemes"],["soil","Soil & Fertilizer"]]:[["home","Home"],["about","About this Project"],["howto","How to use"]];
 const plan=state.user?[["calendar","Agricultural Calendar"],["tips","Organic & Modern Tips"],["ai-sathi","AI KrishiNetra Chat"],["dashboard","Farmer Dashboard"]]:[];
 return `<footer class="footer"><div class="container"><div class="footer-grid">
 <div><div class="brand" style="color:white"><span class="brand-mark">🌾</span><span>Krishi<span>Netra</span></span></div><p class="small" style="color:#a8a29e">See your field the way NASA does. AI-powered agricultural guidance for Indian farmers.</p><div class="card" style="background:#292524;border-color:#44403c;color:white"><b>Kisan Toll-Free Call Centre</b><br><a href="tel:18001801551">1800-180-1551 (All 7 Days)</a></div></div>
 <div><h4>${state.user?"Farmer Services":"Explore"}</h4>${svc.map(x=>`<button onclick="navigate('${x[0]}')">${x[1]}</button>`).join("")}${state.user?"":`<button onclick="openAuth('login')">Login</button><button onclick="openAuth('signup')">Register free</button>`}</div>
 ${plan.length?`<div><h4>Planning & Support</h4>${plan.map(x=>`<button onclick="navigate('${x[0]}')">${x[1]}</button>`).join("")}</div>`:""}
 <div><h4>Official Portals</h4>${[["https://pmkisan.gov.in","PM-KISAN Portal"],["https://pmfby.gov.in","PM Fasal Bima"],["https://enam.gov.in","e-NAM Mandi"],["https://soilhealth.dac.gov.in","Soil Health Card"],["https://icar.org.in","ICAR"]].map(x=>`<a target="_blank" href="${x[0]}">${x[1]} ↗</a>`).join("")}</div>
 </div><div class="footer-bottom"><span>© 2026 KrishiNetra. All rights reserved.</span><span>Made with ♥ for Indian Farmers</span></div></div></footer>`;
}

function homeLive(){
 const fill=async(name,c)=>{try{
  const r=await fetch(`/api/nasa-outlook?lat=${c[0]}&lon=${c[1]}`);const o=await r.json();if(!$("#hp-wet"))return;
  const rc=o.recent;if(!rc)throw new Error("x");
  $("#hp-title").textContent="Live NASA field reading — "+name;$("#hp-sub").textContent="NASA POWER · "+rc.period;
  $("#hp-wet").textContent=rc.soil_wetness!=null?rc.soil_wetness:"–";$("#hp-rain").textContent=rc.rain_total+" mm";$("#hp-rain-l").textContent="Rain, last "+rc.days+" days";$("#hp-temp").textContent=rc.avg_temp+"°C";
  const w=(o.warnings||[])[0];
  $("#hp-alert").textContent=w?((OUT_ICON[w.type]||"⚠️")+" "+w.title+" ("+w.when+"): "+w.message):(rc.soil_wetness!=null&&rc.soil_wetness<0.35?"⚠️ Low soil moisture — a chickpea or lentil rotation needs far less water.":"✅ No extreme weather expected in the next 16 days.");
 }catch(e){if($("#hp-sub")){$("#hp-sub").textContent="NASA POWER · live data unavailable (check internet)";$("#hp-alert").textContent="🛰️ Open the Weather page to retry.";}}};
 setTimeout(()=>{const d=[26.85,80.95];fill("Lucknow",d);
  if(navigator.geolocation&&navigator.permissions){navigator.permissions.query({name:"geolocation"}).then(p=>{if(p.state==="granted")navigator.geolocation.getCurrentPosition(g=>fill("your location",[g.coords.latitude,g.coords.longitude]))}).catch(()=>{})}},0);
}
function home(){homeLive();
 const cta=state.user?`<button class="btn btn-green" onclick="navigate('dashboard')">Go to my dashboard →</button>`:`<button class="btn btn-green" onclick="openAuth('signup')">🌱 Register free</button><button class="btn nh-ghost" onclick="openAuth('login')">I already have an account</button>`;
 return `<div class="container" style="padding-top:24px"><div class="nh">
 <section class="nh-hero"><div><h2>See your field the way NASA sees it.</h2>
 <p>KrishiNetra turns NASA satellite records — rainfall, temperature and soil moisture at your exact farm — into early weather warnings and simple farming guidance, and an AI plant doctor reads your crop photos.</p>
 <div class="nh-cta">${cta}<button class="btn nh-ghost" onclick="navigate('about')">About this project</button><button class="btn nh-ghost" onclick="navigate('howto')">How to use</button></div></div>
 <div class="nh-probe"><b id="hp-title">Live NASA field reading</b><br><small id="hp-sub">NASA POWER · loading live data…</small>
 <div class="nh-stats"><div class="nh-stat"><b id="hp-wet">–</b><small>Root-zone moisture (0–1)</small></div><div class="nh-stat"><b id="hp-rain">–</b><small id="hp-rain-l">Rain, last 30 days</small></div><div class="nh-stat"><b id="hp-temp">–</b><small>Average temperature</small></div></div>
 <div class="nh-alert" id="hp-alert">🛰️ Fetching satellite data…</div></div></section>
 <section class="nh-sec" id="features"><h3>Everything inside your farmer dashboard</h3><p class="muted" style="margin:-6px 0 14px">Register once (free) and unlock all of these.</p><div class="nh-grid4">
 <div class="card"><h4>🛰️ NASA weather early warning</h4><p>16-day alerts for heat, cold, frost and rain at your exact location.</p></div>
 <div class="card"><h4>🌿 Fasal Vaidya</h4><p>Upload a leaf photo — get disease, treatment, organic remedies and a soil check.</p></div>
 <div class="card"><h4>🤖 AI KrishiNetra</h4><p>Ask farming questions in Hindi, English or 12 other languages.</p></div>
 <div class="card"><h4>💰 Mandi prices</h4><p>Compare crop prices across markets before you sell.</p></div>
 <div class="card"><h4>🌱 Crop guide</h4><p>Sowing, irrigation, fertilizer, disease and harvest advice.</p></div>
 <div class="card"><h4>🏛️ Government schemes</h4><p>Benefits, eligibility and how to apply — auto-updated.</p></div>
 <div class="card"><h4>🧪 Soil & fertilizer</h4><p>Understand your soil and nutrients.</p></div>
 <div class="card"><h4>📅 Calendar & tips</h4><p>Month-wise farm planning and practical organic tips.</p></div></div></section>
 <section class="nh-sec"><h3>How it works</h3><div class="nh-steps"><div><b>Register</b><br>Sign up with your mobile number or email — no long forms.</div><div><b>Login</b><br>Sign in to open your personal farmer dashboard.</div><div><b>Use every feature</b><br>Weather, crop doctor, prices, schemes and chat — all inside your dashboard.</div></div>
 <div class="nh-cta" style="margin-top:20px">${state.user?"":`<button class="btn btn-green" onclick="openAuth('signup')">Get started</button>`}</div></section>
 <div class="nh-foot">Data: NASA POWER · NASA GIBS (MODIS). For pesticide doses, ask your nearest Krishi Vigyan Kendra (KVK).</div>
 </div></div>`;
}

function about(){
 return shell("About this Project","कृषि नेत्र — इस प्रोजेक्ट के बारे में",
 `<div class="grid">${card(`<h2 style="margin-top:0">What is KrishiNetra?</h2><p>KrishiNetra is a free digital farming companion for Indian farmers. It uses <b>NASA satellite records</b> and <b>AI</b> to tell a farmer what is happening on their field and what is coming next — in simple language, in Hindi and 13 other languages.</p>`)}
 ${card(`<h2 style="margin-top:0">The problem we solve</h2><ul class="list"><li>Sudden heat, cold, frost or rain damages crops because farmers get no early notice for their exact location.</li><li>Plant diseases are noticed late, and the right advice is far away.</li><li>Prices, schemes and farming knowledge are scattered across many websites.</li></ul>`)}
 <div class="grid grid-2">${card(`<h3 style="margin-top:0">🛰️ NASA data</h3><p class="small">Rain, temperature and root-zone soil moisture for your farm from NASA POWER, compared with what is normal for your place and month, to warn about unusual weather up to 16 days ahead.</p>`)}${card(`<h3 style="margin-top:0">🌿 Fasal Vaidya</h3><p class="small">Reads a photo of your crop. It refuses AI-generated photos, automatically cleans blurry or dark ones, then explains the plant problem and the soil condition.</p>`)}${card(`<h3 style="margin-top:0">🤖 AI KrishiNetra</h3><p class="small">Powered by Google Gemini. Ask about crops, fertilizer, weather or schemes and get answers in your language.</p>`)}${card(`<h3 style="margin-top:0">📚 Farming knowledge</h3><p class="small">Crop guides, mandi prices, government schemes, soil and fertilizer help, farming calendar and organic tips — in one place.</p>`)}</div>
 ${card(`<h3 style="margin-top:0">Please remember</h3><p class="small muted">AI can make mistakes. Mandi prices shown are demo data. For pesticide doses and official scheme details, always confirm with your nearest Krishi Vigyan Kendra (KVK) or the official government website.</p>`)}
 ${state.user?"":`<div><button class="btn btn-green" onclick="openAuth('signup')">Register free</button> <button class="btn btn-light" onclick="navigate('howto')">How to use →</button></div>`}</div>`,"","nh-info");
}

function howto(){
 const steps=[["1","Register","Tap Register at the top. Enter your name, phone or email, a password, your state and district. It takes under a minute and is free."],["2","Login","Sign in with the same phone or email and password. You will land on your farmer dashboard."],["3","Open your dashboard","After login, the menu at the top unlocks: Weather, Fasal Vaidya, AI KrishiNetra, Mandi Prices, Crop Guide, Government Schemes, Soil, Calendar and Tips."],["4","Check NASA weather alerts","Open Weather, pick your district or tap Use my location. The NASA card shows heat, cold, frost and rain warnings for the next 16 days with dates."],["5","Scan a sick plant","Open Fasal Vaidya, type the crop name, upload a REAL close-up photo of the leaf in daylight and tap Diagnose. Blurry or dark photos are fixed automatically. AI-made photos are rejected."],["6","Ask anything","Open AI KrishiNetra and ask in your own language by typing. Choose the language from the drop-down."]];
 return shell("How to use KrishiNetra","कृषि नेत्र का उपयोग कैसे करें",
 `<div class="grid">${steps.map(s=>card(`<div style="display:flex;gap:14px;align-items:flex-start"><div style="min-width:42px;height:42px;border-radius:50%;background:var(--green);color:white;display:grid;place-items:center;font-weight:800;font-size:18px">${s[0]}</div><div><b style="font-size:17px">${esc(s[1])}</b><p class="small" style="margin:4px 0 0">${esc(s[2])}</p></div></div>`)).join("")}
 ${card(`<h3 style="margin-top:0">Tips for a good photo</h3><ul class="list"><li>Take the photo in daylight, close to the affected leaf.</li><li>Upload an original camera photo — not an edited or AI-generated one.</li><li>Include a little soil in the frame if you also want a soil check.</li></ul>`)}
 ${state.user?`<div><button class="btn btn-green" onclick="navigate('dashboard')">Go to my dashboard →</button></div>`:`<div><button class="btn btn-green" onclick="openAuth('signup')">Register free</button> <button class="btn btn-light" onclick="openAuth('login')">Login</button></div>`}</div>`,"","nh-info");
}


function cropsPage(){
 let q="",cat="All",season="All";
 const renderList=()=>{
  const rows=(window.CROPS_DATA||[]).filter(c=>(!q||(`${c.name} ${c.hindiName} ${(c.commonDiseases||[]).join(" ")}`).toLowerCase().includes(q.toLowerCase()))&&(cat==="All"||c.category===cat)&&(season==="All"||c.season===season));
  const html=rows.map(c=>`<div class="card crop-card"><img class="crop-img" src="${esc(c.image)}" alt="${esc(c.name)}"><div class="crop-body"><div><span class="tag">${esc(c.season)}</span><span class="tag">${esc(c.category)}</span><button style="float:right" class="icon-btn" onclick="toggleCrop('${c.id}')">${state.savedCrops.includes(c.id)?"★":"☆"}</button></div><h2>${esc(c.name)} <span class="muted">${esc(c.hindiName)}</span></h2><p class="small muted">${esc(c.overview)}</p><div class="kv"><div><b>Best Sowing</b>${esc(c.bestSowingTime)}</div><div><b>Soil</b>${esc(c.soilRequirement)}</div><div><b>Climate</b>${esc(c.climate)}</div><div><b>Seed</b>${esc(c.seedRequirement)}</div><div><b>Irrigation</b>${esc(c.irrigation)}</div><div><b>Fertilizer</b>${esc(c.fertilizerGuidance)}</div></div><p class="small"><b>Diseases:</b> ${(c.commonDiseases||[]).map(d=>`<span class="tag red">${esc(d)}</span>`).join("")}</p><button class="btn btn-green" onclick="navigate('crop-detail','${c.id}')">View Full Guide →</button></div></div>`).join("");
  $("#crop-list").innerHTML=html||`<div class="empty">No crops found.</div>`;$("#crop-count").textContent=`Showing ${rows.length} of ${CROPS_DATA.length} Crops`;
 };
 const categories=["All","Cereals","Pulses","Oilseeds","Vegetables","Commercial"], seasons=["All","Rabi","Kharif","Zaid","Whole Year"];
 const content=`<div class="card" style="margin-bottom:18px"><div style="display:flex;gap:10px;flex-wrap:wrap"><input id="crop-q" class="input" style="flex:1;min-width:240px" placeholder="Search crop name or disease..."><span id="crop-count" class="small muted"></span></div><hr style="border:0;border-top:1px solid #f0f0ee;margin:15px 0"><div class="pills"><b class="tiny muted">Category:</b>${categories.map(x=>pill(x,x===cat,`setCropFilter('cat','${x}')`)).join("")}</div><div class="pills" style="margin-top:8px"><b class="tiny muted">Season:</b>${seasons.map(x=>pill(x,x===season,`setCropFilter('season','${x}')`)).join("")}</div></div><div id="crop-list" class="grid grid-2"></div>`;
 const page=shell("Indian Crop Cultivation Guide","विस्तृत फसल मार्गदर्शिका",`<div class="hero" style="margin-bottom:18px;padding:30px"><h1 style="font-size:34px">Indian Crop Cultivation Guide</h1><p>Detailed agronomic manuals for major crops — sowing, seed rate, fertilizer, irrigation, disease management and harvesting.</p></div>${content}`);
 setTimeout(()=>{$("#crop-q").oninput=e=>{q=e.target.value;renderList()};window._cropFilter=(k,v)=>{if(k==="cat")cat=v;else season=v;renderList()};renderList()},0);
 return page;
}
window.setCropFilter=(k,v)=>window._cropFilter&&window._cropFilter(k,v);

function cropDetail(){
 const c=(window.CROPS_DATA||[]).find(x=>x.id===state.cropId);
 if(!c)return shell("Crop not found","",`<button class="btn btn-green" onclick="navigate('crops')">Back to Crop Guide</button>`);
 const {id,name,hindiName,...rest}=c;
 return shell(name,hindiName,`<div style="display:flex;gap:8px;margin-bottom:14px"><button class="btn btn-light" onclick="navigate('crops')">← Crop Guide</button><button class="btn btn-green" onclick="toggleCrop('${id}')">${state.savedCrops.includes(id)?"★ Saved":"☆ Save crop"}</button></div>${card(generic(rest))}`);
}

const DISTRICT_COORDS={Lucknow:[26.85,80.95],Ayodhya:[26.80,82.20],Varanasi:[25.32,83.01],Kanpur:[26.45,80.35],Ludhiana:[30.90,75.85],Amritsar:[31.63,74.87],Delhi:[28.61,77.21],Jaipur:[26.91,75.79],Indore:[22.72,75.86],Bhopal:[23.26,77.41],Patna:[25.59,85.14],Kolkata:[22.57,88.36],Nagpur:[21.15,79.09],Pune:[18.52,73.86],Ahmedabad:[23.02,72.57],Hyderabad:[17.39,78.49]};
const WMO_HI={"clear sky":"साफ़ आसमान","mainly clear":"ज़्यादातर साफ़","partly cloudy":"आंशिक बादल","overcast":"बादल छाए","fog":"कोहरा","light drizzle":"हल्की फुहार","drizzle":"फुहार","heavy drizzle":"तेज़ फुहार","light rain":"हल्की बारिश","rain":"बारिश","heavy rain":"तेज़ बारिश","light snow":"हल्की बर्फ़बारी","snow":"बर्फ़बारी","heavy snow":"भारी बर्फ़बारी","rain showers":"बारिश की बौछारें","violent showers":"तेज़ बौछारें","thunderstorm":"आंधी-बारिश","thunderstorm with hail":"ओलों के साथ आंधी-बारिश","mixed":"मिला-जुला"};

const OUT_ICON={heat:"🔥",cold:"🥶",rain:"🌧️",dry:"🏜️"};
async function loadNasaOutlook(c,T){
 const el=$("#nasa-outlook");if(!el)return;
 el.innerHTML=card(`<b>🛰️ NASA</b> <span class="muted small">${T("Loading satellite outlook for your area…","आपके इलाके का सैटेलाइट पूर्वानुमान आ रहा है…")}</span>`);
 try{
  const r=await fetch(`/api/nasa-outlook?lat=${c[0]}&lon=${c[1]}`);const o=await r.json();
  if(!el.isConnected)return;
  if(!r.ok&&!o.recent&&!(o.warnings||[]).length)throw new Error(o.error||"x");
  const w=o.warnings||[],rc=o.recent,nm=o.normal,tl=o.timeline||[];
  const sevCls=s=>s==="high"?"high":"";
  const warnHtml=w.length?w.map(a=>`<div class="alert ${sevCls(a.severity)}"><b>${OUT_ICON[a.type]||"⚠️"} ${esc(a.title)}</b> <span class="tiny muted">· ${esc(a.when)}</span><div class="small">${esc(a.message)}</div></div>`).join(""):`<div class="alert"><b>✅ ${T("No extreme weather expected in the next 16 days","अगले 16 दिनों में कोई चरम मौसम नहीं दिख रहा")}</b><div class="small">${T("No heat wave, cold wave or heavy rain is forecast for your area.","आपके इलाके में लू, शीतलहर या भारी बारिश का अनुमान नहीं है।")}</div></div>`;
  const maxT=Math.max(...tl.map(d=>d.tmax??0),1),maxR=Math.max(...tl.map(d=>d.rain||0),1);
  const bars=tl.length?`<div style="display:flex;gap:4px;align-items:flex-end;height:96px;overflow-x:auto;padding:6px 0">${tl.map(d=>{const h=Math.max(8,Math.round((d.tmax/maxT)*70));const dt=new Date(d.date);return `<div title="${esc(d.date)}: ${Math.round(d.tmax)}°/${Math.round(d.tmin)}°C, ${d.rain.toFixed(1)}mm" style="flex:1;min-width:34px;text-align:center"><div class="tiny">${Math.round(d.tmax)}°</div><div style="height:${h}px;background:${d.tmax>=40?"#dc2626":d.tmax>=35?"#d97706":"#059669"};border-radius:6px 6px 0 0"></div><div class="tiny" style="color:#0369a1">${d.rain>=1?Math.round(d.rain)+"mm":"·"}</div><div class="tiny muted">${dt.getDate()}</div></div>`}).join("")}</div>`:"";
  const facts=[];
  if(rc)facts.push(`<div class="nh-stat"><b>${esc(rc.rain_total)} mm</b><small>${T("Rain, last","बारिश, पिछले")} ${esc(rc.days)} ${T("days (NASA)","दिन (NASA)")}</small></div>`,`<div class="nh-stat"><b>${esc(rc.avg_temp)}°C</b><small>${T("Avg temp (NASA)","औसत तापमान (NASA)")}</small></div>`,`<div class="nh-stat"><b>${rc.soil_wetness!=null?esc(rc.soil_wetness):"–"}</b><small>${T("Root-zone soil moisture 0–1","जड़ क्षेत्र की नमी 0–1")}</small></div>`);
  if(nm&&nm.tmax!=null)facts.push(`<div class="nh-stat"><b>${Math.round(nm.tmax)}° / ${Math.round(nm.tmin)}°</b><small>${T("NASA normal max / min this month","इस महीने का NASA सामान्य अधिकतम/न्यूनतम")}</small></div>`);
  el.innerHTML=`<div class="card" style="border-top:6px solid #1b4fd6;margin-bottom:18px"><h2 style="margin:0 0 4px">🛰️ ${T("NASA Early Warning — next 16 days","NASA पूर्व-चेतावनी — अगले 16 दिन")}</h2><div class="tiny muted" style="margin-bottom:10px">${T("Coming weather compared with NASA's normal for your exact location","आने वाला मौसम, आपकी लोकेशन के NASA सामान्य मौसम से तुलना करके")}</div>${warnHtml}${bars}${facts.length?`<div class="nh-stats">${facts.join("")}</div>`:""}<div class="tiny muted" style="margin-top:8px">${T("Sources","स्रोत")}: ${esc((o.sources||[]).join(" · "))}. ${T("NASA satellite data shows what has happened and what is normal; the 16-day outlook comes from weather forecast models. Forecasts can change — recheck daily.","NASA सैटेलाइट डेटा बताता है कि क्या हुआ और सामान्य क्या है; 16 दिन का पूर्वानुमान मौसम मॉडल से आता है। पूर्वानुमान बदल सकता है — रोज़ देखें।")}</div></div>`;
 }catch(e){if(el.isConnected)el.innerHTML=card(`<span class="small muted">🛰️ ${T("NASA outlook not available right now (check internet).","NASA पूर्वानुमान अभी उपलब्ध नहीं (इंटरनेट जाँचें)।")}</span>`)}
}

function weather(){
 let k="Lucknow",live=null,msg="",coords=null,token=0;
 const names=[...new Set([...Object.keys(DISTRICT_COORDS),...Object.keys(window.DISTRICT_WEATHER||{})])];
 const hi=()=>state.lang==="hi";
 const T=(en,h)=>hi()?h:en;
 const cond=c=>hi()?(WMO_HI[String(c).toLowerCase()]||c):c;
 const draw=()=>{const w=live||(window.DISTRICT_WEATHER||{})[k];const el=$("#weather-content");if(!el)return;$("#weather-msg").textContent=msg;
  if(!w){el.innerHTML=card(`<p>${T("Weather not available for this place right now.","इस जगह का मौसम अभी उपलब्ध नहीं है।")}</p>`);return}
  el.innerHTML=`${card(`<div class="stat">${esc(w.current.temp)}°C</div><b>${esc(cond(w.current.condition))}</b><p class="small muted">${T("Feels","महसूस")} ${esc(w.current.feelsLike)}° · ${T("Humidity","नमी")} ${esc(w.current.humidity)}% · ${T("Wind","हवा")} ${esc(w.current.windSpeed)} km/h · ${T("Rain","बारिश")} ${esc(w.current.rainProbability)}% · UV ${esc(w.current.uvIndex)}</p>`)}<div style="margin-top:15px">${(w.alerts||[]).map(a=>`<div class="alert ${a.severity==='high'?'high':''}"><b>${esc(a.title)}</b><div class="small">${esc(a.message)}</div></div>`).join("")}</div><h2>${T("Forecast","पूर्वानुमान")}</h2><div class="forecast">${(w.forecast||[]).map(d=>card(`<b>${esc(d.day)}</b><div class="tiny muted">${esc(d.date)}</div><div class="small">${esc(cond(d.condition))}</div><b>${esc(d.tempMax)}° / ${esc(d.tempMin)}°</b><div class="tiny" style="color:#0369a1">${T("Rain","बारिश")} ${esc(d.rainProbability)}%</div>`)).join("")}</div>`};
 const load=async()=>{const my=++token;const c=coords||DISTRICT_COORDS[k];live=null;if(c)loadNasaOutlook(c,T);
  if(!c){msg=T("Showing sample data for this place","इस जगह का नमूना डेटा दिखा रहे हैं");draw();return}
  msg=T("Loading live weather…","लाइव मौसम आ रहा है…");draw();
  try{const r=await fetch(`/api/weather?lat=${c[0]}&lon=${c[1]}`);const d=await r.json();if(my!==token)return;if(!r.ok||!d.current)throw new Error("x");live=d;msg=T("Live · Open-Meteo · updated ","लाइव · Open-Meteo · अपडेट ")+new Date(d.fetchedAt).toLocaleTimeString()}
  catch(e){if(my!==token)return;live=null;msg=(window.DISTRICT_WEATHER||{})[k]?T("Live weather unavailable - showing sample data","लाइव मौसम नहीं मिला - नमूना डेटा दिखा रहे हैं"):T("Live weather unavailable","लाइव मौसम नहीं मिला")}
  draw()};
 const page=shell("Weather","मौसम",`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><select id="weather-k" class="select" style="max-width:260px">${names.map(x=>`<option>${esc(x)}</option>`).join("")}</select><button id="weather-loc" class="btn btn-light">📍 ${T("Use my location","मेरी लोकेशन")}</button></div><div id="weather-msg" class="tiny muted" style="margin-bottom:10px"></div><div id="nasa-outlook"></div><div id="weather-content"></div>`);
 setTimeout(()=>{$("#weather-k").value=k;$("#weather-k").onchange=e=>{k=e.target.value;coords=null;load()};
  $("#weather-loc").onclick=()=>{if(!navigator.geolocation){msg=T("Location not supported in this browser","इस ब्राउज़र में लोकेशन उपलब्ध नहीं");draw();return}navigator.geolocation.getCurrentPosition(p=>{coords=[p.coords.latitude,p.coords.longitude];load()},()=>{msg=T("Location permission denied","लोकेशन की अनुमति नहीं मिली");draw()},{timeout:10000})};
  load()},0);return page;
}

function schemeInfo(s){const src=(s.sources||[]).filter(x=>/^https?:\/\//.test(x.uri)).slice(0,3).map(x=>`<a href="${esc(x.uri)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>`).join(" · ");
 const d=s.lastUpdated||s.lastChecked;return `<div class="tiny muted" style="margin-top:10px">${s.autoAdded?"🆕 Auto-found online - official website par zaroor verify karein. ":""}${d?"Auto-updated: "+esc(String(d).slice(0,10))+". ":""}${s.recentChanges?esc(s.recentChanges)+" ":""}${src?"Sources: "+src:""}</div>`}
function schemes(){
 let cat="All",open=null;const cats=["All",...new Set((window.GOVERNMENT_SCHEMES_DATA||[]).map(s=>s.category))];
 const draw=()=>{const list=(window.GOVERNMENT_SCHEMES_DATA||[]).filter(s=>cat==="All"||s.category===cat);$("#scheme-list").innerHTML=list.map(s=>card(`<div class="bold" style="font-size:18px">${esc(s.name)} <span class="success small">${esc(s.hindiName)}</span></div><div class="tiny muted">${esc(s.category)} · ${esc(s.authority)}${s.autoAdded?" · 🆕 Auto-found":""}</div><p class="small">${esc(s.overview)}</p><button class="btn btn-light" onclick="toggleScheme('${s.id}')">${open===s.id?"Hide details":"Details"}</button>${open===s.id?`<div style="margin-top:12px"><b>Benefits</b>${list(s.benefits)}<b>Eligibility</b>${list(s.eligibility)}<b>Documents</b>${list(s.requiredDocuments)}<b>How to apply</b>${list(s.applicationProcess)}<a class="btn btn-green" style="display:inline-block;margin-top:8px;text-decoration:none" target="_blank" rel="noopener noreferrer" href="${esc(s.officialWebsite)}">Official website ↗</a>${schemeInfo(s)}</div>`:""}`)).join("")};
 const page=shell("Government Schemes","सरकारी योजनाएं",`${(window.SCHEMES_META&&window.SCHEMES_META.lastRun)?`<div class="notice">Yojanaon ki jaankari apne aap update hoti rehti hai. Last auto-update: ${esc(String(window.SCHEMES_META.lastRun).slice(0,10))} (${esc(window.SCHEMES_META.summary||"")}). Apply karne se pehle official website check karein.</div>`:`<div class="notice">Yojanaon ki jaankari periodically auto-update hoti hai (server par Gemini key chalu hone par). Apply karne se pehle official website check karein.</div>`}<div class="pills" id="scheme-cats">${cats.map(x=>pill(x,x===cat,`setSchemeCat('${x}')`)).join("")}</div><div id="scheme-list" class="grid grid-2"></div>`);
 setTimeout(()=>{window._schemeCat=x=>{cat=x;draw()};window.setSchemeCat=x=>window._schemeCat(x);window.toggleScheme=x=>{open=open===x?null:x;draw()};draw()},0);return page;
}

function soil(){
 return shell("Soil & Fertilizer","मिट्टी और पोषण",`${soilPromo()}<div style="height:14px"></div><div class="grid grid-2">${(window.SOIL_TYPES||[]).map(s=>card(`<div class="bold">${esc(s.name)}</div><div class="success small">${esc(s.hindiName)}</div><p class="small">${esc(s.characteristics)}</p><div class="kv"><div><b>pH</b>${esc(s.phRange)}</div><div><b>Water retention</b>${esc(s.waterRetention)}</div><div><b>Organic matter</b>${esc(s.organicMatterContent)}</div><div><b>Best crops</b>${esc((s.bestSuitedCrops||[]).join(", "))}</div></div><b>Management</b>${list(s.managementTips)}`)).join("")}</div><div class="section-title"><h2>NPK Explanation</h2></div>${card(generic(window.NPK_EXPLANATION||{}))}`);
}

function calendar(){
 const months=Object.keys(window.FARMING_CALENDAR_DATA||{});let m=months[new Date().getMonth()]||months[0];
 const draw=()=>{$("#cal-body").innerHTML=card(generic(window.FARMING_CALENDAR_DATA[m]||{}))};
 const page=shell("Farming Calendar","खेती कैलेंडर",`<div class="pills">${months.map(x=>pill(x,x===m,`setMonth('${x}')`)).join("")}</div><div id="cal-body"></div>`);
 setTimeout(()=>{window.setMonth=x=>{m=x;draw()};draw()},0);return page;
}

function tips(){
 const cats=["All",...new Set((window.FARMING_TIPS_DATA||[]).map(t=>t.category))];let cat="All";
 const draw=()=>{$("#tips-list").innerHTML=(window.FARMING_TIPS_DATA||[]).filter(t=>cat==="All"||t.category===cat).map(t=>card(`<div class="tiny success bold">${esc(t.category)}</div><h3>${esc(t.title)}</h3><p class="small">${esc(t.summary)}</p>${list(t.steps)}<p class="small"><b>Benefit:</b> ${esc(t.benefit)}</p>`)).join("")};
 const page=shell("Farming Tips","खेती के सुझाव",`<div class="pills">${cats.map(x=>pill(x,x===cat,`setTipCat('${x}')`)).join("")}</div><div id="tips-list" class="grid grid-2"></div>`);
 setTimeout(()=>{window.setTipCat=x=>{cat=x;draw()};draw()},0);return page;
}

function dashboard(){
 if(!state.user)return shell("Farmer Dashboard","",card(`<p>Dashboard dekhne ke liye login karein.</p><button class="btn btn-green" onclick="openAuth('login')">Login</button>`));
 const u=state.user, unread=state.notifications.filter(n=>!n.isRead).length;
 return shell(`Namaste, ${u.name}`,[u.village,u.district,u.state].filter(Boolean).join(", ")+(u.landSizeAcres>0?` · ${u.landSizeAcres} acres`:""),`${card(`<div class="grid grid-3"><div><div class="stat">${u.userCrops.length}</div>My crops</div><div><div class="stat">${unread}</div>Unread alerts</div><div><button class="btn btn-red" onclick="logout()">Logout</button></div></div>`)}
 ${farmCard()}${soilPromo()}
 <h2>All Farmer Services</h2><div class="grid grid-3">${[["🌦️","NASA Weather Alerts","16-day heat, cold & rain warnings","weather"],["🩺","Fasal Vaidya","Photo → disease, treatment & soil check","crop-doctor"],["🤖","AI KrishiNetra","Ask farming questions","ai-sathi"],["💰","Mandi Prices","Compare market prices","mandi"],["🌱","Crop Guide","Sowing to harvest advice","crops"],["🏛️","Government Schemes","Benefits & how to apply","schemes"],["🧪","Soil Report AI","Upload report → what is wrong & best fix","soil-report"],["🧪","Soil & Fertilizer","Nutrients and soil basics","soil"],["📅","Farming Calendar","Month-wise planning","calendar"],["💡","Farming Tips","Organic & modern tips","tips"]].map(s=>`<div class="service"><div class="emoji">${s[0]}</div><h3>${s[1]}</h3><p>${s[2]}</p><button class="btn btn-green" onclick="navigate('${s[3]}')">Open →</button></div>`).join("")}</div>
 <h2 style="margin-top:28px">My Crops</h2><div class="grid grid-3">${u.userCrops.map(c=>card(`<div class="bold">${esc(c.cropName)}</div><div class="tiny">${c.acreage} acres · ${esc(c.soilType)}</div><div class="small">Sown ${esc(c.sowingDate)} → Harvest ${esc(c.expectedHarvest)}</div><div class="small bold ${c.healthStatus==="Healthy"?"success":"danger"}">${esc(c.healthStatus)}</div><button class="btn btn-light" onclick="navigate('crop-doctor')">Check disease</button> <button class="btn btn-red" onclick="removeUserCrop('${c.id}')">Remove</button>`)).join("")}</div>
 <div class="section-title"><h2>Alerts</h2><button class="btn btn-light" onclick="markAllRead()">Mark all read</button></div><div class="grid">${state.notifications.map(n=>`<div class="card ${n.isRead?"":"notice"}" onclick="notificationClick('${n.id}')"><b>${esc(n.title)}</b><div class="small">${esc(n.message)}</div><div class="tiny muted">${esc(n.time)} · ${esc(n.category)}</div></div>`).join("")}</div>`);
}

function aiSathi(){
 const msgs=state.aiMsgs||[GREETING];
 state.aiMsgs=msgs;
 const quick=["Gehun me peele patte kyu hote hain?","PM-KISAN ke liye apply kaise karein?","Rabi me sarson kab boyein?"];
 const page=shell("AI KrishiNetra","एआई कृषि नेत्र",`<div id="chat" class="chat">${msgs.map(m=>`<div class="bubble ${m.role}">${m.role==="bot"?md(m.text):esc(m.text)}</div>`).join("")}<div id="chat-end"></div></div><div class="pills" style="margin-top:10px">${quick.map(q=>`<button class="pill" onclick="sendChat(${JSON.stringify(q)})">${esc(q)}</button>`).join("")}</div><div class="chatbar"><input id="chat-input" class="input" placeholder="Apna sawal likhein…" ${state.aiBusy?"disabled":""}><button class="btn btn-green" onclick="sendChat()" ${state.aiBusy?"disabled":""}>${state.aiBusy?"Thinking…":"Send"}</button></div>`,`<button class="btn" onclick="clearChat()">Clear chat</button>`);
 setTimeout(()=>{const el=$("#chat-input");if(el)el.onkeydown=e=>{if(e.key==="Enter")sendChat()};const ch=$("#chat");if(ch)ch.scrollTop=ch.scrollHeight},0);return page;
}
function clientId(){try{let id=localStorage.getItem("ks_client_id");if(!id){id="ks"+Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem("ks_client_id",id)}return id}catch(e){return "anonymous"}}
function HDR(){return {"Content-Type":"application/json","X-Client-Id":clientId()}}
const GREETING={role:"bot",text:"Namaste! Main KrishiNetra hoon. Fasal, khaad, mausam ya yojana — kuch bhi poochhiye."};
async function loadHistory(){try{const r=await fetch("/api/history",{headers:HDR()});const d=await r.json();if(d.messages&&d.messages.length&&!state.aiMsgs){state.aiMsgs=[GREETING,...d.messages.map(m=>({role:m.role,text:m.text}))];render()}}catch(e){}}
async function clearChat(){if(!confirm("Poori chat history delete karein?"))return;try{await fetch("/api/history",{method:"DELETE",headers:HDR()})}catch(e){}state.aiMsgs=[GREETING];render()}
async function loadDiagHistory(){const el=$("#doctor-history");if(!el)return;try{const r=await fetch("/api/diagnoses",{headers:HDR()});const d=await r.json();if(!d.items||!d.items.length){el.innerHTML="";return}el.innerHTML=card(`<h3>Pichhli jaanch (History)</h3>${d.items.map(x=>`<div class="small" style="padding:6px 0;border-bottom:1px solid #eee"><b>${esc(x.disease_name||"-")}</b> · ${esc(x.crop||"")} · ${x.confidence??"-"}% · ${esc(x.severity||"")}<br><span style="opacity:.6">${esc(x.created_at.replace("T"," "))}</span></div>`).join("")}`)}catch(e){}}

/* ---------- language selection for AI answers ---------- */
const LANG_LIST=["Hindi","English","Hinglish","Marathi","Gujarati","Punjabi","Bengali","Tamil","Telugu","Kannada","Malayalam","Odia","Urdu"];
const LANG_NATIVE={Hindi:"हिन्दी",English:"English",Hinglish:"Hinglish",Marathi:"मराठी",Gujarati:"ગુજરાતી",Punjabi:"ਪੰਜਾਬੀ",Bengali:"বাংলা",Tamil:"தமிழ்",Telugu:"తెలుగు",Kannada:"ಕನ್ನಡ",Malayalam:"മലയാളം",Odia:"ଓଡ଼ିଆ",Urdu:"اردو"};
function getAiLang(){try{return localStorage.getItem("ks_ai_lang")||"Hindi"}catch(e){return "Hindi"}}
function setAiLang(v){try{localStorage.setItem("ks_ai_lang",v)}catch(e){}}
function apiLang(){const v=getAiLang();return v==="Auto"?"":v}
function langSelect(withAuto){const cur=getAiLang();const opts=(withAuto?["Auto",...LANG_LIST]:LANG_LIST).map(l=>`<option value="${l}" ${l===cur?"selected":""}>${l==="Auto"?"Auto (jaisi bhasha mein poochho)":esc(LANG_NATIVE[l]+(LANG_NATIVE[l]!==l?" · "+l:""))}</option>`).join("");return `<select class="select" style="width:auto;display:inline-block;margin:0 8px 8px 0" title="Jawab ki bhasha / Answer language" onchange="setAiLang(this.value)">${opts}</select>`}
function toggleLang(){state.lang=state.lang==='en'?'hi':'en';setAiLang(state.lang==='hi'?'Hindi':'English');render()}
function diagCard(x){const L=Object.assign({plantName:"Plant",healthScore:"Plant health",symptoms:"Symptoms",possibleCauses:"Possible Causes",prevention:"Prevention",recommendedNextSteps:"Recommended Next Steps",organicRemedies:"Organic / Home Remedies",expertAdvice:"Expert Advice",confidence:"Confidence",severity:"Severity",soil:"Soil Check",soilCondition:"Soil condition",soilProblems:"Soil problems",soilImprovements:"How to improve the soil"},(x&&typeof x.labels==="object"&&x.labels)||{});
 const hs=Number(x.healthScore),hsOk=Number.isFinite(hs),hc=hs>=70?"#059669":hs>=40?"#d97706":"#dc2626";
 const so=x.soilAssessment&&typeof x.soilAssessment==="object"?x.soilAssessment:null;
 const soil=so?`<hr style="border:0;border-top:1px solid var(--line);margin:14px 0"><h3 style="margin:0 0 6px">🧪 ${esc(L.soil)}</h3>${so.condition?`<p class="small"><b>${esc(L.soilCondition)}:</b> ${esc(so.condition)}</p>`:""}${arr(so.problems).length?`<h4>${esc(L.soilProblems)}</h4>${list(so.problems)}`:""}${arr(so.improvements).length?`<h4>${esc(L.soilImprovements)}</h4>${list(so.improvements)}`:""}`:"";
 return card(`${x.plantName?`<div class="tiny muted bold">🌿 ${esc(L.plantName)}</div><h3 style="margin:0 0 6px">${esc(x.plantName)}</h3>`:""}${hsOk?`<div class="tiny muted bold">${esc(L.healthScore)}: <span style="color:${hc}">${hs}/100</span></div><div class="meter" style="height:9px;background:var(--line);border-radius:9px;overflow:hidden;margin:4px 0 12px"><i style="display:block;height:100%;width:${Math.max(0,Math.min(100,hs))}%;background:${hc}"></i></div>`:""}<h2>${esc(x.diseaseName)}</h2><i>${esc(x.scientificName)}</i><p>${esc(L.confidence)} <b>${esc(x.confidence)}%</b> · ${esc(L.severity)} <b>${esc(x.severityLabel||x.severity)}</b></p><h4>${esc(L.symptoms)}</h4>${list(x.symptoms)}<h4>${esc(L.possibleCauses)}</h4>${list(x.possibleCauses)}<h4>${esc(L.recommendedNextSteps)}</h4>${list(x.recommendedNextSteps)}${arr(x.organicRemedies).length?`<h4>🌱 ${esc(L.organicRemedies)}</h4>${list(x.organicRemedies)}`:""}<h4>${esc(L.prevention)}</h4>${list(x.prevention)}<h4>${esc(L.expertAdvice)}</h4><p class="small">${esc(x.expertAdvice)}</p>${soil}`)}

function md(t){return esc(t).replace(/\*\*(.*?)\*\*/g,"<b>$1</b>").replace(/^### (.*)$/gm,"<b>$1</b>").replace(/^- (.*)$/gm,"• $1").replace(/\n/g,"<br>")}
async function sendChat(q){const input=$("#chat-input");q=q||input?.value||"";if(!q.trim()||state.aiBusy)return;state.aiBusy=true;state.aiMsgs=state.aiMsgs||[];state.aiMsgs.push({role:"user",text:q});render();try{const r=await fetch("/api/chat",{method:"POST",headers:HDR(),body:JSON.stringify({language:apiLang(),message:q,history:state.aiMsgs.map(m=>({sender:m.role==="user"?"user":"bot",text:m.text}))})});const d=await r.json();state.aiMsgs.push({role:"bot",text:d.reply?(d.warning?`⚠️ ${d.warning}\n\n${d.reply}`:d.reply):d.error||`AI KrishiNetra could not respond (${r.status}).`});}catch(e){state.aiMsgs.push({role:"bot",text:"AI KrishiNetra could not connect to the server. Please try again."});}finally{state.aiBusy=false;render()}}

function cropDoctor(){
 const page=shell("Fasal Vaidya","फसल वैद्य — पत्ती की फोटो से रोग पहचानें",`<div class="grid grid-2">${card(`<div class="notice">📸 Upload a REAL photo. AI-made photos are rejected. Blurry or dark photos are cleaned up automatically before the check.</div><input id="doctor-crop" class="input" placeholder="Crop name (e.g. Wheat)"><input id="doctor-file" style="margin-top:12px" type="file" accept="image/*"><div id="doctor-preview"></div><button id="doctor-run" class="btn btn-green" style="width:100%;margin-top:12px" disabled>Diagnose</button><div id="doctor-err" class="danger small"></div>`)}<div id="doctor-result"></div></div><div id="doctor-history"></div>`);
 setTimeout(()=>{
  loadDiagHistory();let img=null;const f=$("#doctor-file"),run=$("#doctor-run"),prev=$("#doctor-preview");
  f.onchange=()=>{const file=f.files[0];if(!file)return;run.disabled=true;$("#doctor-err").textContent="";const r=new FileReader();r.onload=()=>{const original=r.result;const showPreview=()=>{prev.innerHTML=`<img class="image-preview" src="${img}" alt="plant">`;run.disabled=false};const photo=new Image();photo.onload=()=>{try{const scale=Math.min(1,1280/Math.max(photo.naturalWidth,photo.naturalHeight));const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(photo.naturalWidth*scale));canvas.height=Math.max(1,Math.round(photo.naturalHeight*scale));canvas.getContext("2d").drawImage(photo,0,0,canvas.width,canvas.height);img=canvas.toDataURL("image/jpeg",0.85)}catch(e){img=original}showPreview()};photo.onerror=()=>{img=original;showPreview()};photo.src=original};r.onerror=()=>{$("#doctor-err").textContent="Could not read this photo. Please choose another image."};r.readAsDataURL(file)};
  run.onclick=async()=>{if(!img)return;run.disabled=true;run.textContent="Analysing photo… this can take up to 45 seconds";$("#doctor-err").textContent="";$("#doctor-result").innerHTML="";
   try{const crop=$("#doctor-crop").value;
    const r=await fetch("/api/diagnose",{method:"POST",headers:HDR(),body:JSON.stringify({imageBase64:img,mimeType:img.slice(5,img.indexOf(";")),cropName:crop,language:apiLang()||"Hindi"})});
    const d=await r.json().catch(()=>({}));
    if(d.rejected){const ai=d.verdict==="ai_generated";
     $("#doctor-result").innerHTML=card(`<div style="font-size:42px">${ai?"🚫":"📷"}</div><h2 style="color:#b91c1c;margin:4px 0">${ai?"AI-generated photo detected":"This is not a plant photo"}</h2><p><b>${esc(d.message||"")}</b></p>${d.reason?`<p class="tiny muted">${esc(d.reason)}</p>`:""}<p class="small">${ai?"Please upload a real photo taken with your phone camera — a close-up of the affected leaf in daylight.":"Please upload a clear photo of the plant leaf, crop or field."}</p>`,"");
     run.disabled=false;run.textContent="Diagnose";return}
    if(!r.ok||!d.data)throw new Error(d.error||`Diagnosis failed (HTTP ${r.status}). Please try again with a smaller photo.`);
    const q=d.quality||{};let pre="";
    if(arr(d.notices).length)pre+=d.notices.map(n=>`<div class="notice">⚠️ ${esc(n)}</div>`).join("");
    if(q.enhanced&&q.before&&q.after)pre+=card(`<b>✨ ${q.reason==="dark"?"Photo was too dark — brightened and sharpened automatically":"Photo was blurry — sharpened and cleaned automatically"}</b><div class="grid grid-2" style="margin-top:10px"><div><div class="tiny muted bold">Before</div><img class="image-preview" src="${q.before}" alt="before"></div><div><div class="tiny muted bold">After (used for diagnosis)</div><img class="image-preview" src="${q.after}" alt="after"></div></div>`)+'<div style="height:12px"></div>';
    $("#doctor-result").innerHTML=pre+diagCard(d.data)}
   catch(e){$("#doctor-err").textContent=e.message||"Server se connect nahi ho paya."}
   run.disabled=false;run.textContent="Diagnose";loadDiagHistory()};
 },0);return page;
}

function authModal(){
 const mode=state.authMode;
 return `<div class="modal-bg auth-modal-bg" onclick="if(event.target===this)closeAuth()"><div class="modal auth-modal"><div class="modal-head auth-modal-head"><button class="close" onclick="closeAuth()">✕</button><div style="font-size:22px">🌾 KrishiNetra</div><h3>${mode==="login"?"Farmer Sign In":"Create Farmer Account"}</h3></div><div class="modal-body">${mode==="login"?`<form onsubmit="loginSubmit(event)"><input id="auth-contact" required class="input" placeholder="Phone or email"><input id="auth-pass" type="password" class="input" style="margin-top:9px" placeholder="Password"><div id="auth-err" class="danger small" style="margin-top:8px"></div><button class="btn btn-green" style="width:100%;margin-top:12px">Sign In</button></form><div style="margin-top:12px;display:flex;justify-content:space-between"><button class="btn btn-light" onclick="state.authMode='signup';render()">Create account</button></div>`:
 `<form onsubmit="signupSubmit(event)"><input id="auth-name" required class="input" placeholder="Full name"><input id="auth-contact" required class="input" style="margin-top:9px" placeholder="Phone or email"><input id="auth-pass" required type="password" minlength="6" class="input" style="margin-top:9px" placeholder="Password (min 6 characters)"><select id="auth-state" class="select" style="margin-top:9px">${(window.STATES_LIST||[]).map(x=>`<option>${esc(x)}</option>`).join("")}</select><input id="auth-district" class="input" style="margin-top:9px" value="Lucknow" placeholder="District"><div id="auth-err" class="danger small" style="margin-top:8px"></div><button class="btn btn-green" style="width:100%;margin-top:12px">Create account</button></form><button class="btn btn-light" style="margin-top:10px" onclick="state.authMode='login';render()">Back to sign in</button>`}</div></div></div>`;
}

function openAuth(mode="login"){state.isAuth=true;state.authMode=mode;render()}
function closeAuth(){state.isAuth=false;render()}
function demoLogin_unused(){state.user={id:"usr-demo",name:"Ramesh Kumar",email:"ramesh.farmer@example.com",phone:"+91 98765 43210",state:"Uttar Pradesh",district:"Lucknow",village:"Bakshi Ka Talab",landSizeAcres:4.5,savedCrops:state.savedCrops,savedMandis:state.savedMandis,userCrops:state.userCrops};state.isAuth=false;state.page="dashboard";render()}
function applyUser(u){const goto=state.pendingPage||"dashboard";state.pendingPage=null;if(PUBLIC_PAGES.includes(state.page)&&state.page!=="home"||state.isAuth)state.page=goto;state.user=u;state.savedCrops=u.savedCrops;state.savedMandis=u.savedMandis;state.userCrops=u.userCrops;state.isAuth=false;state.aiMsgs=undefined;loadHistory()}
async function authCall(url,body,btnSel){const err=$("#auth-err");if(err)err.textContent="";try{const r=await fetch(url,{method:"POST",headers:HDR(),body:JSON.stringify(body)});const d=await r.json();if(!r.ok||!d.user){if(err)err.textContent=d.error||"Kuch galat hua, dobara try karein.";return}applyUser(d.user);state.page="dashboard";render()}catch(e){if(err)err.textContent="Server se connect nahi ho paya."}}
function loginSubmit(e){e.preventDefault();authCall("/api/auth/login",{contact:$("#auth-contact").value,password:$("#auth-pass").value})}
function signupSubmit(e){e.preventDefault();authCall("/api/auth/register",{name:$("#auth-name").value,contact:$("#auth-contact").value,password:$("#auth-pass").value,state:$("#auth-state").value,district:$("#auth-district").value})}
async function logout(){try{await fetch("/api/auth/logout",{method:"POST",headers:HDR()})}catch(e){}state.user=null;state.aiMsgs=undefined;state.page="home";render()}
async function saveProfile(){if(!state.user||state.user.id==="usr-demo")return;try{await fetch("/api/auth/me",{method:"PUT",headers:HDR(),body:JSON.stringify({savedCrops:state.savedCrops,savedMandis:state.savedMandis,userCrops:state.userCrops})})}catch(e){}}
async function loadMe(){try{const r=await fetch("/api/auth/me",{headers:HDR()});const d=await r.json();if(d.user){applyUser(d.user);render()}}catch(e){}}
function toggleCrop(id){state.savedCrops=state.savedCrops.includes(id)?state.savedCrops.filter(x=>x!==id):[...state.savedCrops,id];if(state.user)state.user.savedCrops=state.savedCrops;saveProfile();render()}
function toggleMandi(id){state.savedMandis=state.savedMandis.includes(id)?state.savedMandis.filter(x=>x!==id):[...state.savedMandis,id];if(state.user)state.user.savedMandis=state.savedMandis;saveProfile();render()}
function removeUserCrop(id){if(state.user)state.user.userCrops=state.user.userCrops.filter(c=>c.id!==id);state.userCrops=state.user.userCrops;saveProfile();render()}
function markAllRead(){state.notifications.forEach(n=>n.isRead=true);render()}
function notificationClick(id){const n=state.notifications.find(x=>x.id===id);if(!n)return;n.isRead=true;if(n.actionTarget)navigate(n.actionTarget);else render()}
function toggleNotifications(){const panel=$("#notification-panel");if(panel.innerHTML){panel.innerHTML="";return}panel.innerHTML=`<div class="modal-bg" onclick="if(event.target===this)toggleNotifications()"><div class="modal" style="width:min(520px,100%)"><div class="modal-body"><div style="display:flex;justify-content:space-between"><h3>Notifications</h3><button class="btn btn-light" onclick="markAllRead()">Mark all read</button></div>${state.notifications.map(n=>`<div class="card" style="margin:8px 0" onclick="notificationClick('${n.id}')"><b>${esc(n.title)}</b><div class="small">${esc(n.message)}</div><div class="tiny muted">${esc(n.time)}</div></div>`).join("")}</div></div></div>`}
function mobileNav(){const links=state.user?PRIVATE_LINKS:[["home","Home"],["about","About this Project"],["howto","How to use"]];const html=`<div class="modal-bg" onclick="if(event.target===this)this.remove()"><div class="modal"><div class="modal-body">${links.map(x=>`<button class="btn btn-light" style="width:100%;margin:4px 0;text-align:left" onclick="navigate('${x[0]}');this.closest('.modal-bg').remove()">${x[1]}</button>`).join("")}${state.user?"":`<button class="btn btn-green" style="width:100%;margin:4px 0" onclick="this.closest('.modal-bg').remove();openAuth('login')">Login / Register</button>`}</div></div></div>`;document.body.insertAdjacentHTML("beforeend",html)}

function render(){
 if(state.user&&state.page==="home")state.page="dashboard";
 if(!state.user&&!PUBLIC_PAGES.includes(state.page))state.page="home";
 let content="";
 switch(state.page){
  case "crops":content=cropsPage();break;case "crop-detail":content=cropDetail();break;case "mandi":content=mandi();break;
  case "weather":content=weather();break;case "schemes":content=schemes();break;case "ai-sathi":content=aiSathi();break;
  case "crop-doctor":content=cropDoctor();break;case "soil":content=soil();break;case "soil-report":content=soilReportPage();break;case "calendar":content=calendar();break;
  case "tips":content=tips();break;case "dashboard":content=dashboard();break;case "about":content=about();break;case "howto":content=howto();break;default:content=home();
 }
 $("#app").innerHTML=navbar()+`<main class="main">${content}</main>`+footer()+(state.isAuth?authModal():"");
 translateApp();
}

/* =====================================================================
   FARM DETAILS, SOIL REPORT AI, LIVE MANDI PRICES  (added)
   ===================================================================== */
const SOIL_OPTIONS=["Alluvial (jalodh)","Black cotton (regur)","Red & yellow","Sandy loam (balui domat)","Clayey (chikni)","Loamy","Not sure"];
const IRRIGATION_OPTIONS=["Tubewell / borewell","Canal","River / pond / well","Drip / sprinkler","Rain-fed (no irrigation)"];
const INDIA_STATES=["Andhra Pradesh","Assam","Bihar","Chhattisgarh","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Odisha","Punjab","Rajasthan","Tamil Nadu","Telangana","Uttar Pradesh","Uttarakhand","West Bengal","Delhi","Jammu and Kashmir"];
const fmtINR=n=>n==null?"–":"₹"+Math.round(n).toLocaleString("en-IN");
const fmtDate=d=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(d||"");return m?`${m[3]}/${m[2]}/${m[1]}`:(d||"–")};

function farmSet(u){return !!(u&&u.landSizeAcres>0&&u.soilType)}
function farmCard(){
 const u=state.user;
 if(farmSet(u)&&!state.farmEdit)return card(`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h2 style="margin:0">🌾 My Farm</h2><button class="btn btn-light" onclick="state.farmEdit=true;render()">Edit</button></div><div class="grid grid-3"><div><div class="tiny muted bold">Field area</div><div class="stat">${esc(u.landSizeAcres)}</div>acres</div><div><div class="tiny muted bold">Soil type</div><b>${esc(u.soilType)}</b></div><div><div class="tiny muted bold">Irrigation</div><b>${esc(u.irrigation||"Not added")}</b></div></div>`);
 const opt=(list,cur,ph)=>`<option value="">${ph}</option>`+list.map(x=>`<option ${x===cur?"selected":""}>${esc(x)}</option>`).join("");
 return card(`<h2 style="margin-top:0">🌾 Tell us about your field</h2><p class="small">${farmSet(u)?"Update your farm details.":"Add your field area and soil type once. We use them to give you better soil and crop advice."}</p>
 <div class="grid grid-2"><div><label class="tiny muted bold">Field area</label><div style="display:flex;gap:8px"><input id="farm-area" class="input" type="number" min="0" step="0.01" inputmode="decimal" placeholder="e.g. 2.5" value="${u.landSizeAcres>0?esc(u.landSizeAcres):""}"><select id="farm-unit" class="select" style="width:130px"><option value="acre">Acre</option><option value="hectare">Hectare</option><option value="guntha">Guntha</option></select></div></div>
 <div><label class="tiny muted bold">Soil type</label><select id="farm-soil" class="select">${opt(SOIL_OPTIONS,u.soilType,"Choose soil type")}</select></div>
 <div><label class="tiny muted bold">Water source</label><select id="farm-irr" class="select">${opt(IRRIGATION_OPTIONS,u.irrigation,"Choose (optional)")}</select></div>
 <div><label class="tiny muted bold">Village</label><input id="farm-village" class="input" placeholder="Village name (optional)" value="${esc(u.village||"")}"></div></div>
 <div id="farm-err" class="danger small" style="margin-top:8px"></div>
 <div style="margin-top:10px"><button class="btn btn-green" onclick="saveFarm()">Save farm details</button>${farmSet(u)?` <button class="btn btn-light" onclick="state.farmEdit=false;render()">Cancel</button>`:""}</div>
 <p class="tiny muted">Not sure about the soil? Pick “Not sure” and upload a soil report in <a href="#" onclick="navigate('soil-report');return false">Soil Report AI</a>.</p>`);
}
async function saveFarm(){
 const v=s=>$(s).value,err=$("#farm-err");err.textContent="";
 let a=parseFloat(v("#farm-area"));
 if(!(a>0)){err.textContent="Please enter your field area (a number above 0).";return}
 const unit=v("#farm-unit");if(unit==="hectare")a*=2.471;else if(unit==="guntha")a/=40;
 a=Math.round(a*100)/100;
 if(a>100000){err.textContent="That area looks too large. Please check the number.";return}
 if(!v("#farm-soil")){err.textContent="Please choose your soil type.";return}
 try{const r=await fetch("/api/auth/me",{method:"PUT",headers:HDR(),body:JSON.stringify({landSizeAcres:a,soilType:v("#farm-soil"),irrigation:v("#farm-irr"),village:v("#farm-village")})});
  const d=await r.json();if(!r.ok||!d.user)throw new Error(d.error||"Could not save");
  state.user=d.user;state.farmEdit=false;render()}
 catch(e){err.textContent=e.message||"Could not save. Please try again."}
}
function soilPromo(){return card(`<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div style="font-size:42px">🧪</div><div style="flex:1;min-width:220px"><h2 style="margin:0">Soil Report AI</h2><p class="small" style="margin:4px 0">Upload your soil test report. AI reads it, tells you what is happening in your soil, and gives the best solution.</p></div><button class="btn btn-green" onclick="navigate('soil-report')">Upload soil report →</button></div>`)}

/* ---------- Soil Report AI ---------- */
const SR={tab:"upload",busy:false,result:null,file:null,mime:"",fname:"",err:"",history:null,crop:""};
const SR_FIELDS=[["ph","pH","7.4"],["ec","Salinity EC (dS/m)","0.4"],["organicCarbon","Organic carbon (%)","0.45"],["nitrogen","Nitrogen N (kg/ha)","250"],["phosphorus","Phosphorus P (kg/ha)","12"],["potassium","Potassium K (kg/ha)","180"],["sulphur","Sulphur S (ppm)",""],["zinc","Zinc Zn (ppm)",""],["iron","Iron Fe (ppm)",""],["manganese","Manganese Mn (ppm)",""],["copper","Copper Cu (ppm)",""],["boron","Boron B (ppm)",""]];
const STATUS_CLS={Optimal:"ok",Low:"low","Very low":"low",High:"high","Very high":"low"};
function scoreInfo(s){return s>=75?["Healthy","#4ade80"]:s>=50?["Needs care","#facc15"]:["Poor – needs fixing","#f87171"]}
function soilResultHtml(d){
 const [lbl,col]=scoreInfo(d.healthScore??0);
 const rows=arr(d.values).map(r=>`<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.value)} ${esc(r.unit)}</td><td><span class="chip chip-${STATUS_CLS[r.status]||"ok"}">${esc(r.status)}</span></td><td class="small">${esc(r.note)}</td></tr>`).join("");
 const info=d.reportInfo||{};const infoTxt=[info.lab,info.date,info.sampleId&&("Sample "+info.sampleId)].filter(Boolean).join(" · ");
 return `${d.aiUsed?"":`<div class="notice">AI advice was not available right now, so this is built-in guidance based on standard soil ranges. Try again later for a fuller AI report.</div>`}
 ${card(`<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><div class="score" style="border-color:${col}"><b>${d.healthScore??"–"}</b><span>/100</span></div><div style="flex:1;min-width:220px"><div class="bold" style="color:${col}">${lbl}</div><p style="margin:4px 0">${esc(d.summary)}</p>${infoTxt?`<div class="tiny muted">${esc(infoTxt)}</div>`:""}</div></div>`)}
 <div class="section-title"><h2>Your soil values</h2></div><div class="table-wrap"><table class="table"><thead><tr><th>Nutrient</th><th>Value</th><th>Level</th><th>Meaning</th></tr></thead><tbody>${rows}</tbody></table></div>
 ${arr(d.whatIsHappening).length?`<div class="section-title"><h2>What is happening in your soil</h2></div><div class="grid grid-2">${d.whatIsHappening.map(x=>card(`<div class="bold">${esc(x.topic)}</div><p class="small" style="margin:4px 0">${esc(x.explanation)}</p>`)).join("")}</div>`:""}
 ${arr(d.solutions).length?`<div class="section-title"><h2>Best solution</h2></div><div class="grid">${d.solutions.map((x,i)=>card(`<div class="bold">${i+1}. ${esc(x.title)}</div>${list(x.steps)}`)).join("")}</div>`:""}
 <div class="grid grid-2" style="margin-top:14px">
  ${arr(d.fertilizerPlan).length?card(`<div class="bold">🧴 Fertilizer plan (next crop)</div>${list(d.fertilizerPlan)}`):""}
  ${arr(d.organicOptions).length?card(`<div class="bold">🌿 Organic options</div>${list(d.organicOptions)}`):""}
  ${arr(d.suitableCrops).length?card(`<div class="bold">✅ Crops that suit this soil</div><div style="margin-top:6px">${d.suitableCrops.map(c=>`<span class="chip chip-ok">${esc(c)}</span>`).join(" ")}</div>`):""}
  ${arr(d.cropsToAvoid).length?card(`<div class="bold">⚠️ Better to avoid for now</div><div style="margin-top:6px">${d.cropsToAvoid.map(c=>`<span class="chip chip-low">${esc(c)}</span>`).join(" ")}</div>`):""}
 </div>
 ${d.retestAdvice?`<p class="small" style="margin-top:12px">🔁 ${esc(d.retestAdvice)}</p>`:""}
 <div class="notice" style="margin-top:12px">Quantities are approximate guidance. Fertilizer need depends on your crop, variety and yield target, so confirm with your Soil Health Card or nearest KVK / agriculture officer (Kisan Call Centre 1800-180-1551) before buying. This is not a lab test.</div>`;
}
function soilReportPage(){
 const u=state.user;
 if(!u)return shell("Soil Report AI","",card(`<p>Please login to use Soil Report AI.</p><button class="btn btn-green" onclick="openAuth('login')">Login</button>`));
 const farm=farmSet(u)?`<div class="tiny muted">Using your farm details: ${esc(u.landSizeAcres)} acres · ${esc(u.soilType)}${u.district?` · ${esc(u.district)}`:""}</div>`:`<div class="notice">Add your field area and soil type on the <a href="#" onclick="navigate('dashboard');return false">Dashboard</a> for more accurate advice.</div>`;
 const tabs=`<div style="display:flex;gap:8px;margin:12px 0">${pill("📄 Upload report",SR.tab==="upload","SR.tab='upload';SR.err='';render()")}${pill("⌨️ Type values",SR.tab==="manual","SR.tab='manual';SR.err='';render()")}</div>`;
 const upload=`<p class="small">Upload a clear photo or PDF of your soil test report or Soil Health Card.</p><input id="sr-file" type="file" accept="image/*,application/pdf"><div id="sr-preview">${SR.file?(SR.mime==="application/pdf"?`<div class="small" style="margin-top:8px">📄 ${esc(SR.fname)}</div>`:`<img class="image-preview" src="${SR.file}" alt="soil report">`):""}</div>`;
 const manual=`<p class="small">No report file? Type the values you have. Leave the rest empty.</p><div class="grid grid-2">${SR_FIELDS.map(([k,l,ph])=>`<div><label class="tiny muted bold">${esc(l)}</label><input class="input sr-val" data-k="${k}" type="number" step="any" inputmode="decimal" placeholder="${ph?"e.g. "+ph:""}"></div>`).join("")}</div>`;
 const form=card(`${farm}${tabs}<input id="sr-crop" class="input" placeholder="Crop you plan to grow (optional)" value="${esc(SR.crop)}" style="margin-bottom:12px">${SR.tab==="upload"?upload:manual}<button id="sr-run" class="btn btn-green" style="width:100%;margin-top:14px" ${SR.busy||(SR.tab==="upload"&&!SR.file)?"disabled":""}>${SR.busy?"Reading your soil report… up to a minute":"Analyse my soil"}</button><div id="sr-err" class="danger small" style="margin-top:8px">${esc(SR.err)}</div>`);
 const page=shell("Soil Report AI","मिट्टी रिपोर्ट जाँच — AI बताएगा मिट्टी में क्या हो रहा है",`${form}<div id="sr-result" style="margin-top:16px">${SR.result?soilResultHtml(SR.result):""}</div><div id="sr-history" style="margin-top:16px"></div>`);
 setTimeout(wireSoilReport,0);return page;
}
function wireSoilReport(){
 const run=$("#sr-run");if(!run)return;
 const f=$("#sr-file");
 if(f)f.onchange=()=>{const file=f.files[0];if(!file)return;SR.err="";$("#sr-err").textContent="";
  const ok=file.type==="application/pdf"||file.type.startsWith("image/");
  if(!ok){$("#sr-err").textContent="Please choose a photo or a PDF.";return}
  if(file.size>9*1024*1024&&file.type==="application/pdf"){$("#sr-err").textContent="PDF is too large (max 9 MB).";return}
  SR.fname=file.name;const r=new FileReader();
  r.onload=()=>{const done=(url,mime)=>{SR.file=url;SR.mime=mime;$("#sr-preview").innerHTML=mime==="application/pdf"?`<div class="small" style="margin-top:8px">📄 ${esc(file.name)}</div>`:`<img class="image-preview" src="${url}" alt="soil report">`;run.disabled=false};
   if(file.type==="application/pdf"){done(r.result,"application/pdf");return}
   const im=new Image();im.onload=()=>{try{const sc=Math.min(1,2000/Math.max(im.naturalWidth,im.naturalHeight));const c=document.createElement("canvas");c.width=Math.round(im.naturalWidth*sc);c.height=Math.round(im.naturalHeight*sc);c.getContext("2d").drawImage(im,0,0,c.width,c.height);done(c.toDataURL("image/jpeg",0.88),"image/jpeg")}catch(e){done(r.result,file.type)}};im.onerror=()=>done(r.result,file.type);im.src=r.result};
  r.onerror=()=>{$("#sr-err").textContent="Could not read this file."};r.readAsDataURL(file)};
 run.onclick=async()=>{
  SR.crop=($("#sr-crop")||{}).value||"";let body={language:apiLang()||"Hindi",crop:SR.crop};
  if(SR.tab==="manual"){const vals={};document.querySelectorAll(".sr-val").forEach(i=>{if(i.value!=="")vals[i.dataset.k]=parseFloat(i.value)});
   if(!Object.keys(vals).length){$("#sr-err").textContent="Please type at least one value (for example pH).";return}body.values=vals}
  else{if(!SR.file)return;body.fileBase64=SR.file;body.mimeType=SR.mime}
  SR.busy=true;SR.err="";run.disabled=true;run.textContent="Reading your soil report… up to a minute";
  try{const r=await fetch("/api/soil-report",{method:"POST",headers:HDR(),body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));
   if(d.rejected){SR.err=d.message||"This file could not be used.";SR.result=null}
   else if(!r.ok||!d.data){SR.err=d.error||`Analysis failed (HTTP ${r.status}). Please try again.`}
   else{SR.result=d.data;SR.history=null}}
  catch(e){SR.err="Could not connect to the server. Please try again."}
  SR.busy=false;render();if(SR.result&&!SR.err)setTimeout(()=>{const el=$("#sr-result");if(el)el.scrollIntoView({behavior:"smooth"})},50)};
 loadSoilHistory();
}
async function loadSoilHistory(){
 const el=$("#sr-history");if(!el)return;
 try{if(!SR.history){const r=await fetch("/api/soil-reports",{headers:HDR()});const d=await r.json();SR.history=d.items||[]}
  const el2=$("#sr-history");if(!el2)return;
  el2.innerHTML=SR.history.length?card(`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px"><h3 style="margin:0">Your earlier soil reports</h3><button class="btn btn-light" onclick="clearSoilHistory()">Clear</button></div>${SR.history.map((x,i)=>`<div class="small clickable" style="padding:8px 0;border-bottom:1px solid #ffffff18;cursor:pointer" onclick="SR.result=SR.history[${i}].result;SR.err='';render();window.scrollTo({top:0,behavior:'smooth'})"><b>Score ${x.health_score??"–"}/100</b> · ${esc((x.summary||"").slice(0,110))}<br><span class="tiny muted">${esc((x.created_at||"").replace("T"," "))} · ${x.source==="manual"?"typed values":"uploaded report"}</span></div>`).join("")}`):""}
 catch(e){}
}
async function clearSoilHistory(){if(!confirm("Delete all your saved soil reports?"))return;try{await fetch("/api/soil-reports",{method:"DELETE",headers:HDR()})}catch(e){}SR.history=[];SR.result=null;render()}

/* ---------- Mandi Prices (live Agmarknet via data.gov.in) ---------- */
const MD={state:null,district:"All",q:"",rows:null,loadedState:null,demo:false,meta:null,loading:false};
function mandi(){
 if(MD.state===null)MD.state=(state.user&&INDIA_STATES.includes(state.user.state))?state.user.state:"Uttar Pradesh";
 const content=`<div id="mandi-status"></div><div class="card" style="margin-bottom:15px"><div style="display:flex;gap:10px;flex-wrap:wrap"><select id="mandi-state" class="select" style="width:200px">${INDIA_STATES.map(x=>`<option ${x===MD.state?"selected":""}>${esc(x)}</option>`).join("")}</select><select id="mandi-district" class="select" style="width:190px"><option>All</option></select><input id="mandi-q" class="input" style="flex:1;min-width:170px" placeholder="Search crop / mandi" value="${esc(MD.q)}"><button id="mandi-refresh" class="btn btn-green">⟳ Refresh live prices</button></div></div><div id="mandi-trend"></div><div class="table-wrap"><table class="table"><thead><tr><th>Crop</th><th>Mandi</th><th>Min</th><th>Max</th><th>Modal</th><th>Change</th><th>Date</th><th></th></tr></thead><tbody id="mandi-body"><tr><td colspan="8" class="empty">Loading prices…</td></tr></tbody></table></div><p class="tiny muted">Source: Agmarknet, Government of India (data.gov.in). Prices are ₹ per quintal as reported by each mandi. Always confirm at your local APMC before selling.</p>`;
 const page=shell("Mandi Prices","मंडी भाव — लाइव",content);
 setTimeout(wireMandi,0);return page;
}
function wireMandi(){
 if(!$("#mandi-state"))return;
 $("#mandi-state").onchange=e=>{MD.state=e.target.value;MD.district="All";MD.rows=null;loadMandi(false)};
 $("#mandi-district").onchange=e=>{MD.district=e.target.value;renderMandiRows()};
 $("#mandi-q").oninput=e=>{MD.q=e.target.value;renderMandiRows()};
 $("#mandi-refresh").onclick=()=>loadMandi(true);
 if(MD.rows&&MD.loadedState===MD.state){fillMandiDistricts();renderMandiStatus();renderMandiRows()}else loadMandi(false);
}
async function loadMandi(refresh){
 if(MD.loading)return;MD.loading=true;const btn=$("#mandi-refresh"),st=$("#mandi-status");
 if(btn){btn.disabled=true;btn.textContent="Loading…"}if(st)st.innerHTML=`<div class="notice">Fetching today's prices from the government mandi feed…</div>`;
 const reqState=MD.state;
 try{const r=await fetch(`/api/mandi?state=${encodeURIComponent(reqState)}${refresh?"&refresh=1":""}`,{headers:HDR()});const d=await r.json();
  if(!r.ok)throw new Error(d.error||"Could not load prices");
  if(reqState!==MD.state){MD.loading=false;return}
  MD.meta=d;MD.demo=!(d.rows&&d.rows.length);
  MD.rows=MD.demo?(window.MANDI_PRICES_DATA||[]).filter(m=>m.state===reqState||!MD.state).map(m=>({...m,demo:true,arrivalDate:m.lastUpdated})):d.rows;
  MD.loadedState=reqState}
 catch(e){MD.meta={error:e.message||"Could not load prices"};MD.demo=true;MD.rows=(window.MANDI_PRICES_DATA||[]).map(m=>({...m,demo:true,arrivalDate:m.lastUpdated}));MD.loadedState=reqState}
 MD.loading=false;const b2=$("#mandi-refresh");if(b2){b2.disabled=false;b2.textContent="⟳ Refresh live prices"}
 fillMandiDistricts();renderMandiStatus();renderMandiRows();
}
function fillMandiDistricts(){const sel=$("#mandi-district");if(!sel)return;const ds=[...new Set((MD.rows||[]).map(m=>m.district).filter(Boolean))].sort();if(MD.district!=="All"&&!ds.includes(MD.district))MD.district="All";sel.innerHTML=`<option>All</option>`+ds.map(x=>`<option ${x===MD.district?"selected":""}>${esc(x)}</option>`).join("")}
function renderMandiStatus(){
 const el=$("#mandi-status");if(!el)return;const d=MD.meta||{};let h="";
 if(!MD.demo){const latest=(MD.rows||[]).map(m=>m.arrivalDate).filter(Boolean).sort().pop();const t=d.lastFetched?d.lastFetched.replace("T"," ").slice(0,16):"";
  h=`<div class="notice" style="border-color:#4ade8088">✅ <b>Live prices</b> from Agmarknet (Govt. of India). Latest market date: <b>${esc(fmtDate(latest))}</b>${t?` · refreshed ${esc(t)}`:""}.${d.error?`<br>⚠️ Could not refresh just now (${esc(d.error)}). Showing the last saved live prices.`:""}</div>`}
 else if(d.keyConfigured===false)h=`<div class="notice">⚠️ <b>Live prices are not switched on yet.</b> Showing DEMO prices. To get real prices, get a free API key at <b>data.gov.in</b> and add <code>DATA_GOV_API_KEY=your_key</code> to the <code>.env</code> file, then restart the app.</div>`;
 else h=`<div class="notice">⚠️ ${esc(d.error||d.notice||"No live prices were found for this state.")} Showing DEMO prices below. Try “Refresh live prices” again later.</div>`;
 el.innerHTML=h;
}
function renderMandiRows(){
 const body=$("#mandi-body");if(!body)return;const q=MD.q.toLowerCase().trim();
 let rows=(MD.rows||[]).filter(m=>(MD.district==="All"||m.district===MD.district)&&(!q||q.split(/\s+/).every(w=>`${m.crop} ${m.variety||""} ${m.mandi} ${m.district}`.toLowerCase().includes(w))));
 rows.sort((a,b)=>String(a.crop).localeCompare(b.crop)||String(a.mandi).localeCompare(b.mandi));
 const total=rows.length;rows=rows.slice(0,300);
 body.innerHTML=rows.map(m=>{const c=m.changeAmount;const cls=m.trend==="up"?"success":m.trend==="down"?"danger":"";const arrow=m.trend==="up"?"▲":m.trend==="down"?"▼":"–";
  return `<tr class="clickable" onclick="selectMandi('${esc(m.id)}')"><td><b>${esc(m.crop)}</b>${m.variety&&m.variety!=="Other"?`<div class="tiny muted">${esc(m.variety)}</div>`:""}${m.demo?` <span class="chip chip-low">DEMO</span>`:""}</td><td>${esc(m.mandi)}, ${esc(m.district)}</td><td>${fmtINR(m.minPrice)}</td><td>${fmtINR(m.maxPrice)}</td><td><b>${fmtINR(m.modalPrice)}</b></td><td class="${cls}">${c==null?"–":`${arrow} ${Math.abs(c)}`}</td><td class="tiny">${esc(m.demo?m.arrivalDate:fmtDate(m.arrivalDate))}</td><td><button class="icon-btn" onclick="event.stopPropagation();toggleMandi('${esc(m.id)}')">${state.savedMandis.includes(m.id)?"★":"☆"}</button></td></tr>`}).join("")||`<tr><td colspan="8" class="empty">No prices match. Try another district or search.</td></tr>`;
 if(total>300)body.insertAdjacentHTML("beforeend",`<tr><td colspan="8" class="tiny muted">Showing first 300 of ${total}. Use the district box or search to narrow down.</td></tr>`);
}
async function selectMandi(id){
 const box=$("#mandi-trend");if(!box)return;const m=(MD.rows||[]).find(x=>x.id===id);if(!m)return;let hist=[];
 if(m.demo){hist=((window.MANDI_TREND_HISTORY||{})[m.crop]||[]).map(x=>({day:x.date,modalPrice:x.modalPrice}))}
 else{try{const r=await fetch(`/api/mandi/history?id=${encodeURIComponent(id)}`,{headers:HDR()});hist=(await r.json()).items||[]}catch(e){}}
 const title=`${esc(m.crop)} · ${esc(m.mandi)}`;
 if(hist.length<2){box.innerHTML=card(`<b>${title}</b><p class="small muted" style="margin:6px 0 0">Price trend will appear after this mandi's prices have been saved on a few different days. The app saves each day's price whenever prices are refreshed.</p>`);return}
 const ps=hist.map(h=>h.modalPrice),lo=Math.min(...ps),hi=Math.max(...ps);
 box.innerHTML=card(`<b>${title} — price trend (₹/quintal)</b><div class="chart">${hist.map(x=>`<div class="bar" style="height:${Math.max(15,((x.modalPrice-lo)/((hi-lo)||1))*150+25)}px"><span>${fmtINR(x.modalPrice)}<br><small>${esc(m.demo?x.day:fmtDate(x.day).slice(0,5))}</small></span></div>`).join("")}</div>`);
}

/* =====================================================================
   WHOLE-APP LANGUAGE SWITCH
   Every visible text on the page (menus, home, dashboard, all pages) is translated
   into the language chosen in the top-right dropdown. Translations come from the
   server (/api/translate, Gemini) and are cached in the database + the browser,
   so each text is translated only once.
   ===================================================================== */
const APP_LANGS=[
 ["English","English"],["Hindi","हिन्दी"],["Marathi","मराठी"],["Gujarati","ગુજરાતી"],["Punjabi","ਪੰਜਾਬੀ"],["Bengali","বাংলা"],["Tamil","தமிழ்"],["Telugu","తెలుగు"],
 ["Kannada","ಕನ್ನಡ"],["Malayalam","മലയാളം"],["Odia","ଓଡ଼ିଆ"],["Urdu","اردو"],["Assamese","অসমীয়া"],["Maithili","मैथिली"],["Bhojpuri","भोजपुरी"],["Rajasthani","राजस्थानी"],
 ["Haryanvi","हरियाणवी"],["Chhattisgarhi","छत्तीसगढ़ी"],["Konkani","कोंकणी"],["Kashmiri","کٲشُر"],["Sindhi","سنڌي"],["Dogri","डोगरी"],["Nepali","नेपाली"],["Sanskrit","संस्कृतम्"],
 ["Santali","ᱥᱟᱱᱛᱟᱲᱤ"],["Bodo","बड़ो"],["Manipuri","মৈতৈলোন্"],["Hinglish","Hinglish"],
 ["Spanish","Español"],["French","Français"],["German","Deutsch"],["Portuguese","Português"],["Italian","Italiano"],["Dutch","Nederlands"],["Russian","Русский"],["Ukrainian","Українська"],
 ["Polish","Polski"],["Czech","Čeština"],["Romanian","Română"],["Greek","Ελληνικά"],["Turkish","Türkçe"],["Swedish","Svenska"],["Norwegian","Norsk"],["Danish","Dansk"],["Finnish","Suomi"],
 ["Hungarian","Magyar"],["Bulgarian","Български"],["Serbian","Српски"],["Croatian","Hrvatski"],["Slovak","Slovenčina"],["Lithuanian","Lietuvių"],["Latvian","Latviešu"],["Estonian","Eesti"],
 ["Arabic","العربية"],["Hebrew","עברית"],["Persian","فارسی"],["Pashto","پښتو"],["Kurdish","Kurdî"],
 ["Chinese (Simplified)","简体中文"],["Chinese (Traditional)","繁體中文"],["Japanese","日本語"],["Korean","한국어"],["Vietnamese","Tiếng Việt"],["Thai","ไทย"],["Indonesian","Bahasa Indonesia"],
 ["Malay","Bahasa Melayu"],["Filipino","Filipino"],["Burmese","မြန်မာ"],["Khmer","ខ្មែរ"],["Lao","ລາວ"],["Mongolian","Монгол"],["Sinhala","සිංහල"],["Dzongkha","རྫོང་ཁ"],["Tibetan","བོད་ཡིག"],
 ["Swahili","Kiswahili"],["Amharic","አማርኛ"],["Hausa","Hausa"],["Yoruba","Yorùbá"],["Igbo","Igbo"],["Zulu","isiZulu"],["Xhosa","isiXhosa"],["Afrikaans","Afrikaans"],["Somali","Soomaali"],["Malagasy","Malagasy"],
 ["Uzbek","Oʻzbekcha"],["Kazakh","Қазақша"],["Azerbaijani","Azərbaycanca"],["Georgian","ქართული"],["Armenian","Հայերեն"],["Albanian","Shqip"],["Macedonian","Македонски"],["Bosnian","Bosanski"],
 ["Slovenian","Slovenščina"],["Icelandic","Íslenska"],["Irish","Gaeilge"],["Welsh","Cymraeg"],["Catalan","Català"],["Basque","Euskara"],["Galician","Galego"],["Maltese","Malti"],
 ["Haitian Creole","Kreyòl ayisyen"],["Maori","Te Reo Māori"],["Hawaiian","ʻŌlelo Hawaiʻi"],["Samoan","Gagana Samoa"],["Esperanto","Esperanto"]
];
const RTL_LANGS=["Urdu","Arabic","Hebrew","Persian","Pashto","Sindhi","Kashmiri","Kurdish"];
const LANG_CODE={Hindi:"hi",English:"en",Marathi:"mr",Gujarati:"gu",Punjabi:"pa",Bengali:"bn",Tamil:"ta",Telugu:"te",Kannada:"kn",Malayalam:"ml",Odia:"or",Urdu:"ur",Assamese:"as",Nepali:"ne",Arabic:"ar",Spanish:"es",French:"fr",German:"de",Portuguese:"pt",Russian:"ru",Japanese:"ja",Korean:"ko"};

function appLangSelect(){
 const cur=getAiLang();
 const opts=APP_LANGS.map(([l,n])=>`<option value="${esc(l)}" ${l===cur?"selected":""}>${esc(n===l?l:n+" · "+l)}</option>`).join("");
 return `<select id="app-lang" class="select lang-select" aria-label="Language / भाषा" title="Language / भाषा" onchange="setAppLanguage(this.value)">${opts}</select>`;
}
function setAppLanguage(l){
 TR.retryAt[l]=0;
 trStatus("");
 setAiLang(l);state.lang=l==="Hindi"?"hi":"en";
 document.documentElement.lang=LANG_CODE[l]||"en";
 document.documentElement.dir=RTL_LANGS.includes(l)?"rtl":"ltr";
 render();
}

/* --- translation engine --- */
const TR={mem:{},active:null,seq:0,retryAt:{},orig:new WeakMap()};
const TR_SKIP="SCRIPT,STYLE,CODE,PRE,TEXTAREA,SELECT,OPTION,NOSCRIPT,SVG";
function trLoad(l){if(TR.mem[l])return TR.mem[l];let m={};try{m=JSON.parse(localStorage.getItem("ks_tr_"+l)||"{}")}catch(e){}return TR.mem[l]=m}
function trSave(l){try{localStorage.setItem("ks_tr_"+l,JSON.stringify(TR.mem[l]))}catch(e){try{localStorage.removeItem("ks_tr_"+l)}catch(_){}}}
function trWorthy(t){return /\p{L}/u.test(t)&&t.length>1}
function trCollect(root){
 const nodes=[],attrs=[];
 const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>{
  const p=n.parentElement;if(!p||TR_SKIP.includes(p.tagName)||p.closest("[data-notr],#app-lang"))return NodeFilter.FILTER_REJECT;
  return trWorthy(n.nodeValue)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT}});
 let n;while(n=w.nextNode())nodes.push(n);
 root.querySelectorAll("[placeholder],[title],[aria-label]").forEach(el=>{
  if(el.closest("[data-notr],#app-lang"))return;
  ["placeholder","title","aria-label"].forEach(a=>{const v=el.getAttribute(a);if(v&&trWorthy(v))attrs.push([el,a])})});
 return {nodes,attrs};
}
async function translateApp(fetchMissing=true){
 const lang=getAiLang();
 const root=document.getElementById("app");if(!root)return;
 const {nodes,attrs}=trCollect(root);
 // Remember the English original of every node/attribute, so languages can be switched.
 const items=[];
 nodes.forEach(n=>{let o=TR.orig.get(n);if(o===undefined){o=n.nodeValue;TR.orig.set(n,o)}items.push({kind:"t",n,o})});
 attrs.forEach(([el,a])=>{const key="o_"+a;if(el[key]===undefined)el[key]=el.getAttribute(a);items.push({kind:"a",el,a,o:el[key]})});
 if(lang==="English"){
  if(TR.active){TR.active.controller.abort();TR.active=null;TR.seq++}
  trStatus("");
  items.forEach(it=>trApply(it,it.o));
  return;
 }
 const mem=trLoad(lang);
 const lead=s=>s.match(/^\s*/)[0],trail=s=>s.match(/\s*$/)[0];
 const core=s=>s.trim().replace(/\s+/g," ");
 const apply=()=>items.forEach(it=>{const c=core(it.o);const t=mem[c];if(t)trApply(it,lead(it.o)+t+trail(it.o))});
 apply();
 let need=[...new Set(items.map(it=>core(it.o)).filter(c=>c&&!mem[c]&&trWorthy(c)))];
 if(TR.active&&TR.active.lang!==lang){TR.active.controller.abort();TR.active=null;TR.seq++;trStatus("")}
 if(!need.length||!fetchMissing)return;
 if(TR.active&&TR.active.lang===lang){
  if(need.every(text=>TR.active.pending.has(text)))return;
  need=[...new Set([...TR.active.pending,...need])].filter(text=>!mem[text]);
  TR.active.controller.abort();
  TR.active=null;
  TR.seq++;
 }
 if(!need.length)return;
 if(Date.now()<(TR.retryAt[lang]||0))return;
 const run={lang,pending:new Set(need),controller:new AbortController(),id:++TR.seq};
 TR.active=run;
 trStatus(`🌐 ${need.length}…`);
 let failed=false;
 try{
  for(let i=0;i<need.length;i+=120){
   if(run.id!==TR.seq||getAiLang()!==lang)break;
   const part=need.slice(i,i+120);
   const r=await fetch("/api/translate",{method:"POST",headers:HDR(),body:JSON.stringify({lang,texts:part}),signal:run.controller.signal});
   const d=await r.json();
   if(run.id!==TR.seq||getAiLang()!==lang)break;
   Object.assign(mem,d.map||{});trSave(lang);apply();
   if(d.error||d.pending)throw new Error(d.error||"Some translations are still pending");
  }
 }catch(e){
  if(e.name!=="AbortError"){failed=true;TR.retryAt[lang]=Date.now()+30000;console.error("App translation failed:",e)}
 }finally{
  if(TR.active===run){
   TR.active=null;
   trStatus(failed?"🌐 Translation temporarily unavailable. Try again shortly.":"");
   if(getAiLang()===lang)setTimeout(()=>translateApp(false),0);
  }
 }
}
function trApply(it,val){
 if(it.kind==="t"){if(it.n.isConnected&&it.n.nodeValue!==val)it.n.nodeValue=val}
 else if(it.el.isConnected&&it.el.getAttribute(it.a)!==val)it.el.setAttribute(it.a,val);
}
function trStatus(msg){let b=document.getElementById("tr-status");if(!msg){if(b)b.remove();return}if(!b){b=document.createElement("div");b.id="tr-status";b.setAttribute("data-notr","1");b.style.cssText="position:fixed;bottom:14px;left:50%;transform:translateX(-50%);background:#14532d;color:#fff;padding:8px 16px;border-radius:99px;font-size:13px;z-index:99999;box-shadow:0 4px 14px rgba(0,0,0,.25)";document.body.appendChild(b)}b.textContent=msg}
/* keep translating when parts of the page change without a full render (weather, chat, diagnosis, search results ...) */
let _trTimer=null;
new MutationObserver(()=>{clearTimeout(_trTimer);_trTimer=setTimeout(()=>{if(getAiLang()!=="English")translateApp()},350)}).observe(document.getElementById("app"),{childList:true,subtree:true,characterData:false});
document.documentElement.lang=LANG_CODE[getAiLang()]||"en";
document.documentElement.dir=RTL_LANGS.includes(getAiLang())?"rtl":"ltr";

render();
loadMe();loadHistory();
