// FlyCoder bench: small, self-written coding problems with hidden tests.
// Only `prompt` is sent to the model. `test` runs against the extracted code,
// and `reference` is a known-good solution used by `npm test` to prove that
// every test is correct and solvable.
const py = String.raw;
const js = String.raw;

export const PROBLEMS = [
  {
    id: 'py-merge-intervals',
    language: 'python',
    entry: 'merge_intervals',
    prompt: `Write a Python function merge_intervals(intervals) that merges closed intervals.
- intervals is a list of (start, end) tuples of integers, in any order.
- Intervals that overlap or touch (one ends exactly where the next starts) are merged.
- Return a new list of (start, end) tuples sorted by start. Do not mutate the input.
- Raise ValueError if any interval has start > end.`,
    reference: py`def merge_intervals(intervals):
    items = sorted(intervals)
    for start, end in items:
        if start > end:
            raise ValueError("start > end")
    merged = []
    for start, end in items:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged
`,
    test: py`data = [(5, 6), (1, 3), (2, 4)]
assert merge_intervals(data) == [(1, 4), (5, 6)]
assert data == [(5, 6), (1, 3), (2, 4)], "input was mutated"
assert merge_intervals([]) == []
assert merge_intervals([(1, 2), (2, 3)]) == [(1, 3)]
assert merge_intervals([(1, 10), (2, 3), (4, 5)]) == [(1, 10)]
assert merge_intervals([(-5, -1), (0, 0)]) == [(-5, -1), (0, 0)]
try:
    merge_intervals([(3, 1)])
    raise AssertionError("expected ValueError")
except ValueError:
    pass
`
  },
  {
    id: 'py-roman-strict',
    language: 'python',
    entry: 'roman_to_int',
    prompt: `Write a Python function roman_to_int(s) that converts a Roman numeral to an integer.
- Only canonical numerals for 1 to 3999 are valid, using I V X L C D M and the standard subtractive pairs (IV IX XL XC CD CM).
- Raise ValueError for anything else: empty string, lowercase, unknown letters, or non-canonical forms such as "IIII", "VV", "IC", "XM" or "MMMM".`,
    reference: py`def roman_to_int(s):
    table = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"),
             (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
    if not isinstance(s, str) or not s:
        raise ValueError("empty")
    values = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = 0
    for i, ch in enumerate(s):
        if ch not in values:
            raise ValueError("bad digit")
        v = values[ch]
        if i + 1 < len(s) and s[i + 1] in values and values[s[i + 1]] > v:
            total -= v
        else:
            total += v
    if not 1 <= total <= 3999:
        raise ValueError("range")
    n, out = total, ""
    for value, sym in table:
        while n >= value:
            out += sym
            n -= value
    if out != s:
        raise ValueError("non-canonical")
    return total
`,
    test: py`for text, value in [("I", 1), ("IV", 4), ("IX", 9), ("XLII", 42), ("XCIX", 99), ("CDXLIV", 444), ("MCMXCIV", 1994), ("MMMCMXCIX", 3999)]:
    assert roman_to_int(text) == value, text
for bad in ["", "IIII", "VV", "IC", "XM", "MMMM", "iv", "ABC", "IIV", "VX"]:
    try:
        roman_to_int(bad)
        raise AssertionError("accepted " + repr(bad))
    except ValueError:
        pass
`
  },
  {
    id: 'py-parse-duration',
    language: 'python',
    entry: 'parse_duration',
    prompt: `Write a Python function parse_duration(text) that returns a duration in whole seconds.
- The format is one or more <non-negative integer><unit> parts with units d (86400 s), h, m and s, for example "2d4h", "1h30m", "45s" or "1h 15m 10s".
- Spaces may appear between parts and around the text, never inside a number.
- Each unit may appear at most once and units must appear in the order d, h, m, s.
- Raise ValueError for invalid input such as "", "10", "1x", "1m1h", "1h1h" or "1 h".`,
    reference: py`import re

def parse_duration(text):
    if not isinstance(text, str):
        raise ValueError("not text")
    parts = re.findall(r"\s*(\d+)([dhms])", text)
    rebuilt = "".join(re.findall(r"\s*\d+[dhms]", text))
    if not parts or rebuilt.strip() != text.strip() or text[len(rebuilt):].strip():
        raise ValueError("invalid")
    order = "dhms"
    seconds = {"d": 86400, "h": 3600, "m": 60, "s": 1}
    last = -1
    total = 0
    for number, unit in parts:
        index = order.index(unit)
        if index <= last:
            raise ValueError("order")
        last = index
        total += int(number) * seconds[unit]
    return total
`,
    test: py`assert parse_duration("45s") == 45
assert parse_duration("1h30m") == 5400
assert parse_duration("2d4h") == 187200
assert parse_duration(" 1h 15m 10s ") == 4510
assert parse_duration("0s") == 0
assert parse_duration("90m") == 5400
for bad in ["", "   ", "10", "1x", "1m1h", "1h1h", "h", "1 h", "-1s", "1.5h"]:
    try:
        parse_duration(bad)
        raise AssertionError("accepted " + repr(bad))
    except ValueError:
        pass
`
  },
  {
    id: 'py-topo-sort',
    language: 'python',
    entry: 'topo_sort',
    prompt: `Write a Python function topo_sort(deps) for build ordering.
- deps maps each node (a string) to a list of nodes it depends on. Nodes that only appear as dependencies are also part of the graph.
- Return a list containing every node exactly once, where each node comes after all of its dependencies.
- When several nodes are ready at the same time, take the alphabetically smallest first, so the result is deterministic.
- Raise ValueError if there is a cycle (including a node that depends on itself).`,
    reference: py`import heapq

def topo_sort(deps):
    nodes = set(deps)
    for values in deps.values():
        nodes.update(values)
    remaining = {n: set(deps.get(n, [])) for n in nodes}
    users = {n: [] for n in nodes}
    for node, values in remaining.items():
        for dep in values:
            users[dep].append(node)
    ready = [n for n, values in remaining.items() if not values]
    heapq.heapify(ready)
    order = []
    while ready:
        node = heapq.heappop(ready)
        order.append(node)
        for user in users[node]:
            remaining[user].discard(node)
            if not remaining[user]:
                heapq.heappush(ready, user)
    if len(order) != len(nodes):
        raise ValueError("cycle")
    return order
`,
    test: py`assert topo_sort({}) == []
assert topo_sort({"app": ["lib", "utils"], "lib": ["utils"]}) == ["utils", "lib", "app"]
assert topo_sort({"b": [], "a": [], "c": ["a"]}) == ["a", "b", "c"]
assert topo_sort({"z": ["y"], "x": []}) == ["x", "y", "z"]
for cyclic in [{"a": ["b"], "b": ["a"]}, {"a": ["a"]}, {"a": ["b"], "b": ["c"], "c": ["a"]}]:
    try:
        topo_sort(cyclic)
        raise AssertionError("cycle not detected")
    except ValueError:
        pass
`
  },
  {
    id: 'py-lru-cache',
    language: 'python',
    entry: 'LRUCache',
    prompt: `Write a Python class LRUCache with a fixed capacity.
- LRUCache(capacity) raises ValueError if capacity is negative. A capacity of 0 stores nothing.
- get(key) returns the stored value, or -1 if the key is absent. A successful get marks the key as most recently used.
- put(key, value) inserts or updates the key and marks it as most recently used. When the cache exceeds its capacity, evict the least recently used key.
- Both operations must run in O(1) average time.`,
    reference: py`from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity):
        if capacity < 0:
            raise ValueError("capacity")
        self.capacity = capacity
        self.data = OrderedDict()

    def get(self, key):
        if key not in self.data:
            return -1
        self.data.move_to_end(key)
        return self.data[key]

    def put(self, key, value):
        if self.capacity == 0:
            return
        self.data[key] = value
        self.data.move_to_end(key)
        if len(self.data) > self.capacity:
            self.data.popitem(last=False)
`,
    test: py`c = LRUCache(2)
c.put(1, 1); c.put(2, 2)
assert c.get(1) == 1
c.put(3, 3)
assert c.get(2) == -1
c.put(4, 4)
assert c.get(1) == -1 and c.get(3) == 3 and c.get(4) == 4
c.put(3, 30)
c.put(5, 5)
assert c.get(3) == 30 and c.get(4) == -1
z = LRUCache(0)
z.put("a", 1)
assert z.get("a") == -1
try:
    LRUCache(-1)
    raise AssertionError("negative capacity accepted")
except ValueError:
    pass
`
  },
  {
    id: 'py-wrap-text',
    language: 'python',
    entry: 'wrap_text',
    prompt: `Write a Python function wrap_text(text, width) that wraps text greedily into lines.
- Words are separated by any whitespace; runs of whitespace collapse, and lines never start or end with a space.
- Put as many words as fit on each line (words joined by single spaces, line length <= width).
- A word longer than width is split into pieces of exactly width characters (the last piece may be shorter); each piece is then placed like a word.
- Return the list of lines; empty or whitespace-only text returns [].
- Raise ValueError if width < 1.`,
    reference: py`def wrap_text(text, width):
    if width < 1:
        raise ValueError("width")
    words = []
    for word in text.split():
        while len(word) > width:
            words.append(word[:width])
            word = word[width:]
        words.append(word)
    lines = []
    for word in words:
        if lines and len(lines[-1]) + 1 + len(word) <= width:
            lines[-1] += " " + word
        else:
            lines.append(word)
    return lines
`,
    test: py`assert wrap_text("the quick brown fox", 10) == ["the quick", "brown fox"]
assert wrap_text("  a   b\n c\t", 3) == ["a b", "c"]
assert wrap_text("", 5) == [] and wrap_text("   ", 5) == []
assert wrap_text("abcdefghij", 4) == ["abcd", "efgh", "ij"]
assert wrap_text("hi abcdefg", 4) == ["hi", "abcd", "efg"]
assert wrap_text("ab cdefgh", 5) == ["ab", "cdefg", "h"]
try:
    wrap_text("x", 0)
    raise AssertionError("width 0 accepted")
except ValueError:
    pass
`
  },
  {
    id: 'py-semver-compare',
    language: 'python',
    entry: 'compare_versions',
    prompt: `Write a Python function compare_versions(a, b) that compares two Semantic Versioning 2.0.0 strings and returns -1, 0 or 1.
- Versions look like MAJOR.MINOR.PATCH, optionally followed by -PRERELEASE and/or +BUILD.
- Follow SemVer precedence exactly: numeric core comparison; a pre-release version has lower precedence than the normal version; pre-release identifiers are compared dot by dot, numeric identifiers numerically, alphanumeric ones in ASCII order, numeric identifiers lower than alphanumeric ones, and a shorter set of identifiers is lower when all preceding ones are equal.
- Build metadata is ignored.`,
    reference: py`def compare_versions(a, b):
    def parse(v):
        v = v.split("+", 1)[0]
        core, _, pre = v.partition("-")
        nums = tuple(int(x) for x in core.split("."))
        return nums, (pre.split(".") if pre else [])

    def cmp(x, y):
        return (x > y) - (x < y)

    (na, pa), (nb, pb) = parse(a), parse(b)
    if na != nb:
        return cmp(na, nb)
    if not pa or not pb:
        return cmp(not pa, not pb)
    for x, y in zip(pa, pb):
        if x == y:
            continue
        xd, yd = x.isdigit(), y.isdigit()
        if xd and yd:
            return cmp(int(x), int(y))
        if xd != yd:
            return -1 if xd else 1
        return cmp(x, y)
    return cmp(len(pa), len(pb))
`,
    test: py`chain = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.2.0", "1.10.0", "2.0.0"]
for low, high in zip(chain, chain[1:]):
    assert compare_versions(low, high) == -1, (low, high)
    assert compare_versions(high, low) == 1, (high, low)
assert compare_versions("1.0.0+build.1", "1.0.0+build.2") == 0
assert compare_versions("1.0.0-rc.1+x", "1.0.0-rc.1") == 0
assert compare_versions("3.4.5", "3.4.5") == 0
`
  },
  {
    id: 'py-spiral',
    language: 'python',
    entry: 'spiral_order',
    prompt: `Write a Python function spiral_order(matrix) that returns the elements of a rectangular matrix (a list of equal-length lists) in clockwise spiral order, starting at the top-left corner. An empty matrix, or a matrix of empty rows, returns [].`,
    reference: py`def spiral_order(matrix):
    out = []
    if not matrix or not matrix[0]:
        return out
    top, bottom, left, right = 0, len(matrix) - 1, 0, len(matrix[0]) - 1
    while top <= bottom and left <= right:
        for c in range(left, right + 1):
            out.append(matrix[top][c])
        for r in range(top + 1, bottom + 1):
            out.append(matrix[r][right])
        if top < bottom:
            for c in range(right - 1, left - 1, -1):
                out.append(matrix[bottom][c])
        if left < right:
            for r in range(bottom - 1, top, -1):
                out.append(matrix[r][left])
        top, bottom, left, right = top + 1, bottom - 1, left + 1, right - 1
    return out
`,
    test: py`assert spiral_order([]) == [] and spiral_order([[]]) == []
assert spiral_order([[1, 2, 3], [4, 5, 6], [7, 8, 9]]) == [1, 2, 3, 6, 9, 8, 7, 4, 5]
assert spiral_order([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]) == [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]
assert spiral_order([[1, 2, 3]]) == [1, 2, 3]
assert spiral_order([[1], [2], [3]]) == [1, 2, 3]
assert spiral_order([[1, 2], [3, 4], [5, 6]]) == [1, 2, 4, 6, 5, 3]
`
  },
  {
    id: 'py-csv-line',
    language: 'python',
    entry: 'parse_csv_line',
    prompt: `Write a Python function parse_csv_line(line) that splits one CSV record into fields, without using the csv module.
- Fields are separated by commas. An empty line is one empty field: [""].
- A field may be quoted with double quotes; inside quotes, commas are literal and "" stands for one double quote.
- Unquoted fields are taken as-is (no trimming).
- Raise ValueError for an unterminated quoted field, or for any character other than a comma after a closing quote.`,
    reference: py`def parse_csv_line(line):
    fields, i, n = [], 0, len(line)
    while True:
        if i < n and line[i] == '"':
            i += 1
            value = []
            while True:
                if i >= n:
                    raise ValueError("unterminated")
                if line[i] == '"':
                    if i + 1 < n and line[i + 1] == '"':
                        value.append('"')
                        i += 2
                        continue
                    i += 1
                    break
                value.append(line[i])
                i += 1
            fields.append("".join(value))
            if i < n and line[i] != ",":
                raise ValueError("garbage after quote")
        else:
            j = line.find(",", i)
            j = n if j == -1 else j
            fields.append(line[i:j])
            i = j
        if i >= n:
            return fields
        i += 1
`,
    test: py`assert parse_csv_line("a,b,c") == ["a", "b", "c"]
assert parse_csv_line("") == [""]
assert parse_csv_line("a,,") == ["a", "", ""]
assert parse_csv_line('"x, y",z') == ["x, y", "z"]
assert parse_csv_line('"say ""hi""",2') == ['say "hi"', "2"]
assert parse_csv_line('""') == [""]
assert parse_csv_line(" a , b") == [" a ", " b"]
assert parse_csv_line('1,"",3') == ["1", "", "3"]
for bad in ['"open', '"a"b,c', 'x,"y"z']:
    try:
        parse_csv_line(bad)
        raise AssertionError("accepted " + bad)
    except ValueError:
        pass
`
  },
  {
    id: 'py-lcs',
    language: 'python',
    entry: 'longest_common_subsequence',
    prompt: `Write a Python function longest_common_subsequence(a, b) that returns one longest common subsequence of strings a and b (any one of maximal length). It must handle strings of 2000 characters each within a couple of seconds.`,
    reference: py`def longest_common_subsequence(a, b):
    n, m = len(a), len(b)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        row, below = dp[i], dp[i + 1]
        for j in range(m - 1, -1, -1):
            row[j] = below[j + 1] + 1 if a[i] == b[j] else max(below[j], row[j + 1])
    out, i, j = [], 0, 0
    while i < n and j < m:
        if a[i] == b[j]:
            out.append(a[i]); i += 1; j += 1
        elif dp[i + 1][j] >= dp[i][j + 1]:
            i += 1
        else:
            j += 1
    return "".join(out)
`,
    test: py`import random, time
def is_sub(s, t):
    it = iter(t)
    return all(c in it for c in s)
for a, b, n in [("ABCBDAB", "BDCABA", 4), ("", "abc", 0), ("abc", "abc", 3), ("abc", "def", 0), ("AGGTAB", "GXTXAYB", 4)]:
    r = longest_common_subsequence(a, b)
    assert len(r) == n and is_sub(r, a) and is_sub(r, b), (a, b, r)
rng = random.Random(7)
a = "".join(rng.choice("ACGT") for _ in range(2000))
b = "".join(rng.choice("ACGT") for _ in range(2000))
start = time.time()
r = longest_common_subsequence(a, b)
assert is_sub(r, a) and is_sub(r, b)
assert time.time() - start < 8, "too slow"
`
  },
  {
    id: 'py-number-words',
    language: 'python',
    entry: 'number_to_words',
    prompt: `Write a Python function number_to_words(n) that spells an integer in English.
- Valid range: 0 to 999_999_999_999 inclusive; raise ValueError otherwise.
- Use lowercase words, single spaces, hyphens for 21-99 compounds ("forty-two"), no "and", and the scale words thousand, million, billion.
- Examples: 0 -> "zero", 105 -> "one hundred five", 1_000_010 -> "one million ten", 999_999_999_999 -> "nine hundred ninety-nine billion nine hundred ninety-nine million nine hundred ninety-nine thousand nine hundred ninety-nine".`,
    reference: py`def number_to_words(n):
    if not isinstance(n, int) or isinstance(n, bool) or not 0 <= n <= 999_999_999_999:
        raise ValueError("range")
    ones = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
    tens = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
    def small(x):
        words = []
        if x >= 100:
            words += [ones[x // 100], "hundred"]
            x %= 100
        if x >= 20:
            words.append(tens[x // 10] + ("-" + ones[x % 10] if x % 10 else ""))
        elif x:
            words.append(ones[x])
        return words
    if n == 0:
        return "zero"
    words = []
    for value, name in [(10**9, "billion"), (10**6, "million"), (1000, "thousand"), (1, "")]:
        if n >= value:
            words += small(n // value) + ([name] if name else [])
            n %= value
    return " ".join(words)
`,
    test: py`cases = {0: "zero", 7: "seven", 13: "thirteen", 20: "twenty", 42: "forty-two", 100: "one hundred", 105: "one hundred five",
         999: "nine hundred ninety-nine", 1000: "one thousand", 1_000_010: "one million ten", 2_000_000_000: "two billion",
         123_456: "one hundred twenty-three thousand four hundred fifty-six",
         999_999_999_999: "nine hundred ninety-nine billion nine hundred ninety-nine million nine hundred ninety-nine thousand nine hundred ninety-nine"}
for n, words in cases.items():
    assert number_to_words(n) == words, (n, number_to_words(n))
for bad in [-1, 1_000_000_000_000]:
    try:
        number_to_words(bad)
        raise AssertionError("accepted " + str(bad))
    except ValueError:
        pass
`
  },
  {
    id: 'py-dijkstra',
    language: 'python',
    entry: 'shortest_distances',
    prompt: `Write a Python function shortest_distances(n, edges, source) for a directed graph with nodes 0..n-1.
- edges is a list of (u, v, weight) tuples; weights are non-negative numbers and parallel edges may exist.
- Return a list of length n with the shortest distance from source to every node, using float("inf") for unreachable nodes.
- Raise ValueError if any weight is negative or source is not a valid node.
- It must handle 20_000 nodes and 100_000 edges quickly (use a priority queue).`,
    reference: py`import heapq

def shortest_distances(n, edges, source):
    if not 0 <= source < n:
        raise ValueError("source")
    graph = [[] for _ in range(n)]
    for u, v, w in edges:
        if w < 0:
            raise ValueError("negative")
        graph[u].append((v, w))
    dist = [float("inf")] * n
    dist[source] = 0
    heap = [(0, source)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue
        for v, w in graph[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(heap, (nd, v))
    return dist
`,
    test: py`import random, time
inf = float("inf")
assert shortest_distances(1, [], 0) == [0]
assert shortest_distances(4, [(0, 1, 5), (0, 2, 1), (2, 1, 1), (1, 3, 2)], 0) == [0, 2, 1, 4]
assert shortest_distances(3, [(1, 2, 1)], 0) == [0, inf, inf]
assert shortest_distances(2, [(0, 1, 3), (0, 1, 2)], 0) == [0, 2]
for args in [(2, [(0, 1, -1)], 0), (2, [], 5)]:
    try:
        shortest_distances(*args)
        raise AssertionError("accepted invalid input")
    except ValueError:
        pass
rng = random.Random(3)
n = 20000
edges = [(rng.randrange(n), rng.randrange(n), rng.randrange(1, 100)) for _ in range(100000)]
start = time.time()
d = shortest_distances(n, edges, 0)
assert len(d) == n and d[0] == 0 and time.time() - start < 6
`
  },
  {
    id: 'py-slugify',
    language: 'python',
    entry: 'slugify',
    prompt: `Write a Python function slugify(text, max_length=50) that builds an ASCII URL slug.
- Lowercase the text and remove accents (é -> e, ñ -> n, Ü -> u); also map ß -> ss, æ -> ae, œ -> oe, ø -> o.
- Every run of characters that are not a-z or 0-9 becomes a single hyphen; no leading or trailing hyphens.
- If the slug is longer than max_length, cut it to max_length characters and remove any trailing hyphen.
- Raise ValueError if max_length < 1. Use only the standard library.`,
    reference: py`import re
import unicodedata

def slugify(text, max_length=50):
    if max_length < 1:
        raise ValueError("max_length")
    text = text.lower()
    for src, dst in (("ß", "ss"), ("æ", "ae"), ("œ", "oe"), ("ø", "o")):
        text = text.replace(src, dst)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return slug[:max_length].rstrip("-")
`,
    test: py`assert slugify("Hello, World!") == "hello-world"
assert slugify("  Crème Brûlée à la Française  ") == "creme-brulee-a-la-francaise"
assert slugify("Straße & Œuvre, Æther, Øre") == "strasse-oeuvre-aether-ore"
assert slugify("ÜBER---cool__stuff") == "uber-cool-stuff"
assert slugify("¡¿!") == ""
assert slugify("abc def ghi", max_length=7) == "abc-def"
assert slugify("abc def ghi", max_length=8) == "abc-def"
assert slugify("Niño 2026") == "nino-2026"
try:
    slugify("x", max_length=0)
    raise AssertionError("max_length 0 accepted")
except ValueError:
    pass
`
  },
  {
    id: 'py-base-convert',
    language: 'python',
    entry: 'convert_base',
    prompt: `Write a Python function convert_base(number, from_base, to_base) that converts an integer written as a string between bases 2 and 36.
- Digits are 0-9 then letters a-z; input letters may be uppercase or lowercase, output uses lowercase.
- An optional leading "-" marks a negative number. Zero is "0" (never "-0").
- Raise ValueError if a base is outside 2..36, the string is empty or only "-", or a digit is invalid for from_base.
- Do it without int(number, base) or any other base-parsing helper.`,
    reference: py`def convert_base(number, from_base, to_base):
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    for base in (from_base, to_base):
        if not isinstance(base, int) or not 2 <= base <= 36:
            raise ValueError("base")
    text = number.strip().lower()
    negative = text.startswith("-")
    if negative:
        text = text[1:]
    if not text:
        raise ValueError("empty")
    value = 0
    for ch in text:
        d = digits.find(ch)
        if d < 0 or d >= from_base:
            raise ValueError("digit")
        value = value * from_base + d
    if value == 0:
        return "0"
    out = []
    while value:
        value, r = divmod(value, to_base)
        out.append(digits[r])
    return ("-" if negative else "") + "".join(reversed(out))
`,
    test: py`assert convert_base("ff", 16, 2) == "11111111"
assert convert_base("FF", 16, 10) == "255"
assert convert_base("-101", 2, 10) == "-5"
assert convert_base("0", 10, 2) == "0" and convert_base("-0", 10, 7) == "0"
assert convert_base("zz", 36, 10) == "1295"
assert convert_base("1295", 10, 36) == "zz"
assert convert_base("123456789012345678901234567890", 10, 16) == "18ee90ff6c373e0ee4e3f0ad2"
for args in [("12", 1, 10), ("12", 10, 37), ("", 10, 2), ("-", 10, 2), ("2", 2, 10), ("g", 16, 10)]:
    try:
        convert_base(*args)
        raise AssertionError("accepted " + repr(args))
    except ValueError:
        pass
`
  },
  {
    id: 'js-parse-query',
    language: 'javascript',
    entry: 'parseQuery',
    prompt: `Write a JavaScript function parseQuery(query) that parses a URL query string into a plain object, without using URLSearchParams or the URL class.
- A leading "?" is optional. Pairs are separated by "&"; empty pairs are ignored.
- Split each pair on the first "="; a key without "=" maps to "".
- In keys and values, "+" means a space, then percent-decoding applies. If percent-decoding fails, keep that text as it is (with "+" still turned into spaces).
- A key that appears several times maps to an array of its values in order; otherwise the value is a string.
- The result must be safe for keys such as "__proto__" (it must become an own property, and Object.prototype must not change).`,
    reference: js`export function parseQuery(query) {
  const result = Object.create(null);
  const decode = text => { const spaced = text.replace(/\+/g, ' '); try { return decodeURIComponent(spaced); } catch { return spaced; } };
  for (const pair of query.replace(/^\?/, '').split('&')) {
    if (!pair) continue;
    const at = pair.indexOf('=');
    const key = decode(at === -1 ? pair : pair.slice(0, at));
    const value = at === -1 ? '' : decode(pair.slice(at + 1));
    if (Object.hasOwn(result, key)) result[key] = [].concat(result[key], value);
    else result[key] = value;
  }
  return result;
}
`,
    test: js`const a = (await import('node:assert/strict')).default;
const { parseQuery } = await import('./solution.mjs');
const plain = v => JSON.parse(JSON.stringify(v));
a.deepEqual(plain(parseQuery('?a=1&b=two')), { a: '1', b: 'two' });
a.deepEqual(plain(parseQuery('a=1&a=2&a=3')), { a: ['1', '2', '3'] });
a.deepEqual(plain(parseQuery('flag&x=')), { flag: '', x: '' });
a.deepEqual(plain(parseQuery('q=hello+world&e=%C3%A9t%C3%A9')), { q: 'hello world', e: 'été' });
a.deepEqual(plain(parseQuery('&&k=v&')), { k: 'v' });
a.deepEqual(plain(parseQuery('eq=a=b')), { eq: 'a=b' });
a.deepEqual(plain(parseQuery('bad=%E0%A4%A&ok=1')), { bad: '%E0%A4%A', ok: '1' });
a.deepEqual(plain(parseQuery('')), {});
const p = parseQuery('__proto__=x&constructor=y');
a.equal(Object.getOwnPropertyDescriptor(p, '__proto__').value, 'x');
a.equal(({}).x, undefined);
a.equal(p.constructor, 'y');
`
  },
  {
    id: 'js-deep-equal',
    language: 'javascript',
    entry: 'deepEqual',
    prompt: `Write a JavaScript function deepEqual(a, b) that returns true when two values are structurally equal.
- Primitives are compared with SameValueZero (NaN equals NaN, 0 equals -0).
- Arrays are equal when they have the same length and equal elements in order.
- Date objects are equal when their time values are equal.
- Plain objects are equal when they have the same own enumerable string keys (in any order) with equal values.
- Values of different kinds are never equal (an array is not equal to an object with the same indices, a Date is not equal to a number).
- It must not overflow on cyclic structures: two values that cycle the same way are equal.`,
    reference: js`export function deepEqual(a, b, seen = new Map()) {
  if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if ((a instanceof Date) !== (b instanceof Date)) return false;
  if (a instanceof Date) return Object.is(a.getTime(), b.getTime()) || a.getTime() === b.getTime();
  if (seen.get(a) === b) return true;
  seen.set(a, b);
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => Object.hasOwn(b, k) && deepEqual(a[k], b[k], seen));
}
`,
    test: js`const a = (await import('node:assert/strict')).default;
const { deepEqual } = await import('./solution.mjs');
a.equal(deepEqual(1, 1), true); a.equal(deepEqual(NaN, NaN), true); a.equal(deepEqual(0, -0), true);
a.equal(deepEqual('1', 1), false); a.equal(deepEqual(null, undefined), false); a.equal(deepEqual(null, {}), false);
a.equal(deepEqual([1, [2, { x: 3 }]], [1, [2, { x: 3 }]]), true);
a.equal(deepEqual([1, 2], [1, 2, 3]), false);
a.equal(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
a.equal(deepEqual({ a: 1 }, { a: 1, b: undefined }), false);
a.equal(deepEqual([1], { 0: 1 }), false);
a.equal(deepEqual(new Date(5), new Date(5)), true);
a.equal(deepEqual(new Date(5), new Date(6)), false);
a.equal(deepEqual(new Date(5), 5), false);
const x = { v: 1 }; x.self = x; const y = { v: 1 }; y.self = y;
a.equal(deepEqual(x, y), true);
const z = { v: 2 }; z.self = z;
a.equal(deepEqual(x, z), false);
`
  },
  {
    id: 'js-evaluate',
    language: 'javascript',
    entry: 'evaluate',
    prompt: `Write a JavaScript function evaluate(expression) that computes an arithmetic expression and returns a number.
- Supported: non-negative decimal numbers (like 3, 0.5, 2.), + - * /, parentheses, unary minus and unary plus, and whitespace anywhere between tokens.
- Usual precedence: unary operators bind tighter than * and /, which bind tighter than + and -. Binary operators are left-associative.
- Throw a SyntaxError for malformed input (empty input, unbalanced parentheses, a dangling operator, unknown characters).
- Throw a RangeError on division by zero.
- Do not use eval, Function or any other dynamic code execution.`,
    reference: js`export function evaluate(expression) {
  const tokens = expression.match(/\d+\.?\d*|\.\d+|[-+*/()]|\S/g) || [];
  let i = 0;
  const peek = () => tokens[i];
  const fail = () => { throw new SyntaxError('Malformed expression'); };
  const primary = () => {
    const t = tokens[i++];
    if (t === undefined) fail();
    if (t === '-') return -primary();
    if (t === '+') return primary();
    if (t === '(') { const v = sum(); if (tokens[i++] !== ')') fail(); return v; }
    if (/^(\d+\.?\d*|\.\d+)$/.test(t)) return Number(t);
    return fail();
  };
  const product = () => {
    let v = primary();
    while (peek() === '*' || peek() === '/') {
      const op = tokens[i++]; const r = primary();
      if (op === '/' && r === 0) throw new RangeError('Division by zero');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const sum = () => {
    let v = product();
    while (peek() === '+' || peek() === '-') { const op = tokens[i++]; const r = product(); v = op === '+' ? v + r : v - r; }
    return v;
  };
  const value = sum();
  if (i !== tokens.length) fail();
  return value;
}
`,
    test: js`const a = (await import('node:assert/strict')).default;
const fs = await import('node:fs');
const { evaluate } = await import('./solution.mjs');
const src = fs.readFileSync(new URL('./solution.mjs', import.meta.url), 'utf8');
a.ok(!/\beval\s*\(|\bFunction\s*\(|new\s+Function/.test(src), 'dynamic code execution is not allowed');
a.equal(evaluate('1 + 2 * 3'), 7);
a.equal(evaluate('(1 + 2) * 3'), 9);
a.equal(evaluate('10 - 4 - 3'), 3);
a.equal(evaluate('8 / 4 / 2'), 1);
a.equal(evaluate('-3 * -(2 + 1)'), 9);
a.equal(evaluate(' 2.5*4 '), 10);
a.equal(evaluate('+.5 + 2.'), 2.5);
a.equal(evaluate('((7))'), 7);
for (const bad of ['', '1 +', '(1 + 2', '1 + 2)', '2 ** 3', '3 $ 4', '()', '1 2']) a.throws(() => evaluate(bad), SyntaxError, bad);
a.throws(() => evaluate('1 / (2 - 2)'), RangeError);
`
  },
  {
    id: 'js-format-bytes',
    language: 'javascript',
    entry: 'formatBytes',
    prompt: `Write a JavaScript function formatBytes(bytes, decimals = 1) that formats a byte count with binary (IEC) units.
- Units: B, KiB, MiB, GiB, TiB, PiB (factor 1024). Values below 1024 are integers shown as "<n> B".
- Otherwise pick the largest unit where the value is at least 1, and format it with exactly \`decimals\` digits after the point, e.g. "1.5 KiB".
- If rounding would display 1024.0 of a unit, move to the next unit instead (1048575 with 1 decimal is "1.0 MiB"). Values beyond PiB stay in PiB.
- Negative numbers keep their sign ("-1.5 KiB").
- Throw a TypeError if bytes is not a finite number, and a RangeError if decimals is not an integer from 0 to 10.`,
    reference: js`export function formatBytes(bytes, decimals = 1) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) throw new TypeError('bytes must be finite');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 10) throw new RangeError('decimals');
  const sign = bytes < 0 ? '-' : '';
  let value = Math.abs(bytes);
  if (value < 1024) return sign + Math.round(value) + ' B';
  const units = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let index = -1;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  if (Number(value.toFixed(decimals)) >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return sign + value.toFixed(decimals) + ' ' + units[index];
}
`,
    test: js`const a = (await import('node:assert/strict')).default;
const { formatBytes } = await import('./solution.mjs');
a.equal(formatBytes(0), '0 B'); a.equal(formatBytes(1023), '1023 B');
a.equal(formatBytes(1024), '1.0 KiB'); a.equal(formatBytes(1536), '1.5 KiB');
a.equal(formatBytes(1048576), '1.0 MiB'); a.equal(formatBytes(1048575), '1.0 MiB');
a.equal(formatBytes(1536, 3), '1.500 KiB'); a.equal(formatBytes(1536, 0), '2 KiB');
a.equal(formatBytes(-1536), '-1.5 KiB');
a.equal(formatBytes(5 * 1024 ** 3), '5.0 GiB');
a.equal(formatBytes(2048 * 1024 ** 5), '2048.0 PiB');
a.throws(() => formatBytes(Infinity), TypeError); a.throws(() => formatBytes('1'), TypeError);
a.throws(() => formatBytes(1, 1.5), RangeError); a.throws(() => formatBytes(1, -1), RangeError);
`
  },
  {
    id: 'js-wildcard',
    language: 'javascript',
    entry: 'matchWildcard',
    prompt: `Write a JavaScript function matchWildcard(pattern, text) that returns true when the whole text matches the pattern.
- "?" matches exactly one character and "*" matches any sequence of characters, including an empty one. Every other character matches itself (no escaping, no character classes).
- Do not build a RegExp from the pattern.
- It must stay fast on adversarial inputs: patterns and texts of a few thousand characters, such as many "*a" groups against a long run of "a", must be answered in well under a second.`,
    reference: js`export function matchWildcard(pattern, text) {
  let p = 0, t = 0, star = -1, mark = 0;
  while (t < text.length) {
    if (p < pattern.length && (pattern[p] === '?' || pattern[p] === text[t])) { p++; t++; }
    else if (p < pattern.length && pattern[p] === '*') { star = p++; mark = t; }
    else if (star !== -1) { p = star + 1; t = ++mark; }
    else return false;
  }
  while (p < pattern.length && pattern[p] === '*') p++;
  return p === pattern.length;
}
`,
    test: js`const a = (await import('node:assert/strict')).default;
const fs = await import('node:fs');
const { matchWildcard } = await import('./solution.mjs');
const src = fs.readFileSync(new URL('./solution.mjs', import.meta.url), 'utf8');
a.ok(!/new\s+RegExp|RegExp\s*\(/.test(src), 'must not build a RegExp');
a.equal(matchWildcard('', ''), true); a.equal(matchWildcard('*', ''), true); a.equal(matchWildcard('?', ''), false);
a.equal(matchWildcard('a*b', 'ab'), true); a.equal(matchWildcard('a*b', 'axxb'), true); a.equal(matchWildcard('a*b', 'axxbc'), false);
a.equal(matchWildcard('*.js', 'app.test.js'), true); a.equal(matchWildcard('?at', 'cat'), true); a.equal(matchWildcard('?at', 'at'), false);
a.equal(matchWildcard('a.c', 'abc'), false); a.equal(matchWildcard('[a]', '[a]'), true); a.equal(matchWildcard('**a**', 'bab'), true);
const start = Date.now();
a.equal(matchWildcard('*a'.repeat(800) + 'b', 'a'.repeat(3000)), false);
a.equal(matchWildcard('*a'.repeat(800), 'a'.repeat(3000)), true);
a.ok(Date.now() - start < 1500, 'too slow on adversarial input');
`
  },
  {
    id: 'js-search-range',
    language: 'javascript',
    entry: 'searchRange',
    prompt: `Write a JavaScript function searchRange(sorted, target) that returns [first, last], the first and last indices of target in an ascending array of numbers, or [-1, -1] if it is absent. It must run in O(log n) time, so do not scan the array linearly.`,
    reference: js`export function searchRange(sorted, target) {
  const bound = strict => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < target || (!strict && sorted[mid] === target)) lo = mid + 1; else hi = mid;
    }
    return lo;
  };
  const first = bound(true);
  if (first === sorted.length || sorted[first] !== target) return [-1, -1];
  return [first, bound(false) - 1];
}
`,
    test: js`const a = (await import('node:assert/strict')).default;
const { searchRange } = await import('./solution.mjs');
a.deepEqual(searchRange([], 1), [-1, -1]);
a.deepEqual(searchRange([5, 7, 7, 8, 8, 10], 8), [3, 4]);
a.deepEqual(searchRange([5, 7, 7, 8, 8, 10], 6), [-1, -1]);
a.deepEqual(searchRange([1], 1), [0, 0]);
a.deepEqual(searchRange([2, 2, 2], 2), [0, 2]);
a.deepEqual(searchRange([1, 2, 3], 4), [-1, -1]);
a.deepEqual(searchRange([1, 2, 3], 0), [-1, -1]);
let reads = 0;
const big = new Proxy(Array.from({ length: 1 << 20 }, (_, i) => i >> 2), { get(t, k) { if (/^\d+$/.test(String(k))) reads++; return Reflect.get(t, k); } });
a.deepEqual(searchRange(big, 1000), [4000, 4003]);
a.ok(reads < 400, 'too many element reads: ' + reads);
`
  }
];
