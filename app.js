/* ====================================================================
   HALBA — login + post MVP
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

  var views = ["feed", "compose", "profile"];
  function show(view) {
    views.forEach(function (v) { $("view-" + v).hidden = v !== view; });
    document.querySelectorAll(".nav-btn").forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.nav === view);
    });
    if (view === "feed") loadFeed();
    if (view === "profile") loadProfile();
  }

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
    setAuthMsg("Creating your profile…");
    var res = await sb.auth.signUp({
      email: f.email.value.trim(),
      password: f.password.value,
      options: { data: {
        name: f.name.value.trim(),
        city: f.city.value.trim(),
        skill: f.skill.value.trim()
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

  $("btn-logout").addEventListener("click", function () { sb.auth.signOut(); });

  async function ensureProfile() {
    var got = await sb.from("profiles").select("*").eq("id", me.id).maybeSingle();
    if (got.data) { myProfile = got.data; return; }
    var md = me.user_metadata || {};
    var ins = await sb.from("profiles").insert({
      id: me.id,
      name: md.name || "Athlete",
      city: md.city || "",
      skill: md.skill || ""
    }).select().single();
    myProfile = ins.data || { id: me.id, name: md.name || "Athlete", city: "", skill: "" };
  }

  sb.auth.onAuthStateChange(async function (_event, session) {
    me = session ? session.user : null;
    if (me) {
      await ensureProfile();
      $("view-auth").hidden = true;
      $("app-shell").hidden = false;
      $("topbar-skill").textContent = myProfile.skill || "";
      show("feed");
    } else {
      myProfile = null;
      $("app-shell").hidden = true;
      $("view-auth").hidden = false;
      setAuthMsg("");
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
      '<div class="avatar avatar-sm">' + esc(initials(prof.name)) + "</div>" +
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
      '<div class="post-head">' +
        '<div class="avatar">' + esc(initials(prof.name)) + "</div>" +
        '<div class="post-who"><strong>' + esc(prof.name || "Athlete") + "</strong>" +
        "<small>" + esc(prof.city || "") + " · " + timeAgo(p.created_at) + "</small></div>" +
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
        .select("*, profiles(name)")
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
        .select("*, profiles(name)").single();
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
      .select("*, profiles(name, city, skill), claps(user_id), comments(id)")
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
        var path = me.id + "/" + Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        var up = await sb.storage.from("media").upload(path, file, { contentType: file.type });
        if (up.error) throw up.error;
        media_url = sb.storage.from("media").getPublicUrl(path).data.publicUrl;
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

  // ---------- profile ----------
  async function loadProfile() {
    $("profile-avatar").textContent = initials(myProfile.name);
    $("profile-name").textContent = myProfile.name;
    $("profile-meta").textContent =
      (myProfile.skill || "—") + " · " + (myProfile.city || "—");

    var res = await sb.from("posts")
      .select("*, profiles(name, city, skill), claps(user_id), comments(id)")
      .eq("user_id", me.id)
      .order("created_at", { ascending: false });
    var rows = res.data || [];
    $("stat-posts").textContent = rows.length;
    $("stat-claps").textContent = rows.reduce(function (n, p) {
      return n + (p.claps ? p.claps.length : 0);
    }, 0);
    var list = $("profile-posts");
    list.innerHTML = "";
    rows.forEach(function (p) {
      list.appendChild(postCard(p, { canDelete: true }));
    });
  }

  // ---------- nav ----------
  document.querySelectorAll(".nav-btn").forEach(function (b) {
    b.addEventListener("click", function () { show(b.dataset.nav); });
  });

  // ---------- PWA ----------
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
