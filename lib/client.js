/**
 * dsh-snap — client half.
 * 点按钮 → 调起 DshSnap.exe 框选 → 拿回 PNG → 以「拖入」的方式塞进输入框。
 */
window.__ModuleLoader__.load({
	id: "dsh-snap",
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;

		let React = null;
		try {
			const mod = require("react");
			React = mod && mod.default ? mod.default : mod;
		} catch {}

		const START = "/api/dsh-snap/start";
		const POLL = "/api/dsh-snap/poll";
		const FILE = "/api/dsh-snap/file";

		function composerTarget() {
			return (
				document.querySelector('[contenteditable="true"]') ||
				document.querySelector("textarea") ||
				document.querySelector('[contenteditable]')
			);
		}

		async function attachToComposer() {
			const resp = await fetch(FILE, { cache: "no-store" });
			if (!resp.ok) return false;
			const blob = await resp.blob();
			if (!blob || blob.size === 0) return false;

			const target = composerTarget();
			if (!target) return false;

			const dt = new DataTransfer();
			dt.items.add(new File([blob], "snap.png", { type: "image/png" }));

			for (const type of ["dragenter", "dragover", "drop"]) {
				target.dispatchEvent(
					new DragEvent(type, {
						bubbles: true,
						cancelable: true,
						composed: true,
						dataTransfer: dt,
					}),
				);
			}
			try { target.focus(); } catch {}
			return true;
		}

		const btnStyle = (busy) => ({
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			width: "32px",
			height: "32px",
			border: "1px solid rgba(128,128,128,0.30)",
			borderRadius: "8px",
			background: "transparent",
			color: "inherit",
			cursor: busy ? "progress" : "pointer",
			opacity: busy ? 0.5 : 1,
			padding: 0,
			lineHeight: "1",
			WebkitAppRegion: "no-drag",
		});

		function ScissorsIcon() {
			return React.createElement(
				"svg",
				{
					width: 17, height: 17, viewBox: "0 0 24 24", fill: "none",
					stroke: "currentColor", strokeWidth: 2,
					strokeLinecap: "round", strokeLinejoin: "round",
				},
				React.createElement("circle", { cx: 6, cy: 6, r: 3 }),
				React.createElement("circle", { cx: 6, cy: 18, r: 3 }),
				React.createElement("line", { x1: 20, y1: 4, x2: 8.12, y2: 15.88 }),
				React.createElement("line", { x1: 14.47, y1: 14.48, x2: 20, y2: 20 }),
				React.createElement("line", { x1: 8.12, y1: 8.12, x2: 12, y2: 12 }),
			);
		}

		function SnapButton() {
			const [busy, setBusy] = React.useState(false);

			const snap = React.useCallback(async () => {
				if (busy) return;
				setBusy(true);
				try {
					await fetch(START, { method: "POST" });
					let ready = false;
					for (let i = 0; i < 120; i++) {
						await new Promise((r) => setTimeout(r, 250));
						const j = await (await fetch(POLL, { cache: "no-store" })).json();
						if (j.ready) { ready = true; break; }
					}
					if (ready) await attachToComposer();
				} catch {}
				setBusy(false);
			}, [busy]);

			return React.createElement(
				"button",
				{
					type: "button",
					onClick: snap,
					disabled: busy,
					title: "截图并插入",
					"aria-label": "截图并插入",
					style: btnStyle(busy),
				},
				ScissorsIcon(),
			);
		}

		function apply(ctx) {
			if (!React || !ctx?.slots) return;
			try {
				ctx.slots.inject("conversation.composer.dock", () =>
					ctx.slots.register(
						{ name: "conversation.composer.dock", id: "dsh-snap-button", order: 60 },
						SnapButton,
					),
				);
			} catch (e) {
				console.error("[dsh-snap]", e);
			}
		}

		exports.apply = apply;
		exports.inject = ["slots"];
		return module.exports;
	},
});