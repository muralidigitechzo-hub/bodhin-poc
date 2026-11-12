/** Daily Concept Quiz: one conceptual multiple-choice question a day (rotates by date, like the daily code problem). */
export interface DailyQuiz {
  id: string;
  topic: 'Python' | 'JavaScript' | 'SQL' | 'Web';
  question: string;
  options: [string, string, string, string];
  /** Index into `options`. */
  answer: 0 | 1 | 2 | 3;
  explain: string;
}

const RAW: DailyQuiz[] = [
  { id: 'q-py-mutable', topic: 'Python', question: 'Which of these Python types is mutable?', options: ['tuple', 'str', 'list', 'frozenset'], answer: 2, explain: 'Lists can be changed in place (append, assign by index). Tuples, strings and frozensets cannot.' },
  { id: 'q-py-len', topic: 'Python', question: 'What does len({"a": 1, "b": 2}) return?', options: ['1', '2', '4', 'It raises an error'], answer: 1, explain: 'len() of a dict counts its keys, so two keys give 2.' },
  { id: 'q-py-range', topic: 'Python', question: 'What does list(range(2, 6)) give?', options: ['[2, 3, 4, 5, 6]', '[2, 3, 4, 5]', '[3, 4, 5, 6]', '[2, 6]'], answer: 1, explain: 'range stops before the end value: 2, 3, 4, 5.' },
  { id: 'q-py-none', topic: 'Python', question: 'What does a Python function return if it has no return statement?', options: ['0', 'An empty string', 'None', 'It raises an error'], answer: 2, explain: 'A function without a return statement returns None.' },
  { id: 'q-py-eq', topic: 'Python', question: 'What is the difference between == and is in Python?', options: ['No difference', '== compares values, is compares identity', 'is compares values, == compares identity', '== works only on numbers'], answer: 1, explain: '== asks "are the values equal?", is asks "is it the very same object?".' },
  { id: 'q-py-comp', topic: 'Python', question: 'What does [x * x for x in range(4)] produce?', options: ['[0, 1, 4, 9]', '[1, 4, 9, 16]', '[0, 2, 4, 6]', '[0, 1, 2, 3]'], answer: 0, explain: 'x runs over 0,1,2,3, so the squares are 0, 1, 4, 9.' },
  { id: 'q-py-dict', topic: 'Python', question: 'How do you safely read a missing key from a dict d without an error?', options: ['d[key]', 'd.get(key)', 'd.find(key)', 'd.read(key)'], answer: 1, explain: 'd.get(key) returns None (or a default you pass) instead of raising KeyError.' },
  { id: 'q-js-equal', topic: 'JavaScript', question: 'What does 1 === "1" evaluate to in JavaScript?', options: ['true', 'false', 'undefined', 'It throws a TypeError'], answer: 1, explain: '=== compares type and value; a number and a string are different types.' },
  { id: 'q-js-const', topic: 'JavaScript', question: 'What does const prevent?', options: ['Changing the object an array holds', 'Re-assigning the variable', 'Using the variable before it is declared', 'Using the variable in functions'], answer: 1, explain: 'const stops re-assignment of the name. The contents of an object or array can still change.' },
  { id: 'q-js-typeof', topic: 'JavaScript', question: 'What does typeof null return?', options: ['"null"', '"undefined"', '"object"', '"number"'], answer: 2, explain: 'A well-known historical quirk: typeof null is "object".' },
  { id: 'q-js-map', topic: 'JavaScript', question: 'What does [1, 2, 3].map(n => n * 2) return?', options: ['6', '[2, 4, 6]', '[1, 2, 3]', 'undefined'], answer: 1, explain: 'map builds a new array by applying the function to every item.' },
  { id: 'q-js-async', topic: 'JavaScript', question: 'What does await do inside an async function?', options: ['Blocks the whole browser', 'Pauses that function until the promise settles', 'Runs the promise twice', 'Turns errors off'], answer: 1, explain: 'await pauses only that function; the rest of the page keeps running.' },
  { id: 'q-js-let', topic: 'JavaScript', question: 'Where is a variable declared with let visible?', options: ['Everywhere in the file', 'Only in the block where it is declared', 'Only in the global scope', 'Only inside functions'], answer: 1, explain: 'let is block scoped (inside the nearest { }).' },
  { id: 'q-js-arr', topic: 'JavaScript', question: 'Which method adds an item to the END of an array?', options: ['unshift', 'push', 'shift', 'concat only'], answer: 1, explain: 'push appends to the end; unshift adds to the start.' },
  { id: 'q-sql-where', topic: 'SQL', question: 'Which clause filters rows BEFORE they are grouped?', options: ['HAVING', 'ORDER BY', 'WHERE', 'LIMIT'], answer: 2, explain: 'WHERE filters rows first; HAVING filters groups after GROUP BY.' },
  { id: 'q-sql-join', topic: 'SQL', question: 'Which JOIN keeps every row from the left table even without a match?', options: ['INNER JOIN', 'LEFT JOIN', 'CROSS JOIN', 'SELF JOIN only'], answer: 1, explain: 'LEFT JOIN keeps all left rows and fills missing right values with NULL.' },
  { id: 'q-sql-null', topic: 'SQL', question: 'How do you test for a missing value in SQL?', options: ['= NULL', '== NULL', 'IS NULL', 'EQUALS NULL'], answer: 2, explain: 'NULL is never equal to anything, even NULL, so use IS NULL.' },
  { id: 'q-sql-count', topic: 'SQL', question: 'What is the difference between COUNT(*) and COUNT(column)?', options: ['None', 'COUNT(column) skips NULLs', 'COUNT(*) skips NULLs', 'COUNT(column) counts only numbers'], answer: 1, explain: 'COUNT(*) counts rows; COUNT(column) counts rows where that column is not NULL.' },
  { id: 'q-sql-order', topic: 'SQL', question: 'What is the default direction of ORDER BY?', options: ['Descending', 'Ascending', 'Random', 'Alphabetical only'], answer: 1, explain: 'ORDER BY sorts ascending unless you add DESC.' },
  { id: 'q-sql-pk', topic: 'SQL', question: 'What does a PRIMARY KEY guarantee?', options: ['Rows are sorted', 'Each row has a unique, non-null identifier', 'The table is encrypted', 'The column is a number'], answer: 1, explain: 'A primary key uniquely identifies each row and cannot be NULL.' },
  { id: 'q-sql-group', topic: 'SQL', question: 'What does GROUP BY dept with AVG(salary) return?', options: ['One average for the whole table', 'One average per department', 'Every salary', 'The highest salary'], answer: 1, explain: 'GROUP BY collapses rows into one row per department, and AVG runs within each group.' },
  { id: 'q-web-flex', topic: 'Web', question: 'Which CSS property turns an element into a flex container?', options: ['position: flex', 'display: flex', 'flex: container', 'layout: flex'], answer: 1, explain: 'display: flex makes the element a flex container for its children.' },
  { id: 'q-web-box', topic: 'Web', question: 'In the CSS box model, what sits between content and border?', options: ['Margin', 'Padding', 'Outline', 'Gap'], answer: 1, explain: 'Padding is inside the border; margin is outside it.' },
  { id: 'q-web-semantic', topic: 'Web', question: 'Which HTML element is best for the main navigation links?', options: ['<div>', '<span>', '<nav>', '<section>'], answer: 2, explain: '<nav> tells browsers and screen readers that this block is for navigation.' },
  { id: 'q-web-status', topic: 'Web', question: 'What does HTTP status 404 mean?', options: ['Server error', 'Not found', 'Unauthorised', 'Redirect'], answer: 1, explain: '404 means the server could not find the requested resource.' },
  { id: 'q-web-alt', topic: 'Web', question: 'Why add an alt attribute to an <img>?', options: ['To make it load faster', 'To describe the image for screen readers and when it fails to load', 'To resize it', 'To add a border'], answer: 1, explain: 'Alt text is read aloud by screen readers and shown if the image cannot load.' },
  { id: 'q-web-get', topic: 'Web', question: 'Which HTTP method is meant for reading data without changing it?', options: ['POST', 'DELETE', 'GET', 'PUT'], answer: 2, explain: 'GET requests should be safe: they read data and change nothing.' },
];

/**
 * The authored list has its correct answers mostly in one position, which makes guessing easy.
 * Rotate each question's options (never reorder them, so nothing like "All of the above" breaks)
 * so the correct answer cycles A, B, C, D through the bank. Deterministic: same order on every load.
 */
function spread(q: DailyQuiz, i: number): DailyQuiz {
  const target = (i % 4) as DailyQuiz['answer'];
  const shift = (target - q.answer + 4) % 4;
  const options = q.options.map((_, j) => q.options[(j - shift + 4) % 4]) as DailyQuiz['options'];
  return { ...q, options, answer: target };
}
export const QUIZ_BANK: DailyQuiz[] = RAW.map(spread);
