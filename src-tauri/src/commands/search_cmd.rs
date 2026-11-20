//! 工作区全文搜索：文件 / 文件夹名称匹配 + 受支持文本类文件的内容匹配。
//!
//! 设计要点（保证“搜索不卡死、体验流畅”）：
//! - 命令为 async，实际遍历在 `spawn_blocking` 线程池执行，绝不阻塞主线程；
//! - 每轮搜索持有一个自增代号，新一轮搜索会让旧遍历在中途提前退出（取消）；
//! - 3 秒时间预算 + 条目数 / 结果数上限，超限即返回已收集结果（truncated 标记）；
//! - 内容匹配仅针对目录树支持的文本类文件（20+ 语言，PDF / 图片等二进制除外），
//!   单文件上限 2 MiB，复用 encoding 模块自动识别 UTF-8 / UTF-16 / GBK 等编码。

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tauri::State;

use crate::commands::encoding;
use crate::commands::fs_cmds::{file_type_of, is_ignored_dir, workspace_root};
use crate::config::AppState;

/// 搜索代号：每次请求自增；旧请求在循环检查时发现代号过期即提前返回。
static SEARCH_GEN: AtomicU64 = AtomicU64::new(0);

/// 内容搜索单文件大小上限（更大的文件跳过内容匹配，仅保留名称匹配）。
const MAX_CONTENT_BYTES: u64 = 2 * 1024 * 1024;
/// 命中位置前后保留的上下文字节数（中文约 1/3 于此的字符数）。
const SNIPPET_RADIUS: usize = 96;
/// 单次搜索的时间预算，超时返回已收集的部分结果。
const TIME_BUDGET: Duration = Duration::from_secs(3);
/// 遍历条目数硬上限（防御病态目录树）。
const MAX_ENTRIES: usize = 200_000;

#[derive(Debug, Serialize)]
pub struct SearchHit {
    pub path: String,
    /// 相对工作区根的目录部分（根目录下的条目为空串）。
    pub rel_dir: String,
    pub name: String,
    /// "dir" | "file"
    pub kind: String,
    /// 与目录树一致的 file_type 标识（文件夹为空串）。
    pub file_type: String,
    /// "name"（名称命中）| "content"（内容命中）
    pub matched: String,
    /// 内容命中时首处匹配的上下文片段（原文大小写展示）。
    pub snippet: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SearchOut {
    pub hits: Vec<SearchHit>,
    /// 因超时 / 上限提前截断时为 true。
    pub truncated: bool,
}

#[tauri::command]
pub async fn search_workspace(
    state: State<'_, AppState>,
    query: String,
    limit: Option<u32>,
) -> Result<SearchOut, String> {
    let root = workspace_root(&state)?;
    let q = query.trim().to_string();
    if q.is_empty() {
        return Ok(SearchOut {
            hits: Vec::new(),
            truncated: false,
        });
    }
    // 新搜索使旧搜索失效：旧任务在下一次循环检查时退出。
    let gen = SEARCH_GEN.fetch_add(1, Ordering::Relaxed) + 1;
    let limit = limit.unwrap_or(100).max(1) as usize;
    tauri::async_runtime::spawn_blocking(move || run_search(root, q, limit, gen))
        .await
        .map_err(|e| e.to_string())
}

struct Collector {
    root: PathBuf,
    needle: String,
    deadline: Instant,
    limit: usize,
    gen: u64,
    entries_seen: usize,
    truncated: bool,
    dirs: Vec<SearchHit>,
    name_files: Vec<SearchHit>,
    content_files: Vec<SearchHit>,
}

impl Collector {
    /// 被新一轮搜索取代。
    fn superseded(&self) -> bool {
        SEARCH_GEN.load(Ordering::Relaxed) != self.gen
    }

    fn reached_limit(&self) -> bool {
        self.dirs.len() + self.name_files.len() + self.content_files.len() >= self.limit
    }

    /// 每处理一个条目前调用：被取代 / 超量 / 超时时中止遍历。
    fn should_stop(&mut self) -> bool {
        if self.superseded() {
            return true;
        }
        if self.reached_limit() {
            self.truncated = true;
            return true;
        }
        if self.entries_seen >= MAX_ENTRIES || Instant::now() >= self.deadline {
            self.truncated = true;
            return true;
        }
        false
    }
}

fn run_search(root: PathBuf, query: String, limit: usize, gen: u64) -> SearchOut {
    let mut c = Collector {
        needle: query.to_ascii_lowercase(),
        deadline: Instant::now() + TIME_BUDGET,
        root: root.clone(),
        limit,
        gen,
        entries_seen: 0,
        truncated: false,
        dirs: Vec::new(),
        name_files: Vec::new(),
        content_files: Vec::new(),
    };
    walk_dir(&mut c, &root, 0);
    sort_bucket(&mut c.dirs);
    sort_bucket(&mut c.name_files);
    sort_bucket(&mut c.content_files);
    let mut hits = std::mem::take(&mut c.dirs);
    hits.append(&mut c.name_files);
    hits.append(&mut c.content_files);
    SearchOut {
        hits,
        truncated: c.truncated,
    }
}

fn sort_bucket(bucket: &mut [SearchHit]) {
    bucket.sort_by(|a, b| a.path.to_ascii_lowercase().cmp(&b.path.to_ascii_lowercase()));
}

fn walk_dir(c: &mut Collector, dir: &Path, depth: usize) {
    if depth > 10 || c.should_stop() {
        return;
    }
    let Ok(read) = fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<_> = read.filter_map(|e| e.ok()).collect();
    entries.sort_by_key(|e| e.file_name());
    let root = c.root.clone();
    for entry in entries {
        c.entries_seen += 1;
        if c.should_stop() {
            return;
        }
        let path = entry.path();
        let Ok(ft) = entry.file_type() else {
            continue;
        };
        let name = entry.file_name().to_string_lossy().to_string();
        if ft.is_dir() {
            if is_ignored_dir(&name) {
                continue;
            }
            if name.to_ascii_lowercase().contains(&c.needle) {
                c.dirs.push(make_hit(&root, &path, &name, "dir", "", "name", None));
            }
            walk_dir(c, &path, depth + 1);
        } else if ft.is_file() {
            // 仅目录树可见的类型参与搜索（与 file_type_of 一致的 20+ 类型）。
            let Some(kind) = file_type_of(&path) else {
                continue;
            };
            if name.to_ascii_lowercase().contains(&c.needle) {
                c.name_files
                    .push(make_hit(&root, &path, &name, "file", kind, "name", None));
                continue; // 名称已命中，无需再做内容匹配
            }
            if kind == "pdf" || kind == "image" {
                continue; // 二进制类型不做全文匹配
            }
            if let Some(snippet) = first_match_snippet(&path, &c.needle) {
                c.content_files.push(make_hit(
                    &root,
                    &path,
                    &name,
                    "file",
                    kind,
                    "content",
                    Some(snippet),
                ));
            }
        }
    }
}

fn make_hit(
    root: &Path,
    path: &Path,
    name: &str,
    kind: &str,
    file_type: &str,
    matched: &str,
    snippet: Option<String>,
) -> SearchHit {
    let rel = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string();
    let rel_dir = match rel.rfind(['\\', '/']) {
        Some(i) => rel[..i].to_string(),
        None => String::new(),
    };
    SearchHit {
        path: path.to_string_lossy().to_string(),
        rel_dir,
        name: name.to_string(),
        kind: kind.into(),
        file_type: file_type.into(),
        matched: matched.into(),
        snippet,
    }
}

/// 读取文件（自动识别编码）并做大小写不敏感查找，命中时返回上下文片段。
/// 仅匹配 ASCII 大小写（与常规编辑器行为一致），中英文均可正常检索。
fn first_match_snippet(path: &Path, needle: &str) -> Option<String> {
    let Ok(meta) = fs::metadata(path) else {
        return None;
    };
    if meta.len() == 0 || meta.len() > MAX_CONTENT_BYTES {
        return None;
    }
    let Ok(bytes) = fs::read(path) else {
        return None;
    };
    let enc = encoding::detect(&bytes);
    let text = encoding::decode(&bytes, &enc);
    // to_ascii_lowercase 保持字节长度与字符边界不变，命中位置可直接映射回原文。
    let lower = text.to_ascii_lowercase();
    let idx = lower.find(needle)?;
    Some(build_snippet(&text, idx, needle.len()))
}

fn build_snippet(text: &str, idx: usize, needle_len: usize) -> String {
    let start = floor_boundary(text, idx.saturating_sub(SNIPPET_RADIUS));
    let end = ceil_boundary(text, (idx + needle_len + SNIPPET_RADIUS).min(text.len()));
    let raw = &text[start..end];
    // 折叠换行与连续空白，保证结果里单行展示。
    let mut folded = String::with_capacity(raw.len());
    let mut prev_ws = false;
    for ch in raw.chars() {
        if ch.is_whitespace() {
            if !prev_ws {
                folded.push(' ');
                prev_ws = true;
            }
        } else {
            folded.push(ch);
            prev_ws = false;
        }
    }
    let mut out = folded.trim().to_string();
    if start > 0 {
        out.insert(0, '…');
    }
    if end < text.len() {
        out.push('…');
    }
    out
}

fn floor_boundary(s: &str, mut i: usize) -> usize {
    while i > 0 && !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

fn ceil_boundary(s: &str, mut i: usize) -> usize {
    while i < s.len() && !s.is_char_boundary(i) {
        i += 1;
    }
    i
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::encoding::{encode, Encoding};
    use std::sync::atomic::AtomicU32;

    static SEQ: AtomicU32 = AtomicU32::new(0);

    fn gen() -> u64 {
        // 测试互相并行，不能各自递增共享代号（会互相取消）；
        // 直接读取当前值：测试期间没有真实搜索递增它，因此不会失效。
        SEARCH_GEN.load(Ordering::Relaxed)
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "hinote_search_{}_{}_{}",
            tag,
            std::process::id(),
            SEQ.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn finds_dir_file_and_content_matches() {
        let root = temp_dir("basic");
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::write(root.join("项目笔记.md"), "# hello\nworld").unwrap();
        fs::write(root.join("sub").join("plain.txt"), "body with NEEDLE inside").unwrap();
        fs::write(root.join("sub").join("other.md"), "nothing relevant").unwrap();

        // 名称命中
        let out = run_search(root.clone(), "项目".into(), 50, gen());
        assert_eq!(out.hits.len(), 1, "{:?}", out.hits);
        assert_eq!(out.hits[0].matched, "name");
        assert_eq!(out.hits[0].rel_dir, "");

        // 内容命中 + 相对目录 + 片段保留原文大小写
        let out = run_search(root.clone(), "needle".into(), 50, gen());
        assert_eq!(out.hits.len(), 1, "{:?}", out.hits);
        assert_eq!(out.hits[0].matched, "content");
        assert_eq!(out.hits[0].rel_dir, "sub");
        assert!(
            out.hits[0].snippet.as_deref().unwrap().contains("NEEDLE"),
            "snippet: {:?}",
            out.hits[0].snippet
        );

        // 文件夹名命中（大小写不敏感）
        let out = run_search(root.clone(), "SUB".into(), 50, gen());
        assert_eq!(out.hits.len(), 1);
        assert_eq!(out.hits[0].kind, "dir");

        // 无匹配
        let out = run_search(root.clone(), "zzz-not-there".into(), 50, gen());
        assert!(out.hits.is_empty());
        assert!(!out.truncated);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn name_match_wins_over_content() {
        let root = temp_dir("dup");
        fs::write(root.join("report.md"), "report body").unwrap();
        let out = run_search(root.clone(), "report".into(), 50, gen());
        assert_eq!(out.hits.len(), 1);
        assert_eq!(out.hits[0].matched, "name");
        assert!(out.hits[0].snippet.is_none());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn respects_limit_and_marks_truncated() {
        let root = temp_dir("limit");
        for i in 0..5 {
            fs::write(root.join(format!("note{i}.md")), "hit".to_string()).unwrap();
        }
        let out = run_search(root.clone(), "hit".into(), 2, gen());
        assert!(out.truncated);
        assert_eq!(out.hits.len(), 2);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn searches_gbk_encoded_content() {
        let root = temp_dir("gbk");
        let text = "中文测试内容，用于验证工作区全文搜索对 GBK 编码文件的匹配能力，样本足够长以便稳定识别编码。";
        let bytes = encode(text, &Encoding::Ansi("gbk".into()));
        fs::write(root.join("legacy.txt"), bytes).unwrap();
        let out = run_search(root.clone(), "全文搜索".into(), 50, gen());
        assert_eq!(out.hits.len(), 1, "{:?}", out.hits);
        let snippet = out.hits[0].snippet.clone().unwrap();
        assert!(snippet.contains("全文搜索"), "snippet: {snippet}");
        let _ = fs::remove_dir_all(&root);
    }
}
