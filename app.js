/* ====================================================================
   HALBA — profiles, posts, claps, typed comments, teams, events
   Stack: supabase-js v2 (auth, Postgres, storage). No build step.
==================================================================== */
(function () {
  "use strict";

  var cfg = window.HALBA_CONFIG || {};
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.indexOf("YOUR-PROJECT") !== -1) {
    document.body.innerHTML =
      '<p style="padding:24px;font-family:sans-serif">HALBA is not configured yet. ' +
      "Open <code>config.js</code> and paste your Supabase URL and anon key (see README).</p>";
    return;
  }

  var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  var me = null;        // auth user
  var myProfile = null; // row from profiles

  // ---------- tiny helpers ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function initials(name) {
    var parts = String(name || "?").trim().split(/\s+/);
    return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }
  function timeAgo(iso) {
    var s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "now";
    if (s < 3600) return Math.floor(s / 60) + "m";
    if (s < 86400) return Math.floor(s / 3600) + "h";
    return Math.floor(s / 86400) + "d";
  }

  var views = ["feed", "compose", "teams", "team", "events", "event", "profile", "about"];
  function show(view, arg) {
    views.forEach(function (v) { $("view-" + v).hidden = v !== view; });
    var navKey = view === "team" ? "teams" : view === "event" ? "events" : view;
    document.querySelectorAll(".nav-btn").forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.nav === navKey);
    });
    window.scrollTo(0, 0);
    if (view === "feed") loadFeed();
    if (view === "teams") loadTeams();
    if (view === "team") loadTeam(arg);
    if (view === "events") loadEvents();
    if (view === "event") loadEvent(arg);
    if (view === "profile") loadProfile(arg || (me && me.id));
  }
  function openSheet(id) { $(id).hidden = false; document.body.classList.add("no-scroll"); }
  function closeSheet(id) { $(id).hidden = true; document.body.classList.remove("no-scroll"); }
  document.querySelectorAll(".sheet-close").forEach(function (b) {
    b.addEventListener("click", function () { closeSheet(b.dataset.close); });
  });
  document.querySelectorAll(".back").forEach(function (b) {
    b.addEventListener("click", function () { if (b.dataset.back !== "__auth") show(b.dataset.back); });
  });
  // landing: reveal on scroll + CTA buttons
  (function () {
    var els = document.querySelectorAll("#view-auth .reveal");
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
      }, { threshold: 0.15 });
      els.forEach(function (el) { io.observe(el); });
    } else {
      els.forEach(function (el) { el.classList.add("is-in"); });
    }
    document.querySelectorAll("[data-cta]").forEach(function (b) {
      b.addEventListener("click", function () {
        var signup = b.dataset.cta === "signup";
        $("form-login").hidden = signup; $("form-signup").hidden = !signup; setAuthMsg("");
        $("auth-forms").scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(function () { var f = signup ? $("form-signup") : $("form-login"); f.querySelector("input").focus({ preventScroll: true }); }, 500);
      });
    });
  })();
  $("auth-about-btn").addEventListener("click", function () {
    $("view-auth").hidden = true;
    $("app-shell").hidden = false;
    document.querySelector(".bottomnav").hidden = true;
    $("about-back").dataset.back = "__auth";
    show("about");
  });
  $("about-back").addEventListener("click", function () {
    if ($("about-back").dataset.back === "__auth") {
      $("app-shell").hidden = true; document.querySelector(".bottomnav").hidden = false; $("view-auth").hidden = false;
    }
  });
  function avatarHtml(prof, cls) {
    prof = prof || {};
    if (prof.avatar_url) {
      return '<img class="avatar ' + (cls || "") + '" src="' + esc(prof.avatar_url) + '" alt="">';
    }
    return '<div class="avatar ' + (cls || "") + '">' + esc(initials(prof.name)) + "</div>";
  }
  async function uploadFile(file, prefix) {
    var path = me.id + "/" + prefix + "_" + Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    var up = await sb.storage.from("media").upload(path, file, { contentType: file.type });
    if (up.error) throw up.error;
    return sb.storage.from("media").getPublicUrl(path).data.publicUrl;
  }
  var USERNAME_RE = /^[a-z0-9_]{3,20}$/;
  async function usernameTaken(u, exceptId) {
    var q = sb.from("profiles").select("id").eq("username", u);
    var r = await q;
    return (r.data || []).some(function (row) { return row.id !== exceptId; });
  }
  // live username hint on any field with data-hint="username" sibling
  function wireUsernameHint(input, hintEl, exceptId) {
    var t;
    input.addEventListener("input", function () {
      input.value = input.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
      clearTimeout(t);
      var u = input.value;
      if (!USERNAME_RE.test(u)) { hintEl.textContent = "3–20 characters: letters, numbers, _"; hintEl.className = "field-hint"; return; }
      hintEl.textContent = "Checking…"; hintEl.className = "field-hint";
      t = setTimeout(async function () {
        var ex = typeof exceptId === "function" ? exceptId() : exceptId;
        var taken = await usernameTaken(u, ex);
        hintEl.textContent = taken ? "@" + u + " is taken" : "@" + u + " is available";
        hintEl.className = "field-hint " + (taken ? "is-bad" : "is-good");
      }, 350);
    });
  }

  // ---------- talents: common list + what members already use ----------
  var COMMON_SKILLS = ["Football", "Swimming", "Running", "Basketball", "Cricket", "Volleyball", "Tennis", "Padel", "Table tennis",
    "Badminton", "Handball", "Squash", "Athletics", "Cycling", "Gymnastics", "Karate", "Taekwondo", "Judo", "Boxing", "Kickboxing",
    "Jiu-jitsu", "Wrestling", "Fencing", "Archery", "Shooting", "Horse riding", "Falconry", "Camel racing", "Diving", "Sailing",
    "Jet ski", "Kitesurfing", "Fishing", "Skateboarding", "Parkour", "Fitness", "Weightlifting", "Chess", "Esports", "Rubik's cube",
    "Memory", "Mathematics", "Science", "Robotics", "Coding", "Game development", "3D design", "Animation", "Graphic design",
    "Drawing", "Painting", "Calligraphy", "Photography", "Videography", "Filmmaking", "Singing", "Quran recitation", "Oud",
    "Piano", "Guitar", "Violin", "Drums", "Music production", "DJ", "Rap", "Beatbox", "Dance", "Acting", "Comedy", "Magic",
    "Poetry", "Writing", "Storytelling", "Public speaking", "Debate", "Languages", "Sign language", "Cooking", "Baking",
    "Fashion design", "Makeup", "Woodwork", "Pottery", "Origami"];
  var skillIndex = null; // [{ name, count }] from profiles, most used first
  var skillIndexAt = 0;
  async function loadSkillIndex(force) {
    if (skillIndex && !force && Date.now() - skillIndexAt < 60000) return skillIndex;
    var res = await sb.from("profiles").select("skill").not("skill", "is", null).limit(2000);
    var counts = {};
    (res.data || []).forEach(function (r) {
      var s = String(r.skill || "").trim(); if (!s) return;
      var k = s.toLowerCase();
      if (!counts[k]) counts[k] = { name: s, count: 0 };
      counts[k].count++;
    });
    skillIndex = Object.keys(counts).map(function (k) { return counts[k]; })
      .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
    skillIndexAt = Date.now();
    return skillIndex;
  }
  // members' talents first (most used first), then common ones not yet used
  function allSkills() {
    var seen = {}, out = [];
    (skillIndex || []).forEach(function (s) { seen[s.name.toLowerCase()] = 1; out.push(s.name); });
    COMMON_SKILLS.forEach(function (s) { if (!seen[s.toLowerCase()]) out.push(s); });
    return out;
  }
  function matchSkills(q, limit) {
    q = String(q || "").trim().toLowerCase();
    var all = allSkills();
    if (!q) return all.slice(0, limit);
    var starts = [], has = [];
    all.forEach(function (s) {
      var l = s.toLowerCase();
      if (l.indexOf(q) === 0) starts.push(s); else if (l.indexOf(q) !== -1) has.push(s);
    });
    return starts.concat(has).slice(0, limit);
  }
  // keep one spelling per talent so filters group correctly ("football" -> "Football")
  function canonSkill(v) {
    v = String(v || "").trim().replace(/\s+/g, " ");
    if (!v) return v;
    var l = v.toLowerCase();
    var hit = allSkills().filter(function (s) { return s.toLowerCase() === l; })[0];
    return hit || (v.charAt(0).toUpperCase() + v.slice(1));
  }
  // suggestions under any input[data-skill-suggest]
  function wireSkillSuggest(input) {
    var box = document.createElement("div");
    box.className = "suggest"; box.hidden = true;
    input.insertAdjacentElement("afterend", box);
    var hideT;
    function render() {
      var items = matchSkills(input.value, input.value.trim() ? 8 : 12);
      var cur = input.value.trim().toLowerCase();
      items = items.filter(function (s) { return s.toLowerCase() !== cur; });
      box.hidden = items.length === 0;
      box.innerHTML = (input.value.trim() ? "" : '<small class="suggest-title">Popular on HALBA</small>') +
        items.map(function (s) { return '<button type="button" class="suggest-chip">' + esc(s) + "</button>"; }).join("");
    }
    input.addEventListener("focus", function () { loadSkillIndex().then(render); render(); });
    input.addEventListener("input", render);
    input.addEventListener("blur", function () { hideT = setTimeout(function () { box.hidden = true; }, 150); });
    box.addEventListener("mousedown", function (e) { e.preventDefault(); });
    box.addEventListener("click", function (e) {
      var b = e.target.closest(".suggest-chip"); if (!b) return;
      clearTimeout(hideT);
      input.value = b.textContent; box.hidden = true;
      input.dispatchEvent(new Event("change"));
    });
  }
  document.querySelectorAll("input[data-skill-suggest]").forEach(wireSkillSuggest);

  // ---------- countries, age ----------
  var COUNTRIES = ["Kuwait", "Saudi Arabia", "United Arab Emirates", "Qatar", "Bahrain", "Oman", "Egypt", "Jordan", "Lebanon", "Iraq", "Syria", "Palestine", "Yemen", "India", "Pakistan", "Bangladesh", "Sri Lanka", "Nepal", "Philippines", "Indonesia", "Afghanistan", "Algeria", "Argentina", "Australia", "Austria", "Azerbaijan", "Belgium", "Brazil", "Cameroon", "Canada", "Chile", "China", "Colombia", "Croatia", "Czech Republic", "Denmark", "Ethiopia", "Finland", "France", "Germany", "Ghana", "Greece", "Hungary", "Iran", "Ireland", "Italy", "Japan", "Kazakhstan", "Kenya", "Libya", "Malaysia", "Mexico", "Morocco", "Netherlands", "New Zealand", "Nigeria", "Norway", "Poland", "Portugal", "Romania", "Russia", "Senegal", "Serbia", "Singapore", "Somalia", "South Africa", "South Korea", "Spain", "Sudan", "Sweden", "Switzerland", "Tanzania", "Thailand", "Tunisia", "Turkey", "Uganda", "Ukraine", "United Kingdom", "United States", "Uzbekistan", "Vietnam", "Other"];
  document.querySelectorAll("select[data-countries]").forEach(function (sel) {
    var def = sel.dataset.default || "";
    sel.innerHTML = '<option value="">Select</option>' + COUNTRIES.map(function (c) {
      return '<option value="' + c + '"' + (c === def ? " selected" : "") + ">" + c + "</option>";
    }).join("");
  });
  function ageOn(dobStr, on) {
    var d = new Date(dobStr), t = on || new Date();
    var a = t.getFullYear() - d.getFullYear();
    var m = t.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
    return a;
  }
  function bracketFor(age) { return age < 12 ? "U12" : age < 15 ? "U15" : age < 18 ? "U18" : "OPEN"; }
  function bracketLabel(b) { return { U12: "Under 12", U15: "Under 15", U18: "Under 18", OPEN: "Open (18+)" }[b] || ""; }
  function validDob(dobStr) {
    if (!dobStr) return "Date of birth is required.";
    var age = ageOn(dobStr);
    if (isNaN(age) || age > 100) return "Please enter a valid date of birth.";
    if (age < 3) return "HALBA is for ages 3 and up.";
    return null;
  }
  function validPhone(p) {
    p = (p || "").trim();
    if (!p) return null;
    return /^\+?[0-9 ]{7,16}$/.test(p) ? null : "Mobile number: digits only, e.g. +965 5xxx xxxx";
  }
  (function () {
    var max = new Date(); max.setFullYear(max.getFullYear() - 3);
    var iso = max.toISOString().slice(0, 10);
    document.querySelectorAll('input[name="birth_date"]').forEach(function (i) {
      i.max = iso;
      // show guardian fields for under-13s
      i.addEventListener("input", function () {
        var form = i.form, block = form.querySelector("[data-guardian]");
        if (!block) return;
        var minor = i.value && ageOn(i.value) < 13;
        block.hidden = !minor;
        form.guardian_name.required = !!minor;
        form.guardian_phone.required = !!minor;
      });
    });
  function guardianCheck(form) {
    var minor = form.birth_date.value && ageOn(form.birth_date.value) < 13;
    if (!minor) return null;
    if (!form.guardian_name.value.trim()) return "Guardian's name is required for under-13 accounts.";
    var e = validPhone(form.guardian_phone.value);
    if (e || !form.guardian_phone.value.trim()) return "Guardian's mobile number is required for under-13 accounts.";
    return null;
  }
  window.__guardianCheck = guardianCheck;
  })();

  // ---------- auth ----------
  function setAuthMsg(t) { $("auth-msg").textContent = t || ""; }

  $("show-signup").addEventListener("click", function () {
    $("form-login").hidden = true; $("form-signup").hidden = false; setAuthMsg("");
  });
  $("show-login").addEventListener("click", function () {
    $("form-signup").hidden = true; $("form-login").hidden = false; setAuthMsg("");
  });

  $("form-signup").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = e.target;
    var uname = f.username.value.trim().toLowerCase();
    if (!USERNAME_RE.test(uname)) return setAuthMsg("Username: 3–20 characters, letters, numbers and _ only.");
    var dobErr = validDob(f.birth_date.value); if (dobErr) return setAuthMsg(dobErr);
    var phErr = validPhone(f.phone.value); if (phErr) return setAuthMsg(phErr);
    var gErr = window.__guardianCheck(f); if (gErr) return setAuthMsg(gErr);
    setAuthMsg("Checking username…");
    if (await usernameTaken(uname)) return setAuthMsg("@" + uname + " is already taken — try another.");
    setAuthMsg("Creating your profile…");
    var res = await sb.auth.signUp({
      email: f.email.value.trim(),
      password: f.password.value,
      options: { data: {
        name: f.name.value.trim(),
        username: uname,
        city: f.city.value.trim(),
        skill: canonSkill(f.skill.value),
        gender: f.gender.value,
        nationality: f.nationality.value,
        residence: f.residence.value,
        birth_date: f.birth_date.value,
        phone: f.phone.value.trim() || null,
        guardian_name: f.guardian_name.value.trim() || null,
        guardian_phone: f.guardian_phone.value.trim() || null
      } }
    });
    if (res.error) return setAuthMsg(res.error.message);
    if (!res.data.session) {
      return setAuthMsg("Account created. Check your email to confirm, then log in. " +
        "(Tip for testing: disable email confirmation in Supabase → Auth → Providers.)");
    }
    // session active -> onAuthStateChange takes over
  });

  $("form-login").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = e.target;
    setAuthMsg("Logging in…");
    var res = await sb.auth.signInWithPassword({
      email: f.email.value.trim(), password: f.password.value
    });
    if (res.error) return setAuthMsg(res.error.message);
  });

  wireUsernameHint(document.querySelector('#form-signup input[name="username"]'),
    document.querySelector('#form-signup [data-hint="username"]'));

  async function ensureProfile() {
    var got = await sb.from("profiles").select("*").eq("id", me.id).maybeSingle();
    if (got.data) { myProfile = got.data; return; }
    var md = me.user_metadata || {};
    var age = md.birth_date ? ageOn(md.birth_date) : null;
    var ins = await sb.from("profiles").insert({
      id: me.id,
      name: md.name || "Athlete",
      username: md.username || null,
      city: md.city || "",
      skill: md.skill || "",
      gender: md.gender || null,
      nationality: md.nationality || null,
      residence: md.residence || null,
      birth_year: md.birth_date ? new Date(md.birth_date).getFullYear() : null,
      age_bracket: age != null ? bracketFor(age) : null,
      guardian_managed: age != null && age < 13
    }).select().single();
    myProfile = ins.data || { id: me.id, name: md.name || "Athlete", city: "", skill: "" };
    if (md.birth_date || md.phone) {
      await sb.from("profile_private").upsert({ user_id: me.id, birth_date: md.birth_date || null, phone: md.phone || null,
        guardian_name: md.guardian_name || null, guardian_phone: md.guardian_phone || null });
    }
  }

  sb.auth.onAuthStateChange(async function (_event, session) {
    me = session ? session.user : null;
    if (me) {
      await ensureProfile();
      $("view-auth").hidden = true;
      $("app-shell").hidden = false;
      $("topbar-skill").textContent = myProfile.skill || "";
      show("feed");
      if (!myProfile.username || !myProfile.gender || !myProfile.nationality || !myProfile.residence || !myProfile.birth_year) openEditProfile(true);
    } else {
      myProfile = null;
      $("app-shell").hidden = true;
      $("view-auth").hidden = false;
      setAuthMsg("");
      window.scrollTo(0, 0);
    }
  });

  // ---------- feed ----------
  var KINDS = {
    appreciate: { label: "Appreciate", hint: "Tell them what you loved" },
    suggest:    { label: "Suggest",    hint: "One thing that would make this better" },
    ask:        { label: "Ask",        hint: "Ask how they did it" }
  };

  function commentRow(c) {
    var prof = c.profiles || {};
    var row = document.createElement("div");
    row.className = "comment";
    row.innerHTML =
      avatarHtml(prof, "avatar-sm") +
      '<div class="comment-body">' +
        '<div class="comment-meta"><strong>' + esc(prof.name || "Someone") + "</strong>" +
        '<span class="kind kind-' + esc(c.kind) + '">' + esc(KINDS[c.kind] ? KINDS[c.kind].label : c.kind) + "</span>" +
        "<small>" + timeAgo(c.created_at) + "</small></div>" +
        '<p>' + esc(c.body) + "</p>" +
      "</div>" +
      (me && c.user_id === me.id ? '<button class="comment-del" aria-label="Delete comment">×</button>' : "");
    var del = row.querySelector(".comment-del");
    if (del) del.addEventListener("click", async function () {
      await sb.from("comments").delete().eq("id", c.id);
      row.remove();
    });
    return row;
  }

  function postCard(p, opts) {
    var prof = p.profiles || {};
    var claps = p.claps || [];
    var clapped = me && claps.some(function (l) { return l.user_id === me.id; });
    var commentCount = (p.comments && p.comments.length) || 0;
    var card = document.createElement("article");
    card.className = "card post";
    card.dataset.id = p.id;

    var mediaHtml = "";
    if (p.media_url && p.media_type === "video") {
      mediaHtml = '<video class="post-media" src="' + esc(p.media_url) + '" controls playsinline preload="metadata"></video>';
    } else if (p.media_url) {
      mediaHtml = '<img class="post-media" src="' + esc(p.media_url) + '" alt="Post media" loading="lazy">';
    }

    card.innerHTML =
      '<div class="post-head" role="link" tabindex="0">' +
        avatarHtml(prof, "") +
        '<div class="post-who"><strong>' + esc(prof.name || "Athlete") + "</strong>" +
        "<small>" + (prof.username ? "@" + esc(prof.username) + " · " : "") + esc(prof.city || "") + " · " + timeAgo(p.created_at) + "</small></div>" +
        (prof.skill ? '<span class="chip post-skill">' + esc(prof.skill) + "</span>" : "") +
      "</div>" +
      '<p class="post-caption">' + esc(p.caption) + "</p>" +
      mediaHtml +
      '<div class="post-foot">' +
        '<button class="clap-btn' + (clapped ? " is-clapped" : "") + '" aria-label="Clap">' +
          '<span class="clap-ico" aria-hidden="true">👏</span>' +
          '<span class="clap-count">' + claps.length + "</span>" +
        "</button>" +
        '<button class="comments-btn" aria-expanded="false">' +
          '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z"/></svg>' +
          '<span class="comment-count">' + commentCount + "</span>" +
        "</button>" +
        (opts && opts.canDelete ? '<button class="post-del">Delete</button>' : "") +
      "</div>" +
      '<section class="comments" hidden>' +
        '<div class="comment-list"></div>' +
        '<form class="comment-form">' +
          '<div class="kind-picker" role="radiogroup" aria-label="Comment type">' +
            '<button type="button" class="kind kind-appreciate is-on" data-kind="appreciate" aria-pressed="true">Appreciate</button>' +
            '<button type="button" class="kind kind-suggest" data-kind="suggest" aria-pressed="false">Suggest</button>' +
            '<button type="button" class="kind kind-ask" data-kind="ask" aria-pressed="false">Ask</button>' +
          "</div>" +
          '<div class="comment-input">' +
            '<input type="text" name="body" maxlength="300" placeholder="' + KINDS.appreciate.hint + '" required>' +
            '<button type="submit" class="btn-send" aria-label="Send">Send</button>' +
          "</div>" +
        "</form>" +
      "</section>";

    card.querySelector(".post-head").addEventListener("click", function () {
      $("profile-back").hidden = false;
      $("profile-back").dataset.back = "feed";
      show("profile", p.user_id);
    });

    // clap (one per person, toggles)
    card.querySelector(".clap-btn").addEventListener("click", async function () {
      var btn = this, count = btn.querySelector(".clap-count");
      if (btn.classList.contains("is-clapped")) {
        btn.classList.remove("is-clapped");
        count.textContent = Math.max(0, +count.textContent - 1);
        await sb.from("claps").delete().match({ post_id: p.id, user_id: me.id });
      } else {
        btn.classList.add("is-clapped", "pop");
        setTimeout(function () { btn.classList.remove("pop"); }, 350);
        count.textContent = +count.textContent + 1;
        await sb.from("claps").insert({ post_id: p.id, user_id: me.id });
      }
    });

    // comments: open/close + load
    var section = card.querySelector(".comments");
    var listEl = card.querySelector(".comment-list");
    var loaded = false;
    async function loadComments() {
      var res = await sb.from("comments")
        .select("*, profiles(name, avatar_url)")
        .eq("post_id", p.id)
        .order("created_at", { ascending: true });
      listEl.innerHTML = "";
      (res.data || []).forEach(function (c) { listEl.appendChild(commentRow(c)); });
      loaded = true;
    }
    card.querySelector(".comments-btn").addEventListener("click", async function () {
      var open = !section.hidden;
      section.hidden = open;
      this.setAttribute("aria-expanded", String(!open));
      if (!open && !loaded) await loadComments();
      if (!open) card.querySelector('.comment-form input').focus();
    });

    // kind picker
    var form = card.querySelector(".comment-form");
    var kind = "appreciate";
    form.querySelectorAll(".kind-picker .kind").forEach(function (b) {
      b.addEventListener("click", function () {
        kind = b.dataset.kind;
        form.querySelectorAll(".kind-picker .kind").forEach(function (x) {
          var on = x === b;
          x.classList.toggle("is-on", on);
          x.setAttribute("aria-pressed", String(on));
        });
        form.body.placeholder = KINDS[kind].hint;
        form.body.focus();
      });
    });

    // submit comment
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var body = form.body.value.trim();
      if (!body) return;
      var sendBtn = form.querySelector(".btn-send");
      sendBtn.disabled = true;
      var ins = await sb.from("comments")
        .insert({ post_id: p.id, user_id: me.id, kind: kind, body: body })
        .select("*, profiles(name, avatar_url)").single();
      sendBtn.disabled = false;
      if (ins.error) { form.body.placeholder = "Couldn't send. Try again."; return; }
      listEl.appendChild(commentRow(ins.data));
      form.body.value = "";
      var cc = card.querySelector(".comment-count");
      cc.textContent = +cc.textContent + 1;
    });

    var del = card.querySelector(".post-del");
    if (del) del.addEventListener("click", async function () {
      if (!confirm("Delete this post?")) return;
      await sb.from("posts").delete().eq("id", p.id);
      card.remove();
    });

    return card;
  }

  var feedSkill = ""; // "" = all talents
  async function loadFeed() {
    var q = sb.from("posts")
      .select("*, profiles!posts_user_id_fkey" + (feedSkill ? "!inner" : "") + "(name, city, skill, username, avatar_url), claps(user_id), comments(id)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (feedSkill) q = q.ilike("profiles.skill", feedSkill);
    var res = await q;
    var list = $("feed-list");
    list.innerHTML = "";
    var rows = res.data || [];
    if (res.error) {
      $("feed-empty").textContent = "Couldn't load the arena: " + res.error.message + " — pull to refresh or reopen the app.";
      $("feed-empty").hidden = false;
      return;
    }
    $("feed-empty").textContent = feedSkill ? "No " + feedSkill + " posts yet. Be the first." : "The arena is quiet. Be the first to post your skill.";
    $("feed-empty").hidden = rows.length > 0;
    rows.forEach(function (p) {
      list.appendChild(postCard(p, { canDelete: me && p.user_id === me.id }));
    });
  }

  // ---------- search people ----------
  function personRow(p, onPick) {
    var el = document.createElement("button");
    el.type = "button"; el.className = "member member-btn";
    el.innerHTML = avatarHtml(p, "avatar-sm") +
      '<div class="member-body"><strong>' + esc(p.name) + "</strong>" +
      "<small>" + (p.username ? "@" + esc(p.username) : "") + (p.skill ? " · " + esc(p.skill) : "") + (p.city ? " · " + esc(p.city) : "") + "</small></div>";
    el.addEventListener("click", function () { onPick(p); });
    return el;
  }
  function openPerson(p, closeId) {
    closeSheet(closeId);
    $("profile-back").hidden = false; $("profile-back").dataset.back = "feed";
    show("profile", p.id);
  }
  var searchT, searchSeq = 0;
  async function runPeopleSearch(q) {
    var body = $("search-body");
    q = q.trim().replace(/^@/, "");
    if (q.length < 2) { body.innerHTML = '<p class="empty">Type a name, @username or talent.</p>'; return; }
    var seq = ++searchSeq;
    body.innerHTML = '<p class="empty">Searching…</p>';
    var like = "%" + q.replace(/[%_,()]/g, " ") + "%";
    var res = await sb.from("profiles")
      .select("id, name, username, avatar_url, skill, city")
      .or("name.ilike." + like + ",username.ilike." + like + ",skill.ilike." + like)
      .order("name").limit(30);
    if (seq !== searchSeq) return;
    var rows = res.data || [];
    body.innerHTML = rows.length ? "" : '<p class="empty">No one found for “' + esc(q) + '”.</p>';
    rows.forEach(function (p) { body.appendChild(personRow(p, function (pp) { openPerson(pp, "sheet-search"); })); });
  }
  $("btn-search").addEventListener("click", function () {
    openSheet("sheet-search");
    setTimeout(function () { $("people-search").focus(); }, 50);
  });
  $("people-search").addEventListener("input", function () {
    clearTimeout(searchT); var v = this.value;
    searchT = setTimeout(function () { runPeopleSearch(v); }, 300);
  });

  // ---------- filter feed by talent ----------
  function renderFilterChips(q) {
    var body = $("filter-body");
    q = String(q || "").trim().toLowerCase();
    var items = (skillIndex || []).filter(function (s) { return !q || s.name.toLowerCase().indexOf(q) !== -1; });
    body.innerHTML = (q ? "" : '<button type="button" class="filter-chip' + (feedSkill ? "" : " is-on") + '" data-skill="">All talents</button>') +
      items.map(function (s) {
        return '<button type="button" class="filter-chip' + (feedSkill.toLowerCase() === s.name.toLowerCase() ? " is-on" : "") +
          '" data-skill="' + esc(s.name) + '">' + esc(s.name) + ' <span class="chip-n">' + s.count + "</span></button>";
      }).join("");
    if (!items.length && q) body.innerHTML += '<p class="empty">No member has “' + esc(q) + '” as a talent yet.</p>';
  }
  function setFeedSkill(skill) {
    feedSkill = skill || "";
    $("filter-label").textContent = feedSkill || "All talents";
    $("btn-filter").classList.toggle("is-on", !!feedSkill);
    loadFeed();
  }
  $("btn-filter").addEventListener("click", async function () {
    $("filter-search").value = "";
    $("filter-body").innerHTML = '<p class="empty">Loading…</p>';
    openSheet("sheet-filter");
    await loadSkillIndex(true);
    renderFilterChips("");
  });
  $("filter-search").addEventListener("input", function () { renderFilterChips(this.value); });
  $("filter-body").addEventListener("click", function (e) {
    var b = e.target.closest(".filter-chip"); if (!b) return;
    closeSheet("sheet-filter");
    setFeedSkill(b.dataset.skill);
  });

  // ---------- compose ----------
  var mediaInput = document.querySelector('#form-post input[name="media"]');
  mediaInput.addEventListener("change", function () {
    var f = mediaInput.files[0];
    var box = $("compose-preview");
    box.innerHTML = ""; box.hidden = true;
    $("file-name").textContent = f ? f.name : "Add a photo or video (optional)";
    if (!f) return;
    var mb = f.size / (1024 * 1024);
    if (mb > cfg.MAX_UPLOAD_MB) {
      $("compose-msg").textContent = "File is " + mb.toFixed(0) + "MB — the limit is " + cfg.MAX_UPLOAD_MB + "MB.";
      mediaInput.value = "";
      return;
    }
    $("compose-msg").textContent = "";
    var url = URL.createObjectURL(f);
    box.innerHTML = f.type.indexOf("video") === 0
      ? '<video src="' + url + '" controls playsinline></video>'
      : '<img src="' + url + '" alt="Preview">';
    box.hidden = false;
  });

  $("form-post").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = e.target;
    var btn = $("btn-publish");
    var file = mediaInput.files[0] || null;
    btn.disabled = true;
    $("compose-msg").textContent = file ? "Uploading…" : "Posting…";

    try {
      var media_url = null, media_type = null;
      if (file) {
        media_url = await uploadFile(file, "post");
        media_type = file.type.indexOf("video") === 0 ? "video" : "image";
      }
      var ins = await sb.from("posts").insert({
        user_id: me.id,
        caption: f.caption.value.trim(),
        media_url: media_url,
        media_type: media_type
      });
      if (ins.error) throw ins.error;

      f.reset();
      $("compose-preview").hidden = true;
      $("compose-preview").innerHTML = "";
      $("file-name").textContent = "Add a photo or video (optional)";
      $("compose-msg").textContent = "";
      show("feed");
    } catch (err) {
      $("compose-msg").textContent = err.message || "Something went wrong. Try again.";
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- profile (mine or someone else's) ----------
  async function loadProfile(userId) {
    var isMe = me && userId === me.id;
    $("profile-back").hidden = isMe;
    var page = $("profile-page");
    page.innerHTML = '<p class="empty">Loading…</p>';

    var pr = isMe ? { data: myProfile } : await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
    var prof = pr.data;
    if (!prof) { page.innerHTML = '<p class="empty">Profile not found.</p>'; return; }
    if (isMe) myProfile = prof;

    var mem = await sb.from("team_members")
      .select("status, role, teams(id, name, handle, logo_url)")
      .eq("user_id", userId);
    var supRes = await Promise.all([
      sb.from("supports").select("supporter_id").eq("supported_id", userId),
      sb.from("supports").select("supported_id").eq("supporter_id", userId)
    ]);
    var supporters = supRes[0].data || [];
    var supporting = supRes[1].data || [];
    var iSupport = me && supporters.some(function (r) { return r.supporter_id === me.id; });
    var teams = (mem.data || []).filter(function (m) { return m.teams; });

    var res = await sb.from("posts")
      .select("*, profiles!posts_user_id_fkey(name, city, skill, username, avatar_url), claps(user_id), comments(id)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    var rows = res.data || [];
    var rr = await sb.from("event_results").select("rank, note, events(id, title, kind, starts_at)").eq("user_id", userId);
    var achievements = (rr.data || []).filter(function (r) { return r.events; })
      .sort(function (a, b) { return a.events.starts_at < b.events.starts_at ? 1 : -1; });
    var achHtml = achievements.length
      ? '<div class="achievements">' + achievements.map(function (r) {
          var medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : "#" + r.rank;
          return '<button class="ach" data-event="' + esc(r.events.id) + '"><span class="medal">' + medal + "</span><span><strong>" + esc(r.events.title) + "</strong><small>" +
            esc(new Date(r.events.starts_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })) + (r.note ? " · " + esc(r.note) : "") + "</small></span></button>";
        }).join("") + "</div>"
      : "";
    var clapsEarned = rows.reduce(function (n, p) { return n + (p.claps ? p.claps.length : 0); }, 0);

    var teamHtml = teams.length
      ? '<div class="team-badges">' + teams.map(function (m) {
          var t = m.teams;
          return '<button class="team-badge' + (m.status === "pending" ? " is-pending" : "") + '" data-team="' + esc(t.id) + '">' +
            avatarHtml({ name: t.name, avatar_url: t.logo_url }, "avatar-xs avatar-team") +
            "<span>" + esc(t.name) + "</span>" +
            (m.status === "pending" ? "<small>pending approval</small>" : (m.role === "admin" ? "<small>admin</small>" : "")) +
          "</button>";
        }).join("") + "</div>"
      : (isMe ? '<p class="profile-noteam">Part of a team? <button class="linklike" id="go-teams">Find or create it</button></p>' : "");

    page.innerHTML =
      '<section class="profile-card card">' +
        '<div class="profile-cover"></div>' +
        '<div class="profile-main">' +
          avatarHtml(prof, "avatar-xl") +
          '<h2 class="profile-name">' + esc(prof.name) + "</h2>" +
          (prof.username ? '<p class="profile-handle">@' + esc(prof.username) + "</p>" : "") +
          '<p class="profile-meta">' +
            (prof.skill ? '<span class="chip chip-skill">' + esc(prof.skill) + "</span>" : "") +
            (prof.city ? "<span>" + esc(prof.city) + "</span>" : "") +
          "</p>" +
          '<p class="profile-facts">' +
            (prof.age_bracket ? "<span><strong>" + esc(bracketLabel(prof.age_bracket)) + "</strong></span>" : "") +
            (prof.guardian_managed ? '<span class="chip chip-managed">Managed by a parent</span>' : "") +
            (prof.birth_year ? "<span>Born " + esc(prof.birth_year) + "</span>" : "") +
            (prof.nationality ? "<span>" + esc(prof.nationality) + "</span>" : "") +
            (prof.residence && prof.residence !== prof.nationality ? "<span>Lives in " + esc(prof.residence) + "</span>" : "") +
          "</p>" +
          teamHtml + achHtml +
          (prof.about ? '<p class="profile-about">' + esc(prof.about) + "</p>" : (isMe ? '<p class="profile-about is-empty">Add a line about yourself.</p>' : "")) +
          '<div class="profile-stats">' +
            "<div><strong>" + rows.length + "</strong><span>posts</span></div>" +
            "<div><strong>" + clapsEarned + "</strong><span>claps</span></div>" +
            '<button class="stat-btn" id="stat-supporters"><strong>' + supporters.length + "</strong><span>supporters</span></button>" +
            '<button class="stat-btn" id="stat-supporting"><strong>' + supporting.length + "</strong><span>supporting</span></button>" +
          "</div>" +
          (!isMe && me
            ? '<div class="profile-actions">' +
                '<button class="btn btn-small ' + (iSupport ? "btn-ghost" : "btn-primary") + '" id="btn-support" aria-pressed="' + (iSupport ? "true" : "false") + '">' +
                  (iSupport ? "Supporting ✓" : "Support") + "</button>" +
              "</div>"
            : "") +
          (isMe
            ? '<div class="profile-actions">' +
                '<button class="btn btn-primary btn-small" id="btn-edit-profile">Edit profile</button>' +
                '<button class="btn btn-ghost btn-small" id="btn-logout">Log out</button>' +
                '<button class="linklike" id="btn-about">About HALBA</button>' +
              "</div>"
            : "") +
        "</div>" +
      "</section>";

    $("profile-posts-title").textContent = isMe ? "My posts" : "Posts";
    var list = $("profile-posts");
    list.innerHTML = "";
    rows.forEach(function (p) { list.appendChild(postCard(p, { canDelete: isMe })); });

    page.querySelectorAll(".team-badge").forEach(function (b) {
      b.addEventListener("click", function () { show("team", b.dataset.team); });
    });
    page.querySelectorAll(".ach").forEach(function (b) {
      b.addEventListener("click", function () { show("event", b.dataset.event); });
    });
    var go = $("go-teams"); if (go) go.addEventListener("click", function () { show("teams"); });
    var sup = $("btn-support");
    if (sup) sup.addEventListener("click", async function () {
      var on = sup.getAttribute("aria-pressed") === "true";
      sup.disabled = true;
      var r = on
        ? await sb.from("supports").delete().match({ supporter_id: me.id, supported_id: userId })
        : await sb.from("supports").insert({ supporter_id: me.id, supported_id: userId });
      sup.disabled = false;
      if (r.error) return;
      on = !on;
      sup.setAttribute("aria-pressed", String(on));
      sup.textContent = on ? "Supporting ✓" : "Support";
      sup.className = "btn btn-small " + (on ? "btn-ghost" : "btn-primary");
      var c = $("stat-supporters").querySelector("strong");
      c.textContent = Math.max(0, +c.textContent + (on ? 1 : -1));
    });
    $("stat-supporters").addEventListener("click", function () { openPeopleList("Supporters", "supports", "supporter_id", "supported_id", userId); });
    $("stat-supporting").addEventListener("click", function () { openPeopleList("Supporting", "supports", "supported_id", "supporter_id", userId); });
    var ed = $("btn-edit-profile"); if (ed) ed.addEventListener("click", function () { openEditProfile(false); });
    var lo = $("btn-logout"); if (lo) lo.addEventListener("click", function () { sb.auth.signOut(); });
    var ab = $("btn-about"); if (ab) ab.addEventListener("click", function () { $("about-back").dataset.back = "profile"; show("about"); });
  }

  // ---------- people list sheet (supporters / supporting) ----------
  async function openPeopleList(title, table, pickCol, whereCol, userId) {
    $("list-title").textContent = title;
    var body = $("list-body");
    body.innerHTML = '<p class="empty">Loading…</p>';
    openSheet("sheet-list");
    var res = await sb.from(table)
      .select(pickCol + ", profiles!" + table + "_" + pickCol + "_fkey(id, name, username, avatar_url, skill, city)")
      .eq(whereCol, userId)
      .order("created_at", { ascending: false })
      .limit(200);
    var rows = (res.data || []).map(function (r) { return r.profiles; }).filter(Boolean);
    body.innerHTML = rows.length ? "" : '<p class="empty">' + (title === "Supporters" ? "No supporters yet." : "Not supporting anyone yet.") + "</p>";
    rows.forEach(function (p) {
      var el = document.createElement("button");
      el.className = "member member-btn";
      el.innerHTML = avatarHtml(p, "avatar-sm") +
        '<div class="member-body"><strong>' + esc(p.name) + "</strong>" +
        "<small>" + (p.username ? "@" + esc(p.username) : "") + (p.skill ? " · " + esc(p.skill) : "") + (p.city ? " · " + esc(p.city) : "") + "</small></div>";
      el.addEventListener("click", function () {
        closeSheet("sheet-list");
        $("profile-back").hidden = false; $("profile-back").dataset.back = "feed";
        show("profile", p.id);
      });
      body.appendChild(el);
    });
  }

  // ---------- edit profile sheet ----------
  var profForm = $("form-profile");
  var profAvatarFile = null;
  var myPrivate = null;
  async function openEditProfile(needUsername) {
    $("profile-notice").hidden = !needUsername;
    var pv = await sb.from("profile_private").select("*").eq("user_id", me.id).maybeSingle();
    myPrivate = pv.data || {};
    profForm.birth_date.value = myPrivate.birth_date || "";
    profForm.phone.value = myPrivate.phone || "";
    profForm.guardian_name.value = myPrivate.guardian_name || "";
    profForm.guardian_phone.value = myPrivate.guardian_phone || "";
    profForm.birth_date.dispatchEvent(new Event("input"));
    profForm.gender.value = myProfile.gender || "";
    profForm.nationality.value = myProfile.nationality || "";
    profForm.residence.value = myProfile.residence || "Kuwait";
    profForm.name.value = myProfile.name || "";
    profForm.username.value = myProfile.username || "";
    profForm.city.value = myProfile.city || "";
    profForm.skill.value = myProfile.skill || "";
    profForm.about.value = myProfile.about || "";
    $("edit-avatar").outerHTML = avatarHtml(myProfile, "avatar-lg").replace('class="avatar', 'id="edit-avatar" class="avatar');
    profForm.querySelector('[data-hint="username"]').textContent = "Letters, numbers and _ only.";
    profForm.querySelector('[data-msg="profile"]').textContent = "";
    profAvatarFile = null;
    openSheet("sheet-profile");
    if (needUsername) profForm.username.focus();
  }
  wireUsernameHint(profForm.username, profForm.querySelector('[data-hint="username"]'), function () { return me && me.id; });
  profForm.avatar.addEventListener("change", function () {
    var f = profForm.avatar.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { profForm.querySelector('[data-msg="profile"]').textContent = "Photo must be under 5MB."; return; }
    profAvatarFile = f;
    var url = URL.createObjectURL(f);
    $("edit-avatar").outerHTML = '<img id="edit-avatar" class="avatar avatar-lg" src="' + url + '" alt="">';
  });
  profForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var msg = profForm.querySelector('[data-msg="profile"]');
    var uname = profForm.username.value.trim().toLowerCase();
    if (!USERNAME_RE.test(uname)) { msg.textContent = "Username: 3–20 characters, letters, numbers and _ only."; return; }
    var dobErr = validDob(profForm.birth_date.value); if (dobErr) { msg.textContent = dobErr; return; }
    var phErr = validPhone(profForm.phone.value); if (phErr) { msg.textContent = phErr; return; }
    var gErr = window.__guardianCheck(profForm); if (gErr) { msg.textContent = gErr; return; }
    msg.textContent = "Saving…";
    if (uname !== myProfile.username && await usernameTaken(uname, me.id)) { msg.textContent = "@" + uname + " is taken."; return; }
    try {
      var dob = profForm.birth_date.value;
      var minor = ageOn(dob) < 13;
      var pv = await sb.from("profile_private").upsert({
        user_id: me.id, birth_date: dob, phone: profForm.phone.value.trim() || null,
        guardian_name: minor ? profForm.guardian_name.value.trim() : null,
        guardian_phone: minor ? profForm.guardian_phone.value.trim() : null,
        updated_at: new Date().toISOString()
      });
      if (pv.error) throw pv.error;
      var patch = {
        name: profForm.name.value.trim(),
        username: uname,
        city: profForm.city.value.trim(),
        skill: canonSkill(profForm.skill.value),
        about: profForm.about.value.trim(),
        gender: profForm.gender.value,
        nationality: profForm.nationality.value,
        residence: profForm.residence.value,
        birth_year: new Date(dob).getFullYear(),
        age_bracket: bracketFor(ageOn(dob)),
        guardian_managed: minor
      };
      if (profAvatarFile) patch.avatar_url = await uploadFile(profAvatarFile, "avatar");
      var up = await sb.from("profiles").update(patch).eq("id", me.id).select().single();
      if (up.error) throw up.error;
      myProfile = up.data;
      $("topbar-skill").textContent = myProfile.skill || "";
      skillIndex = null; // talent list changed
      closeSheet("sheet-profile");
      show("profile", me.id);
    } catch (err) {
      msg.textContent = /username/i.test(err.message) ? "That username is taken." : (err.message || "Couldn't save.");
    }
  });

  // ---------- teams ----------
  var allTeams = [];
  function teamCard(t) {
    var members = (t.team_members || []).filter(function (m) { return m.status === "approved"; }).length;
    var el = document.createElement("button");
    el.className = "card team-card";
    el.innerHTML =
      avatarHtml({ name: t.name, avatar_url: t.logo_url }, "avatar-team") +
      '<div class="team-card-body"><strong>' + esc(t.name) + "</strong>" +
      "<small>@" + esc(t.handle) + (t.skill ? " · " + esc(t.skill) : "") + (t.city ? " · " + esc(t.city) : "") + "</small>" +
      "<small>" + members + (members === 1 ? " member" : " members") + "</small></div>";
    el.addEventListener("click", function () { show("team", t.id); });
    return el;
  }
  function renderTeams(filter) {
    var q = (filter || "").toLowerCase();
    var list = $("team-list");
    list.innerHTML = "";
    var rows = allTeams.filter(function (t) {
      return !q || (t.name + " " + t.handle + " " + t.skill + " " + t.city).toLowerCase().indexOf(q) !== -1;
    });
    $("teams-empty").hidden = rows.length > 0;
    rows.forEach(function (t) { list.appendChild(teamCard(t)); });
  }
  async function loadTeams() {
    var res = await sb.from("teams").select("*, team_members(status)").order("created_at", { ascending: false }).limit(100);
    allTeams = res.data || [];
    renderTeams($("team-search").value);
  }
  $("team-search").addEventListener("input", function () { renderTeams(this.value); });

  // create team sheet
  var teamForm = $("form-team");
  var teamLogoFile = null;
  $("btn-new-team").addEventListener("click", function () {
    teamForm.reset(); teamLogoFile = null;
    $("team-logo-preview").outerHTML = '<span id="team-logo-preview" class="avatar avatar-lg avatar-team">T</span>';
    teamForm.querySelector('[data-msg="team"]').textContent = "";
    openSheet("sheet-team");
  });
  teamForm.name.addEventListener("input", function () {
    if (!teamForm.handle.dataset.touched) {
      teamForm.handle.value = teamForm.name.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24);
    }
    $("team-logo-preview").textContent = initials(teamForm.name.value || "T");
  });
  teamForm.handle.addEventListener("input", function () {
    teamForm.handle.dataset.touched = "1";
    teamForm.handle.value = teamForm.handle.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
  });
  teamForm.logo.addEventListener("change", function () {
    var f = teamForm.logo.files[0];
    if (!f) return;
    teamLogoFile = f;
    $("team-logo-preview").outerHTML = '<img id="team-logo-preview" class="avatar avatar-lg avatar-team" src="' + URL.createObjectURL(f) + '" alt="">';
  });
  teamForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var msg = teamForm.querySelector('[data-msg="team"]');
    var handle = teamForm.handle.value.trim();
    if (!/^[a-z0-9_]{3,24}$/.test(handle)) { msg.textContent = "Handle: 3–24 characters, letters, numbers and _ only."; return; }
    msg.textContent = "Creating…";
    try {
      var row = {
        name: teamForm.name.value.trim(),
        handle: handle,
        skill: teamForm.skill.value.trim(),
        city: teamForm.city.value.trim(),
        about: teamForm.about.value.trim(),
        admin_id: me.id
      };
      if (teamLogoFile) row.logo_url = await uploadFile(teamLogoFile, "teamlogo");
      var ins = await sb.from("teams").insert(row).select().single();
      if (ins.error) throw ins.error;
      await sb.from("team_members").insert({ team_id: ins.data.id, user_id: me.id, status: "approved", role: "admin", approved_at: new Date().toISOString() });
      closeSheet("sheet-team");
      show("team", ins.data.id);
    } catch (err) {
      msg.textContent = /handle/i.test(err.message) || /duplicate/i.test(err.message) ? "That handle is taken." : (err.message || "Couldn't create team.");
    }
  });

  // team page
  async function loadTeam(teamId) {
    var page = $("team-page");
    page.innerHTML = '<p class="empty">Loading…</p>';
    var res = await sb.from("teams")
      .select("*, team_members(user_id, status, role, requested_at, profiles(name, username, avatar_url, skill))")
      .eq("id", teamId).maybeSingle();
    var t = res.data;
    if (!t) { page.innerHTML = '<p class="empty">Team not found.</p>'; return; }
    var members = (t.team_members || []);
    var approved = members.filter(function (m) { return m.status === "approved"; });
    var pending = members.filter(function (m) { return m.status === "pending"; });
    var mine = members.find(function (m) { return me && m.user_id === me.id; });
    var isAdmin = me && t.admin_id === me.id;

    var actionHtml = "";
    if (isAdmin) actionHtml = '<span class="chip chip-admin">You run this team</span>';
    else if (!mine) actionHtml = '<button class="btn btn-primary btn-small" id="team-join">Request to join</button>';
    else if (mine.status === "pending") actionHtml = '<span class="chip chip-pending">Request pending</span> <button class="linklike" id="team-leave">Cancel</button>';
    else actionHtml = '<span class="chip chip-member">Member ✓</span> <button class="linklike" id="team-leave">Leave team</button>';

    function memberRow(m, withActions) {
      var p = m.profiles || {};
      return '<div class="member" data-user="' + esc(m.user_id) + '">' +
        avatarHtml(p, "avatar-sm") +
        '<div class="member-body"><strong>' + esc(p.name || "Member") + "</strong>" +
        "<small>" + (p.username ? "@" + esc(p.username) : "") + (p.skill ? " · " + esc(p.skill) : "") + (m.role === "admin" ? " · admin" : "") + "</small></div>" +
        (withActions
          ? '<button class="btn btn-small btn-primary act-approve">Approve</button><button class="btn btn-small btn-ghost act-decline">Decline</button>'
          : (isAdmin && m.role !== "admin" ? '<button class="linklike act-remove">Remove</button>' : "")) +
      "</div>";
    }

    page.innerHTML =
      '<section class="card team-head">' +
        avatarHtml({ name: t.name, avatar_url: t.logo_url }, "avatar-xl avatar-team") +
        '<h2 class="profile-name">' + esc(t.name) + "</h2>" +
        '<p class="profile-handle">@' + esc(t.handle) + "</p>" +
        '<p class="profile-meta">' +
          (t.skill ? '<span class="chip chip-skill">' + esc(t.skill) + "</span>" : "") +
          (t.city ? "<span>" + esc(t.city) + "</span>" : "") +
        "</p>" +
        (t.about ? '<p class="profile-about">' + esc(t.about) + "</p>" : "") +
        '<div class="profile-stats"><div><strong>' + approved.length + "</strong><span>members</span></div></div>" +
        '<div class="profile-actions">' + actionHtml + "</div>" +
      "</section>" +
      (isAdmin && pending.length
        ? '<h3 class="section-title">Join requests <span class="count">' + pending.length + "</span></h3>" +
          '<div class="card member-list" id="pending-list">' + pending.map(function (m) { return memberRow(m, true); }).join("") + "</div>"
        : "") +
      '<h3 class="section-title">Members</h3>' +
      '<div class="card member-list">' + (approved.length ? approved.map(function (m) { return memberRow(m, false); }).join("") : '<p class="empty">No members yet.</p>') + "</div>";

    var join = $("team-join");
    if (join) join.addEventListener("click", async function () {
      join.disabled = true;
      var r = await sb.from("team_members").insert({ team_id: t.id, user_id: me.id });
      if (r.error) { join.disabled = false; join.textContent = "Couldn't send — try again"; return; }
      loadTeam(t.id);
    });
    var leave = $("team-leave");
    if (leave) leave.addEventListener("click", async function () {
      await sb.from("team_members").delete().match({ team_id: t.id, user_id: me.id });
      loadTeam(t.id);
    });
    page.querySelectorAll(".member").forEach(function (row) {
      var uid = row.dataset.user;
      var ap = row.querySelector(".act-approve"), de = row.querySelector(".act-decline"), rm = row.querySelector(".act-remove");
      if (ap) ap.addEventListener("click", async function () {
        ap.disabled = true;
        await sb.from("team_members").update({ status: "approved", approved_at: new Date().toISOString() }).match({ team_id: t.id, user_id: uid });
        loadTeam(t.id);
      });
      if (de) de.addEventListener("click", async function () {
        await sb.from("team_members").delete().match({ team_id: t.id, user_id: uid });
        loadTeam(t.id);
      });
      if (rm) rm.addEventListener("click", async function () {
        await sb.from("team_members").delete().match({ team_id: t.id, user_id: uid });
        loadTeam(t.id);
      });
      row.querySelector(".avatar").addEventListener("click", function () {
        $("profile-back").hidden = false; $("profile-back").dataset.back = "teams";
        show("profile", uid);
      });
    });
  }

  // ---------- events ----------
  var EVENT_KINDS = {
    competition: { label: "Competition", icon: "🏆" },
    training:    { label: "Training",    icon: "🏋️" },
    bootcamp:    { label: "Bootcamp",    icon: "🔥" },
    workshop:    { label: "Workshop",    icon: "🎨" },
    tryout:      { label: "Tryout",      icon: "🎯" },
    showcase:    { label: "Showcase",    icon: "🎤" }
  };
  var BRACKET_SHORT = { U12: "Under 12", U15: "Under 15", U18: "Under 18", OPEN: "18+" };
  function kindChip(kind) {
    var k = EVENT_KINDS[kind] || { label: kind, icon: "" };
    return '<span class="chip chip-kind chip-kind-' + esc(kind) + '">' + k.icon + " " + esc(k.label) + "</span>";
  }
  function fmtWhen(startIso, endIso) {
    var s = new Date(startIso);
    var opts = { weekday: "short", day: "numeric", month: "short" };
    var day = s.toLocaleDateString("en-GB", opts);
    var time = s.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    var out = day + " · " + time;
    if (endIso) {
      var e = new Date(endIso);
      out += e.toDateString() === s.toDateString()
        ? "–" + e.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
        : " → " + e.toLocaleDateString("en-GB", opts);
    }
    return out;
  }
  function fmtFee(kwd) { return (+kwd || 0) > 0 ? "KD " + (+kwd).toFixed((+kwd) % 1 ? 3 : 0).replace(/\.?0+$/, "") : "Free"; }
  function isPast(ev) { return new Date(ev.ends_at || ev.starts_at).getTime() < Date.now() - 3600000; }
  function toLocalInput(iso) {
    if (!iso) return "";
    var d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  var allEvents = [], eventKind = "", eventWhen = "upcoming";
  function eventCard(ev) {
    var going = (ev.event_registrations || []).filter(function (r) { return r.status === "going"; }).length;
    var el = document.createElement("button");
    el.className = "card event-card" + (ev.status === "cancelled" ? " is-cancelled" : "");
    el.innerHTML =
      (ev.cover_url ? '<img class="event-cover-sm" src="' + esc(ev.cover_url) + '" alt="">' : '<div class="event-date-sm"><strong>' + new Date(ev.starts_at).getDate() + "</strong><span>" + new Date(ev.starts_at).toLocaleDateString("en-GB", { month: "short" }) + "</span></div>") +
      '<div class="team-card-body">' +
        "<div>" + kindChip(ev.kind) + (ev.status === "cancelled" ? ' <span class="chip chip-pending">Cancelled</span>' : "") + "</div>" +
        "<strong>" + esc(ev.title) + "</strong>" +
        "<small>" + esc(fmtWhen(ev.starts_at, ev.ends_at)) + "</small>" +
        "<small>" + [ev.skill, ev.city].filter(Boolean).map(esc).join(" · ") + "</small>" +
        "<small>" + going + " going · " + esc(fmtFee(ev.fee_kwd)) + (ev.capacity ? " · " + Math.max(0, ev.capacity - going) + " places left" : "") + "</small>" +
      "</div>";
    el.addEventListener("click", function () { show("event", ev.id); });
    return el;
  }
  function renderEvents() {
    var q = ($("event-search").value || "").toLowerCase();
    var list = $("event-list"); list.innerHTML = "";
    var rows = allEvents.filter(function (ev) {
      if (eventKind && ev.kind !== eventKind) return false;
      if (eventWhen === "upcoming" && (isPast(ev) || ev.status === "cancelled")) return false;
      if (eventWhen === "past" && !isPast(ev)) return false;
      if (eventWhen === "mine" && !(me && (ev.organiser_id === me.id || (ev.event_registrations || []).some(function (r) { return r.user_id === me.id; })))) return false;
      return !q || (ev.title + " " + ev.skill + " " + ev.city + " " + ev.venue).toLowerCase().indexOf(q) !== -1;
    });
    if (eventWhen === "past") rows.reverse();
    $("events-empty").textContent = eventWhen === "mine" ? "Nothing yet. Register for an event or add your own." : (eventWhen === "past" ? "No past events." : "No upcoming events. Add the first one.");
    $("events-empty").hidden = rows.length > 0;
    rows.forEach(function (ev) { list.appendChild(eventCard(ev)); });
  }
  async function loadEvents() {
    var res = await sb.from("events").select("*, event_registrations(user_id, status)").order("starts_at", { ascending: true }).limit(200);
    allEvents = res.data || [];
    renderEvents();
  }
  $("event-search").addEventListener("input", renderEvents);
  $("event-kinds").addEventListener("click", function (e) {
    var b = e.target.closest(".filter-chip"); if (!b) return;
    eventKind = b.dataset.kind;
    $("event-kinds").querySelectorAll(".filter-chip").forEach(function (c) { c.classList.toggle("is-on", c === b); });
    renderEvents();
  });
  $("event-when").addEventListener("click", function (e) {
    var b = e.target.closest(".seg-btn"); if (!b) return;
    eventWhen = b.dataset.when;
    $("event-when").querySelectorAll(".seg-btn").forEach(function (c) { c.classList.toggle("is-on", c === b); });
    renderEvents();
  });

  // create / edit event sheet
  var eventForm = $("form-event");
  var eventCoverFile = null;
  async function openEventSheet(ev) {
    eventForm.reset(); eventCoverFile = null;
    $("event-cover-name").textContent = "Add a cover photo (optional)";
    eventForm.querySelector('[data-msg="event"]').textContent = "";
    $("event-sheet-title").textContent = ev ? "Edit event" : "Add an event";
    $("btn-save-event").textContent = ev ? "Save changes" : "Publish event";
    // teams I run
    var mine = await sb.from("teams").select("id, name").eq("admin_id", me.id).order("name");
    eventForm.team_id.innerHTML = '<option value="">Just me</option>' + (mine.data || []).map(function (t) {
      return '<option value="' + esc(t.id) + '">' + esc(t.name) + "</option>";
    }).join("");
    if (ev) {
      eventForm.id.value = ev.id;
      var r = eventForm.querySelector('input[name="kind"][value="' + ev.kind + '"]'); if (r) r.checked = true;
      eventForm.title.value = ev.title; eventForm.skill.value = ev.skill || ""; eventForm.city.value = ev.city || "";
      eventForm.venue.value = ev.venue || ""; eventForm.starts_at.value = toLocalInput(ev.starts_at); eventForm.ends_at.value = toLocalInput(ev.ends_at);
      eventForm.querySelectorAll('input[name="brackets"]').forEach(function (c) { c.checked = (ev.brackets || []).indexOf(c.value) !== -1; });
      eventForm.fee_kwd.value = ev.fee_kwd || 0; eventForm.capacity.value = ev.capacity || "";
      eventForm.team_id.value = ev.team_id || ""; eventForm.description.value = ev.description || "";
    } else {
      eventForm.id.value = "";
      eventForm.skill.value = myProfile.skill || ""; eventForm.city.value = myProfile.city || "";
      var d = new Date(); d.setDate(d.getDate() + 7); d.setHours(17, 0, 0, 0);
      eventForm.starts_at.value = toLocalInput(d.toISOString());
    }
    openSheet("sheet-event");
  }
  $("btn-new-event").addEventListener("click", function () { openEventSheet(null); });
  eventForm.cover.addEventListener("change", function () {
    var f = eventForm.cover.files[0]; if (!f) return;
    if (f.size > 8 * 1024 * 1024) { eventForm.querySelector('[data-msg="event"]').textContent = "Cover must be under 8MB."; eventForm.cover.value = ""; return; }
    eventCoverFile = f; $("event-cover-name").textContent = f.name;
  });
  eventForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var msg = eventForm.querySelector('[data-msg="event"]');
    var kind = (eventForm.querySelector('input[name="kind"]:checked') || {}).value;
    if (!kind) { msg.textContent = "Pick the kind of event."; return; }
    var starts = new Date(eventForm.starts_at.value), ends = eventForm.ends_at.value ? new Date(eventForm.ends_at.value) : null;
    if (isNaN(starts.getTime())) { msg.textContent = "Set a start date and time."; return; }
    if (ends && ends < starts) { msg.textContent = "The end must be after the start."; return; }
    msg.textContent = "Saving…";
    try {
      var row = {
        kind: kind,
        title: eventForm.title.value.trim(),
        skill: canonSkill(eventForm.skill.value),
        city: eventForm.city.value.trim(),
        venue: eventForm.venue.value.trim(),
        starts_at: starts.toISOString(),
        ends_at: ends ? ends.toISOString() : null,
        brackets: Array.prototype.map.call(eventForm.querySelectorAll('input[name="brackets"]:checked'), function (c) { return c.value; }),
        fee_kwd: +eventForm.fee_kwd.value || 0,
        capacity: eventForm.capacity.value ? +eventForm.capacity.value : null,
        team_id: eventForm.team_id.value || null,
        description: eventForm.description.value.trim()
      };
      if (eventCoverFile) row.cover_url = await uploadFile(eventCoverFile, "event");
      var r, id = eventForm.id.value;
      if (id) { r = await sb.from("events").update(row).eq("id", id).select().single(); }
      else { row.organiser_id = me.id; r = await sb.from("events").insert(row).select().single(); }
      if (r.error) throw r.error;
      if (!id) await sb.from("event_registrations").insert({ event_id: r.data.id, user_id: me.id, status: "going" });
      closeSheet("sheet-event");
      show("event", r.data.id);
    } catch (err) { msg.textContent = err.message || "Couldn't save the event."; }
  });

  // result sheet
  var resultForm = $("form-result");
  resultForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var msg = resultForm.querySelector('[data-msg="result"]');
    msg.textContent = "Saving…";
    var r = await sb.from("event_results").upsert({
      event_id: resultForm.event_id.value, user_id: resultForm.user_id.value,
      rank: +resultForm.rank.value, note: resultForm.note.value.trim()
    });
    if (r.error) { msg.textContent = r.error.message; return; }
    closeSheet("sheet-result");
    show("event", resultForm.event_id.value);
  });

  // event page
  async function loadEvent(eventId) {
    var page = $("event-page");
    page.innerHTML = '<p class="empty">Loading…</p>';
    var res = await sb.from("events")
      .select("*, profiles!events_organiser_id_fkey(id, name, username, avatar_url), teams(id, name, logo_url), " +
              "event_registrations(user_id, status, attended, created_at, profiles(name, username, avatar_url, skill, age_bracket)), " +
              "event_results(user_id, rank, note, profiles(name, username, avatar_url))")
      .eq("id", eventId).maybeSingle();
    var ev = res.data;
    if (!ev) { page.innerHTML = '<p class="empty">Event not found.' + (res.error ? " " + esc(res.error.message) : "") + "</p>"; return; }
    var regs = (ev.event_registrations || []).sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; });
    var going = regs.filter(function (r) { return r.status === "going"; });
    var waitlist = regs.filter(function (r) { return r.status === "waitlist"; });
    var mine = regs.find(function (r) { return me && r.user_id === me.id; });
    var isOrg = me && ev.organiser_id === me.id;
    var past = isPast(ev), cancelled = ev.status === "cancelled";
    var full = ev.capacity && going.length >= ev.capacity;
    var results = (ev.event_results || []).sort(function (a, b) { return a.rank - b.rank; });
    var eligible = !ev.brackets || !ev.brackets.length || !myProfile || !myProfile.age_bracket || ev.brackets.indexOf(myProfile.age_bracket) !== -1;

    var action = "";
    if (cancelled) action = '<span class="chip chip-pending">This event was cancelled</span>';
    else if (isOrg) action = '<span class="chip chip-admin">You organise this event</span>';
    else if (past) action = mine ? '<span class="chip chip-member">' + (mine.attended ? "You took part ✓" : "You were registered") + "</span>" : '<span class="chip chip-pending">This event has ended</span>';
    else if (mine && mine.status === "going") action = '<span class="chip chip-member">You\'re going ✓</span> <button class="linklike" id="ev-withdraw">Withdraw</button>';
    else if (mine) action = '<span class="chip chip-pending">On the waitlist (#' + (waitlist.findIndex(function (r) { return r.user_id === me.id; }) + 1) + ')</span> <button class="linklike" id="ev-withdraw">Leave waitlist</button>';
    else if (!eligible) action = '<span class="chip chip-pending">For ' + ev.brackets.map(function (b) { return BRACKET_SHORT[b] || b; }).join(", ") + " only</span>";
    else action = '<button class="btn btn-primary btn-small" id="ev-register">' + (full ? "Join the waitlist" : (ev.kind === "competition" ? "Enter competition" : "Register")) + "</button>";

    function regRow(r) {
      var p = r.profiles || {};
      return '<div class="member" data-user="' + esc(r.user_id) + '">' +
        avatarHtml(p, "avatar-sm") +
        '<div class="member-body"><strong>' + esc(p.name || "Member") + "</strong>" +
        "<small>" + (p.username ? "@" + esc(p.username) : "") + (p.skill ? " · " + esc(p.skill) : "") + (p.age_bracket ? " · " + esc(bracketLabel(p.age_bracket)) : "") + "</small></div>" +
        (isOrg && !cancelled
          ? (r.status === "waitlist"
              ? '<button class="btn btn-small btn-primary act-promote">Admit</button>'
              : '<label class="attend"><input type="checkbox" class="act-attend"' + (r.attended ? " checked" : "") + "> Attended</label>") +
            '<button class="linklike act-remove" aria-label="Remove">×</button>'
          : (r.attended ? '<span class="chip chip-member">✓</span>' : "")) +
      "</div>";
    }
    function resultRow(r) {
      var p = r.profiles || {};
      var medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : "#" + r.rank;
      return '<div class="member result-row" data-user="' + esc(r.user_id) + '">' +
        '<span class="medal">' + medal + "</span>" + avatarHtml(p, "avatar-sm") +
        '<div class="member-body"><strong>' + esc(p.name || "Member") + "</strong><small>" + (p.username ? "@" + esc(p.username) : "") + (r.note ? " · " + esc(r.note) : "") + "</small></div>" +
        (isOrg ? '<button class="linklike act-unresult" aria-label="Remove result">×</button>' : "") +
      "</div>";
    }
    var org = ev.profiles || {};
    page.innerHTML =
      '<section class="card event-head">' +
        (ev.cover_url ? '<img class="event-cover" src="' + esc(ev.cover_url) + '" alt="">' : '<div class="event-cover event-cover-empty">' + (EVENT_KINDS[ev.kind] || {}).icon + "</div>") +
        '<div class="event-body">' +
          "<div>" + kindChip(ev.kind) + (ev.skill ? ' <span class="chip chip-skill">' + esc(ev.skill) + "</span>" : "") + "</div>" +
          '<h2 class="event-title">' + esc(ev.title) + "</h2>" +
          '<ul class="event-facts">' +
            "<li>📅 " + esc(fmtWhen(ev.starts_at, ev.ends_at)) + "</li>" +
            (ev.venue || ev.city ? "<li>📍 " + esc([ev.venue, ev.city].filter(Boolean).join(", ")) + "</li>" : "") +
            "<li>🎟️ " + esc(fmtFee(ev.fee_kwd)) + (ev.capacity ? " · " + going.length + " / " + ev.capacity + " places" : " · " + going.length + " going") + "</li>" +
            (ev.brackets && ev.brackets.length ? "<li>👥 " + esc(ev.brackets.map(function (b) { return BRACKET_SHORT[b] || b; }).join(", ")) + "</li>" : "<li>👥 All ages</li>") +
          "</ul>" +
          '<button class="event-org" id="ev-org">' + avatarHtml(ev.teams ? { name: ev.teams.name, avatar_url: ev.teams.logo_url } : org, "avatar-xs" + (ev.teams ? " avatar-team" : "")) +
            "<span>Organised by <strong>" + esc(ev.teams ? ev.teams.name : org.name) + "</strong>" + (ev.teams ? " · " + esc(org.name) : "") + "</span></button>" +
          (ev.description ? '<p class="event-desc">' + esc(ev.description) + "</p>" : "") +
          '<div class="profile-actions">' + action +
            (isOrg && !cancelled ? '<button class="btn btn-ghost btn-small" id="ev-edit">Edit</button>' + (!past ? '<button class="linklike" id="ev-cancel">Cancel event</button>' : "") : "") +
          "</div>" +
        "</div>" +
      "</section>" +
      (results.length || (isOrg && ev.kind === "competition" && past && !cancelled)
        ? '<h3 class="section-title">Results' + (isOrg && !cancelled ? ' <button class="linklike" id="ev-add-result">+ Add result</button>' : "") + "</h3>" +
          '<div class="card member-list">' + (results.length ? results.map(resultRow).join("") : '<p class="empty">No results yet. Add the podium.</p>') + "</div>"
        : (isOrg && !cancelled && regs.length ? '<p class="event-hint"><button class="linklike" id="ev-add-result">+ Add a result</button> once the event is done — it appears on the talent\'s profile.</p>' : "")) +
      '<h3 class="section-title">' + (past ? "Took part" : "Going") + ' <span class="count">' + going.length + "</span></h3>" +
      '<div class="card member-list">' + (going.length ? going.map(regRow).join("") : '<p class="empty">Nobody yet. Be the first.</p>') + "</div>" +
      (waitlist.length ? '<h3 class="section-title">Waitlist <span class="count">' + waitlist.length + "</span></h3>" +
          '<div class="card member-list">' + waitlist.map(regRow).join("") + "</div>" : "");

    var reg = $("ev-register");
    if (reg) reg.addEventListener("click", async function () {
      reg.disabled = true;
      var r = await sb.from("event_registrations").insert({ event_id: ev.id, user_id: me.id, status: full ? "waitlist" : "going" });
      if (r.error) { reg.disabled = false; reg.textContent = "Couldn't register — try again"; return; }
      loadEvent(ev.id);
    });
    var wd = $("ev-withdraw");
    if (wd) wd.addEventListener("click", async function () {
      await sb.from("event_registrations").delete().match({ event_id: ev.id, user_id: me.id });
      loadEvent(ev.id);
    });
    var ed = $("ev-edit"); if (ed) ed.addEventListener("click", function () { openEventSheet(ev); });
    var cx = $("ev-cancel");
    if (cx) cx.addEventListener("click", async function () {
      if (cx.dataset.sure !== "1") { cx.dataset.sure = "1"; cx.textContent = "Tap again to confirm cancellation"; return; }
      await sb.from("events").update({ status: "cancelled" }).eq("id", ev.id);
      loadEvent(ev.id);
    });
    var ar = $("ev-add-result");
    if (ar) ar.addEventListener("click", function () {
      resultForm.reset();
      resultForm.event_id.value = ev.id;
      resultForm.user_id.innerHTML = going.map(function (r) {
        var p = r.profiles || {};
        return '<option value="' + esc(r.user_id) + '">' + esc(p.name) + (p.username ? " (@" + esc(p.username) + ")" : "") + "</option>";
      }).join("");
      resultForm.rank.value = results.length + 1;
      resultForm.querySelector('[data-msg="result"]').textContent = "";
      openSheet("sheet-result");
    });
    $("ev-org").addEventListener("click", function () {
      if (ev.teams) show("team", ev.teams.id);
      else { $("profile-back").hidden = false; $("profile-back").dataset.back = "events"; show("profile", ev.organiser_id); }
    });
    page.querySelectorAll(".member").forEach(function (row) {
      var uid = row.dataset.user;
      var at = row.querySelector(".act-attend"), rm = row.querySelector(".act-remove"), pr = row.querySelector(".act-promote"), ur = row.querySelector(".act-unresult");
      if (at) at.addEventListener("change", function () {
        sb.from("event_registrations").update({ attended: at.checked }).match({ event_id: ev.id, user_id: uid });
      });
      if (rm) rm.addEventListener("click", async function () {
        await sb.from("event_registrations").delete().match({ event_id: ev.id, user_id: uid }); loadEvent(ev.id);
      });
      if (pr) pr.addEventListener("click", async function () {
        await sb.from("event_registrations").update({ status: "going" }).match({ event_id: ev.id, user_id: uid }); loadEvent(ev.id);
      });
      if (ur) ur.addEventListener("click", async function () {
        await sb.from("event_results").delete().match({ event_id: ev.id, user_id: uid }); loadEvent(ev.id);
      });
      var av = row.querySelector(".avatar");
      if (av) av.addEventListener("click", function () {
        $("profile-back").hidden = false; $("profile-back").dataset.back = "events"; show("profile", uid);
      });
    });
  }

  // ---------- nav ----------
  document.querySelectorAll(".nav-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.dataset.nav === "profile") { $("profile-back").hidden = true; show("profile", me.id); }
      else show(b.dataset.nav);
    });
  });

  // ---------- PWA ----------
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
