# 代码块语言标识大全

HiNote 预览基于 highlight.js **全量语言包**渲染，以下 193 种语言标识都可以直接写在围栏代码块开头（```` ```语言名 ````）。在 HiNote 中打开本文件并切到预览视图，即可看到每种语言的真实高亮效果。

> - 每种语言都有**别名**可用（如 `js`、`ts`、`py`、`yml`），见各条目括号内标注
> - 未标注语言或写错语言名时，HiNote 会自动探测常见语言（未命中则原样显示）
> - 特殊注意：`shell` / `console` / `shellsession` 是「终端会话记录」语法（只识别 `$` 提示符行）；写 shell 脚本请用 `bash`。HiNote 已把 `shell` 自动映射为 `bash`，无需手动区分

## 目录

1. [主流编程语言](#1-主流编程语言)
2. [函数式与学术语言](#2-函数式与学术语言)
3. [脚本与 Shell](#3-脚本与 shell)
4. [编译型与传统语言](#4-编译型与传统语言)
5. [前端样式与模板](#5-前端样式与模板)
6. [标记与文档](#6-标记与文档)
7. [数据与配置格式](#7-数据与配置格式)
8. [数据库与查询](#8-数据库与查询)
9. [构建工具与运维](#9-构建工具与运维)
10. [网络协议与日志](#10-网络协议与日志)
11. [硬件、汇编与底层](#11-硬件、汇编与底层)
12. [科学计算](#12-科学计算)
13. [图形、游戏与 3D](#13-图形、游戏与 3d)
14. [REPL 会话](#14-repl 会话)
15. [其他与小众语言](#15-其他与小众语言)

---

## 1. 主流编程语言

### python — Python（别名：`py` · `gyp` · `ipython`）

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("HiNote"))
```

### javascript — JavaScript（别名：`js` · `jsx` · `mjs` · `cjs`）

```javascript
function greet(name) {
  return 'Hello, ' + name;
}
console.log(greet("HiNote"));
```

### typescript — TypeScript（别名：`ts` · `tsx` · `mts` · `cts`）

```typescript
interface User {
  name: string;
  tags?: string[];
}
const user: User = { name: "Ada" };
```

### java — Java（别名：`jsp`）

```java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, HiNote!");
    }
}
```

### c — C（别名：`h`）

```c
#include <stdio.h>

int main(void) {
    printf("Hello, HiNote!\n");
    return 0;
}
```

### cpp — C++（别名：`cc` · `c++` · `h++` · `hpp` · `hh` · `hxx` · `cxx`）

```cpp
#include <iostream>

int main() {
    std::cout << "Hello, HiNote!" << std::endl;
    return 0;
}
```

### csharp — C#（别名：`cs` · `c#`）

```csharp
using System;

var name = "HiNote";
Console.WriteLine($"Hello, {name}!");
```

### go — Go（别名：`golang`）

```go
package main

import "fmt"

func main() {
    fmt.Println("Hello, HiNote!")
}
```

### rust — Rust（别名：`rs`）

```rust
fn main() {
    let name = "HiNote";
    println!("Hello, {name}!");
}
```

### swift — Swift

```swift
let name = "HiNote"
print("Hello, \(name)!")
```

### kotlin — Kotlin（别名：`kt` · `kts` · `ktm` · `ktx`）

```kotlin
fun main() {
    println("Hello, HiNote!")
}
```

### ruby — Ruby（别名：`rb` · `gemspec` · `podspec` · `thor` · `irb`）

```ruby
def greet(name)
  "Hello, #{name}!"
end

puts greet("HiNote")
```

### php — php

```php
<?php
$name = "HiNote";
echo "Hello, {$name}!";
```

### scala — Scala

```scala
object Main extends App {
  println("Hello, HiNote!")
}
```

### dart — Dart

```dart
void main() {
  print('Hello, HiNote!');
}
```

### groovy — Groovy

```groovy
def greet(name) { "Hello, $name!" }
println greet("HiNote")
```

### objectivec — Objective-C（别名：`mm` · `objc` · `obj-c` · `obj-c++` · `objective-c++`）

```objectivec
#import <Foundation/Foundation.h>

NSLog(@"Hello, HiNote!");
```

## 2. 函数式与学术语言

### haskell — Haskell（别名：`hs`）

```haskell
main :: IO ()
main = putStrLn "Hello, HiNote!"
```

### elixir — Elixir（别名：`ex` · `exs`）

```elixir
defmodule Greet do
  def hello(name), do: "Hello, #{name}!"
end
```

### erlang — Erlang（别名：`erl`）

```erlang
-module(greet).
-export([hello/1]).
hello(Name) -> io:format("Hello, ~s!~n", [Name]).
```

### clojure — Clojure（别名：`clj` · `edn`）

```clojure
(defn greet [name]
  (str "Hello, " name "!"))

(greet "HiNote")
```

### lisp — Lisp

```lisp
(defun greet (name)
  (format t "Hello, ~a!" name))
```

### scheme — Scheme（别名：`scm`）

```scheme
(define (greet name)
  (display (string-append "Hello, " name "!")))
```

### ocaml — OCaml（别名：`ml`）

```ocaml
let greet name =
  print_endline ("Hello, " ^ name ^ "!")
```

### fsharp — F#（别名：`fs` · `f#`）

```fsharp
let greet name = printfn "Hello, %s!" name
greet "HiNote"
```

### julia — Julia

```julia
greet(name) = println("Hello, $name!")
greet("HiNote")
```

### elm — Elm

```elm
import Html exposing (text)

main =
  text "Hello, HiNote!"
```

### reasonml — ReasonML（别名：`re`）

```reasonml
let greet = (name) => print_endline("Hello, " ++ name ++ "!");
```

### flix — Flix

```flix
def main(): Unit \ IO =
  println("Hello, HiNote!")
```

### mercury — Mercury（别名：`m` · `moo`）

```mercury
:- module greet.
:- interface.
:- import_module io.
:- pred main(io::di, io::uo) is det.
```

### pony — Pony

```pony
actor Main
  new create(env: Env) =>
    env.out.print("Hello, HiNote!")
```

### coq — Coq

```coq
Theorem hello : True.
Proof. exact I. Qed.
```

### clean — Clean（别名：`icl` · `dcl`）

```clean
module hello
Start = "Hello, HiNote!"
```

### hy — Hy（别名：`hylang`）

```hy
(defn greet [name]
  (print "Hello," name "!"))
```

### sml — SML (Standard ML)（别名：`ml`）

```sml
fun greet name = print ("Hello, " ^ name ^ "!")
```

### smalltalk — Smalltalk（别名：`st`）

```smalltalk
Transcript show: 'Hello, HiNote!'; cr.
```

### prolog — Prolog

```prolog
greet(hinote).
% 查询：?- greet(hinote).  →  true
```

## 3. 脚本与 Shell

### bash — Bash（别名：`sh` · `zsh`）

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "Hello, HiNote!"
```

### shell — Shell Session（别名：`console` · `shellsession`）

```shell
$ ssh deploy@example.com
$ echo "Hello, HiNote!"
Hello, HiNote!
```

> **注意**：highlight.js 的 `shell` 语法名为 Shell Session，专为终端会话记录设计；普通脚本内容请用 `bash`。HiNote 已自动将 `shell` 映射为 `bash`。

### powershell — PowerShell（别名：`pwsh` · `ps` · `ps1`）

```powershell
Get-Process |
  Where-Object { $_.CPU -gt 10 } |
  Select-Object -First 5
```

### dos — Batch file (DOS)（别名：`bat` · `batch` · `cmd`）

```dos
@echo off
echo Hello, HiNote!
```

### awk — Awk

```awk
ps aux | awk '{ print $1, $11 }'
```

### lua — Lua（别名：`pluto`）

```lua
local name = "HiNote"
print("Hello, " .. name .. "!")
```

### perl — Perl（别名：`pl` · `pm`）

```perl
my $name = "HiNote";
print "Hello, $name!\n";
```

### coffeescript — CoffeeScript（别名：`coffee` · `cson` · `iced`）

```coffeescript
greet = (name) -> "Hello, #{name}!"
console.log greet "HiNote"
```

### livescript — LiveScript（别名：`ls`）

```livescript
greet = (name) -> "Hello, #name!"
console.log greet "HiNote"
```

### moonscript — MoonScript（别名：`moon`）

```moonscript
greet = (name) -> print "Hello, #{name}!"
greet "HiNote"
```

### tcl — Tcl（别名：`tk`）

```tcl
set name "HiNote"
puts "Hello, $name!"
```

### applescript — AppleScript（别名：`osascript`）

```applescript
display dialog "Hello, HiNote!"
```

### autohotkey — AutoHotkey（别名：`ahk`）

```autohotkey
^j::
    Send, Hello, HiNote!
return
```

### autoit — AutoIt

```autoit
MsgBox(0, "HiNote", "Hello, HiNote!")
```

### vim — Vim Script

```vim
set number
nnoremap <leader>w :w<CR>
```

### nsis — NSIS

```nsis
OutFile "installer.exe"
Section
  DetailPrint "Hello, HiNote!"
SectionEnd
```

### livecodeserver — LiveCode

```livecodeserver
answer "Hello, HiNote!"
```

### hsp — HSP

```hsp
mes "Hello, HiNote!"
stop
```

### wren — Wren

```wren
System.print("Hello, HiNote!")
```

## 4. 编译型与传统语言

### d — D

```d
import std.stdio;

void main() {
    writeln("Hello, HiNote!");
}
```

### nim — Nim

```nim
echo "Hello, HiNote!"
```

### crystal — Crystal（别名：`cr`）

```crystal
name = "HiNote"
puts "Hello, #{name}!"
```

### haxe — Haxe（别名：`hx`）

```haxe
class Main {
  static function main() {
    trace("Hello, HiNote!");
  }
}
```

### zephir — Zephir（别名：`zep`）

```zephir
namespace App;

function hello() -> void
{
    echo "Hello, HiNote!";
}
```

### ada — Ada

```ada
with Ada.Text_IO;
procedure Main is
begin
   Ada.Text_IO.Put_Line ("Hello, HiNote!");
end Main;
```

### fortran — Fortran（别名：`f90` · `f95`）

```fortran
program hello
  print *, "Hello, HiNote!"
end program hello
```

### delphi — Delphi（别名：`dpr` · `dfm` · `pas` · `pascal`）

```delphi
program Hello;
begin
  writeln('Hello, HiNote!');
end.
```

### vbnet — Visual Basic .NET（别名：`vb`）

```vbnet
Module Program
    Sub Main()
        Console.WriteLine("Hello, HiNote!")
    End Sub
End Module
```

### vbscript — VBScript（别名：`vbs`）

```vbscript
MsgBox "Hello, HiNote!"
```

### basic — BASIC

```basic
10 PRINT "Hello, HiNote!"
20 END
```

### vala — Vala

```vala
void main () {
    print ("Hello, HiNote!\n");
}
```

### oxygene — Oxygene

```oxygene
class Program
  class method Main;
  begin
    Console.WriteLine('Hello, HiNote!');
  end;
end.
```

### purebasic — PureBASIC（别名：`pb` · `pbi`）

```purebasic
MessageRequester("HiNote", "Hello, HiNote!")
```

### actionscript — ActionScript（别名：`as`）

```actionscript
package {
  public class Hello {
    public function Hello():void {
      trace("Hello, HiNote!");
    }
  }
}
```

### ceylon — Ceylon

```ceylon
shared void run() {
  print("Hello, HiNote!");
}
```

### arcade — ArcGIS Arcade

```arcade
let sprite = game.createSprite(2, 2)
game.onUpdate(function () {
  sprite.change(LedSpriteProperty.X, 1)
})
```

### golo — Golo

```golo
module hello

function main = |args| ->
  println("Hello, HiNote!")
```

### angelscript — AngelScript（别名：`asc`）

```angelscript
void main() {
  print("Hello, HiNote!\n");
}
```

## 5. 前端样式与模板

### css — CSS

```css
:root {
  --accent: #3b82f6;
}
.button {
  color: var(--accent);
}
```

### scss — SCSS

```scss
$accent: #3b82f6;

.button {
  color: $accent;
  &:hover { opacity: 0.8; }
}
```

### less — Less

```less
@accent: #3b82f6;

.button {
  color: @accent;
}
```

### stylus — Stylus（别名：`styl`）

```stylus
accent = #3b82f6

.button
  color accent
```

### qml — QML（别名：`qt`）

```qml
import QtQuick 2.15

Rectangle {
  width: 200; height: 100
  Text { text: "HiNote" }
}
```

### haml — HAML

```haml
%body
  %h1.title HiNote
  %p 欢迎使用
```

### handlebars — Handlebars（别名：`hbs` · `html.hbs` · `html.handlebars` · `htmlbars`）

```handlebars
{{#each notes}}
  <li>{{this.title}}</li>
{{/each}}
```

### twig — Twig（别名：`craftcms`）

```twig
{% if user.online %}
  <p>{{ user.name }} 在线</p>
{% endif %}
```

### dust — Dust（别名：`dst`）

```dust
{#notes}
  <li>{title}</li>
{/notes}
```

### erb — ERB

```erb
<% @notes.each do |note| %>
  <li><%= note.title %></li>
<% end %>
```

### django — Django（别名：`jinja`）

```django
{% for note in notes %}
  <li>{{ note.title }}</li>
{% endfor %}
```

### php-template — PHP template

```php-template
<h1><?= $title ?></h1>
<?php foreach ($notes as $note): ?>
  <p><?= htmlspecialchars($note) ?></p>
<?php endforeach ?>
```

### vbscript-html — VBScript in HTML

```vbscript-html
<span>当前时间：<% = Now() %></span>
```

### mojolicious — Mojolicious

```mojolicious
% layout 'default';
<title><%= $title %></title>
```

### leaf — Leaf

```leaf
#if(user.online) {
  <p>#(user.name) 在线</p>
}
```

## 6. 标记与文档

### xml — HTML, XML（别名：`html` · `xhtml` · `rss` · `atom` · `xjb` · `xsd` · `xsl` · `plist` · `wsf` · `svg`）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<note priority="high">
  <title>Hello</title>
</note>
```

### markdown — Markdown（别名：`md` · `mkdown` · `mkd`）

```markdown
# HiNote 笔记

**粗体** 与 `行内代码`

- [ ] 待办事项
```

### latex — LaTeX（别名：`tex`）

```latex
\documentclass{article}
\begin{document}
  Hello, HiNote!
\end{document}
```

### asciidoc — AsciiDoc（别名：`adoc`）

```asciidoc
== 二级标题

*粗体* 文本与 +等宽+ 文本
```

## 7. 数据与配置格式

### json — JSON（别名：`jsonc` · `json5`）

```json
{
  "name": "HiNote",
  "tags": ["markdown", "notes"],
  "version": 1
}
```

### yaml — YAML（别名：`yml`）

```yaml
name: HiNote
tags:
  - markdown
  - notes
autosave: true
```

### ini — TOML, also INI（别名：`toml`）

```ini
[settings]
theme = dark
fontsize = 14
```

### properties — .properties

```properties
app.name=HiNote
app.mode=local
```

### nestedtext — Nested Text（别名：`nt`）

```nestedtext
name: HiNote
tags:
    markdown
    notes
```

### protobuf — Protocol Buffers（别名：`proto`）

```protobuf
syntax = "proto3";

message Note {
  string title = 1;
  repeated string tags = 2;
}
```

### thrift — Thrift

```thrift
struct Note {
  1: string title,
  2: list<string> tags,
}
```

### capnproto — Cap’n Proto（别名：`capnp`）

```capnproto
@0xdbb9ad1f14bf8b5c;

struct Note {
  title @0 :Text;
}
```

### graphql — GraphQL（别名：`gql`）

```graphql
query {
  user(id: "1") {
    name
    notes { title }
  }
}
```

### abnf — Augmented Backus-Naur Form

```abnf
greeting    = "Hello" SP name
name        = 1*( ALPHA / DIGIT )
```

### bnf — Backus–Naur Form

```bnf
<sentence> ::= <noun-phrase> <verb-phrase>
<noun-phrase> ::= <determiner> <noun>
```

### ebnf — Extended Backus-Naur Form

```ebnf
digit = "0" | "1" | "2" | … | "9" ;
number = { digit } ;
```

## 8. 数据库与查询

### sql — SQL

```sql
SELECT title, COUNT(*) AS cnt
FROM notes
WHERE archived = 0
GROUP BY title
ORDER BY cnt DESC;
```

### pgsql — PostgreSQL（别名：`postgres` · `postgresql`）

```pgsql
CREATE TYPE mood AS ENUM ('sad', 'happy');
SELECT * FROM notes WHERE tags @> ARRAY['go'];
```

### n1ql — N1QL

```n1ql
SELECT META().id FROM notes
WHERE type = "todo";
```

### gherkin — Gherkin（别名：`feature`）

```gherkin
Feature: 笔记搜索
  Scenario: 关键词搜索
    Given 已有笔记 "hello.md"
    When 搜索 "hello"
    Then 显示 1 条结果
```

### excel — Excel formulae（别名：`xlsx` · `xls`）

```excel
=SUMIFS(B2:B10, A2:A10, ">=2024-01-01")
=IF(A2>60, "及格", "不及格")
```

### xquery — XQuery（别名：`xpath` · `xq` · `xqm`）

```xquery
for $note in doc("notes.xml")//note
where $note/@archived = "0"
return $note/title
```

### q — Q（别名：`k` · `kdb`）

```q
t: ([] name:`a`b`c; val: 1 2 3)
select from t where val > 1
```

## 9. 构建工具与运维

### dockerfile — Dockerfile（别名：`docker`）

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci
CMD ["npm", "start"]
```

### makefile — Makefile（别名：`mk` · `mak` · `make`）

```makefile
.PHONY: build
build:
	go build -o hinote .

clean:
	rm -f hinote
```

### cmake — CMake（别名：`cmake.in`）

```cmake
cmake_minimum_required(VERSION 3.20)
project(hinote CXX)
add_executable(hinote main.cpp)
```

### gradle — Gradle

```gradle
plugins { id 'java' }
repositories { mavenCentral() }
dependencies { testImplementation 'junit:junit:4.13.2' }
```

### nginx — Nginx config（别名：`nginxconf`）

```nginx
server {
  listen 80;
  server_name hinote.app;
  root /var/www/hinote;
}
```

### apache — Apache config（别名：`apacheconf`）

```apache
<VirtualHost *:80>
  DocumentRoot /var/www/hinote
  ServerName hinote.app
</VirtualHost>
```

### dns — DNS Zone（别名：`bind` · `zone`）

```dns
example.com.  IN  A      93.184.216.34
www           IN  CNAME  example.com.
```

### freedesktop — FreeDesktop config（别名：`desktop` · `systemd`）

```freedesktop
[Desktop Entry]
Name=HiNote
Type=Application
Exec=hinote
```

### pf — Packet Filter config（别名：`pf.conf`）

```pf
pass in on egress proto tcp to port 443
block all
```

### routeros — MikroTik RouterOS script（别名：`mikrotik`）

```routeros
/ip firewall filter
add chain=forward action=accept
```

### crmsh — crmsh（别名：`crm` · `pcmk`）

```crmsh
primitive vip IPaddr2 \
  params ip=192.168.1.100 \
  op monitor interval=10s
```

### jboss-cli — JBoss CLI（别名：`wildfly-cli`）

```jboss-cli
/subsystem=datasources/data-source=Main:read-resource()
```

### dsconfig — dsconfig

```dsconfig
dsconfig set-global-configuration-prop \
  --hostname localhost --port 1389 \
  --set max-clients:100
```

### puppet — Puppet（别名：`pp`）

```puppet
package { "nginx":
  ensure => installed,
}

service { "nginx":
  ensure => running,
}
```

### nix — Nix（别名：`nixos`）

```nix
{ pkgs }: {
  environment.systemPackages = [ pkgs.git ];
}
```

## 10. 网络协议与日志

### http — HTTP（别名：`https`）

```http
POST /api/notes HTTP/1.1
Host: hinote.app
Content-Type: application/json

{"title": "HiNote"}
```

### accesslog — Apache Access Log

```accesslog
127.0.0.1 - - [10/Oct/2024:13:55:36 +0800] "GET /index.html HTTP/1.1" 200 2326
127.0.0.1 - - [10/Oct/2024:13:55:37 +0800] "GET /style.css HTTP/1.1" 304 0
```

### ldif — LDIF

```ldif
dn: cn=Ada,dc=example,dc=com
changetype: modify
replace: mail
mail: ada@example.com
```

### csp — CSP

```csp
Content-Security-Policy: default-src 'self'; img-src *
X-Frame-Options: DENY
```

### profile — Python profiler

```profile
Flat profile:

Each sample counts as 0.01 seconds.
  %   cumulative   self           self    total
 time   seconds   seconds     calls  name
```

## 11. 硬件、汇编与底层

### armasm — ARM Assembly（别名：`arm`）

```armasm
    MOV R0, #1
    BL print_int
```

### avrasm — AVR Assembly

```avrasm
ldi  r16, 0xFF
out  DDRB, r16
```

### x86asm — Intel x86 Assembly

```x86asm
mov eax, 1
xor ebx, ebx
int 0x80
```

### mipsasm — MIPS Assembly（别名：`mips`）

```mipsasm
addi $t0, $zero, 10
syscall
```

### verilog — Verilog（别名：`v` · `sv` · `svh`）

```verilog
module led(input clk, output reg led);
  always @(posedge clk) led <= ~led;
endmodule
```

### vhdl — VHDL

```vhdl
process(clk) begin
  if rising_edge(clk) then
    led <= not led;
  end if;
end process;
```

### dts — Device Tree

```dts
/ {
  leds {
    compatible = "gpio-leds";
  };
};
```

### llvm — LLVM IR

```llvm
define i32 @main() {
entry:
  ret i32 0
}
```

### wasm — WebAssembly

```wasm
(module
  (func (export "add") (param i32 i32) (result i32)
    local.get 0
    local.get 1
    i32.add))
```

### arduino — Arduino（别名：`ino`）

```arduino
void setup() {
  Serial.begin(9600);
}

void loop() { Serial.println("HiNote"); }
```

### smali — Smali

```smali
.class public LHello;
.method public static main()V
    return-void
.end method
```

## 12. 科学计算

### r — R

```r
x <- seq(0, 2 * pi, length.out = 100)
plot(x, sin(x), type = "l")
```

### matlab — Matlab

```matlab
x = linspace(0, 2*pi, 100);
plot(x, sin(x));
```

### mathematica — Mathematica（别名：`mma` · `wl`）

```mathematica
Plot[Sin[x], {x, 0, 2 Pi}]
```

### scilab — Scilab（别名：`sci`）

```scilab
x = linspace(0, 2*%pi, 100);
plot(x, sin(x));
```

### stata — Stata（别名：`do` · `ado`）

```stata
regress y x, robust
```

### sas — SAS

```sas
proc means data=work.notes mean;
  var score;
run;
```

### gams — GAMS（别名：`gms`）

```gams
Variable x;
Equation obj;
obj.. x =E= 2;
```

### gauss — GAUSS（别名：`gss`）

```gauss
y = ln(x);
print y;
```

### stan — Stan（别名：`stanfuncs`）

```stan
data {
  int<lower=0> N;
}
```

### irpf90 — IRPF90

```irpf90
BEGIN_PROVIDER [ integer, n ]
  n = 10
END_PROVIDER
```

### isbl — ISBL

```isbl
Результат = Запрос.Выполнить();
```

### cos — Caché Object Script（别名：`cls`）

```cos
Set note = ##class(User.Note).%New()
Write "Hello, HiNote!", !
```

### ruleslanguage — Oracle Rules Language

```ruleslanguage
the country = "CN" results in the currency = "CNY"
```

## 13. 图形、游戏与 3D

### glsl — GLSL

```glsl
vec3 light = normalize(vec3(1.0, 2.0, 0.5));
float diff = max(dot(normal, light), 0.0);
```

### openscad — OpenSCAD（别名：`scad`）

```openscad
cube([10, 10, 10], center = true);
```

### processing — Processing（别名：`pde`）

```processing
void setup() {
  size(200, 200);
}

void draw() { ellipse(mouseX, mouseY, 20, 20); }
```

### gcode — G-code (ISO 6983)（别名：`nc`）

```gcode
G21
G90
G1 X10 Y20 F150
```

### step21 — STEP Part 21（别名：`p21` · `step` · `stp`）

```step21
ISO-10303-21;
HEADER; ENDSEC;
DATA; ENDSEC;
END-ISO-10303-21;
```

### mel — MEL

```mel
polyCube -w 1 -h 1 -d 1 -name "HiNote";
```

### rib — RenderMan RIB

```rib
AttributeBegin
  Surface "plastic"
AttributeEnd
```

### rsl — RenderMan RSL

```rsl
color c = color(0.2, 0.5, 0.8);
Ci = diffuse(N) * c;
```

## 14. REPL 会话

### python-repl — python-repl（别名：`pycon`）

```python-repl
>>> from pathlib import Path
>>> Path(".").resolve()
PosixPath('/home/user/notes')
```

### node-repl — Node REPL

```node-repl
> [1, 2, 3].map(x => x * 2)
[ 2, 4, 6 ]
```

### clojure-repl — Clojure REPL

```clojure-repl
user=> (+ 1 2)
3
```

### erlang-repl — Erlang REPL

```erlang-repl
1> lists:reverse([1, 2, 3]).
[3,2,1]
```

### julia-repl — Julia REPL（别名：`jldoctest`）

```julia-repl
julia> 1 + 2
3
```

## 15. 其他与小众语言

### aspectj — AspectJ

```aspectj
pointcut logMethods() : execution(* com.hinote..*(..));
before() : logMethods() { System.out.println("call"); }
```

### diff — Diff（别名：`patch`）

```diff
--- a/config.toml
+++ b/config.toml
@@ -1,3 +1,3 @@
-theme = "light"
+theme = "dark"
```

### plaintext — Plain text（别名：`text` · `txt`）

```plaintext
没有语法高亮的纯文本块。
Still plain text, no colors.
```

### subunit — SubUnit

```subunit
test: test_add
successful: test_add
```

### tap — Test Anything Protocol

```tap
TAP version 14
ok 1 - 加载配置
not ok 2 - 解析失败
```

### taggerscript — Tagger Script

```taggerscript
$artist - $title ($album)
```

### brainfuck — Brainfuck（别名：`bf`）

```brainfuck
++++++++[>++++++++<-]>+.
++++++++++[>++++++<-]>.
```

### roboconf — Roboconf（别名：`graph` · `instances`）

```roboconf
instance of VM {
  count: 2;
}
```

### tp — TP

```tp
PROGRAM hello
  MOVJ J[1] 100.00 FINE
END
```

### xl — XL（别名：`tao`）

```xl
// XL：基于语法树重写的可扩展语言
X + Y -> X.plus(Y)
```

### lasso — Lasso（别名：`ls` · `lassoscript`）

```lasso
[local(name = 'HiNote')]
Hello, [#name]!
```

### monkey — Monkey

```monkey
Function Main:Int()
  Print "Hello, HiNote!"
  Return 0
End
```

### inform7 — Inform 7（别名：`i7`）

```inform7
The Kitchen is a room.
The printer is a device in the Kitchen.
```

### lsl — LSL (Linden Scripting Language)

```lsl
default {
  state_entry() {
    llSay(0, "Hello, HiNote!");
  }
}
```

### gml — GML

```gml
if (hp <= 0) {
  instance_destroy();
}
```

### sqf — SQF

```sqf
if (true) then { hint "Hello, HiNote!"; };
```

### parser3 — Parser3

```parser3
@main[]
$result[$response:body]
```

### maxima — Maxima

```maxima
diff(sin(x), x);
```

### fix — FIX

```fix
8=FIX.4.2|9=65|35=D|49=BUYER|56=SELLER|34=1|11=ORDER1
```

### mizar — Mizar

```mizar
environ
  vocabularies Syllogism;
```

### cal — C/AL

```cal
IF CONFIRM('继续?') THEN
  MESSAGE('Hello, HiNote!');
```

### 1c — 1C:Enterprise

```1c
Процедура Приветствие()
    Сообщить("Привет, HiNote!");
КонецПроцедуры
```

### axapta — X++（别名：`x++`）

```axapta
class HelloWorld
{
    static void Main(Args _args)
    {
        info("Hello, HiNote!");
    }
}
```

---

<div align="center">

共 193 种语言。把本文件放到 HiNote 中预览，每种代码块即为对应语言的实时渲染效果。

</div>
