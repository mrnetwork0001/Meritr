(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/app/components/TxModal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TxProvider",
    ()=>TxProvider,
    "useTx",
    ()=>useTx
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-check.mjs [app-client] (ecmascript) <export default as CheckCircle2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CircleAlert$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-alert.mjs [app-client] (ecmascript) <export default as CircleAlert>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$external$2d$link$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ExternalLink$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/external-link.mjs [app-client] (ecmascript) <export default as ExternalLink>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.mjs [app-client] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/x.mjs [app-client] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$wallet$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/wallet.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$chains$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/chains.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
"use client";
;
;
;
;
const TxCtx = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(null);
function useTx() {
    _s();
    const v = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(TxCtx);
    if (!v) throw new Error("useTx must be used inside <TxProvider>");
    return v;
}
_s(useTx, "vseRKStixtRCAgA7lJDFgCF8qLI=");
/** Pull the most useful sentence out of an ethers/provider error. */ function readableError(e) {
    if (e?.code === 4001 || e?.code === "ACTION_REJECTED") return null; // user declined
    return String(e?.revert?.name ?? e?.reason ?? e?.shortMessage ?? e?.info?.error?.message ?? e?.message ?? "Transaction failed").slice(0, 240);
}
function TxProvider({ children }) {
    _s1();
    const { chainId, bump } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$wallet$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useWallet"])();
    const [req, setReq] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [steps, setSteps] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [busy, setBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [finished, setFinished] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const close = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "TxProvider.useCallback[close]": ()=>{
            if (busy) return; // never disappear mid-flight
            setReq(null);
            setSteps([]);
            setFinished(null);
        }
    }["TxProvider.useCallback[close]"], [
        busy
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TxProvider.useEffect": ()=>{
            if (!req) return;
            const onKey = {
                "TxProvider.useEffect.onKey": (e)=>e.key === "Escape" && close()
            }["TxProvider.useEffect.onKey"];
            window.addEventListener("keydown", onKey);
            return ({
                "TxProvider.useEffect": ()=>window.removeEventListener("keydown", onKey)
            })["TxProvider.useEffect"];
        }
    }["TxProvider.useEffect"], [
        req,
        close
    ]);
    const run = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "TxProvider.useCallback[run]": async (request)=>{
            setReq(request);
            setFinished(null);
            setBusy(true);
            setSteps(request.steps.map({
                "TxProvider.useCallback[run]": (s)=>({
                        label: s.label,
                        detail: s.detail,
                        status: "waiting"
                    })
            }["TxProvider.useCallback[run]"]));
            const patch = {
                "TxProvider.useCallback[run].patch": (i, p)=>setSteps({
                        "TxProvider.useCallback[run].patch": (cur)=>cur.map({
                                "TxProvider.useCallback[run].patch": (s, idx)=>idx === i ? {
                                        ...s,
                                        ...p
                                    } : s
                            }["TxProvider.useCallback[run].patch"])
                    }["TxProvider.useCallback[run].patch"])
            }["TxProvider.useCallback[run].patch"];
            let ok = true;
            for(let i = 0; i < request.steps.length; i++){
                patch(i, {
                    status: "signing"
                });
                try {
                    const hash = await request.steps[i].run();
                    if (hash === null) {
                        patch(i, {
                            status: "skipped"
                        });
                        continue;
                    }
                    patch(i, {
                        status: "done",
                        hash
                    });
                } catch (e) {
                    const msg = readableError(e);
                    if (msg === null) {
                        patch(i, {
                            status: "waiting"
                        });
                        setFinished("cancelled");
                        ok = false;
                        break;
                    }
                    patch(i, {
                        status: "failed",
                        error: msg
                    });
                    ok = false;
                    break;
                }
            }
            setBusy(false);
            if (ok) {
                setFinished("ok");
                bump(); // tell the rest of the app to refetch
            } else if (finished !== "cancelled") {
                setFinished({
                    "TxProvider.useCallback[run]": (f)=>f ?? "failed"
                }["TxProvider.useCallback[run]"]);
            }
            request.onSettled?.(ok);
        }
    }["TxProvider.useCallback[run]"], [
        bump,
        finished
    ]);
    const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TxProvider.useMemo[value]": ()=>({
                run,
                busy
            })
    }["TxProvider.useMemo[value]"], [
        run,
        busy
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(TxCtx.Provider, {
        value: value,
        children: [
            children,
            req && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm",
                role: "dialog",
                "aria-modal": "true",
                "aria-labelledby": "tx-modal-title",
                onClick: close,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "w-full max-w-lg overflow-hidden rounded-lg border border-[var(--color-line)] bg-ink-900/88 shadow-2xl",
                    onClick: (e)=>e.stopPropagation(),
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-start justify-between gap-3 border-b border-[var(--color-line)] px-5 py-4",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "min-w-0",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                            id: "tx-modal-title",
                                            className: "text-[14px] font-semibold text-gray-100",
                                            children: req.title
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/TxModal.tsx",
                                            lineNumber: 157,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-1.5 text-[12.5px] leading-relaxed text-gray-400",
                                            children: req.description
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/TxModal.tsx",
                                            lineNumber: 160,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/TxModal.tsx",
                                    lineNumber: 156,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: close,
                                    disabled: busy,
                                    "aria-label": "Close",
                                    className: "shrink-0 rounded p-1 text-gray-600 transition hover:bg-ink-800 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                        size: 16,
                                        "aria-hidden": true
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/TxModal.tsx",
                                        lineNumber: 171,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/components/TxModal.tsx",
                                    lineNumber: 164,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/TxModal.tsx",
                            lineNumber: 155,
                            columnNumber: 13
                        }, this),
                        req.facts && req.facts.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                            className: "divide-y divide-[var(--color-line)] border-b border-[var(--color-line)] text-[12.5px]",
                            children: req.facts.map(([k, v])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                    className: "flex items-baseline justify-between gap-3 px-5 py-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-gray-500",
                                            children: k
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/TxModal.tsx",
                                            lineNumber: 180,
                                            columnNumber: 21
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "mono truncate text-right text-gray-200",
                                            children: v
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/TxModal.tsx",
                                            lineNumber: 181,
                                            columnNumber: 21
                                        }, this)
                                    ]
                                }, k, true, {
                                    fileName: "[project]/app/components/TxModal.tsx",
                                    lineNumber: 179,
                                    columnNumber: 19
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/app/components/TxModal.tsx",
                            lineNumber: 177,
                            columnNumber: 15
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ol", {
                            className: "divide-y divide-[var(--color-line)]",
                            children: steps.map((s, i)=>{
                                const link = s.hash ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$chains$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["txUrl"])(chainId, s.hash) : null;
                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                    className: "flex gap-3 px-5 py-3.5",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "mt-0.5 shrink-0",
                                            children: [
                                                s.status === "done" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"], {
                                                    size: 16,
                                                    className: "text-up",
                                                    "aria-hidden": true
                                                }, void 0, false, {
                                                    fileName: "[project]/app/components/TxModal.tsx",
                                                    lineNumber: 194,
                                                    columnNumber: 47
                                                }, this),
                                                s.status === "skipped" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"], {
                                                    size: 16,
                                                    className: "text-gray-700",
                                                    "aria-hidden": true
                                                }, void 0, false, {
                                                    fileName: "[project]/app/components/TxModal.tsx",
                                                    lineNumber: 195,
                                                    columnNumber: 50
                                                }, this),
                                                s.status === "failed" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CircleAlert$3e$__["CircleAlert"], {
                                                    size: 16,
                                                    className: "text-down",
                                                    "aria-hidden": true
                                                }, void 0, false, {
                                                    fileName: "[project]/app/components/TxModal.tsx",
                                                    lineNumber: 196,
                                                    columnNumber: 49
                                                }, this),
                                                (s.status === "signing" || s.status === "pending") && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                                    size: 16,
                                                    className: "animate-spin text-model",
                                                    "aria-hidden": true
                                                }, void 0, false, {
                                                    fileName: "[project]/app/components/TxModal.tsx",
                                                    lineNumber: 198,
                                                    columnNumber: 25
                                                }, this),
                                                s.status === "waiting" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "block h-4 w-4 rounded-full border border-[var(--color-line)]",
                                                    "aria-hidden": true
                                                }, void 0, false, {
                                                    fileName: "[project]/app/components/TxModal.tsx",
                                                    lineNumber: 201,
                                                    columnNumber: 25
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/components/TxModal.tsx",
                                            lineNumber: 193,
                                            columnNumber: 21
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "min-w-0 flex-1",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: `text-[13px] ${s.status === "waiting" ? "text-gray-600" : "text-gray-200"}`,
                                                    children: [
                                                        s.label,
                                                        s.status === "skipped" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "ml-2 font-mono text-[10.5px] text-gray-600",
                                                            children: "not needed"
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/components/TxModal.tsx",
                                                            lineNumber: 213,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/app/components/TxModal.tsx",
                                                    lineNumber: 206,
                                                    columnNumber: 23
                                                }, this),
                                                s.status === "signing" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "mt-1 font-mono text-[11px] text-model",
                                                    children: "confirm in your wallet…"
                                                }, void 0, false, {
                                                    fileName: "[project]/app/components/TxModal.tsx",
                                                    lineNumber: 220,
                                                    columnNumber: 25
                                                }, this),
                                                s.detail && s.status === "waiting" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "mt-1 text-[11.5px] text-gray-600",
                                                    children: s.detail
                                                }, void 0, false, {
                                                    fileName: "[project]/app/components/TxModal.tsx",
                                                    lineNumber: 225,
                                                    columnNumber: 25
                                                }, this),
                                                s.error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "mt-1 font-mono text-[11px] leading-relaxed text-down",
                                                    children: s.error
                                                }, void 0, false, {
                                                    fileName: "[project]/app/components/TxModal.tsx",
                                                    lineNumber: 228,
                                                    columnNumber: 25
                                                }, this),
                                                s.hash && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "mt-1.5 flex items-center gap-1.5",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "mono truncate text-[11px] text-gray-500",
                                                            children: s.hash
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/components/TxModal.tsx",
                                                            lineNumber: 234,
                                                            columnNumber: 27
                                                        }, this),
                                                        link && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                            href: link,
                                                            target: "_blank",
                                                            rel: "noreferrer",
                                                            className: "shrink-0 text-gray-600 transition hover:text-model",
                                                            "aria-label": "View on the block explorer",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$external$2d$link$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ExternalLink$3e$__["ExternalLink"], {
                                                                size: 12,
                                                                "aria-hidden": true
                                                            }, void 0, false, {
                                                                fileName: "[project]/app/components/TxModal.tsx",
                                                                lineNumber: 243,
                                                                columnNumber: 31
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/components/TxModal.tsx",
                                                            lineNumber: 236,
                                                            columnNumber: 29
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/app/components/TxModal.tsx",
                                                    lineNumber: 233,
                                                    columnNumber: 25
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/components/TxModal.tsx",
                                            lineNumber: 205,
                                            columnNumber: 21
                                        }, this)
                                    ]
                                }, i, true, {
                                    fileName: "[project]/app/components/TxModal.tsx",
                                    lineNumber: 192,
                                    columnNumber: 19
                                }, this);
                            })
                        }, void 0, false, {
                            fileName: "[project]/app/components/TxModal.tsx",
                            lineNumber: 188,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center justify-between gap-3 border-t border-[var(--color-line)] px-5 py-3.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "font-mono text-[11px]",
                                    children: [
                                        busy && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-model",
                                            children: "in progress — do not close"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/TxModal.tsx",
                                            lineNumber: 257,
                                            columnNumber: 26
                                        }, this),
                                        finished === "ok" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-up",
                                            children: "confirmed on-chain"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/TxModal.tsx",
                                            lineNumber: 258,
                                            columnNumber: 39
                                        }, this),
                                        finished === "failed" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-down",
                                            children: "failed"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/TxModal.tsx",
                                            lineNumber: 259,
                                            columnNumber: 43
                                        }, this),
                                        finished === "cancelled" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-gray-500",
                                            children: "cancelled in wallet"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/TxModal.tsx",
                                            lineNumber: 260,
                                            columnNumber: 46
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/TxModal.tsx",
                                    lineNumber: 256,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex gap-2",
                                    children: [
                                        (()=>{
                                            const last = [
                                                ...steps
                                            ].reverse().find((s)=>s.hash);
                                            const link = last?.hash ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$chains$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["txUrl"])(chainId, last.hash) : null;
                                            return link ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                href: link,
                                                target: "_blank",
                                                rel: "noreferrer",
                                                className: "btn-ghost",
                                                children: "View on explorer ↗"
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/TxModal.tsx",
                                                lineNumber: 268,
                                                columnNumber: 21
                                            }, this) : null;
                                        })(),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: close,
                                            disabled: busy,
                                            className: "btn-primary disabled:cursor-not-allowed disabled:opacity-40",
                                            children: busy ? "Working…" : "Close"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/TxModal.tsx",
                                            lineNumber: 273,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/TxModal.tsx",
                                    lineNumber: 263,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/TxModal.tsx",
                            lineNumber: 255,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/components/TxModal.tsx",
                    lineNumber: 150,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/TxModal.tsx",
                lineNumber: 143,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/TxModal.tsx",
        lineNumber: 140,
        columnNumber: 5
    }, this);
}
_s1(TxProvider, "dMR4yMRxHn25Ea0dpqfYeE0d39A=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$wallet$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useWallet"]
    ];
});
_c = TxProvider;
var _c;
__turbopack_context__.k.register(_c, "TxProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/lib/chains.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Chain definitions for wallet network switching.
 *
 * Creditcoin is not a network any wallet ships with, so connecting is not enough — the app has
 * to be able to *add* the chain via `wallet_addEthereumChain` when the switch fails with 4902.
 * That is the difference between a connect button that works for the author and one that works
 * for a judge opening the app for the first time.
 */ __turbopack_context__.s([
    "CHAINS",
    ()=>CHAINS,
    "chainName",
    ()=>chainName,
    "explorerFor",
    ()=>explorerFor,
    "txUrl",
    ()=>txUrl
]);
const def = (chainId, name, rpcUrls, symbol, explorer)=>({
        chainId,
        hexChainId: `0x${chainId.toString(16)}`,
        name,
        rpcUrls,
        blockExplorerUrls: explorer ? [
            explorer
        ] : undefined,
        nativeCurrency: {
            name: symbol,
            symbol,
            decimals: 18
        }
    });
const CHAINS = {
    102030: def(102030, "Creditcoin Mainnet", [
        "https://mainnet3.creditcoin.network"
    ], "CTC", "https://creditcoin.blockscout.com"),
    102031: def(102031, "Creditcoin Testnet", [
        "https://rpc.cc3-testnet.creditcoin.network"
    ], "CTC", "https://creditcoin-testnet.blockscout.com"),
    102032: def(102032, "Creditcoin Devnet", [
        "https://rpc.cc3-devnet.creditcoin.network"
    ], "CTC"),
    // Local development. The RPC port is whatever `hardhat node` was started on; the app reads
    // the real value from the backend's /api/config at runtime and overrides this.
    31337: def(31337, "Meritr Local", [
        "http://127.0.0.1:8545"
    ], "ETH")
};
function chainName(chainId) {
    if (chainId === null) return "unknown";
    return CHAINS[chainId]?.name ?? `chain ${chainId}`;
}
function explorerFor(chainId) {
    if (chainId === null) return null;
    return CHAINS[chainId]?.blockExplorerUrls?.[0] ?? null;
}
function txUrl(chainId, hash) {
    const base = explorerFor(chainId);
    return base ? `${base}/tx/${hash}` : null;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/lib/wallet.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WalletProvider",
    ()=>WalletProvider,
    "useWallet",
    ()=>useWallet
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$ethers$2f$lib$2e$esm$2f$providers$2f$provider$2d$browser$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/ethers/lib.esm/providers/provider-browser.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$chains$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/chains.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
"use client";
;
;
;
const Ctx = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(null);
function WalletProvider({ children }) {
    _s();
    // Tri-state on purpose. `window.ethereum` cannot be read during SSR or before hydration, and
    // rendering "No wallet found" to someone who *has* a wallet — even for one frame — is worse
    // than rendering nothing. Stays null until detection actually runs.
    const [available, setAvailable] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [account, setAccount] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [chainId, setChainId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [connecting, setConnecting] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [nonce, setNonce] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const bump = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "WalletProvider.useCallback[bump]": ()=>setNonce({
                "WalletProvider.useCallback[bump]": (n)=>n + 1
            }["WalletProvider.useCallback[bump]"])
    }["WalletProvider.useCallback[bump]"], []);
    // Detect an injected provider and re-attach to an already-authorised account, so a reload
    // does not force the reader to reconnect.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "WalletProvider.useEffect": ()=>{
            const eth = ("TURBOPACK compile-time truthy", 1) ? window.ethereum : "TURBOPACK unreachable";
            if (!eth) {
                setAvailable(false);
                return;
            }
            setAvailable(true);
            let dead = false;
            ({
                "WalletProvider.useEffect": async ()=>{
                    try {
                        const accts = await eth.request({
                            method: "eth_accounts"
                        });
                        const cid = await eth.request({
                            method: "eth_chainId"
                        });
                        if (dead) return;
                        if (accts?.length) setAccount(accts[0]);
                        setChainId(parseInt(cid, 16));
                    } catch  {
                    /* wallet locked or refusing; the connect button still works */ }
                }
            })["WalletProvider.useEffect"]();
            const onAccounts = {
                "WalletProvider.useEffect.onAccounts": (accts)=>setAccount(accts?.[0] ?? null)
            }["WalletProvider.useEffect.onAccounts"];
            const onChain = {
                "WalletProvider.useEffect.onChain": (cid)=>setChainId(parseInt(cid, 16))
            }["WalletProvider.useEffect.onChain"];
            eth.on?.("accountsChanged", onAccounts);
            eth.on?.("chainChanged", onChain);
            return ({
                "WalletProvider.useEffect": ()=>{
                    dead = true;
                    eth.removeListener?.("accountsChanged", onAccounts);
                    eth.removeListener?.("chainChanged", onChain);
                }
            })["WalletProvider.useEffect"];
        }
    }["WalletProvider.useEffect"], []);
    const connect = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "WalletProvider.useCallback[connect]": async ()=>{
            const eth = window.ethereum;
            if (!eth) {
                setError("No injected wallet found. Install MetaMask, Rabby or a compatible extension.");
                return;
            }
            setConnecting(true);
            setError(null);
            try {
                const accts = await eth.request({
                    method: "eth_requestAccounts"
                });
                const cid = await eth.request({
                    method: "eth_chainId"
                });
                setAccount(accts?.[0] ?? null);
                setChainId(parseInt(cid, 16));
            } catch (e) {
                // 4001 is the user declining, which is not an error worth shouting about.
                setError(e?.code === 4001 ? null : e?.message ?? "Could not connect.");
            } finally{
                setConnecting(false);
            }
        }
    }["WalletProvider.useCallback[connect]"], []);
    /** Forgets the account locally. EIP-1193 has no true disconnect for injected wallets. */ const disconnect = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "WalletProvider.useCallback[disconnect]": ()=>{
            setAccount(null);
            setError(null);
        }
    }["WalletProvider.useCallback[disconnect]"], []);
    const ensureChain = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "WalletProvider.useCallback[ensureChain]": async (target, rpcOverride)=>{
            const eth = window.ethereum;
            if (!eth) return false;
            const known = __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$chains$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CHAINS"][target];
            const hex = known?.hexChainId ?? `0x${target.toString(16)}`;
            try {
                await eth.request({
                    method: "wallet_switchEthereumChain",
                    params: [
                        {
                            chainId: hex
                        }
                    ]
                });
                setChainId(target);
                return true;
            } catch (e) {
                // 4902: the wallet does not know this network yet. Add it, then it is switched to.
                const unknownNetwork = e?.code === 4902 || e?.data?.originalError?.code === 4902;
                if (!unknownNetwork || !known) {
                    setError(e?.code === 4001 ? null : e?.message ?? "Could not switch network.");
                    return false;
                }
                try {
                    await eth.request({
                        method: "wallet_addEthereumChain",
                        params: [
                            {
                                chainId: hex,
                                chainName: known.name,
                                rpcUrls: rpcOverride ? [
                                    rpcOverride
                                ] : known.rpcUrls,
                                nativeCurrency: known.nativeCurrency,
                                ...known.blockExplorerUrls ? {
                                    blockExplorerUrls: known.blockExplorerUrls
                                } : {}
                            }
                        ]
                    });
                    setChainId(target);
                    return true;
                } catch (addErr) {
                    setError(addErr?.code === 4001 ? null : addErr?.message ?? "Could not add the network.");
                    return false;
                }
            }
        }
    }["WalletProvider.useCallback[ensureChain]"], []);
    const getSigner = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "WalletProvider.useCallback[getSigner]": async ()=>{
            const eth = window.ethereum;
            if (!eth) throw new Error("No injected wallet.");
            const provider = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$ethers$2f$lib$2e$esm$2f$providers$2f$provider$2d$browser$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BrowserProvider"](eth);
            return provider.getSigner();
        }
    }["WalletProvider.useCallback[getSigner]"], []);
    const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "WalletProvider.useMemo[value]": ()=>({
                available,
                account,
                chainId,
                connecting,
                error,
                connect,
                disconnect,
                ensureChain,
                getSigner,
                nonce,
                bump
            })
    }["WalletProvider.useMemo[value]"], [
        available,
        account,
        chainId,
        connecting,
        error,
        connect,
        disconnect,
        ensureChain,
        getSigner,
        nonce,
        bump
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Ctx.Provider, {
        value: value,
        children: children
    }, void 0, false, {
        fileName: "[project]/app/lib/wallet.tsx",
        lineNumber: 188,
        columnNumber: 10
    }, this);
}
_s(WalletProvider, "vSg4b1kSp2z++iE5P8SHI7aPt50=");
_c = WalletProvider;
function useWallet() {
    _s1();
    const v = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(Ctx);
    if (!v) throw new Error("useWallet must be used inside <WalletProvider>");
    return v;
}
_s1(useWallet, "vseRKStixtRCAgA7lJDFgCF8qLI=");
var _c;
__turbopack_context__.k.register(_c, "WalletProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=app_0_q5r1d._.js.map