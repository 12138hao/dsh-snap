import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const name = "dsh-snap";
const inject = ["webServer"];

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** 截图程序：优先环境变量，其次包内 bin/ 目录，最后兼容旧的开发路径。 */
const SNAP_EXE = [
	process.env.DSH_SNAP_EXE,
	join(PLUGIN_ROOT, "bin", "DshSnap.exe"),
	"D:\\deepseek-harness\\home\\agent-workspace\\apps\\DshSnap\\out\\DshSnap.exe",
].filter(Boolean).find((p) => existsSync(p)) ?? join(PLUGIN_ROOT, "bin", "DshSnap.exe");
const SNAP_DIR = join(homedir(), ".dsh", "snap");
const SNAP_FILE = join(SNAP_DIR, "snap.png");
const RESULT_FILE = join(SNAP_DIR, "result.json");

function writeJson(res, status, body) {
	if (res.writableEnded || res.destroyed) return;
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
	});
	res.end(JSON.stringify(body));
}

function launchSnap() {
	if (!existsSync(SNAP_EXE)) return false;
	execFile(SNAP_EXE, [], { windowsHide: false, timeout: 120000 }, () => {});
	return true;
}

function apply(ctx) {
	// 调起截屏
	const startRoute = {
		kind: "exact",
		path: "/api/dsh-snap/start",
		handler: (_req, res) => {
			try { unlinkSync(RESULT_FILE); } catch {}
			try { unlinkSync(SNAP_FILE); } catch {}
			const ok = launchSnap();
			writeJson(res, ok ? 200 : 500, ok ? { ok: true } : { ok: false, error: `找不到截图程序：${SNAP_EXE}` });
		},
	};

	// 轮询结果（截图程序自己写 result.json，不依赖端口通知）
	const pollRoute = {
		kind: "exact",
		path: "/api/dsh-snap/poll",
		handler: (_req, res) => {
			try {
				const data = JSON.parse(readFileSync(RESULT_FILE, "utf8"));
				writeJson(res, 200, { ready: data.ready === 1 });
			} catch {
				writeJson(res, 200, { ready: false });
			}
		},
	};

	// 取图
	const fileRoute = {
		kind: "exact",
		path: "/api/dsh-snap/file",
		handler: (_req, res) => {
			try {
				const buf = readFileSync(SNAP_FILE);
				res.writeHead(200, {
					"content-type": "image/png",
					"content-length": String(buf.length),
					"cache-control": "no-store",
				});
				res.end(buf);
			} catch {
				writeJson(res, 404, { ok: false, error: "还没有截图" });
			}
		},
	};

	// 兼容旧版截图程序的回调
	const doneRoute = {
		kind: "exact",
		path: "/api/dsh-snap/done",
		handler: (_req, res) => {
			const ready = existsSync(SNAP_FILE);
			try { writeFileSync(RESULT_FILE, JSON.stringify({ ready: ready ? 1 : 0 })); } catch {}
			writeJson(res, 200, { ok: true, ready });
		},
	};

	ctx.effect(() => ctx.webServer.register(startRoute));
	ctx.effect(() => ctx.webServer.register(pollRoute));
	ctx.effect(() => ctx.webServer.register(fileRoute));
	ctx.effect(() => ctx.webServer.register(doneRoute));
}

export { name, inject, apply };
