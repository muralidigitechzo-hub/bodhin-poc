/**
 * Playground stack catalogue. Pure data — no React.
 * runner:
 *   web      HTML + CSS + JS, live preview in a sandboxed iframe (browser)
 *   js / ts  Web Worker in the browser (TypeScript is stripped with sucrase)
 *   react    JSX compiled with sucrase, rendered in a sandboxed iframe
 *   python   Pyodide (CPython compiled to WebAssembly) in a Web Worker
 *   sql      SQLite (sql.js, WebAssembly) in a Web Worker
 *   remote   compiled / server languages run by Bodhin's sandboxed code server (open-source Piston) via the `playground-run` function
 */
export type Runner = 'web' | 'js' | 'ts' | 'react' | 'python' | 'sql' | 'remote';
export type Group = 'Web' | 'Languages' | 'Data' | 'Systems & enterprise';
export type CmLang = 'html' | 'css' | 'javascript' | 'typescript' | 'jsx' | 'python' | 'sql' | 'java' | 'cpp' | 'rust' | 'php' | 'plain';

export interface PFile {
  name: string;
  lang: CmLang;
  code: string;
}

export interface Stack {
  id: string;
  name: string;
  group: Group;
  icon: string; // Ionicons name
  color: string;
  runner: Runner;
  /** Piston language id (remote only). */
  piston?: string;
  blurb: string;
  files: PFile[];
  stdin: boolean; // show the "Input" box
}

const f = (name: string, lang: CmLang, code: string): PFile => ({ name, lang, code });

export const STACKS: Stack[] = [
  {
    id: 'web', name: 'HTML · CSS · JS', group: 'Web', icon: 'globe-outline', color: '#E34F26', runner: 'web', stdin: false,
    blurb: 'Build a web page and see it live.',
    files: [
      f('index.html', 'html', '<h1 id="title">Hello, Bodhin!</h1>\n<p>Edit the files and press Run.</p>\n<button id="btn">Click me</button>\n'),
      f('style.css', 'css', 'body { font-family: system-ui, sans-serif; padding: 24px; }\nh1 { color: #1D5FD0; }\nbutton { padding: 10px 18px; border-radius: 10px; }\n'),
      f('script.js', 'javascript', "document.getElementById('btn').addEventListener('click', () => {\n  document.getElementById('title').textContent = 'You clicked it!';\n});\n"),
    ],
  },
  {
    id: 'javascript', name: 'JavaScript', group: 'Languages', icon: 'logo-javascript', color: '#F7DF1E', runner: 'js', stdin: true,
    blurb: 'Modern JavaScript. Use input() to read a line.',
    files: [f('main.js', 'javascript', "// input() returns the next line of the Input box\nconst name = input() || 'Bodhin';\nconsole.log(`Hello, ${name}!`);\n")],
  },
  {
    id: 'typescript', name: 'TypeScript', group: 'Languages', icon: 'code-slash-outline', color: '#3178C6', runner: 'ts', stdin: true,
    blurb: 'Typed JavaScript — types are checked by your editor, stripped at run time.',
    files: [f('main.ts', 'typescript', "function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\nconsole.log(greet(input() || 'Bodhin'));\n")],
  },
  {
    id: 'react', name: 'React', group: 'Web', icon: 'logo-react', color: '#61DAFB', runner: 'react', stdin: false,
    blurb: 'Write a component named App and see it render.',
    files: [f('App.jsx', 'jsx', "function App() {\n  const [n, setN] = React.useState(0);\n  return (\n    <div style={{ fontFamily: 'system-ui', padding: 24 }}>\n      <h1>Count: {n}</h1>\n      <button onClick={() => setN(n + 1)}>Add one</button>\n    </div>\n  );\n}\n")],
  },
  {
    id: 'python', name: 'Python', group: 'Languages', icon: 'logo-python', color: '#3776AB', runner: 'python', stdin: true,
    blurb: 'Python 3 running in your browser. Use input() as usual.',
    files: [f('main.py', 'python', "name = input() or 'Bodhin'\nprint(f'Hello, {name}!')\n")],
  },
  {
    id: 'sql', name: 'SQL', group: 'Data', icon: 'server-outline', color: '#0F766E', runner: 'sql', stdin: false,
    blurb: 'SQLite database in your browser. Tables are reset on every run.',
    files: [f('query.sql', 'sql', "CREATE TABLE courses (id INTEGER PRIMARY KEY, title TEXT, price INTEGER);\nINSERT INTO courses (title, price) VALUES ('Digital Marketing', 17499), ('Python Basics', 4999), ('SEO Growth', 8999);\n\nSELECT title, price FROM courses WHERE price > 5000 ORDER BY price DESC;\n")],
  },
  {
    id: 'java', name: 'Java', group: 'Systems & enterprise', icon: 'cafe-outline', color: '#E76F00', runner: 'remote', piston: 'java', stdin: true,
    blurb: 'Java on Bodhin’s code server. Keep the class named Main.',
    files: [f('Main.java', 'java', 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        String name = in.hasNextLine() ? in.nextLine() : "Bodhin";\n        System.out.println("Hello, " + (name.isEmpty() ? "Bodhin" : name) + "!");\n    }\n}\n')],
  },
  {
    id: 'c', name: 'C', group: 'Systems & enterprise', icon: 'hardware-chip-outline', color: '#5C6BC0', runner: 'remote', piston: 'c', stdin: true,
    blurb: 'C (GCC) on Bodhin’s code server.',
    files: [f('main.c', 'cpp', '#include <stdio.h>\n\nint main(void) {\n    char name[100] = "Bodhin";\n    if (fgets(name, sizeof name, stdin)) { for (char *p = name; *p; p++) if (*p == \'\\n\') *p = 0; }\n    printf("Hello, %s!\\n", name[0] ? name : "Bodhin");\n    return 0;\n}\n')],
  },
  {
    id: 'cpp', name: 'C++', group: 'Systems & enterprise', icon: 'hardware-chip-outline', color: '#00599C', runner: 'remote', piston: 'c++', stdin: true,
    blurb: 'C++17 (GCC) on Bodhin’s code server.',
    files: [f('main.cpp', 'cpp', '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string name;\n    getline(cin, name);\n    cout << "Hello, " << (name.empty() ? "Bodhin" : name) << "!" << endl;\n    return 0;\n}\n')],
  },
  {
    id: 'csharp', name: 'C#', group: 'Systems & enterprise', icon: 'logo-microsoft', color: '#68217A', runner: 'remote', piston: 'csharp', stdin: true,
    blurb: 'C# (.NET) on Bodhin’s code server.',
    files: [f('Main.cs', 'java', 'using System;\n\nclass Program {\n    static void Main() {\n        var name = Console.ReadLine();\n        Console.WriteLine($"Hello, {(string.IsNullOrEmpty(name) ? "Bodhin" : name)}!");\n    }\n}\n')],
  },
  {
    id: 'go', name: 'Go', group: 'Systems & enterprise', icon: 'flash-outline', color: '#00ADD8', runner: 'remote', piston: 'go', stdin: true,
    blurb: 'Go on Bodhin’s code server.',
    files: [f('main.go', 'plain', 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n\t"strings"\n)\n\nfunc main() {\n\treader := bufio.NewReader(os.Stdin)\n\tname, _ := reader.ReadString(\'\\n\')\n\tname = strings.TrimSpace(name)\n\tif name == "" {\n\t\tname = "Bodhin"\n\t}\n\tfmt.Printf("Hello, %s!\\n", name)\n}\n')],
  },
  {
    id: 'rust', name: 'Rust', group: 'Systems & enterprise', icon: 'build-outline', color: '#CE422B', runner: 'remote', piston: 'rust', stdin: true,
    blurb: 'Rust on Bodhin’s code server.',
    files: [f('main.rs', 'rust', 'use std::io::{self, BufRead};\n\nfn main() {\n    let mut name = String::new();\n    io::stdin().lock().read_line(&mut name).unwrap();\n    let name = name.trim();\n    println!("Hello, {}!", if name.is_empty() { "Bodhin" } else { name });\n}\n')],
  },
  {
    id: 'php', name: 'PHP', group: 'Systems & enterprise', icon: 'logo-php', color: '#777BB4', runner: 'remote', piston: 'php', stdin: true,
    blurb: 'PHP on Bodhin’s code server.',
    files: [f('main.php', 'php', '<?php\n$name = trim(fgets(STDIN) ?: "");\necho "Hello, " . ($name === "" ? "Bodhin" : $name) . "!\\n";\n')],
  },
  {
    id: 'ruby', name: 'Ruby', group: 'Languages', icon: 'diamond-outline', color: '#CC342D', runner: 'remote', piston: 'ruby', stdin: true,
    blurb: 'Ruby on Bodhin’s code server.',
    files: [f('main.rb', 'plain', 'name = (gets || "").strip\nputs "Hello, #{name.empty? ? "Bodhin" : name}!"\n')],
  },
  {
    id: 'kotlin', name: 'Kotlin', group: 'Systems & enterprise', icon: 'phone-portrait-outline', color: '#7F52FF', runner: 'remote', piston: 'kotlin', stdin: true,
    blurb: 'Kotlin on Bodhin’s code server.',
    files: [f('Main.kt', 'java', 'fun main() {\n    val name = readLine()?.trim().orEmpty()\n    println("Hello, ${if (name.isEmpty()) "Bodhin" else name}!")\n}\n')],
  },
];

export const stackOf = (id: string) => STACKS.find((s) => s.id === id);
export const GROUPS: Group[] = ['Web', 'Languages', 'Data', 'Systems & enterprise'];

/** Runners that need Bodhin's code server (and count against the daily quota). */
export const isRemote = (s: Stack) => s.runner === 'remote';
