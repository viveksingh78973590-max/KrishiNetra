/* KrishiNetra "Netra" voice bot
   Ported from the PayGuard AI Pro 3D bot (hover help, page intros, login guidance, guided tour)
   and adapted to KrishiNetra's single-page app.

   - Lives OUTSIDE #app, so it survives every render() and follows the farmer on every page.
   - Speaks English or Hindi from built-in lines; other app languages use the app's own /api/translate.
   - Human-sounding voice: picks the best natural voice installed on the device, speaks sentence by
     sentence with small rate / pitch changes and breathing pauses, and cleans text so it reads like a person. */
(function () {
  "use strict";
  if (window.__knBot) return;
  window.__knBot = true;

  /* ------------------------------------------------------------------ helpers */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    sget: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };
  var S = function () { return typeof state !== "undefined" ? state : { page: "home" }; };
  var uiLang = function () { return typeof getAiLang === "function" ? getAiLang() : "English"; };
  var isMobile = function () { return window.matchMedia && matchMedia("(max-width:620px)").matches; };
  var synth = window.speechSynthesis || null;

  /* ------------------------------------------------------------------ spoken lines  [English, Hindi] */
  var T = {
    /* page introductions */
    home: ["Namaste! I'm Netra, your guide on KrishiNetra. This is the home page, where you can see what the app does. If you're new here, tap Register at the top. It's free, and it only takes a minute.",
           "नमस्ते! मैं नेत्र हूँ, कृषि नेत्र पर आपका साथी। यह होम पेज है, यहाँ आप देख सकते हैं कि यह ऐप क्या-क्या करता है। अगर आप नए हैं, तो ऊपर रजिस्टर पर टैप कीजिए। यह बिल्कुल मुफ़्त है और बस एक मिनट लगता है।"],
    about: ["This page explains what KrishiNetra is. It uses NASA satellite data and AI to tell you what's happening on your field, and what's coming next.",
            "यह पेज बताता है कि कृषि नेत्र क्या है। यह नासा के सैटेलाइट डेटा और एआई से बताता है कि आपके खेत में अभी क्या हो रहा है, और आगे क्या आने वाला है।"],
    howto: ["Here's how to use the app, step by step. Register, log in, and then every tool opens up: weather alerts, plant diagnosis, the AI assistant and more.",
            "यहाँ ऐप चलाने का तरीका कदम-दर-कदम दिया है। पहले रजिस्टर कीजिए, फिर लॉगिन, और उसके बाद मौसम की चेतावनी, पौधे की जाँच, एआई सहायक जैसे सारे टूल खुल जाएँगे।"],
    dashboard: ["This is your farmer dashboard. You'll find your crops, your alerts, and quick links to everything else right here.",
                "यह आपका किसान डैशबोर्ड है। यहाँ आपकी फसलें, आपके अलर्ट और बाकी सब चीज़ों के शॉर्टकट मिलेंगे।"],
    crops: ["This is the crop guide. Search for a crop and open it to see sowing time, fertilizer, water needs and common problems.",
            "यह फसल गाइड है। कोई भी फसल खोजिए और खोलकर बुवाई का समय, खाद, पानी की ज़रूरत और आम समस्याएँ देखिए।"],
    "crop-detail": ["This is the detailed guide for this crop, from sowing all the way to harvest.",
                    "यह इस फसल की पूरी जानकारी है, बुवाई से लेकर कटाई तक।"],
    mandi: ["These are live mandi prices from the Government of India. Pick your state and district, search for a crop, and compare rates before you sell. Tap refresh to get the newest prices.",
            "ये भारत सरकार के लाइव मंडी भाव हैं। अपना राज्य और ज़िला चुनिए, फसल खोजिए, और बेचने से पहले दाम मिला लीजिए। नए भाव के लिए रिफ्रेश दबाइए।"],
    weather: ["This is the weather page, with NASA alerts. Choose your district, or use your location, and you'll see heat, cold, frost and rain warnings for the next sixteen days.",
              "यह मौसम का पेज है, जिसमें नासा के अलर्ट हैं। अपना ज़िला चुनिए या लोकेशन इस्तेमाल कीजिए, फिर अगले सोलह दिनों की गर्मी, ठंड, पाले और बारिश की चेतावनी दिखेगी।"],
    schemes: ["These are government schemes for farmers, like PM-KISAN. Tap any scheme to see who can apply, and how.",
              "ये किसानों के लिए सरकारी योजनाएँ हैं, जैसे पीएम-किसान। किसी भी योजना पर टैप कीजिए और देखिए कि कौन आवेदन कर सकता है, और कैसे।"],
    "ai-sathi": ["This is AI KrishiNetra. Ask the assistant anything about crops, fertilizer, weather or schemes, in your own language. Just type your question below.",
                 "यह एआई कृषि नेत्र है। फसल, खाद, मौसम या योजनाओं के बारे में कुछ भी पूछिए, अपनी भाषा में। बस नीचे अपना सवाल लिख दीजिए।"],
    "crop-doctor": ["This is Fasal Vaidya, the plant doctor. Type the crop name, upload a clear daylight photo of the sick leaf, and tap Diagnose. Please use a real photo, because AI-made pictures get rejected.",
                    "यह फसल वैद्य है, यानी पौधों का डॉक्टर। फसल का नाम लिखिए, बीमार पत्ते की दिन की रोशनी में साफ़ फोटो डालिए, और डायग्नोज़ दबाइए। असली फोटो ही डालिएगा, क्योंकि एआई से बनी तस्वीरें मंज़ूर नहीं होतीं।"],
    "soil-report": ["This is Soil Report AI. Upload a photo or PDF of your soil test report, or type the values. I will tell you what is happening in your soil and the best way to fix it.",
                    "यह सॉइल रिपोर्ट एआई है। अपनी मिट्टी जाँच रिपोर्ट की फोटो या पीडीएफ डालिए, या वैल्यू खुद लिखिए। मैं बताऊँगा कि आपकी मिट्टी में क्या हो रहा है और उसे कैसे सुधारें।"],
    soil: ["This page helps with soil and fertilizer. It tells you what your soil needs, and how much to apply.",
           "यह पेज मिट्टी और खाद के बारे में है। इससे पता चलता है कि आपकी मिट्टी को क्या चाहिए और कितना डालना है।"],
    calendar: ["This is the farming calendar. It shows what to sow, irrigate and harvest, month by month.",
               "यह खेती का कैलेंडर है। इसमें महीने-दर-महीने बताया गया है कि कब क्या बोना है, कब सिंचाई करनी है और कब कटाई।"],
    tips: ["Here are farming tips, including organic methods that save money and keep your soil healthy.",
           "ये खेती के सुझाव हैं, जिनमें जैविक तरीके भी हैं जो पैसे बचाते हैं और मिट्टी को सेहतमंद रखते हैं।"],

    /* login guidance */
    login: ["This is the login box. Enter the phone number or email you registered with, and your password. And if you're new here, please register first, and then log in.",
            "यह लॉगिन का डिब्बा है। जिस फ़ोन या ईमेल से रजिस्टर किया था वह डालिए, और पासवर्ड। अगर आप नए हैं, तो पहले रजिस्टर कीजिए, फिर लॉगिन।"],
    signup: ["This is the register form. Fill in your name, your phone or email, a password, and your state and district. It's completely free.",
             "यह रजिस्टर का फ़ॉर्म है। अपना नाम, फ़ोन या ईमेल, पासवर्ड, और अपना राज्य और ज़िला भरिए। यह बिल्कुल मुफ़्त है।"],
    login_required: ["Oh, you need to log in before I can open that page. And if you're new here, please register first.",
                     "अरे, यह पेज खोलने के लिए पहले लॉगिन करना होगा। अगर आप नए हैं, तो पहले रजिस्टर कर लीजिए।"],
    welcome: ["Welcome, {n}! You're in. ", "स्वागत है, {n}! आप अंदर आ गए हैं। "],

    /* tour + misc */
    tour_start: ["Alright, let's take a quick tour. Follow me!", "चलिए, एक छोटा सा टूर करते हैं। मेरे साथ आइए!"],
    tour_end: ["And that's the tour. Now, put your cursor on anything, and I'll explain it to you.",
               "तो यह था टूर। अब किसी भी चीज़ पर माउस रखिए, मैं यहीं हूँ आपको समझाने के लिए।"],
    tour_end_pub: ["And that's the tour. Register to unlock all the tools. Or just put your cursor on anything, and I'll explain it.",
                   "तो यह था टूर। सारे टूल खोलने के लिए रजिस्टर कीजिए। या किसी भी चीज़ पर माउस रखिए, मैं यहीं हूँ समझाने के लिए।"],
    lang_en: ["Sure, we'll talk in English from now on.", "ठीक है, अब अंग्रेज़ी में बात होगी।"],
    lang_hi: ["Sure, switching to Hindi.", "ठीक है, अब हिंदी में बात होगी।"],
    tap_hint: ["Tap anywhere on the page to hear me.", "मेरी आवाज़ सुनने के लिए पेज पर कहीं भी टैप कीजिए।"],

    /* hover help */
    brand: ["This is the KrishiNetra logo. Tap it any time to go back to your main page.", "यह कृषि नेत्र का लोगो है। कभी भी इस पर टैप करके मुख्य पेज पर लौट सकते हैं।"],
    helpline: ["This is the free Kisan Call Centre helpline. You can call from six in the morning till ten at night.", "यह मुफ़्त किसान कॉल सेंटर हेल्पलाइन है। आप सुबह छह बजे से रात दस बजे तक फ़ोन कर सकते हैं।"],
    lang: ["Choose your language here. The whole app, and I too, will switch to it.", "यहाँ से अपनी भाषा चुनिए। पूरा ऐप, और मैं भी, उसी भाषा में बदल जाएँगे।"],
    bell: ["This is your notifications bell, with weather, price and scheme alerts.", "यह आपकी सूचनाओं की घंटी है, जिसमें मौसम, भाव और योजनाओं के अलर्ट आते हैं।"],
    btn_login: ["Tap here to log in.", "लॉगिन करने के लिए यहाँ टैप कीजिए।"],
    btn_register: ["New here? Tap Register. It's free.", "नए हैं? रजिस्टर पर टैप कीजिए। यह मुफ़्त है।"],
    btn_profile: ["This takes you to your dashboard.", "यह आपको आपके डैशबोर्ड पर ले जाता है।"],
    btn_logout: ["Tap here to log out safely.", "सुरक्षित तरीके से लॉगआउट करने के लिए यहाँ टैप कीजिए।"],
    hamburger: ["This opens the menu.", "यह मेन्यू खोलता है।"],
    nav_home: ["This takes you to the home page.", "यह आपको होम पेज पर ले जाता है।"],
    nav_about: ["Read what this project is all about.", "यहाँ पढ़िए कि यह प्रोजेक्ट क्या है।"],
    nav_howto: ["Step-by-step help on using the app.", "ऐप चलाने की कदम-दर-कदम मदद।"],
    nav_dashboard: ["Your farmer dashboard.", "आपका किसान डैशबोर्ड।"],
    nav_crops: ["The crop guide, with sowing and care advice.", "फसल गाइड, बुवाई और देखभाल की सलाह के साथ।"],
    nav_mandi: ["Mandi prices, so you can compare before selling.", "मंडी के भाव, ताकि बेचने से पहले आप तुलना कर सकें।"],
    nav_weather: ["NASA weather alerts for your area.", "आपके इलाके के लिए नासा के मौसम अलर्ट।"],
    nav_schemes: ["Government schemes you can apply for.", "सरकारी योजनाएँ जिनके लिए आप आवेदन कर सकते हैं।"],
    "nav_ai-sathi": ["Chat with the AI farming assistant.", "एआई खेती सहायक से बात कीजिए।"],
    "nav_crop-doctor": ["Fasal Vaidya, the plant doctor. Upload a leaf photo to find the problem.", "फसल वैद्य, पौधों का डॉक्टर। समस्या जानने के लिए पत्ते की फोटो डालिए।"],
    "nav_soil-report": ["Upload your soil report and get AI advice.", "अपनी मिट्टी की रिपोर्ट डालिए और एआई की सलाह पाइए।"],
    nav_soil: ["Soil and fertilizer advice.", "मिट्टी और खाद की सलाह।"],
    nav_calendar: ["The farming calendar.", "खेती का कैलेंडर।"],
    nav_tips: ["Farming tips and organic methods.", "खेती के सुझाव और जैविक तरीके।"],
    "nav_crop-detail": ["Opens the full guide for this crop.", "इस फसल की पूरी जानकारी खोलता है।"],
    chat_input: ["Type your farming question here, in any language.", "अपना खेती का सवाल यहाँ लिखिए, किसी भी भाषा में।"],
    chat_send: ["Tap here to send your question.", "सवाल भेजने के लिए यहाँ टैप कीजिए।"],
    chat_clear: ["This clears the chat.", "यह चैट साफ़ कर देता है।"],
    doc_crop: ["Type the name of your crop here, for example wheat or potato.", "यहाँ अपनी फसल का नाम लिखिए, जैसे गेहूँ या आलू।"],
    doc_file: ["Upload a clear, close-up photo of the leaf, taken in daylight.", "पत्ते की दिन की रोशनी में ली गई साफ़, नज़दीक की फोटो डालिए।"],
    doc_run: ["Tap here, and the plant doctor will study your photo.", "यहाँ टैप कीजिए, और पौधों का डॉक्टर आपकी फोटो की जाँच करेगा।"],
    weather_loc: ["Pick your district here to see its weather.", "यहाँ अपना ज़िला चुनिए, फिर उसका मौसम दिखेगा।"],
    mandi_q: ["Search for a crop or a mandi here.", "यहाँ फसल या मंडी खोजिए।"],
    mandi_state: ["Choose a state to see its mandi prices.", "किसी राज्य के मंडी भाव देखने के लिए उसे चुनिए।"],
    crop_q: ["Search for a crop by name.", "फसल का नाम लिखकर खोजिए।"],
    auth_name: ["Type your full name here.", "यहाँ अपना पूरा नाम लिखिए।"],
    auth_contact: ["Enter your mobile number or email. This is what you'll use to log in.", "अपना मोबाइल नंबर या ईमेल डालिए। इसी से आप लॉगिन करेंगे।"],
    auth_pass: ["Choose a strong password, and remember it.", "एक मज़बूत पासवर्ड चुनिए, और उसे याद रखिए।"],
    auth_state: ["Select your state.", "अपना राज्य चुनिए।"],
    auth_district: ["Now select your district.", "अब अपना ज़िला चुनिए।"],
    pill: ["Tap to filter the list.", "सूची को छाँटने के लिए टैप कीजिए।"],
    toggle_crop: ["Tap to save this crop to your list, or remove it.", "इस फसल को अपनी सूची में जोड़ने या हटाने के लिए टैप कीजिए।"],
    toggle_scheme: ["Tap to open the full details of this scheme.", "इस योजना की पूरी जानकारी खोलने के लिए टैप कीजिए।"],
    select_mandi: ["Tap to see the price trend of this mandi.", "इस मंडी के भाव का रुझान देखने के लिए टैप कीजिए।"],
    remove_crop: ["This removes the crop from your list.", "यह फसल को आपकी सूची से हटा देता है।"],
    mark_read: ["Mark all your notifications as read.", "अपनी सारी सूचनाओं को पढ़ा हुआ चिह्नित कीजिए।"]
  };

  /* labels of the bot's own buttons */
  var LBL = {
    tour: ["🤖 Start bot tour", "🤖 बॉट टूर शुरू करें"],
    stop: ["⏹ Stop tour", "⏹ टूर रोकें"],
    on: ["🔊 Voice on", "🔊 आवाज़ चालू"],
    off: ["🔇 Voice off", "🔇 आवाज़ बंद"],
    auto: ["Auto (best voice)", "ऑटो (सबसे अच्छी आवाज़)"]
  };

  var TOUR_PUBLIC = ["home", "about", "howto"];
  var TOUR_AUTH = ["dashboard", "weather", "crop-doctor", "ai-sathi", "mandi", "crops", "schemes", "soil-report", "soil", "calendar", "tips"];
  var SPOTS = [[0.04, 0.58], [0.80, 0.50], [0.05, 0.30], [0.78, 0.28], [0.40, 0.55], [0.82, 0.62], [0.06, 0.62], [0.55, 0.30]];

  /* ------------------------------------------------------------------ language / translation */
  var LANGCODE = { English: "en-IN", Hindi: "hi-IN", Hinglish: "hi-IN", Marathi: "mr-IN", Gujarati: "gu-IN", Punjabi: "pa-IN",
    Bengali: "bn-IN", Tamil: "ta-IN", Telugu: "te-IN", Kannada: "kn-IN", Malayalam: "ml-IN", Urdu: "ur-IN", Odia: "or-IN",
    Assamese: "as-IN", Nepali: "ne-NP", Arabic: "ar-SA", Spanish: "es-ES", French: "fr-FR", German: "de-DE", Portuguese: "pt-BR",
    Russian: "ru-RU", Japanese: "ja-JP", Korean: "ko-KR", Italian: "it-IT", Dutch: "nl-NL", Turkish: "tr-TR", Indonesian: "id-ID",
    Thai: "th-TH", Vietnamese: "vi-VN", Polish: "pl-PL", Swedish: "sv-SE", Greek: "el-GR",
    "Chinese (Simplified)": "zh-CN", "Chinese (Traditional)": "zh-TW" };
  var codeFor = function (lang) { return LANGCODE[lang] || "en-IN"; };
  var base = function (c) { return String(c || "").replace("_", "-").toLowerCase().split("-")[0]; };
  var isHi = function (lang) { return lang === "Hindi" || lang === "Hinglish"; };

  var trMem = {};
  function trLoad(lang) {
    if (trMem[lang]) return trMem[lang];
    var m = {}; try { m = JSON.parse(store.get("kn_bot_tr_" + lang) || "{}") || {}; } catch (e) {}
    return (trMem[lang] = m);
  }
  function trSave(lang) { store.set("kn_bot_tr_" + lang, JSON.stringify(trMem[lang] || {})); }
  async function translateLines(lang, texts) {
    var mem = trLoad(lang), need = texts.filter(function (t) { return !mem[t]; });
    if (!need.length) return;
    var ctl = new AbortController(), to = setTimeout(function () { ctl.abort(); }, 9000);
    try {
      var r = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: lang, texts: need }), signal: ctl.signal });
      var d = await r.json();
      Object.keys(d.map || {}).forEach(function (k) { if (d.map[k]) mem[k] = d.map[k]; });
      trSave(lang);
    } catch (e) { /* network / quota problem: caller falls back to English */ }
    clearTimeout(to);
  }
  /* decide the text + voice language for a curated line */
  async function resolve(key, vars) {
    var entry = T[key]; if (!entry) return null;
    var lang = uiLang(), en = entry[0], out, vlang;
    if (lang === "English") { out = en; vlang = "en-IN"; }
    else if (isHi(lang)) { out = entry[1]; vlang = "hi-IN"; }
    else {
      var code = codeFor(lang);
      if (voicesFor(code).length) {
        await translateLines(lang, [en]);
        var t = trLoad(lang)[en];
        if (t) { out = t; vlang = code; }
      }
      if (!out) { out = en; vlang = "en-IN"; }           // no translation or no voice: English line, English voice
    }
    if (vars) Object.keys(vars).forEach(function (k) { out = out.split("{" + k + "}").join(vars[k]); });
    return { text: out, vlang: vlang };
  }
  var prefetchTimer;
  function prefetch() {
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(function () {
      var lang = uiLang();
      if (lang === "English" || isHi(lang) || !voicesFor(codeFor(lang)).length) return;
      var keys = ["home", "about", "howto", "dashboard", "crops", "mandi", "weather", "schemes", "ai-sathi", "crop-doctor", "soil-report", "soil",
        "calendar", "tips", "login", "signup", "login_required", "tour_start", "tour_end", "tour_end_pub"];
      translateLines(lang, keys.map(function (k) { return T[k][0]; }));
    }, 1200);
  }

  /* ------------------------------------------------------------------ human voice engine */
  var mute = store.get("knMute") === "1";
  var unlocked = false;            // browsers only allow speech after the first tap / key press
  var pending = null;              // last line that could not be spoken yet
  var speakTok = 0, speaking = false, curPrio = 0;

  function voicesFor(code) {
    if (!synth) return [];
    var b = base(code);
    return synth.getVoices().filter(function (v) { return v.lang && base(v.lang) === b; });
  }
  function scoreVoice(v, code) {
    var s = 0, n = v.name || "", l = String(v.lang || "").replace("_", "-").toLowerCase(), c = code.toLowerCase();
    if (l === c) s += 50;
    if (base(code) === "en") { if (l === "en-in") s += 50; else if (l === "en-gb") s += 30; else if (l === "en-us") s += 20; }
    if (/natural|neural|online/i.test(n)) s += 70;                       // Edge / Windows neural voices
    if (/premium|enhanced|siri/i.test(n)) s += 45;                       // Apple high quality voices
    if (/google/i.test(n)) s += 30;                                      // Chrome / Android cloud voices
    if (/microsoft (aria|jenny|guy|sonia|neerja|prabhat|swara|madhur|ryan|libby|mitchell)/i.test(n)) s += 25;
    if (/espeak|compact|novelty|albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|pipe|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|superstar/i.test(n)) s -= 300;
    if (/\b(david|zira|mark|hazel|george|james)\b/i.test(n) && /microsoft/i.test(n) && !/natural|online/i.test(n)) s -= 15;   // old robotic desktop voices
    return s;
  }
  function rankedVoices(code) {
    return voicesFor(code).map(function (v) { return { v: v, s: scoreVoice(v, code) }; })
      .sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.v; });
  }
  function bestVoice(code) {
    var saved = store.get("knVoice_" + base(code)), list = rankedVoices(code);
    if (saved) { var m = list.filter(function (v) { return v.voiceURI === saved; })[0]; if (m) return m; }
    return list[0] || null;
  }

  /* make written text sound like a person talking */
  function humanize(text, vlang) {
    var hi = base(vlang) === "hi";
    var t = String(text || "");
    t = t.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, " ");
    t = t.replace(/₹\s?([\d,\.]+)/g, function (m, n) { return n + (hi ? " रुपये" : " rupees"); });
    t = t.replace(/(\d)\s?%/g, "$1" + (hi ? " प्रतिशत" : " percent"));
    t = t.replace(/\b(\d+)\s?°\s?C\b/g, "$1" + (hi ? " डिग्री सेल्सियस" : " degrees Celsius"));
    t = t.replace(/\/q\b/gi, hi ? " प्रति क्विंटल" : " per quintal");
    t = t.replace(/&/g, hi ? " और " : " and ");
    t = t.replace(/\bPM-KISAN\b/g, hi ? "पीएम किसान" : "P M Kisan").replace(/\bNASA\b/g, hi ? "नासा" : "NASA").replace(/\bAPMC\b/g, "A P M C");
    t = t.replace(/\bAI\b/g, hi ? "एआई" : "A I");
    t = t.replace(/[•·→←↑↓|*_#~^<>{}\[\]]+/g, " ").replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim();
    return t;
  }
  /* split into sentences, then very long sentences at commas, so every breath is a separate utterance */
  function chunks(text, vlang) {
    var hi = base(vlang) === "hi";
    var baseRate = hi ? 0.92 : (base(vlang) === "en" ? 0.96 : 0.94);
    var sentences = text.match(/[^.!?।]+[.!?।]*/g) || [text], out = [];
    sentences.forEach(function (s) {
      s = s.trim(); if (!s) return;
      var end = /[?]$/.test(s) ? "?" : /[!]$/.test(s) ? "!" : "."; var parts = [s];
      if (s.length > 95) {
        parts = []; var cur = "";
        s.split(/(?<=[,;:])\s+/).forEach(function (p) {
          if ((cur + " " + p).length > 90 && cur) { parts.push(cur); cur = p; } else cur = cur ? cur + " " + p : p;
        });
        if (cur) parts.push(cur);
      }
      parts.forEach(function (p, i) {
        var last = i === parts.length - 1;
        var rate = baseRate * rnd(0.97, 1.04), pitch = 1 + rnd(-0.04, 0.05);
        if (end === "!" && last) { pitch += 0.06; rate += 0.03; }
        if (end === "?" && last) pitch += 0.07;
        if (last) rate -= 0.03;                                           // people slow down at the end of a sentence
        out.push({ t: p, rate: rate, pitch: pitch, pause: last ? (end === "?" ? rnd(360, 460) : end === "!" ? rnd(270, 360) : rnd(300, 420)) : rnd(110, 190) });
      });
    });
    return out;
  }

  var bot, bb, bt;       // DOM nodes (set below)
  function setTalking(on) { speaking = on; if (bot) bot.classList.toggle("talk", on); }

  function utter(list, vlang, tok, done) {
    var voice = bestVoice(vlang), i = 0, ended = false;
    function fin() { if (ended) return; ended = true; setTalking(false); done(); }
    setTalking(true);
    (function next() {
      if (tok !== speakTok) { ended = true; return; }
      if (i >= list.length) return fin();
      var c = list[i++], u = new SpeechSynthesisUtterance(c.t), settled = false, safety;
      u.lang = voice ? voice.lang : vlang; if (voice) u.voice = voice;
      u.rate = Math.max(0.7, Math.min(1.3, c.rate)); u.pitch = Math.max(0.6, Math.min(1.5, c.pitch)); u.volume = 1;
      var step = function () {
        if (settled) return; settled = true; clearTimeout(safety);
        if (tok !== speakTok) return;
        setTimeout(next, c.pause);
      };
      u.onend = step;
      u.onerror = function (e) {
        if (e && e.error === "not-allowed") { unlocked = false; ended = true; setTalking(false); done(); return; }
        step();
      };
      safety = setTimeout(step, c.t.length * 130 + 3500);                 // some browsers never fire onend
      try { synth.speak(u); } catch (e) { step(); }
    })();
  }

  /* say(): shows the bubble, moves the mouth, speaks like a person. prio: 1 hover, 2 page intro, 3 tour */
  function say(res, prio) {
    prio = prio || 1;
    return new Promise(function (resolve) {
      if (!res || !res.text) return resolve();
      var tok = ++speakTok, finished = false, bubbleTimer;
      curPrio = prio;
      bb.textContent = res.text; bb.classList.add("s", "m");
      bot.classList.toggle("r", parseInt(bot.style.left || "20", 10) > innerWidth / 2);
      clearTimeout(say._hide);
      var finish = function () {
        if (finished) return; finished = true; setTalking(false); curPrio = 0;
        say._hide = setTimeout(function () { if (tok === speakTok) bb.classList.remove("s", "m"); }, 2600);
        resolve();
      };
      var readTime = Math.min(9000, res.text.length * 55 + 900);
      if (synth) { try { synth.cancel(); } catch (e) {} }
      if (mute || !synth) { bubbleTimer = setTimeout(finish, readTime); return; }
      if (!unlocked) {                                                    // can't speak yet: show text, speak on first tap
        pending = { res: res, prio: prio };
        if (!say._hinted) { say._hinted = true; resolve0("tap_hint"); }
        bubbleTimer = setTimeout(finish, readTime + 1500); return;
      }
      var list = chunks(humanize(res.text, res.vlang), res.vlang);
      if (!list.length || (!voicesFor(res.vlang).length && base(res.vlang) !== "en")) { bubbleTimer = setTimeout(finish, readTime); return; }
      setTimeout(function () {                                            // a tiny "thinking" gap before speaking, like a person
        if (tok !== speakTok) return resolve();
        utter(list, res.vlang, tok, finish);
      }, rnd(140, 320));
    });
  }
  function resolve0(key) { resolve(key).then(function (r) { if (r && !unlocked) { var h = document.createElement("div"); h.className = "kn-hint"; h.textContent = r.text; bb.appendChild(h); } }); }
  function shutUp() { speakTok++; if (synth) { try { synth.cancel(); } catch (e) {} } setTalking(false); curPrio = 0; bb.classList.remove("s", "m"); }

  /* first tap/keypress: speech is allowed from now on */
  function unlock() {
    if (unlocked) return; unlocked = true;
    ["pointerdown", "keydown", "touchstart"].forEach(function (e) { removeEventListener(e, unlock, true); });
    if (synth) { try { var u = new SpeechSynthesisUtterance(" "); u.volume = 0; synth.speak(u); } catch (e) {} }
    if (pending && !mute) { var p = pending; pending = null; setTimeout(function () { say(p.res, p.prio); }, 250); }
  }
  ["pointerdown", "keydown", "touchstart"].forEach(function (e) { addEventListener(e, unlock, true); });

  /* ------------------------------------------------------------------ DOM */
  bot = document.createElement("div");
  bot.id = "kn-bot"; bot.setAttribute("data-notr", "1");
  bot.innerHTML = '<div id="kn-bt"><div class="arm l"></div><div class="arm r"></div><div class="bd"></div>' +
    '<div class="hd"><div class="hat"></div><div class="ear l"></div><div class="ear r"></div><div class="vs"><div class="ey l"></div>' +
    '<div class="ey r"></div><div class="sm"></div></div></div></div><div id="kn-bb" role="status" aria-live="polite"></div>';
  var ctl = document.createElement("div");
  ctl.id = "kn-ctl"; ctl.setAttribute("data-notr", "1");
  ctl.innerHTML = '<select id="kn-voice" aria-label="Voice" title="Voice"></select>' +
    '<button type="button" id="kn-tour"></button><button type="button" id="kn-mute"></button>';
  document.body.appendChild(bot); document.body.appendChild(ctl);
  bb = $("#kn-bb"); bt = $("#kn-bt");
  var tourBtn = $("#kn-tour"), muteBtn = $("#kn-mute"), voiceSel = $("#kn-voice");

  var lbl = function (k) { return isHi(uiLang()) ? LBL[k][1] : LBL[k][0]; };
  function refreshControls() {
    tourBtn.textContent = lbl(touring ? "stop" : "tour");
    muteBtn.textContent = lbl(mute ? "off" : "on");
    var code = codeFor(uiLang()), list = rankedVoices(code);
    if (base(code) !== "en" && !list.length) list = rankedVoices("en-IN");
    var cur = store.get("knVoice_" + base(list[0] ? list[0].lang : code)) || "";
    voiceSel.innerHTML = "";
    var o = document.createElement("option"); o.value = ""; o.textContent = lbl("auto"); voiceSel.appendChild(o);
    list.slice(0, 12).forEach(function (v) {
      var op = document.createElement("option"); op.value = v.voiceURI; op.textContent = v.name.replace(/^Microsoft |^Google /, "") + " (" + v.lang + ")"; if (v.voiceURI === cur) op.selected = true; voiceSel.appendChild(op);
    });
    voiceSel.style.display = list.length > 1 ? "" : "none";
  }
  voiceSel.onchange = function () {
    var code = codeFor(uiLang()); if (base(code) !== "en" && !voicesFor(code).length) code = "en-IN";
    store.set("knVoice_" + base(code), voiceSel.value);
    var hi = isHi(uiLang());
    say({ text: hi ? "यह आवाज़ कैसी लग रही है?" : "How does this voice sound?", vlang: hi ? "hi-IN" : (base(code) === "en" ? "en-IN" : code) }, 2);
  };
  muteBtn.onclick = function () {
    mute = !mute; store.set("knMute", mute ? "1" : "0");
    if (mute) shutUp();
    refreshControls();
  };
  if (synth) {
    var vc = function () { refreshControls(); };
    if (synth.addEventListener) synth.addEventListener("voiceschanged", vc); else synth.onvoiceschanged = vc;
  }

  /* ------------------------------------------------------------------ movement */
  var walkT;
  function go(x, y) {
    if (isMobile()) return;                                               // on phones the bot stays docked
    var nx = Math.max(8, Math.min(innerWidth - 130, x)), ny = Math.max(70, Math.min(innerHeight - 160, y));
    bot.style.left = nx + "px"; bot.style.top = ny + "px";
    bot.classList.add("walk"); clearTimeout(walkT);
    walkT = setTimeout(function () { bot.classList.remove("walk"); }, 1700);
  }
  var spot = function (i) { var s = SPOTS[i % SPOTS.length]; go(innerWidth * s[0], innerHeight * s[1]); };
  addEventListener("mousemove", function (e) {
    var r = bot.getBoundingClientRect();
    var dx = (e.clientX - r.left - 60) / innerWidth, dy = (e.clientY - r.top - 70) / innerHeight;
    bt.style.transform = "rotateY(" + dx * 80 + "deg) rotateX(" + (-dy * 50) + "deg)";
  });
  addEventListener("resize", function () { go(parseInt(bot.style.left || "20", 10), parseInt(bot.style.top || "200", 10)); });

  /* ------------------------------------------------------------------ hover / focus help (works on every page) */
  var NAVKEY = /navigate\(\s*'([\w-]+)'/;
  function describe(t) {
    if (!t || !t.closest || t.closest("#kn-bot,#kn-ctl")) return null;
    var el;
    if (t.closest("#app-lang")) return { key: "lang" };
    if (t.closest(".brand")) return { key: "brand" };
    if (t.closest(".topbar a")) return { key: "helpline" };
    var ids = { "chat-input": "chat_input", "doctor-crop": "doc_crop", "doctor-file": "doc_file", "doctor-run": "doc_run",
      "weather-loc": "weather_loc", "mandi-q": "mandi_q", "mandi-state": "mandi_state", "crop-q": "crop_q", "auth-name": "auth_name",
      "auth-contact": "auth_contact", "auth-pass": "auth_pass", "auth-state": "auth_state", "auth-district": "auth_district" };
    if ((el = t.closest("[id]")) && ids[el.id]) return { key: ids[el.id] };
    if ((el = t.closest("button[onclick],a[onclick]"))) {
      var oc = el.getAttribute("onclick") || "", m;
      if ((m = oc.match(NAVKEY)) && T["nav_" + m[1]]) return { key: "nav_" + m[1] };
      if (/openAuth\(\s*'login'/.test(oc)) return { key: "btn_login" };
      if (/openAuth\(\s*'signup'/.test(oc)) return { key: "btn_register" };
      if (/toggleNotifications/.test(oc)) return { key: "bell" };
      if (/logout\(/.test(oc)) return { key: "btn_logout" };
      if (/mobileNav/.test(oc)) return { key: "hamburger" };
      if (/sendChat/.test(oc)) return { key: "chat_send" };
      if (/clearChat/.test(oc)) return { key: "chat_clear" };
      if (/markAllRead/.test(oc)) return { key: "mark_read" };
      if (/toggleCrop/.test(oc)) return { key: "toggle_crop" };
      if (/toggleScheme/.test(oc)) return { key: "toggle_scheme" };
      if (/selectMandi/.test(oc)) return { key: "select_mandi" };
      if (/removeUserCrop/.test(oc)) return { key: "remove_crop" };
    }
    if (t.closest(".pill")) return { key: "pill" };
    if ((el = t.closest(".service,.crop-card,.card,.nh-grid4 > *"))) {  // cards: read the heading + description in the current language
      var h = el.querySelector("h1,h2,h3,h4"), p = el.querySelector("p,.small");
      var head = h ? h.textContent.trim() : "", desc = p ? p.textContent.trim() : "";
      if (head && head.length > 2 && el.textContent.length < 900) {
        var txt = head + (desc && desc !== head ? ". " + desc : ""); if (txt.length > 190) txt = txt.slice(0, 187).replace(/\s+\S*$/, "") + "...";
        return { raw: txt, id: "card:" + head };
      }
    }
    return null;
  }
  var hoverT, lastKey = "", lastAt = 0, touring = false, tourTok = 0, suppress = false, quietUntil = 0;
  var quiet = function (ms) { quietUntil = Math.max(quietUntil, Date.now() + ms); clearTimeout(hoverT); };
  function offerHelp(target) {
    if (touring || suppress || Date.now() < quietUntil) return;
    var d = describe(target); if (!d) return;
    var key = d.key || d.id;
    if (curPrio >= 2) return;                                             // never talk over an intro or the tour
    if (key === lastKey && Date.now() - lastAt < 9000) return;
    if (Date.now() - lastAt < 1200) return;
    lastKey = key; lastAt = Date.now();
    var r = target.closest("[onclick],button,a,input,select,textarea,.card,.service,.crop-card,.brand") || target;
    r = r.getBoundingClientRect();
    go(r.right > innerWidth - 380 ? r.left - 140 : r.right + 10, r.top - 20);
    if (d.key) resolve(d.key).then(function (res) { if (res && !touring && lastKey === key) say(res, 1); });
    else { var lang = uiLang(); say({ text: d.raw, vlang: codeFor(lang) }, 1); }
  }
  document.addEventListener("mouseover", function (e) {
    clearTimeout(hoverT); var tg = e.target;
    hoverT = setTimeout(function () { offerHelp(tg); }, 420);              // hover intent: ignore a fast swipe across the page
  });
  document.addEventListener("mouseout", function () { clearTimeout(hoverT); });
  document.addEventListener("click", function () { quiet(2600); }, true);        // after a click the page is about to change: let the page intro speak first
  document.addEventListener("focusin", function (e) { offerHelp(e.target); });   // keyboard / touch users get the same help

  /* ------------------------------------------------------------------ page awareness (single-page app: no reloads) */
  var lastSig = "", lastLang = uiLang(), visited = {};
  var firstName = function () { var u = S().user; return u && u.name ? String(u.name).split(" ")[0] : ""; };
  var opener = function () {
    if (isHi(uiLang())) return pick(["", "", "अच्छा, ", "तो, "]);
    if (uiLang() === "English") return pick(["", "", "Okay, ", "Alright, ", "So, "]);
    return "";
  };

  async function announcePage(welcome) {
    var s = S(), key = s.page;
    if (!T[key]) key = "home";
    quiet(1500);
    var res = await resolve(key); if (!res) return;
    var seen = visited[key]; visited[key] = true;
    if (welcome && firstName()) {
      var w = await resolve("welcome", { n: firstName() }); if (w) res.text = w.text + res.text;
    } else if (seen && key !== "home") {                                   // coming back to a page: sound casual, not scripted
      var o = opener(); if (o) res.text = o + res.text.charAt(0).toLowerCase() + res.text.slice(1);
    }
    if (!isMobile()) spot(Object.keys(T).indexOf(key));
    say(res, 2);
  }
  async function announceAuth(mode) {
    var s = S(), key = s.pendingPage ? "login_required" : (mode === "signup" ? "signup" : "login");
    quiet(1500);
    var res = await resolve(key); if (!res) return;
    if (s.pendingPage) { var r2 = await resolve(mode === "signup" ? "signup" : "login"); if (r2) res.text += " " + r2.text; }
    spot(mode === "signup" ? 2 : 3);
    say(res, 2);
  }
  var booted = false;      // stays false until the start-up announcement; early redraws (restoring a saved login) are silent
  function check() {
    var s = S(), sig = s.page + "|" + (s.isAuth ? "auth:" + s.authMode : "") + "|" + (s.user ? "u" : "g");
    var lang = uiLang();
    if (!booted) { lastSig = sig; lastLang = lang; return; }
    if (lang !== lastLang) {
      lastLang = lang; refreshControls(); prefetch();
      if (!touring && (lang === "English" || isHi(lang))) resolve(lang === "English" ? "lang_en" : "lang_hi").then(function (r) { if (r) say(r, 2); });
      lastSig = sig; return;
    }
    if (sig === lastSig) return;
    var prev = lastSig.split("|"), cur = sig.split("|"); lastSig = sig;
    if (touring || suppress) return;
    var loggedIn = prev[2] === "g" && cur[2] === "u";
    if (s.isAuth && cur[1] !== prev[1]) { announceAuth(s.authMode); return; }       // login / register box opened
    if (prev[0] !== cur[0] || loggedIn) announcePage(loggedIn);
  }
  var obsT;
  var app = document.getElementById("app");
  if (app) new MutationObserver(function () { clearTimeout(obsT); obsT = setTimeout(check, 260); }).observe(app, { childList: true });

  /* ------------------------------------------------------------------ guided tour across the pages */
  function setTouring(on) { touring = on; refreshControls(); }
  function stopTour() { tourTok++; setTouring(false); suppress = false; shutUp(); }
  async function runTour() {
    var tok = ++tourTok, list = S().user ? TOUR_AUTH : TOUR_PUBLIC;
    setTouring(true); suppress = true; unlock();
    var intro = await resolve("tour_start"); if (tok !== tourTok) return;
    await say(intro, 3); if (tok !== tourTok) return;
    for (var i = 0; i < list.length; i++) {
      if (tok !== tourTok) return;
      if (typeof navigate === "function") navigate(list[i]);
      await wait(1000); if (tok !== tourTok) return;
      visited[list[i]] = true; lastSig = S().page + "||" + (S().user ? "u" : "g");
      spot(i); await wait(1500); if (tok !== tourTok) return;
      var res = await resolve(list[i]); if (tok !== tourTok) return;
      await say(res, 3); if (tok !== tourTok) return;
      await wait(650);
    }
    if (tok !== tourTok) return;
    var end = await resolve(S().user ? "tour_end" : "tour_end_pub");
    setTouring(false); suppress = false;
    await say(end, 2);
  }
  tourBtn.onclick = function () { if (touring) stopTour(); else runTour(); };

  /* ------------------------------------------------------------------ start */
  refreshControls(); prefetch();
  go(innerWidth > 900 ? innerWidth - 300 : 20, 190);
  setTimeout(function () {
    var s = S();
    lastSig = s.page + "|" + (s.isAuth ? "auth:" + s.authMode : "") + "|" + (s.user ? "u" : "g");
    booted = true;
    if (s.isAuth) announceAuth(s.authMode); else announcePage(false);
  }, 1300);
})();
