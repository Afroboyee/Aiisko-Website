/* AISSKO site behavior. No libraries. Everything here is an enhancement: the pages read fine without it. */
(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.add("js");
  var cfg = window.AISSKO || { email: "", links: {}, activeStates: [] };

  // [code, name, column, row] for the tile map (11 columns).
  var STATES = [
    ["AK", "Alaska", 0, 0], ["ME", "Maine", 10, 0],
    ["VT", "Vermont", 9, 1], ["NH", "New Hampshire", 10, 1],
    ["WA", "Washington", 0, 2], ["ID", "Idaho", 1, 2], ["MT", "Montana", 2, 2], ["ND", "North Dakota", 3, 2], ["MN", "Minnesota", 4, 2],
    ["IL", "Illinois", 5, 2], ["WI", "Wisconsin", 6, 2], ["MI", "Michigan", 7, 2], ["NY", "New York", 8, 2], ["MA", "Massachusetts", 9, 2],
    ["OR", "Oregon", 0, 3], ["NV", "Nevada", 1, 3], ["WY", "Wyoming", 2, 3], ["SD", "South Dakota", 3, 3], ["IA", "Iowa", 4, 3],
    ["IN", "Indiana", 5, 3], ["OH", "Ohio", 6, 3], ["PA", "Pennsylvania", 7, 3], ["NJ", "New Jersey", 8, 3], ["CT", "Connecticut", 9, 3], ["RI", "Rhode Island", 10, 3],
    ["CA", "California", 0, 4], ["UT", "Utah", 1, 4], ["CO", "Colorado", 2, 4], ["NE", "Nebraska", 3, 4], ["MO", "Missouri", 4, 4],
    ["KY", "Kentucky", 5, 4], ["WV", "West Virginia", 6, 4], ["VA", "Virginia", 7, 4], ["MD", "Maryland", 8, 4], ["DE", "Delaware", 9, 4],
    ["AZ", "Arizona", 1, 5], ["NM", "New Mexico", 2, 5], ["KS", "Kansas", 3, 5], ["AR", "Arkansas", 4, 5], ["TN", "Tennessee", 5, 5],
    ["NC", "North Carolina", 6, 5], ["SC", "South Carolina", 7, 5], ["DC", "Washington, D.C.", 8, 5],
    ["OK", "Oklahoma", 3, 6], ["LA", "Louisiana", 4, 6], ["MS", "Mississippi", 5, 6], ["AL", "Alabama", 6, 6], ["GA", "Georgia", 7, 6],
    ["HI", "Hawaii", 0, 7], ["TX", "Texas", 3, 7], ["FL", "Florida", 8, 7]
  ];
  function stateName(code) {
    for (var i = 0; i < STATES.length; i++) if (STATES[i][0] === code) return STATES[i][1];
    return code;
  }

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  ready(function () {
    initNav();
    initYear();
    initEmail();
    initLinks();
    initReveal();
    initFilters();
    initTabs();
    initStateMap();
    initForms();
    initPrefill();
  });

  /* ---------- Navigation ---------- */
  function initNav() {
    var header = document.querySelector(".site-header");
    var toggle = document.querySelector(".nav-toggle");
    if (!header || !toggle) return;
    function set(open) {
      header.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
    toggle.addEventListener("click", function () { set(!header.classList.contains("nav-open")); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
    header.querySelectorAll(".nav a").forEach(function (a) { a.addEventListener("click", function () { set(false); }); });
  }

  function initYear() {
    document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
  }

  function initEmail() {
    if (!cfg.email) return;
    document.querySelectorAll("a[data-email]").forEach(function (a) {
      a.href = "mailto:" + cfg.email;
      if (!a.hasAttribute("data-keep")) a.textContent = cfg.email;
    });
  }

  /* Buttons that switch from "request" to the real link once config.js has one. */
  function initLinks() {
    document.querySelectorAll("[data-link]").forEach(function (a) {
      var parts = a.getAttribute("data-link").split(":");
      var url = ((cfg.links || {})[parts[0]] || {})[parts[1]];
      if (!url) return;
      a.setAttribute("href", url);
      if (/^https?:/i.test(url)) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); }
      var live = a.getAttribute("data-live");
      var lbl = a.querySelector(".lbl");
      if (live && lbl) lbl.textContent = live;
    });
  }

  function initReveal() {
    var els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { els.forEach(function (el) { el.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Apps filter ---------- */
  function initFilters() {
    var chips = document.querySelectorAll(".chip[data-filter]");
    if (!chips.length) return;
    var items = document.querySelectorAll("[data-cats]");
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var f = chip.getAttribute("data-filter");
        chips.forEach(function (c) { c.setAttribute("aria-pressed", c === chip ? "true" : "false"); });
        items.forEach(function (it) {
          var cats = (it.getAttribute("data-cats") || "").split(" ");
          it.hidden = !(f === "all" || cats.indexOf(f) !== -1);
        });
        document.querySelectorAll(".app-group").forEach(function (g) {
          g.hidden = !g.querySelector("[data-cats]:not([hidden])");
        });
      });
    });
  }

  /* ---------- Tabs (People Services forms) ---------- */
  var selectTab;
  function initTabs() {
    var list = document.querySelector('[role="tablist"]');
    if (!list) return;
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    selectTab = function (id, focus) {
      tabs.forEach(function (t) {
        var on = t.id === "tab-" + id;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
        if (on && focus) t.focus();
      });
    };
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { selectTab(t.id.replace("tab-", "")); });
      t.addEventListener("keydown", function (e) {
        var n = null;
        if (e.key === "ArrowRight") n = tabs[(i + 1) % tabs.length];
        if (e.key === "ArrowLeft") n = tabs[(i - 1 + tabs.length) % tabs.length];
        if (n) { e.preventDefault(); selectTab(n.id.replace("tab-", ""), true); }
      });
    });
    function fromHash() {
      var id = (location.hash || "").replace("#", "");
      if (document.getElementById("tab-" + id)) {
        selectTab(id);
        var panel = document.getElementById(id);
        if (panel) setTimeout(function () { panel.scrollIntoView({ behavior: "smooth", block: "start" }); }, 30);
      }
    }
    selectTab(tabs[0].id.replace("tab-", ""));
    window.addEventListener("hashchange", fromHash);
    fromHash();
  }

  /* ---------- State tile map ---------- */
  function initStateMap() {
    var map = document.getElementById("statemap");
    if (!map) return;
    var panelTitle = document.getElementById("state-title");
    var panelStatus = document.getElementById("state-status");
    var panelCopy = document.getElementById("state-copy");
    var btnRequest = document.getElementById("state-request");
    var btnJoin = document.getElementById("state-join");
    var active = (cfg.activeStates || []).map(function (s) { return String(s).toUpperCase(); });
    var current = null;

    STATES.forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tile" + (active.indexOf(s[0]) !== -1 ? " is-active" : "");
      b.textContent = s[0];
      b.setAttribute("aria-label", s[1]);
      b.setAttribute("aria-pressed", "false");
      b.dataset.code = s[0];
      b.style.gridColumn = s[2] + 1;
      b.style.gridRow = s[3] + 1;
      b.addEventListener("click", function () { choose(s[0]); });
      map.appendChild(b);
    });

    function choose(code) {
      current = code;
      map.querySelectorAll(".tile").forEach(function (t) { t.setAttribute("aria-pressed", t.dataset.code === code ? "true" : "false"); });
      var isActive = active.indexOf(code) !== -1;
      panelTitle.textContent = stateName(code);
      panelStatus.innerHTML = isActive
        ? '<span class="tag tag--cyan">Active crew</span>'
        : '<span class="tag">Building this crew</span>';
      panelCopy.textContent = isActive
        ? "We have an active contractor crew here. Request coverage for a site, or join the crew."
        : "We are building contractor crews state by state. Tell us what you need in " + stateName(code) + ", or sign up to be one of the first people on this crew.";
      btnRequest.hidden = false;
      btnJoin.hidden = false;
      btnRequest.textContent = "Request crews in " + stateName(code);
      btnJoin.textContent = "Join the " + stateName(code) + " crew";
    }
    function go(tab) {
      if (!current) return;
      document.querySelectorAll('select[data-state-select]').forEach(function (sel) { sel.value = current; });
      if (selectTab) selectTab(tab);
      var panel = document.getElementById(tab);
      if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
      var first = panel && panel.querySelector("input[type=text]");
      if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 500);
    }
    btnRequest.addEventListener("click", function () { go("request"); });
    btnJoin.addEventListener("click", function () { go("join"); });
  }

  /* ---------- Forms ---------- */
  function humanize(name) {
    return name.replace(/[_-]+/g, " ").replace(/^./, function (c) { return c.toUpperCase(); });
  }
  function collect(form) {
    var out = {};
    new FormData(form).forEach(function (v, k) {
      if (k === "botcheck") return;
      v = String(v).trim();
      if (!v) return;
      out[k] = out[k] ? out[k] + ", " + v : v;
    });
    return out;
  }
  function show(el, kind, msg) {
    el.className = "form-status is-shown " + kind;
    el.textContent = msg;
  }

  function initForms() {
    document.querySelectorAll("form[data-form]").forEach(function (form) {
      var status = form.querySelector(".form-status");
      var submit = form.querySelector('[type="submit"]');
      var resetLink = form.querySelector("[data-again]");
      if (resetLink) resetLink.addEventListener("click", function (e) {
        e.preventDefault(); form.reset(); form.classList.remove("is-sent"); status.className = "form-status";
      });

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var trap = form.querySelector('[name="botcheck"]');
        if (trap && trap.checked) return;
        if (!form.checkValidity()) { form.reportValidity(); return; }

        var data = collect(form);
        var who = data.name || data.company || "";
        var subject = (form.getAttribute("data-subject") || "Website message") + (who ? " — " + who : "");

        if (!cfg.formEndpoint) {
          // No form service connected yet: open a ready-to-send email instead.
          var body = Object.keys(data).map(function (k) { return humanize(k) + ": " + data[k]; }).join("\n");
          window.location.href = "mailto:" + cfg.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
          show(status, "info", "Your email app should open with your message ready to send. If nothing opens, email us at " + cfg.email + ".");
          return;
        }

        var fd = new FormData();
        Object.keys(data).forEach(function (k) { fd.append(k, data[k]); });
        fd.append("subject", subject);
        fd.append("from_name", "AISSKO website");
        if (cfg.formAccessKey) fd.append("access_key", cfg.formAccessKey);

        if (submit) submit.disabled = true;
        show(status, "info", "Sending…");
        fetch(cfg.formEndpoint, { method: "POST", body: fd, headers: { Accept: "application/json" } })
          .then(function (res) {
            return res.json().catch(function () { return null; }).then(function (json) {
              if (!res.ok || (json && (json.success === false || json.ok === false))) throw new Error((json && json.message) || "Request failed");
            });
          })
          .then(function () {
            form.classList.add("is-sent");
            status.className = "form-status";
            var done = form.querySelector(".sent-msg");
            if (done) { done.setAttribute("tabindex", "-1"); done.focus(); }
          })
          .catch(function () {
            show(status, "err", "Sorry, that did not go through. Please try again, or email us at " + cfg.email + ".");
          })
          .then(function () { if (submit) submit.disabled = false; });
      });
    });
  }

  /* ?topic=…&product=… links from other pages preselect the contact form. */
  function initPrefill() {
    var form = document.getElementById("contact-form");
    if (!form || !window.URLSearchParams) return;
    var q = new URLSearchParams(location.search);
    var topic = q.get("topic");
    var product = q.get("product");
    if (topic) {
      var sel = form.querySelector('select[name="topic"]');
      if (sel) Array.prototype.forEach.call(sel.options, function (o) { if (o.value.toLowerCase() === topic.toLowerCase()) sel.value = o.value; });
    }
    if (product) {
      var msg = form.querySelector('textarea[name="message"]');
      if (msg && !msg.value) msg.value = "I'm interested in " + product + ". ";
      var sub = form.querySelector('input[name="product"]');
      if (sub) sub.value = product;
    }
  }
})();
