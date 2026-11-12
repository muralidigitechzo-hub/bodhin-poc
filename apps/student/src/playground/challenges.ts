/**
 * Built-in practice challenges with automatic checking. Pure data.
 *  io   run the program once per test with its stdin; stdout must match (trailing spaces/newlines ignored)
 *  sql  run the learner's query after the `setup` schema; the LAST result table must equal `expect`
 *  dom  render the page; each assertion is checked against the live DOM
 * `solution` is the reference answer — the test-suite runs it through the real runners to prove every challenge is solvable.
 */
import type { PFile } from './stacks';

export type Level = 'Beginner' | 'Intermediate' | 'Advanced';
export type IoTest = { name: string; stdin: string; expect: string };
export type DomCheck = { name: string; selector: string; count?: number; text?: string; style?: [prop: string, value: string] };
type Base = { id: string; stack: string; title: string; level: Level; points: number; prompt: string; files: PFile[]; solution: PFile[] };
export type Challenge =
  | (Base & { kind: 'io'; tests: IoTest[] })
  | (Base & { kind: 'sql'; setup: string; expect: (string | number | null)[][]; ordered: boolean })
  | (Base & { kind: 'dom'; checks: DomCheck[] });

const f = (name: string, lang: PFile['lang'], code: string): PFile => ({ name, lang, code });

const SUM_TESTS: IoTest[] = [
  { name: '2 + 3', stdin: '2 3\n', expect: '5' },
  { name: 'negatives', stdin: '-10 4\n', expect: '-6' },
  { name: 'large', stdin: '1000000 2345678\n', expect: '3345678' },
];
const SUM_PROMPT = 'Read two integers from one line (separated by a space) and print their sum.';
const FIZZ_TESTS: IoTest[] = [
  { name: 'n = 5', stdin: '5\n', expect: '1\n2\nFizz\n4\nBuzz' },
  { name: 'n = 15', stdin: '15\n', expect: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz' },
];
const FIZZ_PROMPT = 'Read n. For every number from 1 to n print the number — but "Fizz" if it is divisible by 3, "Buzz" if by 5, "FizzBuzz" if by both.';
const PAL_TESTS: IoTest[] = [
  { name: 'racecar', stdin: 'racecar\n', expect: 'yes' },
  { name: 'bodhin', stdin: 'bodhin\n', expect: 'no' },
  { name: 'mixed case + spaces', stdin: 'A man a plan a canal Panama\n', expect: 'yes' },
];
const PAL_PROMPT = 'Read a sentence. Print "yes" if it reads the same forwards and backwards (ignore spaces and upper/lower case), otherwise "no".';
const PRIME_TESTS: IoTest[] = [
  { name: 'n = 10', stdin: '10\n', expect: '4' },
  { name: 'n = 100', stdin: '100\n', expect: '25' },
  { name: 'n = 1', stdin: '1\n', expect: '0' },
];
const PRIME_PROMPT = 'Read n. Print how many prime numbers are there from 1 to n.';

export const CHALLENGES: Challenge[] = [
  /* ───────── JavaScript ───────── */
  { id: 'js-sum', stack: 'javascript', kind: 'io', title: 'Add two numbers', level: 'Beginner', points: 10, prompt: SUM_PROMPT + '\nTip: input() gives you the next line as text.', tests: SUM_TESTS,
    files: [f('main.js', 'javascript', "const line = input();\n// split the line, convert to numbers, print the sum\n")],
    solution: [f('main.js', 'javascript', "const [a, b] = input().split(' ').map(Number);\nconsole.log(a + b);\n")] },
  { id: 'js-fizzbuzz', stack: 'javascript', kind: 'io', title: 'FizzBuzz', level: 'Beginner', points: 15, prompt: FIZZ_PROMPT, tests: FIZZ_TESTS,
    files: [f('main.js', 'javascript', "const n = Number(input());\nfor (let i = 1; i <= n; i++) {\n  // your code\n}\n")],
    solution: [f('main.js', 'javascript', "const n = Number(input());\nfor (let i = 1; i <= n; i++) {\n  console.log(i % 15 === 0 ? 'FizzBuzz' : i % 3 === 0 ? 'Fizz' : i % 5 === 0 ? 'Buzz' : i);\n}\n")] },
  { id: 'js-palindrome', stack: 'javascript', kind: 'io', title: 'Palindrome check', level: 'Intermediate', points: 20, prompt: PAL_PROMPT, tests: PAL_TESTS,
    files: [f('main.js', 'javascript', "const s = input();\n")],
    solution: [f('main.js', 'javascript', "const s = input().toLowerCase().replace(/[^a-z0-9]/g, '');\nconsole.log(s === [...s].reverse().join('') ? 'yes' : 'no');\n")] },
  /* ───────── TypeScript ───────── */
  { id: 'ts-sum', stack: 'typescript', kind: 'io', title: 'Typed sum', level: 'Beginner', points: 10, prompt: SUM_PROMPT + '\nWrite a typed function add(a: number, b: number): number and use it.', tests: SUM_TESTS,
    files: [f('main.ts', 'typescript', "function add(a: number, b: number): number {\n  // return the sum\n}\n\nconst [x, y] = input().split(' ').map(Number);\nconsole.log(add(x, y));\n")],
    solution: [f('main.ts', 'typescript', "function add(a: number, b: number): number {\n  return a + b;\n}\n\nconst [x, y] = input().split(' ').map(Number);\nconsole.log(add(x, y));\n")] },
  { id: 'ts-palindrome', stack: 'typescript', kind: 'io', title: 'Palindrome with types', level: 'Intermediate', points: 20, prompt: PAL_PROMPT, tests: PAL_TESTS,
    files: [f('main.ts', 'typescript', "function isPalindrome(s: string): boolean {\n  return false;\n}\nconsole.log(isPalindrome(input()) ? 'yes' : 'no');\n")],
    solution: [f('main.ts', 'typescript', "function isPalindrome(s: string): boolean {\n  const t: string = s.toLowerCase().replace(/[^a-z0-9]/g, '');\n  return t === t.split('').reverse().join('');\n}\nconsole.log(isPalindrome(input()) ? 'yes' : 'no');\n")] },
  /* ───────── Python ───────── */
  { id: 'py-sum', stack: 'python', kind: 'io', title: 'Add two numbers', level: 'Beginner', points: 10, prompt: SUM_PROMPT, tests: SUM_TESTS,
    files: [f('main.py', 'python', "a, b = map(int, input().split())\n# print the sum\n")],
    solution: [f('main.py', 'python', "a, b = map(int, input().split())\nprint(a + b)\n")] },
  { id: 'py-fizzbuzz', stack: 'python', kind: 'io', title: 'FizzBuzz', level: 'Beginner', points: 15, prompt: FIZZ_PROMPT, tests: FIZZ_TESTS,
    files: [f('main.py', 'python', "n = int(input())\nfor i in range(1, n + 1):\n    pass\n")],
    solution: [f('main.py', 'python', "n = int(input())\nfor i in range(1, n + 1):\n    print('FizzBuzz' if i % 15 == 0 else 'Fizz' if i % 3 == 0 else 'Buzz' if i % 5 == 0 else i)\n")] },
  { id: 'py-primes', stack: 'python', kind: 'io', title: 'Count the primes', level: 'Intermediate', points: 25, prompt: PRIME_PROMPT, tests: PRIME_TESTS,
    files: [f('main.py', 'python', "n = int(input())\n")],
    solution: [f('main.py', 'python', "n = int(input())\nprint(sum(1 for k in range(2, n + 1) if all(k % d for d in range(2, int(k ** 0.5) + 1))))\n")] },
  { id: 'py-words', stack: 'python', kind: 'io', title: 'Most common word', level: 'Intermediate', points: 25, prompt: 'Read a line of words. Print the word that appears most often (lower-case). If there is a tie, print the one that comes first alphabetically.',
    tests: [{ name: 'clear winner', stdin: 'the cat and the hat\n', expect: 'the' }, { name: 'tie', stdin: 'b a b a c\n', expect: 'a' }, { name: 'case', stdin: 'Go go GO stop\n', expect: 'go' }],
    files: [f('main.py', 'python', "words = input().lower().split()\n")],
    solution: [f('main.py', 'python', "from collections import Counter\nc = Counter(input().lower().split())\nprint(sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[0][0])\n")] },
  /* ───────── SQL ───────── */
  { id: 'sql-filter', stack: 'sql', kind: 'sql', title: 'Well-paid staff', level: 'Beginner', points: 10, ordered: true,
    prompt: 'Table staff(id, name, dept, salary). List the NAME of everyone earning more than 50000, highest salary first.',
    setup: SQL_STAFF(), expect: [['Meena'], ['Divya'], ['Karthik']],
    files: [f('query.sql', 'sql', '-- the staff table already exists\nSELECT name FROM staff;\n')],
    solution: [f('query.sql', 'sql', 'SELECT name FROM staff WHERE salary > 50000 ORDER BY salary DESC;\n')] },
  { id: 'sql-group', stack: 'sql', kind: 'sql', title: 'Average pay by department', level: 'Intermediate', points: 20, ordered: true,
    prompt: 'Show each dept and its average salary rounded to a whole number (column names: dept, avg_salary), ordered by dept A→Z.',
    setup: SQL_STAFF(), expect: [['Design', 52000], ['Engineering', 73000], ['Sales', 38000]],
    files: [f('query.sql', 'sql', 'SELECT dept FROM staff;\n')],
    solution: [f('query.sql', 'sql', 'SELECT dept, ROUND(AVG(salary)) AS avg_salary FROM staff GROUP BY dept ORDER BY dept;\n')] },
  { id: 'sql-top2', stack: 'sql', kind: 'sql', title: 'Top earner per department', level: 'Advanced', points: 30, ordered: true,
    prompt: 'For every dept, show the name of its highest-paid person (columns: dept, name), ordered by dept.',
    setup: SQL_STAFF(), expect: [['Design', 'Divya'], ['Engineering', 'Meena'], ['Sales', 'Ravi']],
    files: [f('query.sql', 'sql', 'SELECT dept, name FROM staff;\n')],
    solution: [f('query.sql', 'sql', 'SELECT s.dept, s.name FROM staff s WHERE s.salary = (SELECT MAX(salary) FROM staff WHERE dept = s.dept) ORDER BY s.dept;\n')] },
  /* ───────── HTML · CSS · JS ───────── */
  { id: 'web-heading', stack: 'web', kind: 'dom', title: 'Your first page', level: 'Beginner', points: 10,
    prompt: 'Make an <h1> with the text "Hello Bodhin" and a paragraph (<p>) below it.',
    checks: [{ name: 'has an h1', selector: 'h1', count: 1 }, { name: 'h1 says Hello Bodhin', selector: 'h1', text: 'Hello Bodhin' }, { name: 'has a paragraph', selector: 'p' }],
    files: [f('index.html', 'html', '<!-- write your HTML here -->\n'), f('style.css', 'css', ''), f('script.js', 'javascript', '')],
    solution: [f('index.html', 'html', '<h1>Hello Bodhin</h1>\n<p>Welcome!</p>\n'), f('style.css', 'css', ''), f('script.js', 'javascript', '')] },
  { id: 'web-list', stack: 'web', kind: 'dom', title: 'A styled list', level: 'Beginner', points: 15,
    prompt: 'Create a <ul id="skills"> with exactly 3 <li> items. Make every list item text colour red using CSS.',
    checks: [{ name: 'ul#skills exists', selector: 'ul#skills', count: 1 }, { name: 'three list items', selector: '#skills li', count: 3 }, { name: 'items are red', selector: '#skills li', style: ['color', 'rgb(255, 0, 0)'] }],
    files: [f('index.html', 'html', '<ul id="skills">\n</ul>\n'), f('style.css', 'css', '/* style the li */\n'), f('script.js', 'javascript', '')],
    solution: [f('index.html', 'html', '<ul id="skills"><li>HTML</li><li>CSS</li><li>JS</li></ul>\n'), f('style.css', 'css', '#skills li { color: red; }\n'), f('script.js', 'javascript', '')] },
  { id: 'web-click', stack: 'web', kind: 'dom', title: 'Make it interactive', level: 'Intermediate', points: 25,
    prompt: 'There is a <button id="go"> and an empty <p id="out">. When the page loads, JavaScript should put the text "Ready" in #out.',
    checks: [{ name: 'button exists', selector: 'button#go', count: 1 }, { name: '#out says Ready', selector: '#out', text: 'Ready' }],
    files: [f('index.html', 'html', '<button id="go">Go</button>\n<p id="out"></p>\n'), f('style.css', 'css', ''), f('script.js', 'javascript', '// set the text of #out\n')],
    solution: [f('index.html', 'html', '<button id="go">Go</button>\n<p id="out"></p>\n'), f('style.css', 'css', ''), f('script.js', 'javascript', "document.getElementById('out').textContent = 'Ready';\n")] },
  /* ───────── Server-side languages (sum + fizzbuzz style) ───────── */
  { id: 'java-sum', stack: 'java', kind: 'io', title: 'Add two numbers', level: 'Beginner', points: 10, prompt: SUM_PROMPT, tests: SUM_TESTS,
    files: [f('Main.java', 'java', 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        // read a and b, print a + b\n    }\n}\n')],
    solution: [f('Main.java', 'java', 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        long a = in.nextLong(), b = in.nextLong();\n        System.out.println(a + b);\n    }\n}\n')] },
  { id: 'java-fizzbuzz', stack: 'java', kind: 'io', title: 'FizzBuzz', level: 'Beginner', points: 15, prompt: FIZZ_PROMPT, tests: FIZZ_TESTS,
    files: [f('Main.java', 'java', 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        int n = new Scanner(System.in).nextInt();\n    }\n}\n')],
    solution: [f('Main.java', 'java', 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        int n = new Scanner(System.in).nextInt();\n        for (int i = 1; i <= n; i++) System.out.println(i % 15 == 0 ? "FizzBuzz" : i % 3 == 0 ? "Fizz" : i % 5 == 0 ? "Buzz" : String.valueOf(i));\n    }\n}\n')] },
  { id: 'c-sum', stack: 'c', kind: 'io', title: 'Add two numbers', level: 'Beginner', points: 10, prompt: SUM_PROMPT, tests: SUM_TESTS,
    files: [f('main.c', 'cpp', '#include <stdio.h>\n\nint main(void) {\n    long a, b;\n    // scanf the two numbers, printf the sum\n    return 0;\n}\n')],
    solution: [f('main.c', 'cpp', '#include <stdio.h>\n\nint main(void) {\n    long a, b;\n    scanf("%ld %ld", &a, &b);\n    printf("%ld\\n", a + b);\n    return 0;\n}\n')] },
  { id: 'cpp-sum', stack: 'cpp', kind: 'io', title: 'Add two numbers', level: 'Beginner', points: 10, prompt: SUM_PROMPT, tests: SUM_TESTS,
    files: [f('main.cpp', 'cpp', '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long a, b;\n    // read a, b and print a + b\n}\n')],
    solution: [f('main.cpp', 'cpp', '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n}\n')] },
  { id: 'go-sum', stack: 'go', kind: 'io', title: 'Add two numbers', level: 'Beginner', points: 10, prompt: SUM_PROMPT, tests: SUM_TESTS,
    files: [f('main.go', 'plain', 'package main\n\nimport "fmt"\n\nfunc main() {\n\tvar a, b int\n\t// fmt.Scan(&a, &b) then print the sum\n\tfmt.Println(a, b)\n}\n')],
    solution: [f('main.go', 'plain', 'package main\n\nimport "fmt"\n\nfunc main() {\n\tvar a, b int\n\tfmt.Scan(&a, &b)\n\tfmt.Println(a + b)\n}\n')] },
  { id: 'rust-sum', stack: 'rust', kind: 'io', title: 'Add two numbers', level: 'Beginner', points: 10, prompt: SUM_PROMPT, tests: SUM_TESTS,
    files: [f('main.rs', 'rust', 'use std::io;\n\nfn main() {\n    let mut line = String::new();\n    io::stdin().read_line(&mut line).unwrap();\n    // parse the two numbers and print the sum\n}\n')],
    solution: [f('main.rs', 'rust', 'use std::io;\n\nfn main() {\n    let mut line = String::new();\n    io::stdin().read_line(&mut line).unwrap();\n    let s: i64 = line.split_whitespace().map(|x| x.parse::<i64>().unwrap()).sum();\n    println!("{}", s);\n}\n')] },
  { id: 'php-sum', stack: 'php', kind: 'io', title: 'Add two numbers', level: 'Beginner', points: 10, prompt: SUM_PROMPT, tests: SUM_TESTS,
    files: [f('main.php', 'php', '<?php\n$line = trim(fgets(STDIN));\n// explode the line, add the numbers, echo the result\n')],
    solution: [f('main.php', 'php', '<?php\n$line = trim(fgets(STDIN));\n[$a, $b] = array_map("intval", explode(" ", $line));\necho $a + $b, "\\n";\n')] },
  { id: 'ruby-sum', stack: 'ruby', kind: 'io', title: 'Add two numbers', level: 'Beginner', points: 10, prompt: SUM_PROMPT, tests: SUM_TESTS,
    files: [f('main.rb', 'plain', 'line = gets\n# split, convert with to_i, puts the sum\n')],
    solution: [f('main.rb', 'plain', 'puts gets.split.map(&:to_i).sum\n')] },
  { id: 'kotlin-sum', stack: 'kotlin', kind: 'io', title: 'Add two numbers', level: 'Beginner', points: 10, prompt: SUM_PROMPT, tests: SUM_TESTS,
    files: [f('Main.kt', 'java', 'fun main() {\n    val line = readLine()!!\n    // split by space, convert to Long, print the sum\n}\n')],
    solution: [f('Main.kt', 'java', 'fun main() {\n    println(readLine()!!.trim().split(" ").map { it.toLong() }.sum())\n}\n')] },
  { id: 'csharp-sum', stack: 'csharp', kind: 'io', title: 'Add two numbers', level: 'Beginner', points: 10, prompt: SUM_PROMPT, tests: SUM_TESTS,
    files: [f('Main.cs', 'java', 'using System;\nusing System.Linq;\n\nclass Program {\n    static void Main() {\n        var line = Console.ReadLine();\n        // split, parse, print the sum\n    }\n}\n')],
    solution: [f('Main.cs', 'java', 'using System;\nusing System.Linq;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine(Console.ReadLine().Split(\' \').Select(long.Parse).Sum());\n    }\n}\n')] },
];

function SQL_STAFF() {
  return `CREATE TABLE staff (id INTEGER PRIMARY KEY, name TEXT, dept TEXT, salary INTEGER);
INSERT INTO staff (name, dept, salary) VALUES
 ('Meena','Engineering',90000),('Karthik','Engineering',56000),('Divya','Design',61000),
 ('Arun','Design',43000),('Ravi','Sales',40000),('Suresh','Sales',36000),('Latha','Sales',38000);`;
}

export const challengesOf = (stackId: string) => CHALLENGES.filter((c) => c.stack === stackId);
export const challengeOf = (id: string) => CHALLENGES.find((c) => c.id === id);
