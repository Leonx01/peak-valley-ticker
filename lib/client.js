// Client half of the peak-valley-ticker plugin — hand-built bundle in the
// platform's lazy-CJS format (window.__ModuleLoader__.load({ id, factory })).
// The factory may `require` only seed words: react, react/jsx-runtime,
// react-dom, @deepseek-ai/cordis, @deepseek-ai/dsh-client-ui-slots, etc.
// Renders a 国风 stock-ticker card into the top-left of the Web UI showing
// the current DeepSeek 峰谷计价 period (峰 = peak, 谷 = off-peak) with a
// live Beijing-time countdown to the end of the period, plus the DeepSeek
// API remaining balance (fetched through the host proxy
// /peak-valley-ticker/balance, so the API key never reaches the browser).

window.__ModuleLoader__.load({
  id: "peak-valley-ticker",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");

    // ---------------------------------------------------------------- rules
    // All times are Beijing wall-clock (UTC+8), computed from UTC components
    // of the shifted Date so DST and local-timezone skew can never interfere.
    const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
    // Peak windows as [startHour, endHour] (Beijing time); the rest is 谷.
    const DEFAULT_WINDOWS = [[9, 12], [14, 18]];

    function resolveWindows(config) {
      const c = config && typeof config === "object" ? config : {};
      const raw =
        Array.isArray(c.peakWindows) && c.peakWindows.length > 0
          ? c.peakWindows
          : DEFAULT_WINDOWS;
      const windows = [];
      for (const w of raw) {
        if (!Array.isArray(w)) continue;
        const s = Number(w[0]);
        const e = Number(w[1]);
        if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
        if (s < 0 || e > 24 || s >= e) continue; // crossing-midnight windows unsupported
        windows.push([s * 60, e * 60]);
      }
      if (windows.length === 0) {
        return DEFAULT_WINDOWS.map(([s, e]) => [s * 60, e * 60]);
      }
      windows.sort((a, b) => a[0] - b[0]);
      return windows;
    }

    // Current state: { kind: "peak" | "valley", endMin, mins } where mins is
    // the fractional Beijing minute-of-day and endMin the period end in
    // minutes (may exceed 1440 when a valley runs past midnight).
    function stateAt(windows, nowMs) {
      const d = new Date(nowMs + BEIJING_OFFSET_MS);
      const mins =
        d.getUTCHours() * 60 +
        d.getUTCMinutes() +
        d.getUTCSeconds() / 60 +
        d.getUTCMilliseconds() / 60000;
      for (const [s, e] of windows) {
        if (mins >= s && mins < e) return { kind: "peak", endMin: e, mins };
      }
      let next = null;
      for (const [s] of windows) {
        if (mins < s) {
          next = s;
          break;
        }
      }
      return { kind: "valley", endMin: next !== null ? next : windows[0][0] + 24 * 60, mins };
    }

    function pad2(n) {
      return String(n).padStart(2, "0");
    }

    function fmtHMS(totalSeconds) {
      const s = Math.max(0, Math.floor(totalSeconds));
      return pad2(Math.floor(s / 3600)) + ":" + pad2(Math.floor((s % 3600) / 60)) + ":" + pad2(s % 60);
    }

    // ------------------------------------------------------------------ css
    const STYLE_ID = "peak-valley-ticker/styles";
    const css = [
      ".pvt-card{position:fixed;top:16px;left:16px;z-index:2147483000;display:flex;align-items:center;gap:12px;padding:11px 16px 10px 12px;border-radius:14px;background:linear-gradient(150deg,rgba(250,247,239,.97),rgba(242,235,220,.94));border:1px solid rgba(176,142,78,.6);box-shadow:0 10px 30px rgba(80,55,10,.22),inset 0 1px 0 rgba(255,255,255,.7);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);font-family:'Noto Serif SC','Source Han Serif SC','Songti SC','STSong','SimSun',serif;color:#3b3324;user-select:none;cursor:grab;touch-action:none;pointer-events:auto;animation:pvt-in .45s cubic-bezier(.2,.9,.3,1.15)}",
      ".pvt-card[data-dragging]{cursor:grabbing;box-shadow:0 14px 34px rgba(80,55,10,.32),inset 0 1px 0 rgba(255,255,255,.7)}",
      "body[data-ds-dark-theme] .pvt-card[data-dragging]{box-shadow:0 14px 34px rgba(0,0,0,.62),inset 0 1px 0 rgba(255,255,255,.06)}",
      "body[data-ds-dark-theme] .pvt-card{background:linear-gradient(150deg,rgba(31,35,41,.93),rgba(21,24,29,.93));border-color:rgba(196,168,106,.5);color:#eae3d3;box-shadow:0 10px 30px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06)}",
      "@keyframes pvt-in{from{opacity:0;transform:translateY(-8px) scale(.97)}to{opacity:1;transform:none}}",
      "@media (prefers-reduced-motion:reduce){.pvt-card{animation:none}}",
      ".pvt-goldline{position:absolute;top:0;left:14%;right:14%;height:1.5px;background:linear-gradient(90deg,transparent,rgba(196,168,106,.85),transparent);border-radius:2px}",
      ".pvt-card::before,.pvt-card::after{content:'';position:absolute;width:12px;height:12px;border:0 solid rgba(176,142,78,.95);pointer-events:none}",
      ".pvt-card::before{top:6px;left:6px;border-top-width:1.5px;border-left-width:1.5px;border-top-left-radius:4px}",
      ".pvt-card::after{bottom:6px;right:6px;border-bottom-width:1.5px;border-right-width:1.5px;border-bottom-right-radius:4px}",
      ".pvt-card[data-state='peak']{border-color:rgba(190,74,50,.62)}",
      ".pvt-card[data-state='valley']{border-color:rgba(47,150,108,.6)}",
      ".pvt-seal{position:relative;width:48px;height:48px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Kaiti SC','STKaiti','KaiTi','Noto Serif SC',serif;font-size:27px;font-weight:700;line-height:1}",
      ".pvt-seal::before,.pvt-seal::after{content:'';position:absolute;border-radius:50%;pointer-events:none}",
      ".pvt-seal::before{inset:-3px;border:1px solid currentColor;opacity:.9}",
      ".pvt-seal::after{inset:3px;border:1px solid currentColor;opacity:.45}",
      ".pvt-card[data-state='peak'] .pvt-seal{color:#b03a2b;background:radial-gradient(circle at 35% 28%,rgba(176,58,43,.34),rgba(176,58,43,.10) 62%,rgba(176,58,43,0) 74%);text-shadow:0 0 14px rgba(176,58,43,.4)}",
      ".pvt-card[data-state='valley'] .pvt-seal{color:#1f7a58;background:radial-gradient(circle at 35% 28%,rgba(31,122,88,.32),rgba(31,122,88,.10) 62%,rgba(31,122,88,0) 74%);text-shadow:0 0 14px rgba(31,122,88,.4)}",
      ".pvt-body{display:flex;flex-direction:column;gap:4px;min-width:0}",
      ".pvt-head{display:flex;align-items:center;gap:6px;font-size:11px;letter-spacing:.14em;opacity:.82}",
      ".pvt-dot{width:6px;height:6px;border-radius:50%;animation:pvt-blink 1.4s ease-in-out infinite}",
      ".pvt-card[data-state='peak'] .pvt-dot{background:#d14a33;box-shadow:0 0 8px rgba(209,74,51,.95)}",
      ".pvt-card[data-state='valley'] .pvt-dot{background:#2fa97c;box-shadow:0 0 8px rgba(47,169,124,.95)}",
      "@keyframes pvt-blink{0%,100%{opacity:1}50%{opacity:.2}}",
      ".pvt-tag{border:1px solid currentColor;border-radius:3px;padding:0 5px;font-size:10px;letter-spacing:.2em;opacity:.75;margin-left:2px;white-space:nowrap}",
      ".pvt-line{display:flex;align-items:baseline;gap:8px;margin-top:1px}",
      ".pvt-name{font-size:17px;font-weight:700;letter-spacing:.24em}",
      ".pvt-price{font-size:13px;font-weight:700;font-family:'SF Mono','Cascadia Mono',Consolas,monospace}",
      ".pvt-arrow{font-size:10px}",
      ".pvt-badge{font-size:10px;border:1px solid currentColor;border-radius:3px;padding:0 4px;letter-spacing:.12em;font-family:inherit}",
      ".pvt-card[data-state='peak'] .pvt-price,.pvt-card[data-state='peak'] .pvt-arrow{color:#d14a33}",
      ".pvt-card[data-state='valley'] .pvt-price,.pvt-card[data-state='valley'] .pvt-arrow{color:#2fa97c}",
      ".pvt-count{display:flex;align-items:baseline;gap:7px}",
      ".pvt-label{font-size:11.5px;letter-spacing:.16em;opacity:.72}",
      ".pvt-digits{font-family:'SF Mono','Cascadia Mono',Consolas,'Liberation Mono',monospace;font-variant-numeric:tabular-nums;font-size:21px;font-weight:700;letter-spacing:.06em;line-height:1}",
      ".pvt-card[data-state='peak'] .pvt-digits{color:#c0392b}",
      ".pvt-card[data-state='valley'] .pvt-digits{color:#1f8a63}",
      ".pvt-next{display:flex;align-items:center;justify-content:space-between;gap:14px;font-size:11px;opacity:.8;letter-spacing:.06em}",
      ".pvt-clock{font-family:'SF Mono','Cascadia Mono',Consolas,monospace;font-variant-numeric:tabular-nums;letter-spacing:.08em}",
      ".pvt-balance{display:flex;align-items:baseline;gap:7px;font-size:11px;letter-spacing:.1em;opacity:.85}",
      ".pvt-balance-label{opacity:.6;letter-spacing:.16em}",
      ".pvt-balance-val{font-family:'SF Mono','Cascadia Mono',Consolas,monospace;font-variant-numeric:tabular-nums;font-weight:700;font-size:12.5px;letter-spacing:.04em}",
      ".pvt-card[data-state='peak'] .pvt-balance-val{color:#c0392b}",
      ".pvt-card[data-state='valley'] .pvt-balance-val{color:#1f8a63}"
    ].join("\n");

    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"" + STYLE_ID + "\"]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "peak-valley-ticker";
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    // ------------------------------------------------------------ component
    const h = React.createElement;

    // ---------------------------------------------------------------- balance
    // Balance comes from the host proxy (same origin) so the API key stays
    // server-side. Refreshed on mount, then every balanceRefreshMinutes.
    const BALANCE_URL = "/peak-valley-ticker/balance";

    async function fetchBalanceJson() {
      try {
        const res = await fetch(BALANCE_URL, { headers: { Accept: "application/json" } });
        if (!res.ok) return { ok: false, error: "http-" + res.status };
        const data = await res.json();
        if (data && data.ok === true) return data;
        return { ok: false, error: data && typeof data.error === "string" ? data.error : "unknown" };
      } catch (err) {
        return { ok: false, error: "network" };
      }
    }

    // Dragged position persistence (client-side preference only).
    const POS_KEY = "peak-valley-ticker.pos";

    function loadPos() {
      try {
        const raw = window.localStorage.getItem(POS_KEY);
        if (raw !== null) {
          const p = JSON.parse(raw);
          if (typeof p.x === "number" && typeof p.y === "number") {
            const maxX = Math.max(8, window.innerWidth - 280);
            const maxY = Math.max(8, window.innerHeight - 130);
            return { x: Math.min(maxX, Math.max(8, p.x)), y: Math.min(maxY, Math.max(8, p.y)) };
          }
        }
      } catch (err) {}
      return { x: 16, y: 16 };
    }

    function savePos(p) {
      try {
        window.localStorage.setItem(POS_KEY, JSON.stringify(p));
      } catch (err) {}
    }

    function Ticker(props) {
      const windows = props.windows;
      const showBalance = props.showBalance;
      const refreshMinutes = props.refreshMinutes;
      const [now, setNow] = React.useState(() => Date.now());
      React.useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(t);
      }, []);

      const [balance, setBalance] = React.useState(null); // string | null
      const [balanceCurrency, setBalanceCurrency] = React.useState("");
      const [balanceError, setBalanceError] = React.useState(null); // string | null
      const busyRef = React.useRef(false);
      const mountedRef = React.useRef(true);

      const refreshBalance = React.useCallback(async () => {
        if (busyRef.current) return;
        busyRef.current = true;
        const res = await fetchBalanceJson();
        busyRef.current = false;
        if (!mountedRef.current) return;
        if (res.ok) {
          const info = res.balanceInfos && res.balanceInfos.length > 0 ? res.balanceInfos[0] : null;
          setBalance(info !== null ? String(info.totalBalance) : null);
          setBalanceCurrency(info !== null && typeof info.currency === "string" ? info.currency : "");
          setBalanceError(null);
        } else {
          setBalanceError(res.error || "unknown");
        }
      }, []);

      React.useEffect(() => {
        mountedRef.current = true;
        if (!showBalance) return;
        refreshBalance();
        if (!(refreshMinutes > 0)) return;
        const t = setInterval(refreshBalance, refreshMinutes * 60 * 1000);
        return () => {
          mountedRef.current = false;
          clearInterval(t);
        };
      }, [showBalance, refreshBalance, refreshMinutes]);

      const [pos, setPos] = React.useState(loadPos);
      const [dragging, setDragging] = React.useState(false);
      const posRef = React.useRef(pos);
      posRef.current = pos;
      const dragRef = React.useRef(null);

      const onPointerDown = React.useCallback((e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        dragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          baseX: posRef.current.x,
          baseY: posRef.current.y,
          moved: false,
        };
        setDragging(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch (err) {}
      }, []);

      const onPointerMove = React.useCallback((e) => {
        const d = dragRef.current;
        if (d === null) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        const rect = e.currentTarget.getBoundingClientRect();
        const maxX = Math.max(8, window.innerWidth - rect.width - 8);
        const maxY = Math.max(8, window.innerHeight - rect.height - 8);
        setPos({
          x: Math.min(maxX, Math.max(8, d.baseX + dx)),
          y: Math.min(maxY, Math.max(8, d.baseY + dy)),
        });
      }, []);

      const endDrag = React.useCallback((e) => {
        const d = dragRef.current;
        dragRef.current = null;
        setDragging(false);
        if (d === null) return;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch (err) {}
        if (d.moved) savePos(posRef.current);
      }, []);

      const st = stateAt(windows, now);
      const isPeak = st.kind === "peak";
      const d = new Date(now + BEIJING_OFFSET_MS);
      const clock = pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + ":" + pad2(d.getUTCSeconds());
      const remainSec = Math.ceil((st.endMin - st.mins) * 60);
      const endHour = Math.floor(st.endMin / 60) % 24;
      const endMinute = st.endMin % 60;
      const nextDay = st.endMin >= 24 * 60;
      const nextTime = (nextDay ? "次日 " : "") + pad2(endHour) + ":" + pad2(endMinute);

      const seal = h("div", { className: "pvt-seal" }, isPeak ? "峰" : "谷");
      const head = h(
        "div",
        { className: "pvt-head" },
        h("span", { className: "pvt-dot" }),
        "DeepSeek · 峰谷计价",
        h("span", { className: "pvt-tag" }, "北京时间")
      );
      const line = h(
        "div",
        { className: "pvt-line" },
        h("span", { className: "pvt-name" }, isPeak ? "高峰时段" : "低谷时段"),
        h("span", { className: "pvt-price" }, isPeak ? "×2.00" : "×1.00"),
        h("span", { className: "pvt-arrow" }, isPeak ? "▲" : "▼"),
        isPeak ? null : h("span", { className: "pvt-badge" }, "半价")
      );
      const count = h(
        "div",
        { className: "pvt-count" },
        h("span", { className: "pvt-label" }, "距结束"),
        h("span", { className: "pvt-digits" }, fmtHMS(remainSec))
      );
      const balanceVal =
        balance !== null
          ? balanceCurrency + balance
          : balanceError === "no-api-key"
            ? "未配置"
            : "--";
      const balanceRow = showBalance
        ? h(
            "div",
            { className: "pvt-balance" },
            h("span", { className: "pvt-balance-label" }, "余额"),
            h("span", { className: "pvt-balance-val" }, balanceVal)
          )
        : null;
      const next = h(
        "div",
        { className: "pvt-next" },
        h("span", null, "下一时段 " + (isPeak ? "谷" : "峰") + " · " + nextTime + " 起"),
        h("span", { className: "pvt-clock" }, clock)
      );

      return h(
        "div",
        {
          className: "pvt-card",
          "data-state": st.kind,
          "data-dragging": dragging || undefined,
          style: { top: pos.y + "px", left: pos.x + "px" },
          onPointerDown,
          onPointerMove,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
        },
        h("div", { className: "pvt-goldline" }),
        seal,
        h("div", { className: "pvt-body" }, head, line, count, balanceRow, next)
      );
    }

    // ----------------------------------------------------------------- apply
    const inject = ["slots"];

    function apply(ctx, config) {
      const windows = resolveWindows(config);
      const component = function PeakValleyTicker() {
        return Ticker({
          windows,
          showBalance: config.balance !== false,
          refreshMinutes:
            typeof config.balanceRefreshMinutes === "number" && config.balanceRefreshMinutes > 0
              ? config.balanceRefreshMinutes
              : 60,
        });
      };
      component.displayName = "PeakValleyTicker";
      // Wait for the shell overlay seat (declared by ui-layout's AppFrame),
      // then contribute one list entry. Fiber unload cancels the wait and
      // removes the entry; the style tag is reclaimed via data-plugin.
      ctx.slots.inject("shell.overlay", () =>
        ctx.slots.register(
          { name: "shell.overlay", id: "peak-valley-ticker", order: 0, label: "峰谷计价行情条" },
          component
        )
      );
    }

    exports.name = "peak-valley-ticker";
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
