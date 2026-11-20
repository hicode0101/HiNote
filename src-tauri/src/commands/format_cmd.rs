//! JSON / XML 格式化与压缩（移植自 HiEditor 内置插件实现，FR-16）：
//! - JSON：严格 RFC 8259 解析；preserve_order 保证键序不变；空对象/数组不展开；
//!   错误带行列定位；JSONC 注释单独提示。
//! - XML：声明/DOCTYPE/注释/CDATA 原样保留；含子元素的标签展开缩进；
//!   仅含文本的元素保持单行；属性不换行。

use quick_xml::events::Event;
use quick_xml::Reader;
use serde_json::Value;

fn position_of(err: &serde_json::Error) -> String {
    format!("第 {} 行, 第 {} 列：{}", err.line(), err.column(), err)
}

fn comment_marker_present(text: &str) -> bool {
    let trimmed = text.trim_start();
    let mut in_string = false;
    let mut escaped = false;
    let bytes = trimmed.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        if in_string {
            if escaped {
                escaped = false;
            } else if b == b'\\' {
                escaped = true;
            } else if b == b'"' {
                in_string = false;
            }
            continue;
        }
        match b {
            b'"' => in_string = true,
            b'/' if i + 1 < bytes.len() && (bytes[i + 1] == b'/' || bytes[i + 1] == b'*') => {
                return true
            }
            _ => {}
        }
    }
    false
}

fn parse_json(text: &str) -> Result<Value, String> {
    serde_json::from_str(text).map_err(|e| {
        if comment_marker_present(text) {
            "JSONC 含注释，暂不支持格式化".to_string()
        } else {
            position_of(&e)
        }
    })
}

fn indent_of(indent: usize) -> String {
    if indent == 0 {
        "\t".to_string()
    } else {
        " ".repeat(indent)
    }
}

/// 手写序列化：键序保留、空容器不展开、冒号后单空格。
fn write_value(out: &mut String, value: &Value, level: usize, indent: &str) {
    match value {
        Value::Object(map) => {
            if map.is_empty() {
                out.push_str("{}");
                return;
            }
            out.push_str("{\n");
            let pad = indent.repeat(level + 1);
            let last = map.len() - 1;
            for (i, (key, val)) in map.iter().enumerate() {
                out.push_str(&pad);
                out.push_str(&serde_json::to_string(key).unwrap_or_default());
                out.push_str(": ");
                write_value(out, val, level + 1, indent);
                if i != last {
                    out.push(',');
                }
                out.push('\n');
            }
            out.push_str(&indent.repeat(level));
            out.push('}');
        }
        Value::Array(items) => {
            if items.is_empty() {
                out.push_str("[]");
                return;
            }
            out.push_str("[\n");
            let pad = indent.repeat(level + 1);
            let last = items.len() - 1;
            for (i, val) in items.iter().enumerate() {
                out.push_str(&pad);
                write_value(out, val, level + 1, indent);
                if i != last {
                    out.push(',');
                }
                out.push('\n');
            }
            out.push_str(&indent.repeat(level));
            out.push(']');
        }
        Value::String(s) => out.push_str(&serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into())),
        other => out.push_str(&other.to_string()),
    }
}

fn json_pretty(text: &str, indent: usize) -> Result<String, String> {
    let value = parse_json(text)?;
    let mut out = String::new();
    write_value(&mut out, &value, 0, &indent_of(indent));
    Ok(out)
}

fn json_minify(text: &str) -> Result<String, String> {
    let value = parse_json(text)?;
    serde_json::to_string(&value).map_err(|e| e.to_string())
}

// ===== XML =====

fn xml_position_of(src: &str, offset: usize, err: &quick_xml::Error) -> String {
    let before = &src[..offset.min(src.len())];
    let line = before.matches('\n').count() + 1;
    let col = before.rsplit('\n').next().map(|l| l.len()).unwrap_or(0) + 1;
    format!("第 {line} 行, 第 {col} 列：{err}")
}

struct OpenElem {
    /// 完整开始标签内部内容（`tag attr="v"`）。
    inner: String,
    name: String,
    /// 该元素开始标签在输出中的起始位置（'<')。
    start_out: usize,
    text: String,
    has_child: bool,
}

fn is_ws(s: &str) -> bool {
    s.chars().all(|c| c.is_whitespace())
}

fn qname(e: impl AsRef<[u8]>) -> String {
    String::from_utf8_lossy(e.as_ref()).into_owned()
}

fn xml_pretty(src: &str, indent_str: &str, minify: bool) -> Result<String, String> {
    let mut reader = Reader::from_str(src);
    let mut out = String::new();
    let mut stack: Vec<OpenElem> = Vec::new();
    let mut depth: usize = 0;

    let line_prefix = |out: &mut String, depth: usize| {
        if !minify && !out.is_empty() {
            out.push('\n');
            out.push_str(&indent_str.repeat(depth));
        }
    };

    loop {
        let event = reader.read_event().map_err(|e| {
            xml_position_of(src, reader.error_position() as usize, &e)
        })?;
        match event {
            Event::Eof => break,
            Event::Decl(e) => {
                out.push_str(&format!("<?{}?>", String::from_utf8_lossy(e.as_ref())));
                if minify {
                    out.push('\n');
                }
            }
            Event::DocType(e) => {
                line_prefix(&mut out, depth);
                out.push_str(&format!("<!DOCTYPE {}>", String::from_utf8_lossy(e.as_ref())));
            }
            Event::Comment(e) => {
                line_prefix(&mut out, depth);
                out.push_str(&format!(
                    "<!--{}-->",
                    String::from_utf8_lossy(e.as_ref())
                ));
            }
            Event::CData(e) => {
                let raw = String::from_utf8_lossy(e.as_ref()).into_owned();
                if let Some(top) = stack.last_mut() {
                    if !top.has_child {
                        top.text.push_str(&format!("<![CDATA[{raw}]]>"));
                        continue;
                    }
                }
                line_prefix(&mut out, depth);
                out.push_str(&format!("<![CDATA[{raw}]]>"));
            }
            Event::Start(e) => {
                if let Some(top) = stack.last_mut() {
                    top.has_child = true;
                }
                let inner = String::from_utf8_lossy(e.as_ref()).into_owned();
                let name = qname(e.name());
                line_prefix(&mut out, depth);
                let start_out = out.len();
                out.push_str(&format!("<{inner}>"));
                stack.push(OpenElem {
                    inner,
                    name,
                    start_out,
                    text: String::new(),
                    has_child: false,
                });
                depth += 1;
            }
            Event::Empty(e) => {
                if let Some(top) = stack.last_mut() {
                    top.has_child = true;
                }
                let inner = String::from_utf8_lossy(e.as_ref()).into_owned();
                line_prefix(&mut out, depth);
                out.push_str(&format!("<{inner}/>"));
            }
            Event::Text(e) => {
                let raw = String::from_utf8_lossy(e.as_ref()).into_owned();
                if is_ws(&raw) {
                    continue; // 标签间空白交给格式化决定。
                }
                if let Some(top) = stack.last_mut() {
                    if !top.has_child {
                        top.text.push_str(&raw);
                        continue;
                    }
                }
                // 混合内容：原样落在当前位置。
                out.push_str(&raw);
            }
            Event::End(e) => {
                let name = qname(e.name());
                let top = stack.pop().ok_or("XML 结构错误：多余的结束标签")?;
                if top.name != name {
                    return Err(format!(
                        "XML 结构错误：</{}> 与 <{}> 不匹配",
                        name, top.name
                    ));
                }
                depth = depth.saturating_sub(1);
                let text = if minify { top.text.clone() } else { top.text.trim().to_string() };
                if !top.has_child {
                    // 仅含文本（或为空）的元素保持单行；压缩模式文本原样保留。
                    let inline = if text.is_empty() {
                        format!("<{}></{}>", top.inner, top.name)
                    } else {
                        format!("<{}>{}</{}>", top.inner, text, top.name)
                    };
                    out.truncate(top.start_out);
                    out.push_str(&inline);
                } else {
                    line_prefix(&mut out, depth);
                    out.push_str(&format!("</{}>", top.name));
                }
            }
            Event::PI(e) => {
                line_prefix(&mut out, depth);
                out.push_str(&format!("<?{}?>", String::from_utf8_lossy(e.as_ref())));
            }
        }
    }
    if !stack.is_empty() {
        return Err("XML 结构错误：存在未闭合的标签".into());
    }
    Ok(out)
}

/// formatter_id: "json.pretty" | "json.minify" | "xml.pretty" | "xml.minify".
/// Returns the formatted text; errors carry line/column info.
#[tauri::command]
pub fn format_text(text: String, formatter_id: String, indent: Option<usize>) -> Result<String, String> {
    let indent = indent.unwrap_or(4);
    match formatter_id.as_str() {
        "json.pretty" => json_pretty(&text, indent),
        "json.minify" => json_minify(&text),
        "xml.pretty" => xml_pretty(&text, &indent_of(indent), false),
        "xml.minify" => xml_pretty(&text, "", true),
        other => Err(format!("未知格式化命令：{other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_pretty_keeps_order_and_collapses_empty() {
        let src = r#"{"b":1,"a":{"n":[1,2],"e":{},"ea":[]},"中文":"值"}"#;
        let out = format_text(src.into(), "json.pretty".into(), Some(4)).unwrap();
        let lines: Vec<&str> = out.lines().collect();
        assert_eq!(lines[0], "{");
        assert!(lines[1].trim().starts_with("\"b\": 1"));
        assert!(out.contains("\"e\": {}"));
        assert!(out.contains("\"ea\": []"));
        assert!(out.contains("\"中文\": \"值\""));
    }

    #[test]
    fn json_minify_strips_whitespace() {
        let out = format_text("{ \"a\" : [ 1 , 2 ] }\n".into(), "json.minify".into(), None).unwrap();
        assert_eq!(out, "{\"a\":[1,2]}");
    }

    #[test]
    fn json_error_reports_line_col() {
        let err = format_text("{\n  \"a\": 1,\n  \"b\": \n}".into(), "json.pretty".into(), None).unwrap_err();
        assert!(err.contains("第"), "got {err}");
    }

    #[test]
    fn xml_inline_text_elements_stay_single_line() {
        let src = r#"<?xml version="1.0"?><root><name>HiNote</name><list><i>1</i><i>2</i></list></root>"#;
        let out = format_text(src.into(), "xml.pretty".into(), Some(2)).unwrap();
        let expected = "<?xml version=\"1.0\"?>\n<root>\n  <name>HiNote</name>\n  <list>\n    <i>1</i>\n    <i>2</i>\n  </list>\n</root>";
        assert_eq!(out, expected);
    }

    #[test]
    fn xml_minify_removes_only_tag_whitespace() {
        let out = format_text("<root>\n  <a>  keep me  </a>\n  <b/>\n</root>".into(), "xml.minify".into(), None).unwrap();
        assert_eq!(out, "<root><a>  keep me  </a><b/></root>");
    }

    #[test]
    fn xml_mismatch_reports_error() {
        let err = format_text("<a></b>".into(), "xml.pretty".into(), None).unwrap_err();
        assert!(err.contains("第 1 行"), "got {err}");
    }
}
