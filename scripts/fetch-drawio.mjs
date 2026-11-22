#!/usr/bin/env node
// 把官方 drawio webapp 下载并裁剪到 public/drawio（离线内嵌编辑器用）。
// webapp 约 63MB，不入库（.gitignore）。build.bat 与 CI 构建前都会调用本
// 脚本：public/drawio/index.html 已存在时自动跳过，--force 强制重新下载：
//   node scripts/fetch-drawio.mjs [--force]
// 代理：默认 http://127.0.0.1:7891（GitHub 下载用），可用 DIO_PROXY 覆盖，
// 设 DIO_PROXY= 走直连（CI 里就是用 DIO_PROXY= 直连）。
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DRAWIO_VERSION = "v32.7.4";
const WAR_URL = `https://github.com/jgraph/drawio/releases/download/${DRAWIO_VERSION}/draw.war`;
const LICENSE_URL = "https://www.apache.org/licenses/LICENSE-2.0.txt";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(root, ".drawio-tmp");
const dest = path.join(root, "public", "drawio");

const force = process.argv.includes("--force");
if (!force && existsSync(path.join(dest, "index.html"))) {
  console.log("[fetch-drawio] public/drawio already present, skip. (use --force to re-download)");
  process.exit(0);
}

const proxy =
  process.env.DIO_PROXY !== undefined
    ? process.env.DIO_PROXY
    : process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      "http://127.0.0.1:7891";

// war 是 zip 包：Git Bash 自带的 GNU tar 读不了；Windows 用系统自带 bsdtar
// （System32\tar.exe），macOS 的 tar 本身就是 bsdtar，Linux 优先找 bsdtar、
// 否则退回 unzip（GitHub 的 ubuntu runner 自带）。
function pickExtractor() {
  if (process.platform === "win32") {
    return {
      cmd: path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"),
      args: (war, dir) => ["-xf", war, "-C", dir],
    };
  }
  if (process.platform === "darwin") {
    return { cmd: "tar", args: (war, dir) => ["-xf", war, "-C", dir] };
  }
  const candidates = [
    { cmd: "bsdtar", probe: ["--version"], args: (war, dir) => ["-xf", war, "-C", dir] },
    { cmd: "unzip", probe: ["-v"], args: (war, dir) => ["-q", war, "-d", dir] },
  ];
  for (const c of candidates) {
    try {
      execFileSync(c.cmd, c.probe, { stdio: "ignore" });
      return c;
    } catch {
      // try next candidate
    }
  }
  throw new Error("no bsdtar/unzip found to extract the zip archive");
}

function curl(args) {
  execFileSync(
    "curl",
    proxy ? ["-x", proxy, "-sSL", "--retry", "3", ...args] : ["-sSL", "--retry", "3", ...args],
    { stdio: "inherit" }
  );
}

console.log(`[fetch-drawio] ${DRAWIO_VERSION} -> public/drawio`);
rmSync(tmp, { recursive: true, force: true });
rmSync(dest, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const war = path.join(tmp, "draw.war");
console.log("[fetch-drawio] downloading draw.war (~51MB)...");
curl(["-o", war, WAR_URL]);
curl(["-o", path.join(tmp, "LICENSE"), LICENSE_URL]);

console.log("[fetch-drawio] extracting...");
const extractor = pickExtractor();
execFileSync(extractor.cmd, extractor.args(war, tmp), { stdio: "inherit" });

// war 内部就是 webapp 根目录（index.html / js / ... 平铺，无顶层目录）
const src = tmp;

// 运行时需要的 webapp 子集：排除 Java 服务端目录、Confluence 集成包、
// 只读 viewer 构建、未压缩的开发源码（diagramly/ 仅保留 vsdx 导入器）、
// service-worker/PWA 相关文件，以及其余语言的翻译（只留 zh / zh-tw）。
mkdirSync(dest, { recursive: true });
for (const entry of [
  "index.html", "clear.html", "export-fonts.css", "export3.html", "favicon.ico",
  "connect", "images", "img", "js", "math4", "mxgraph", "plugins",
  "shapes", "stencils", "styles", "templates",
]) {
  cpSync(path.join(src, entry), path.join(dest, entry), { recursive: true });
}
for (const res of ["dia.txt", "dia_i18n.txt", "dia_zh.txt", "dia_zh-tw.txt"]) {
  cpSync(path.join(src, "resources", res), path.join(dest, "resources", res));
}
rmSync(path.join(dest, "js", "integrate.min.js"), { force: true });
rmSync(path.join(dest, "js", "viewer.min.js"), { force: true });
rmSync(path.join(dest, "js", "viewer-static.min.js"), { force: true });
rmSync(path.join(dest, "js", "embed.dev.js"), { force: true });
rmSync(path.join(dest, "js", "diagramly"), { recursive: true, force: true });
mkdirSync(path.join(dest, "js", "diagramly"), { recursive: true });
cpSync(path.join(src, "js", "diagramly", "vsdx"), path.join(dest, "js", "diagramly", "vsdx"), { recursive: true });
cpSync(path.join(tmp, "LICENSE"), path.join(dest, "LICENSE"));

rmSync(tmp, { recursive: true, force: true });
console.log("[fetch-drawio] done.");
