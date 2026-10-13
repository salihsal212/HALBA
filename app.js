/* ====================================================================
   HALBA — profiles, posts, claps, typed comments, teams
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

  var views = ["feed", "compose", "teams", "team", "profile", "about"];
  function show(view, arg) {
    views.forEach(function (v) { $("view-" + v).hidden = v !== view; });
    var navKey = view === "team" ? "teams" : view;
    document.querySelectorAll(".nav-btn").forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.nav === navKey);
    });
    window.scrollTo(0, 0);
    if (view === "feed") loadFeed();
    if (view === "teams") loadTeams();
    if (view === "team") loadTeam(arg);
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
    if (age < 13) return "You must be 13 or older to join HALBA.";
    return null;
  }
  function validPhone(p) {
    p = (p || "").trim();
    if (!p) return null;
    return /^\+?[0-9 ]{7,16}$/.test(p) ? null : "Mobile number: digits only, e.g. +965 5xxx xxxx";
  }
  (function () {
    var max = new Date(); max.setFullYear(max.getFullYear() - 13);
    var iso = max.toISOString().slice(0, 10);
    document.querySelectorAll('input[name="birth_date"]').forEach(function (i) { i.max = iso; });
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
        skill: f.skill.value.trim(),
        gender: f.gender.value,
        nationality: f.nationality.value,
        residence: f.residence.value,
        birth_date: f.birth_date.value,
        phone: f.phone.value.trim() || null
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
      age_bracket: age != null ? bracketFor(age) : null
    }).select().single();
    myProfile = ins.data || { id: me.id, name: md.name || "Athlete", city: "", skill: "" };
    if (md.birth_date || md.phone) {
      await sb.from("profile_private").upsert({ user_id: me.id, birth_date: md.birth_date || null, phone: md.phone || null });
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

  async function loadFeed() {
    var res = await sb.from("posts")
      .select("*, profiles!posts_user_id_fkey(name, city, skill, username, avatar_url), claps(user_id), comments(id)")
      .order("created_at", { ascending: false })
      .limit(50);
    var list = $("feed-list");
    list.innerHTML = "";
    var rows = res.data || [];
    if (res.error) {
      $("feed-empty").textContent = "Couldn't load the arena: " + res.error.message + " — pull to refresh or reopen the app.";
      $("feed-empty").hidden = false;
      return;
    }
    $("feed-empty").textContent = "The arena is quiet. Be the first to post your skill.";
    $("feed-empty").hidden = rows.length > 0;
    rows.forEach(function (p) {
      list.appendChild(postCard(p, { canDelete: me && p.user_id === me.id }));
    });
  }

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
    var teams = (mem.data || []).filter(function (m) { return m.teams; });

    var res = await sb.from("posts")
      .select("*, profiles!posts_user_id_fkey(name, city, skill, username, avatar_url), claps(user_id), comments(id)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    var rows = res.data || [];
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
            (prof.birth_year ? "<span>Born " + esc(prof.birth_year) + "</span>" : "") +
            (prof.nationality ? "<span>" + esc(prof.nationality) + "</span>" : "") +
            (prof.residence && prof.residence !== prof.nationality ? "<span>Lives in " + esc(prof.residence) + "</span>" : "") +
          "</p>" +
          teamHtml +
          (prof.about ? '<p class="profile-about">' + esc(prof.about) + "</p>" : (isMe ? '<p class="profile-about is-empty">Add a line about yourself.</p>' : "")) +
          '<div class="profile-stats">' +
            "<div><strong>" + rows.length + "</strong><span>posts</span></div>" +
            "<div><strong>" + clapsEarned + "</strong><span>claps earned</span></div>" +
            "<div><strong>" + teams.filter(function (m) { return m.status === "approved"; }).length + "</strong><span>teams</span></div>" +
          "</div>" +
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
    var go = $("go-teams"); if (go) go.addEventListener("click", function () { show("teams"); });
    var ed = $("btn-edit-profile"); if (ed) ed.addEventListener("click", function () { openEditProfile(false); });
    var lo = $("btn-logout"); if (lo) lo.addEventListener("click", function () { sb.auth.signOut(); });
    var ab = $("btn-about"); if (ab) ab.addEventListener("click", function () { $("about-back").dataset.back = "profile"; show("about"); });
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
    msg.textContent = "Saving…";
    if (uname !== myProfile.username && await usernameTaken(uname, me.id)) { msg.textContent = "@" + uname + " is taken."; return; }
    try {
      var dob = profForm.birth_date.value;
      var pv = await sb.from("profile_private").upsert({
        user_id: me.id, birth_date: dob, phone: profForm.phone.value.trim() || null, updated_at: new Date().toISOString()
      });
      if (pv.error) throw pv.error;
      var patch = {
        name: profForm.name.value.trim(),
        username: uname,
        city: profForm.city.value.trim(),
        skill: profForm.skill.value.trim(),
        about: profForm.about.value.trim(),
        gender: profForm.gender.value,
        nationality: profForm.nationality.value,
        residence: profForm.residence.value,
        birth_year: new Date(dob).getFullYear(),
        age_bracket: bracketFor(ageOn(dob))
      };
      if (profAvatarFile) patch.avatar_url = await uploadFile(profAvatarFile, "avatar");
      var up = await sb.from("profiles").update(patch).eq("id", me.id).select().single();
      if (up.error) throw up.error;
      myProfile = up.data;
      $("topbar-skill").textContent = myProfile.skill || "";
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
