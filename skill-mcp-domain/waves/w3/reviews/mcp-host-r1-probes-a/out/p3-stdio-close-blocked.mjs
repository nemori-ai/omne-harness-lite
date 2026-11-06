var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/brands.ts
function isText(value) {
  return typeof value === "string" && value.length > 0;
}
function isSha256Text(value) {
  return typeof value === "string" && DIGEST.test(value);
}
function isInstructionsDigest(value) {
  return isSha256Text(value);
}
function isProtocolVersion(value) {
  return isText(value);
}
var DIGEST;
var init_brands = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/brands.ts"() {
    DIGEST = /^sha256:[0-9a-f]{64}$/u;
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/assets/assets/src/identity.ts
var init_identity = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/assets/assets/src/identity.ts"() {
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/common/json-text/src/key-set.ts
function digest(key) {
  let a = SEED_A;
  let b = SEED_B;
  for (let index = 0; index < key.length; index += 1) {
    const unit = key.charCodeAt(index);
    a = Math.imul(a ^ unit, HASH_PRIME_A);
    b = Math.imul(b ^ unit, HASH_PRIME_B);
  }
  return `${a >>> 0}:${b >>> 0}`;
}
var LONG_KEY_UNITS, HASH_PRIME_A, HASH_PRIME_B, SEEDS, SEED_A, SEED_B, KeySet;
var init_key_set = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/common/json-text/src/key-set.ts"() {
    LONG_KEY_UNITS = 256;
    HASH_PRIME_A = 16777619;
    HASH_PRIME_B = 2654435761;
    SEEDS = new DataView(globalThis.crypto.getRandomValues(new Uint8Array(8)).buffer);
    SEED_A = SEEDS.getUint32(0);
    SEED_B = SEEDS.getUint32(4);
    KeySet = class {
      short = /* @__PURE__ */ new Set();
      long = /* @__PURE__ */ new Map();
      size = 0;
      digestOf;
      constructor(digestOf2 = digest) {
        this.digestOf = digestOf2;
      }
      /** Adds the key. Returns false, and keeps the set as it was, when the key is already in it. */
      add(key) {
        if (key.length < LONG_KEY_UNITS) {
          if (this.short.has(key)) return false;
          this.short.add(key);
        } else {
          const id = this.digestOf(key);
          const bucket = this.long.get(id);
          if (bucket === void 0) this.long.set(id, [key]);
          else if (bucket.includes(key)) return false;
          else bucket.push(key);
        }
        this.size += 1;
        return true;
      }
    };
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/scanner.js
function createScanner(text, ignoreTrivia = false) {
  const len = text.length;
  let pos = 0, value = "", tokenOffset = 0, token = 16, lineNumber = 0, lineStartOffset = 0, tokenLineStartOffset = 0, prevTokenLineStartOffset = 0, scanError = 0;
  function scanHexDigits(count, exact) {
    let digits = 0;
    let value2 = 0;
    while (digits < count || !exact) {
      let ch = text.charCodeAt(pos);
      if (ch >= 48 && ch <= 57) {
        value2 = value2 * 16 + ch - 48;
      } else if (ch >= 65 && ch <= 70) {
        value2 = value2 * 16 + ch - 65 + 10;
      } else if (ch >= 97 && ch <= 102) {
        value2 = value2 * 16 + ch - 97 + 10;
      } else {
        break;
      }
      pos++;
      digits++;
    }
    if (digits < count) {
      value2 = -1;
    }
    return value2;
  }
  function setPosition(newPosition) {
    pos = newPosition;
    value = "";
    tokenOffset = 0;
    token = 16;
    scanError = 0;
  }
  function scanNumber() {
    let start = pos;
    if (text.charCodeAt(pos) === 48) {
      pos++;
    } else {
      pos++;
      while (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
      }
    }
    if (pos < text.length && text.charCodeAt(pos) === 46) {
      pos++;
      if (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
        while (pos < text.length && isDigit(text.charCodeAt(pos))) {
          pos++;
        }
      } else {
        scanError = 3;
        return text.substring(start, pos);
      }
    }
    let end = pos;
    if (pos < text.length && (text.charCodeAt(pos) === 69 || text.charCodeAt(pos) === 101)) {
      pos++;
      if (pos < text.length && text.charCodeAt(pos) === 43 || text.charCodeAt(pos) === 45) {
        pos++;
      }
      if (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
        while (pos < text.length && isDigit(text.charCodeAt(pos))) {
          pos++;
        }
        end = pos;
      } else {
        scanError = 3;
      }
    }
    return text.substring(start, end);
  }
  function scanString() {
    let result = "", start = pos;
    while (true) {
      if (pos >= len) {
        result += text.substring(start, pos);
        scanError = 2;
        break;
      }
      const ch = text.charCodeAt(pos);
      if (ch === 34) {
        result += text.substring(start, pos);
        pos++;
        break;
      }
      if (ch === 92) {
        result += text.substring(start, pos);
        pos++;
        if (pos >= len) {
          scanError = 2;
          break;
        }
        const ch2 = text.charCodeAt(pos++);
        switch (ch2) {
          case 34:
            result += '"';
            break;
          case 92:
            result += "\\";
            break;
          case 47:
            result += "/";
            break;
          case 98:
            result += "\b";
            break;
          case 102:
            result += "\f";
            break;
          case 110:
            result += "\n";
            break;
          case 114:
            result += "\r";
            break;
          case 116:
            result += "	";
            break;
          case 117:
            const ch3 = scanHexDigits(4, true);
            if (ch3 >= 0) {
              result += String.fromCharCode(ch3);
            } else {
              scanError = 4;
            }
            break;
          default:
            scanError = 5;
        }
        start = pos;
        continue;
      }
      if (ch >= 0 && ch <= 31) {
        if (isLineBreak(ch)) {
          result += text.substring(start, pos);
          scanError = 2;
          break;
        } else {
          scanError = 6;
        }
      }
      pos++;
    }
    return result;
  }
  function scanNext() {
    value = "";
    scanError = 0;
    tokenOffset = pos;
    lineStartOffset = lineNumber;
    prevTokenLineStartOffset = tokenLineStartOffset;
    if (pos >= len) {
      tokenOffset = len;
      return token = 17;
    }
    let code = text.charCodeAt(pos);
    if (isWhiteSpace(code)) {
      do {
        pos++;
        value += String.fromCharCode(code);
        code = text.charCodeAt(pos);
      } while (isWhiteSpace(code));
      return token = 15;
    }
    if (isLineBreak(code)) {
      pos++;
      value += String.fromCharCode(code);
      if (code === 13 && text.charCodeAt(pos) === 10) {
        pos++;
        value += "\n";
      }
      lineNumber++;
      tokenLineStartOffset = pos;
      return token = 14;
    }
    switch (code) {
      // tokens: []{}:,
      case 123:
        pos++;
        return token = 1;
      case 125:
        pos++;
        return token = 2;
      case 91:
        pos++;
        return token = 3;
      case 93:
        pos++;
        return token = 4;
      case 58:
        pos++;
        return token = 6;
      case 44:
        pos++;
        return token = 5;
      // strings
      case 34:
        pos++;
        value = scanString();
        return token = 10;
      // comments
      case 47:
        const start = pos - 1;
        if (text.charCodeAt(pos + 1) === 47) {
          pos += 2;
          while (pos < len) {
            if (isLineBreak(text.charCodeAt(pos))) {
              break;
            }
            pos++;
          }
          value = text.substring(start, pos);
          return token = 12;
        }
        if (text.charCodeAt(pos + 1) === 42) {
          pos += 2;
          const safeLength = len - 1;
          let commentClosed = false;
          while (pos < safeLength) {
            const ch = text.charCodeAt(pos);
            if (ch === 42 && text.charCodeAt(pos + 1) === 47) {
              pos += 2;
              commentClosed = true;
              break;
            }
            pos++;
            if (isLineBreak(ch)) {
              if (ch === 13 && text.charCodeAt(pos) === 10) {
                pos++;
              }
              lineNumber++;
              tokenLineStartOffset = pos;
            }
          }
          if (!commentClosed) {
            pos++;
            scanError = 1;
          }
          value = text.substring(start, pos);
          return token = 13;
        }
        value += String.fromCharCode(code);
        pos++;
        return token = 16;
      // numbers
      case 45:
        value += String.fromCharCode(code);
        pos++;
        if (pos === len || !isDigit(text.charCodeAt(pos))) {
          return token = 16;
        }
      // found a minus, followed by a number so
      // we fall through to proceed with scanning
      // numbers
      case 48:
      case 49:
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57:
        value += scanNumber();
        return token = 11;
      // literals and unknown symbols
      default:
        while (pos < len && isUnknownContentCharacter(code)) {
          pos++;
          code = text.charCodeAt(pos);
        }
        if (tokenOffset !== pos) {
          value = text.substring(tokenOffset, pos);
          switch (value) {
            case "true":
              return token = 8;
            case "false":
              return token = 9;
            case "null":
              return token = 7;
          }
          return token = 16;
        }
        value += String.fromCharCode(code);
        pos++;
        return token = 16;
    }
  }
  function isUnknownContentCharacter(code) {
    if (isWhiteSpace(code) || isLineBreak(code)) {
      return false;
    }
    switch (code) {
      case 125:
      case 93:
      case 123:
      case 91:
      case 34:
      case 58:
      case 44:
      case 47:
        return false;
    }
    return true;
  }
  function scanNextNonTrivia() {
    let result;
    do {
      result = scanNext();
    } while (result >= 12 && result <= 15);
    return result;
  }
  return {
    setPosition,
    getPosition: () => pos,
    scan: ignoreTrivia ? scanNextNonTrivia : scanNext,
    getToken: () => token,
    getTokenValue: () => value,
    getTokenOffset: () => tokenOffset,
    getTokenLength: () => pos - tokenOffset,
    getTokenStartLine: () => lineStartOffset,
    getTokenStartCharacter: () => tokenOffset - prevTokenLineStartOffset,
    getTokenError: () => scanError
  };
}
function isWhiteSpace(ch) {
  return ch === 32 || ch === 9;
}
function isLineBreak(ch) {
  return ch === 10 || ch === 13;
}
function isDigit(ch) {
  return ch >= 48 && ch <= 57;
}
var CharacterCodes;
var init_scanner = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/scanner.js"() {
    "use strict";
    (function(CharacterCodes2) {
      CharacterCodes2[CharacterCodes2["lineFeed"] = 10] = "lineFeed";
      CharacterCodes2[CharacterCodes2["carriageReturn"] = 13] = "carriageReturn";
      CharacterCodes2[CharacterCodes2["space"] = 32] = "space";
      CharacterCodes2[CharacterCodes2["_0"] = 48] = "_0";
      CharacterCodes2[CharacterCodes2["_1"] = 49] = "_1";
      CharacterCodes2[CharacterCodes2["_2"] = 50] = "_2";
      CharacterCodes2[CharacterCodes2["_3"] = 51] = "_3";
      CharacterCodes2[CharacterCodes2["_4"] = 52] = "_4";
      CharacterCodes2[CharacterCodes2["_5"] = 53] = "_5";
      CharacterCodes2[CharacterCodes2["_6"] = 54] = "_6";
      CharacterCodes2[CharacterCodes2["_7"] = 55] = "_7";
      CharacterCodes2[CharacterCodes2["_8"] = 56] = "_8";
      CharacterCodes2[CharacterCodes2["_9"] = 57] = "_9";
      CharacterCodes2[CharacterCodes2["a"] = 97] = "a";
      CharacterCodes2[CharacterCodes2["b"] = 98] = "b";
      CharacterCodes2[CharacterCodes2["c"] = 99] = "c";
      CharacterCodes2[CharacterCodes2["d"] = 100] = "d";
      CharacterCodes2[CharacterCodes2["e"] = 101] = "e";
      CharacterCodes2[CharacterCodes2["f"] = 102] = "f";
      CharacterCodes2[CharacterCodes2["g"] = 103] = "g";
      CharacterCodes2[CharacterCodes2["h"] = 104] = "h";
      CharacterCodes2[CharacterCodes2["i"] = 105] = "i";
      CharacterCodes2[CharacterCodes2["j"] = 106] = "j";
      CharacterCodes2[CharacterCodes2["k"] = 107] = "k";
      CharacterCodes2[CharacterCodes2["l"] = 108] = "l";
      CharacterCodes2[CharacterCodes2["m"] = 109] = "m";
      CharacterCodes2[CharacterCodes2["n"] = 110] = "n";
      CharacterCodes2[CharacterCodes2["o"] = 111] = "o";
      CharacterCodes2[CharacterCodes2["p"] = 112] = "p";
      CharacterCodes2[CharacterCodes2["q"] = 113] = "q";
      CharacterCodes2[CharacterCodes2["r"] = 114] = "r";
      CharacterCodes2[CharacterCodes2["s"] = 115] = "s";
      CharacterCodes2[CharacterCodes2["t"] = 116] = "t";
      CharacterCodes2[CharacterCodes2["u"] = 117] = "u";
      CharacterCodes2[CharacterCodes2["v"] = 118] = "v";
      CharacterCodes2[CharacterCodes2["w"] = 119] = "w";
      CharacterCodes2[CharacterCodes2["x"] = 120] = "x";
      CharacterCodes2[CharacterCodes2["y"] = 121] = "y";
      CharacterCodes2[CharacterCodes2["z"] = 122] = "z";
      CharacterCodes2[CharacterCodes2["A"] = 65] = "A";
      CharacterCodes2[CharacterCodes2["B"] = 66] = "B";
      CharacterCodes2[CharacterCodes2["C"] = 67] = "C";
      CharacterCodes2[CharacterCodes2["D"] = 68] = "D";
      CharacterCodes2[CharacterCodes2["E"] = 69] = "E";
      CharacterCodes2[CharacterCodes2["F"] = 70] = "F";
      CharacterCodes2[CharacterCodes2["G"] = 71] = "G";
      CharacterCodes2[CharacterCodes2["H"] = 72] = "H";
      CharacterCodes2[CharacterCodes2["I"] = 73] = "I";
      CharacterCodes2[CharacterCodes2["J"] = 74] = "J";
      CharacterCodes2[CharacterCodes2["K"] = 75] = "K";
      CharacterCodes2[CharacterCodes2["L"] = 76] = "L";
      CharacterCodes2[CharacterCodes2["M"] = 77] = "M";
      CharacterCodes2[CharacterCodes2["N"] = 78] = "N";
      CharacterCodes2[CharacterCodes2["O"] = 79] = "O";
      CharacterCodes2[CharacterCodes2["P"] = 80] = "P";
      CharacterCodes2[CharacterCodes2["Q"] = 81] = "Q";
      CharacterCodes2[CharacterCodes2["R"] = 82] = "R";
      CharacterCodes2[CharacterCodes2["S"] = 83] = "S";
      CharacterCodes2[CharacterCodes2["T"] = 84] = "T";
      CharacterCodes2[CharacterCodes2["U"] = 85] = "U";
      CharacterCodes2[CharacterCodes2["V"] = 86] = "V";
      CharacterCodes2[CharacterCodes2["W"] = 87] = "W";
      CharacterCodes2[CharacterCodes2["X"] = 88] = "X";
      CharacterCodes2[CharacterCodes2["Y"] = 89] = "Y";
      CharacterCodes2[CharacterCodes2["Z"] = 90] = "Z";
      CharacterCodes2[CharacterCodes2["asterisk"] = 42] = "asterisk";
      CharacterCodes2[CharacterCodes2["backslash"] = 92] = "backslash";
      CharacterCodes2[CharacterCodes2["closeBrace"] = 125] = "closeBrace";
      CharacterCodes2[CharacterCodes2["closeBracket"] = 93] = "closeBracket";
      CharacterCodes2[CharacterCodes2["colon"] = 58] = "colon";
      CharacterCodes2[CharacterCodes2["comma"] = 44] = "comma";
      CharacterCodes2[CharacterCodes2["dot"] = 46] = "dot";
      CharacterCodes2[CharacterCodes2["doubleQuote"] = 34] = "doubleQuote";
      CharacterCodes2[CharacterCodes2["minus"] = 45] = "minus";
      CharacterCodes2[CharacterCodes2["openBrace"] = 123] = "openBrace";
      CharacterCodes2[CharacterCodes2["openBracket"] = 91] = "openBracket";
      CharacterCodes2[CharacterCodes2["plus"] = 43] = "plus";
      CharacterCodes2[CharacterCodes2["slash"] = 47] = "slash";
      CharacterCodes2[CharacterCodes2["formFeed"] = 12] = "formFeed";
      CharacterCodes2[CharacterCodes2["tab"] = 9] = "tab";
    })(CharacterCodes || (CharacterCodes = {}));
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/string-intern.js
var cachedSpaces, maxCachedValues, cachedBreakLinesWithSpaces;
var init_string_intern = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/string-intern.js"() {
    cachedSpaces = new Array(20).fill(0).map((_, index) => {
      return " ".repeat(index);
    });
    maxCachedValues = 200;
    cachedBreakLinesWithSpaces = {
      " ": {
        "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
          return "\n" + " ".repeat(index);
        }),
        "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
          return "\r" + " ".repeat(index);
        }),
        "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
          return "\r\n" + " ".repeat(index);
        })
      },
      "	": {
        "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
          return "\n" + "	".repeat(index);
        }),
        "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
          return "\r" + "	".repeat(index);
        }),
        "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
          return "\r\n" + "	".repeat(index);
        })
      }
    };
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/format.js
var init_format = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/format.js"() {
    "use strict";
    init_scanner();
    init_string_intern();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/parser.js
var ParseOptions;
var init_parser = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/parser.js"() {
    "use strict";
    init_scanner();
    (function(ParseOptions2) {
      ParseOptions2.DEFAULT = {
        allowTrailingComma: false
      };
    })(ParseOptions || (ParseOptions = {}));
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/edit.js
var init_edit = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/edit.js"() {
    "use strict";
    init_format();
    init_parser();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/main.js
var createScanner2, ScanError, SyntaxKind, ParseErrorCode;
var init_main = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/main.js"() {
    "use strict";
    init_format();
    init_edit();
    init_scanner();
    init_parser();
    createScanner2 = createScanner;
    (function(ScanError2) {
      ScanError2[ScanError2["None"] = 0] = "None";
      ScanError2[ScanError2["UnexpectedEndOfComment"] = 1] = "UnexpectedEndOfComment";
      ScanError2[ScanError2["UnexpectedEndOfString"] = 2] = "UnexpectedEndOfString";
      ScanError2[ScanError2["UnexpectedEndOfNumber"] = 3] = "UnexpectedEndOfNumber";
      ScanError2[ScanError2["InvalidUnicode"] = 4] = "InvalidUnicode";
      ScanError2[ScanError2["InvalidEscapeCharacter"] = 5] = "InvalidEscapeCharacter";
      ScanError2[ScanError2["InvalidCharacter"] = 6] = "InvalidCharacter";
    })(ScanError || (ScanError = {}));
    (function(SyntaxKind2) {
      SyntaxKind2[SyntaxKind2["OpenBraceToken"] = 1] = "OpenBraceToken";
      SyntaxKind2[SyntaxKind2["CloseBraceToken"] = 2] = "CloseBraceToken";
      SyntaxKind2[SyntaxKind2["OpenBracketToken"] = 3] = "OpenBracketToken";
      SyntaxKind2[SyntaxKind2["CloseBracketToken"] = 4] = "CloseBracketToken";
      SyntaxKind2[SyntaxKind2["CommaToken"] = 5] = "CommaToken";
      SyntaxKind2[SyntaxKind2["ColonToken"] = 6] = "ColonToken";
      SyntaxKind2[SyntaxKind2["NullKeyword"] = 7] = "NullKeyword";
      SyntaxKind2[SyntaxKind2["TrueKeyword"] = 8] = "TrueKeyword";
      SyntaxKind2[SyntaxKind2["FalseKeyword"] = 9] = "FalseKeyword";
      SyntaxKind2[SyntaxKind2["StringLiteral"] = 10] = "StringLiteral";
      SyntaxKind2[SyntaxKind2["NumericLiteral"] = 11] = "NumericLiteral";
      SyntaxKind2[SyntaxKind2["LineCommentTrivia"] = 12] = "LineCommentTrivia";
      SyntaxKind2[SyntaxKind2["BlockCommentTrivia"] = 13] = "BlockCommentTrivia";
      SyntaxKind2[SyntaxKind2["LineBreakTrivia"] = 14] = "LineBreakTrivia";
      SyntaxKind2[SyntaxKind2["Trivia"] = 15] = "Trivia";
      SyntaxKind2[SyntaxKind2["Unknown"] = 16] = "Unknown";
      SyntaxKind2[SyntaxKind2["EOF"] = 17] = "EOF";
    })(SyntaxKind || (SyntaxKind = {}));
    (function(ParseErrorCode2) {
      ParseErrorCode2[ParseErrorCode2["InvalidSymbol"] = 1] = "InvalidSymbol";
      ParseErrorCode2[ParseErrorCode2["InvalidNumberFormat"] = 2] = "InvalidNumberFormat";
      ParseErrorCode2[ParseErrorCode2["PropertyNameExpected"] = 3] = "PropertyNameExpected";
      ParseErrorCode2[ParseErrorCode2["ValueExpected"] = 4] = "ValueExpected";
      ParseErrorCode2[ParseErrorCode2["ColonExpected"] = 5] = "ColonExpected";
      ParseErrorCode2[ParseErrorCode2["CommaExpected"] = 6] = "CommaExpected";
      ParseErrorCode2[ParseErrorCode2["CloseBraceExpected"] = 7] = "CloseBraceExpected";
      ParseErrorCode2[ParseErrorCode2["CloseBracketExpected"] = 8] = "CloseBracketExpected";
      ParseErrorCode2[ParseErrorCode2["EndOfFileExpected"] = 9] = "EndOfFileExpected";
      ParseErrorCode2[ParseErrorCode2["InvalidCommentToken"] = 10] = "InvalidCommentToken";
      ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfComment"] = 11] = "UnexpectedEndOfComment";
      ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfString"] = 12] = "UnexpectedEndOfString";
      ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfNumber"] = 13] = "UnexpectedEndOfNumber";
      ParseErrorCode2[ParseErrorCode2["InvalidUnicode"] = 14] = "InvalidUnicode";
      ParseErrorCode2[ParseErrorCode2["InvalidEscapeCharacter"] = 15] = "InvalidEscapeCharacter";
      ParseErrorCode2[ParseErrorCode2["InvalidCharacter"] = 16] = "InvalidCharacter";
    })(ParseErrorCode || (ParseErrorCode = {}));
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/common/json-text/src/read.ts
function isValueStart(token) {
  return VALUE_STARTS.has(token);
}
function readJsonText(text, limits) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  const parsed = parseLimits(limits);
  if (!text.isWellFormed()) throw new TypeError("text must not contain a lone surrogate");
  return readDecoded(text, utf8Length(text), parsed);
}
function readDecoded(text, byteLength, limits) {
  if (text.startsWith("\uFEFF")) return { kind: "bom" };
  if (byteLength > limits.maxBytes) return budget("bytes");
  if (/^[ \t\n\r]*$/.test(text)) return { kind: "empty" };
  return scanDocument(text, limits);
}
function scanDocument(text, limits) {
  const scanner = createScanner2(text, false);
  const stack = [];
  let root;
  let items = 0;
  const complete = (value) => {
    const parent = stack.at(-1);
    if (parent === void 0) {
      root = value;
    } else if (parent.kind === "array") {
      parent.items.push(value);
      parent.next = "comma";
    } else {
      parent.entries.push({ key: parent.key, value });
      parent.next = "comma";
    }
  };
  const close = (frame) => {
    stack.pop();
    complete(
      frame.kind === "array" ? { kind: "array", items: frame.items } : { kind: "object", entries: frame.entries }
    );
  };
  const admit = (token) => {
    const opensContainer = token === TOKEN.openBrace || token === TOKEN.openBracket;
    if (opensContainer && stack.length + 1 > limits.maxDepth) return budget("depth");
    items += 1;
    if (items > limits.maxItems) return budget("items");
    return void 0;
  };
  const startValue = (token) => {
    if (!isValueStart(token)) return syntax("token");
    const overBudget = admit(token);
    if (overBudget !== void 0) return overBudget;
    switch (token) {
      case TOKEN.openBracket:
        stack.push({ kind: "array", items: [], next: "first-item" });
        return void 0;
      case TOKEN.openBrace:
        stack.push({ kind: "object", entries: [], keys: new KeySet(), key: "", next: "first-key" });
        return void 0;
      case TOKEN.string: {
        const value = readString(scanner, text, limits.maxStringLength);
        if (typeof value !== "string") return value;
        complete({ kind: "string", value });
        return void 0;
      }
      case TOKEN.number: {
        const lexeme = readNumber(text, scanner.getTokenOffset(), limits.maxNumberLength);
        if (typeof lexeme !== "string") return lexeme;
        complete({ kind: "number", lexeme });
        return void 0;
      }
      default:
        complete(literal(token));
        return void 0;
    }
  };
  const stepArray = (frame, token) => {
    switch (frame.next) {
      case "comma":
        if (token === TOKEN.comma) {
          frame.next = "item";
          return void 0;
        }
        if (token !== TOKEN.closeBracket) return syntax("token");
        close(frame);
        return void 0;
      case "first-item":
        if (token !== TOKEN.closeBracket) return startValue(token);
        close(frame);
        return void 0;
      case "item":
        if (token === TOKEN.closeBracket) return syntax("trailing-comma");
        return startValue(token);
      default: {
        const unreachable = frame.next;
        return unreachable;
      }
    }
  };
  const stepKey = (frame, token) => {
    if (token === TOKEN.closeBrace) {
      if (frame.next === "key") return syntax("trailing-comma");
      close(frame);
      return void 0;
    }
    if (token !== TOKEN.string) return syntax("token");
    const key = readString(scanner, text, limits.maxStringLength);
    if (typeof key !== "string") return key;
    if (frame.keys.size + 1 > limits.maxMembers) return budget("members");
    if (!frame.keys.add(key)) return { kind: "duplicate-key", path: pathTo(stack), key };
    frame.key = key;
    frame.next = "colon";
    return void 0;
  };
  const stepAfterMember = (frame, token) => {
    if (token === TOKEN.comma) {
      frame.next = "key";
      return void 0;
    }
    if (token !== TOKEN.closeBrace) return syntax("token");
    close(frame);
    return void 0;
  };
  const stepObject = (frame, token) => {
    switch (frame.next) {
      case "comma":
        return stepAfterMember(frame, token);
      case "first-key":
      case "key":
        return stepKey(frame, token);
      case "colon":
        if (token !== TOKEN.colon) return syntax("token");
        frame.next = "value";
        return void 0;
      case "value":
        return startValue(token);
      default: {
        const unreachable = frame.next;
        return unreachable;
      }
    }
  };
  const step = (top, token) => {
    if (top === void 0) return startValue(token);
    return top.kind === "array" ? stepArray(top, token) : stepObject(top, token);
  };
  for (; ; ) {
    const token = scanner.scan();
    if (token === TOKEN.whitespace || token === TOKEN.lineBreak) continue;
    if (token === TOKEN.lineComment || token === TOKEN.blockComment) return syntax("comment");
    const top = stack.at(-1);
    if (top === void 0 && root !== void 0)
      return token === TOKEN.eof ? { kind: "ok", value: root } : syntax("trailing-content");
    if (token === TOKEN.eof) return syntax("truncated");
    const failure = step(top, token);
    if (failure !== void 0) return failure;
  }
}
function literal(token) {
  switch (token) {
    case TOKEN.null:
      return { kind: "null" };
    case TOKEN.true:
      return { kind: "boolean", value: true };
    case TOKEN.false:
      return { kind: "boolean", value: false };
    default: {
      const unreachable = token;
      return unreachable;
    }
  }
}
function pathTo(stack) {
  return stack.slice(0, -1).map((frame) => frame.kind === "array" ? frame.items.length : frame.key);
}
function readString(scanner, text, maxLength) {
  const error = scanner.getTokenError();
  const unterminated = error === SCAN_END_OF_STRING && scanner.getPosition() === text.length;
  if (error !== SCAN_OK && !unterminated) return syntax("token");
  const raw = text.slice(scanner.getTokenOffset(), scanner.getPosition());
  if (!isJsonStringPrefix(raw)) return syntax("token");
  const value = scanner.getTokenValue();
  if (value.length > maxLength) return budget("string");
  if (unterminated) return syntax("truncated");
  return value;
}
function isJsonStringPrefix(raw) {
  if (!raw.startsWith('"')) return false;
  let index = 1;
  while (index < raw.length) {
    const code = raw.charCodeAt(index);
    if (code === 34) return index === raw.length - 1;
    if (code < 32) return false;
    if (code !== 92) {
      index += 1;
      continue;
    }
    index += 1;
    if (index >= raw.length) return true;
    const escaped = raw.charAt(index);
    if ('"\\/bfnrt'.includes(escaped)) {
      index += 1;
      continue;
    }
    if (escaped !== "u") return false;
    index += 1;
    let digits = 0;
    while (digits < 4 && index < raw.length && "0123456789abcdefABCDEF".includes(raw.charAt(index))) {
      index += 1;
      digits += 1;
    }
    if (digits < 4) return index === raw.length;
  }
  return true;
}
function readNumber(text, offset, maxLength) {
  let end = offset;
  while (end < text.length && "0123456789+-.eE".includes(text.charAt(end))) end += 1;
  const lexeme = text.slice(offset, end);
  if (!RFC_8259_NUMBER.test(lexeme)) return syntax("token");
  if (lexeme.length > maxLength) return budget("number");
  return lexeme;
}
function syntax(reason) {
  return { kind: "syntax", reason };
}
function budget(name) {
  return { kind: "budget", name };
}
function utf8Length(text) {
  let length = 0;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    length += unit < 128 ? 1 : unit < 2048 || unit >= 55296 && unit <= 57343 ? 2 : 3;
  }
  return length;
}
function parseLimits(limits) {
  if (typeof limits !== "object" || limits === null) throw new TypeError("limits must be an object");
  const limit = (field2) => {
    const value = Reflect.get(limits, field2);
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
      throw new TypeError(
        `limits.${field2} must be an integer from 1 through Number.MAX_SAFE_INTEGER`
      );
    return value;
  };
  return {
    maxBytes: limit("maxBytes"),
    maxDepth: limit("maxDepth"),
    maxItems: limit("maxItems"),
    maxMembers: limit("maxMembers"),
    maxStringLength: limit("maxStringLength"),
    maxNumberLength: limit("maxNumberLength")
  };
}
var TOKEN, SCAN_OK, SCAN_END_OF_STRING, VALUE_START_TOKENS, VALUE_STARTS, utf8, RFC_8259_NUMBER;
var init_read = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/common/json-text/src/read.ts"() {
    init_main();
    init_key_set();
    TOKEN = {
      openBrace: 1,
      closeBrace: 2,
      openBracket: 3,
      closeBracket: 4,
      comma: 5,
      colon: 6,
      null: 7,
      true: 8,
      false: 9,
      string: 10,
      number: 11,
      lineComment: 12,
      blockComment: 13,
      lineBreak: 14,
      whitespace: 15,
      eof: 17
    };
    SCAN_OK = 0;
    SCAN_END_OF_STRING = 2;
    VALUE_START_TOKENS = [
      TOKEN.openBrace,
      TOKEN.openBracket,
      TOKEN.null,
      TOKEN.true,
      TOKEN.false,
      TOKEN.string,
      TOKEN.number
    ];
    VALUE_STARTS = new Set(VALUE_START_TOKENS);
    utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    RFC_8259_NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/common/json-text/src/judge.ts
var init_judge = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/common/json-text/src/judge.ts"() {
    init_key_set();
    init_read();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/common/json-text/src/write.ts
function malformed(what) {
  return new TypeError(`value is not a json-text tree: ${what}`);
}
function field(node, key) {
  return Reflect.get(node, key);
}
function pushItems(items, pending) {
  if (!Array.isArray(items)) throw malformed("items is not a list");
  for (let index = items.length - 1; index >= 0; index -= 1) {
    pending.push({ node: items[index] });
    if (index > 0) pending.push({ text: "," });
  }
}
function pushEntries(entries, pending) {
  if (!Array.isArray(entries)) throw malformed("entries is not a list");
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (typeof entry !== "object" || entry === null) throw malformed("an entry is not an object");
    const key = field(entry, "key");
    if (typeof key !== "string") throw malformed("an entry key is not a string");
    pending.push({ node: field(entry, "value") }, { text: `${JSON.stringify(key)}:` });
    if (index > 0) pending.push({ text: "," });
  }
}
function booleanText(node) {
  const value = field(node, "value");
  if (typeof value !== "boolean") throw malformed("a boolean value is not a boolean");
  return value ? "true" : "false";
}
function stringText(node) {
  const value = field(node, "value");
  if (typeof value !== "string") throw malformed("a string value is not a string");
  return JSON.stringify(value);
}
function numberText(node) {
  const lexeme = field(node, "lexeme");
  if (typeof lexeme !== "string" || !RFC_8259_NUMBER.test(lexeme))
    throw malformed("a number lexeme is not a JSON number");
  return lexeme;
}
function leafText(kind, node) {
  switch (kind) {
    case "null":
      return "null";
    case "boolean":
      return booleanText(node);
    case "string":
      return stringText(node);
    case "number":
      return numberText(node);
    default:
      throw malformed("a node has no known kind");
  }
}
function open(node, pending) {
  if (typeof node !== "object" || node === null) throw malformed("a node is not an object");
  const kind = field(node, "kind");
  switch (kind) {
    case "array":
      pending.push({ text: "]" });
      pushItems(field(node, "items"), pending);
      return "[";
    case "object":
      pending.push({ text: "}" });
      pushEntries(field(node, "entries"), pending);
      return "{";
    default:
      return leafText(kind, node);
  }
}
function writeJsonText(value) {
  const parts = [];
  const pending = [{ node: value }];
  for (let next = pending.pop(); next !== void 0; next = pending.pop())
    parts.push("text" in next ? next.text : open(next.node, pending));
  return parts.join("");
}
var init_write = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/common/json-text/src/write.ts"() {
    init_read();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/common/json-text/src/index.ts
var init_src = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/common/json-text/src/index.ts"() {
    init_judge();
    init_read();
    init_write();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/assets/assets/src/read-body.ts
function readBodyText(text, limits) {
  const read = readJsonText(text, limits);
  if (read.kind !== "ok") return read;
  const shot = copyTree(read.value, true);
  if (shot === void 0) throw new TypeError("read document could not be copied");
  return { kind: "ok", value: shot };
}
function copyTree(root, trust) {
  const seen = /* @__PURE__ */ new WeakSet();
  const opened = open2(root, seen, trust);
  if (opened === void 0) return void 0;
  if (opened.kind === "leaf") return opened.node;
  const stack = [opened.work];
  let done;
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame === void 0) return void 0;
    if (frame.index >= frame.source.length) {
      done = finish(frame, trust);
      stack.pop();
      const parent = stack[stack.length - 1];
      if (parent !== void 0 && done !== void 0 && !attach(parent, done)) return void 0;
      continue;
    }
    const childSource = sourceChild(frame);
    frame.index += 1;
    if (childSource === void 0) return void 0;
    const child = open2(childSource, seen, trust);
    if (child === void 0) return void 0;
    if (child.kind === "leaf") {
      if (!attach(frame, child.node)) return void 0;
    } else stack.push(child.work);
  }
  return done;
}
function open2(source, seen, trust) {
  if (typeof source !== "object" || source === null) return void 0;
  if (seen.has(source)) return void 0;
  seen.add(source);
  if (!("kind" in source)) return void 0;
  if (source.kind === "null") return { kind: "leaf", node: keep({ kind: "null" }, trust) };
  if (source.kind === "boolean") {
    if (!("value" in source) || typeof source.value !== "boolean") return void 0;
    return { kind: "leaf", node: keep({ kind: "boolean", value: source.value }, trust) };
  }
  if (source.kind === "string") {
    if (!("value" in source) || typeof source.value !== "string") return void 0;
    return { kind: "leaf", node: keep({ kind: "string", value: source.value }, trust) };
  }
  if (source.kind === "number") {
    if (!("lexeme" in source) || typeof source.lexeme !== "string") return void 0;
    return { kind: "leaf", node: keep({ kind: "number", lexeme: source.lexeme }, trust) };
  }
  if (source.kind === "array") {
    if (!("items" in source) || !Array.isArray(source.items)) return void 0;
    return { kind: "work", work: { kind: "array", items: [], source: source.items, index: 0 } };
  }
  if (source.kind === "object") {
    if (!("entries" in source) || !Array.isArray(source.entries)) return void 0;
    return { kind: "work", work: { kind: "object", entries: [], source: source.entries, index: 0 } };
  }
  return void 0;
}
function sourceChild(frame) {
  if (frame.kind === "array") return frame.source[frame.index];
  const entry = frame.source[frame.index];
  if (typeof entry !== "object" || entry === null || !("key" in entry) || typeof entry.key !== "string")
    return void 0;
  if (!("value" in entry)) return void 0;
  return entry.value;
}
function attach(frame, child) {
  if (frame.kind === "array") {
    frame.items.push(child);
    return true;
  }
  const entry = frame.source[frame.index - 1];
  if (typeof entry !== "object" || entry === null || !("key" in entry) || typeof entry.key !== "string")
    return false;
  frame.entries.push(Object.freeze({ key: entry.key, value: child }));
  return true;
}
function finish(frame, trust) {
  if (frame.kind === "array")
    return keep({ kind: "array", items: Object.freeze(frame.items) }, trust);
  return keep({ kind: "object", entries: Object.freeze(frame.entries) }, trust);
}
function keep(value, trust) {
  const frozen = Object.freeze(value);
  if (trust) owned.add(frozen);
  return frozen;
}
var owned;
var init_read_body = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/assets/assets/src/read-body.ts"() {
    init_src();
    owned = /* @__PURE__ */ new WeakSet();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/assets/assets/src/registry.ts
var init_registry = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/assets/assets/src/registry.ts"() {
    init_read_body();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/assets/assets/src/adoption.ts
var init_adoption = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/assets/assets/src/adoption.ts"() {
    init_read_body();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/assets/assets/src/index.ts
var init_src2 = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/assets/assets/src/index.ts"() {
    init_identity();
    init_read_body();
    init_registry();
    init_adoption();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/common/operation-result/src/index.ts
var init_src3 = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/common/operation-result/src/index.ts"() {
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/endpoint-schema.ts
var ENDPOINT_BODY_SCHEMA;
var init_endpoint_schema = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/endpoint-schema.ts"() {
    ENDPOINT_BODY_SCHEMA = '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"urn:omne-harness:mcp-contract:endpoint-body:1","title":"MCP endpoint body","description":"The body of an MCP asset. The remote address, the credential and the connect timeout are settings, not body members. The parser of @omne-harness/mcp-contract decides validity; this schema documents the same rules.","type":"object","additionalProperties":false,"required":["name","transport","auth"],"properties":{"name":{"type":"string","minLength":1,"maxLength":64,"pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$"},"transport":{"enum":["stdio","streamable-http"]},"auth":{"enum":["none","static","oauth"]},"launch":{"$ref":"#/$defs/launch"}},"allOf":[{"$comment":"stdio requires launch; Streamable HTTP forbids it.","if":{"properties":{"transport":{"const":"stdio"}},"required":["transport"]},"then":{"required":["launch"]},"else":{"not":{"required":["launch"]}}},{"$comment":"stdio does not use OAuth.","if":{"properties":{"transport":{"const":"stdio"}},"required":["transport"]},"then":{"properties":{"auth":{"enum":["none","static"]}}}},{"$comment":"Without authentication no variable comes from a credential.","if":{"properties":{"auth":{"const":"none"}},"required":["auth"]},"then":{"properties":{"launch":{"properties":{"env":{"items":{"properties":{"source":{"const":"setting"}}}}}}}}}],"$defs":{"launch":{"type":"object","additionalProperties":false,"required":["command"],"properties":{"command":{"type":"string","minLength":1},"args":{"type":"array","items":{"type":"string"}},"cwd":{"type":"string","minLength":1},"env":{"description":"Variable names are unique.","type":"array","items":{"$ref":"#/$defs/environment"}},"facilities":{"type":"array","uniqueItems":true,"items":{"type":"string","pattern":"^[a-z][a-z0-9-]{0,31}$"}}}},"environment":{"type":"object","additionalProperties":false,"required":["name","source"],"properties":{"name":{"type":"string","pattern":"^[A-Za-z_][A-Za-z0-9_]*$"},"source":{"enum":["setting","credential"]}}}}}';
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/order.ts
var init_order = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/order.ts"() {
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/json.ts
function isObject(value) {
  return value?.kind === "object";
}
function member(object, key) {
  return object.entries.find((entry) => entry.key === key)?.value;
}
function textOf(value) {
  return value?.kind === "string" ? value.value : void 0;
}
function itemsOf(value) {
  return value?.kind === "array" ? value.items : void 0;
}
var init_json = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/json.ts"() {
    init_src();
    init_order();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/endpoint.ts
var SCHEMA_LIMITS, schemaRead, schema;
var init_endpoint = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/endpoint.ts"() {
    init_src2();
    init_src();
    init_src3();
    init_endpoint_schema();
    init_json();
    init_brands();
    SCHEMA_LIMITS = {
      maxBytes: 2e4,
      maxDepth: 16,
      maxItems: 1e3,
      maxMembers: 32,
      maxStringLength: 1e3,
      maxNumberLength: 20
    };
    schemaRead = readBodyText(ENDPOINT_BODY_SCHEMA, SCHEMA_LIMITS);
    if (schemaRead.kind !== "ok") throw new TypeError("the MCP endpoint body schema is not JSON");
    schema = schemaRead.value;
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/digest.ts
import { createHash } from "node:crypto";
function digestOf(text, guard) {
  const digest2 = `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
  if (!guard(digest2)) throw new TypeError("SHA-256 did not give 64 hex digits");
  return digest2;
}
var init_digest = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/digest.ts"() {
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/listing.ts
var init_listing = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/listing.ts"() {
    init_src();
    init_src3();
    init_brands();
    init_digest();
    init_json();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/catalog.ts
var init_catalog = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/catalog.ts"() {
    init_src3();
    init_brands();
    init_listing();
    init_order();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/args.ts
var init_args = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/args.ts"() {
    init_json();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/common/content-block/src/index.ts
function admitWritten(kind, value, id, visibility) {
  if (typeof value.text !== "string") return { rejected: "text" };
  return { ok: { kind, id, visibility, text: value.text } };
}
function admitText(value, id, visibility) {
  return admitWritten("text", value, id, visibility);
}
function admitThinking(value, id, visibility) {
  return admitWritten("thinking", value, id, visibility);
}
function admitMedia(kind, value, id, visibility) {
  if (typeof value.mediaType !== "string" || typeof value.inline !== "string")
    return { rejected: "media" };
  return { ok: { kind, id, visibility, mediaType: value.mediaType, inline: value.inline } };
}
function admitVoice(value, id, visibility) {
  return admitMedia("voice", value, id, visibility);
}
function admitImage(value, id, visibility) {
  return admitMedia("image", value, id, visibility);
}
function admitFile(value, id, visibility) {
  if (typeof value.storage !== "string" || typeof value.key !== "string" || typeof value.mediaType !== "string") {
    return { rejected: "file" };
  }
  return {
    ok: {
      kind: "file",
      id,
      visibility,
      storage: value.storage,
      key: value.key,
      mediaType: value.mediaType
    }
  };
}
function headKeys(kind) {
  const { keys, body } = BLOCKS[kind];
  return Object.freeze(keys.filter((key) => key !== body));
}
var BLOCKS, CONTENT_BLOCK_HEAD_KEYS;
var init_src4 = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/common/content-block/src/index.ts"() {
    BLOCKS = {
      text: { keys: ["kind", "id", "visibility", "text"], body: "text", admit: admitText },
      thinking: { keys: ["kind", "id", "visibility", "text"], body: "text", admit: admitThinking },
      voice: {
        keys: ["kind", "id", "visibility", "mediaType", "inline"],
        body: "inline",
        admit: admitVoice
      },
      image: {
        keys: ["kind", "id", "visibility", "mediaType", "inline"],
        body: "inline",
        admit: admitImage
      },
      file: { keys: ["kind", "id", "visibility", "storage", "key", "mediaType"], admit: admitFile }
    };
    CONTENT_BLOCK_HEAD_KEYS = Object.freeze({
      text: headKeys("text"),
      thinking: headKeys("thinking"),
      voice: headKeys("voice"),
      image: headKeys("image"),
      file: headKeys("file")
    });
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/content.ts
var init_content = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/content.ts"() {
    init_src4();
    init_json();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/classify.ts
function countOf(value) {
  if (value?.kind !== "number" || !COUNT.test(value.lexeme)) return void 0;
  const count = Number(value.lexeme);
  return Number.isSafeInteger(count) ? count : void 0;
}
function taskHintsOf(task) {
  const pollIntervalMs = countOf(member(task, "pollIntervalMs"));
  const ttlMs = countOf(member(task, "ttlMs"));
  const message = textOf(member(task, "statusMessage"));
  return {
    ...pollIntervalMs === void 0 ? {} : { pollIntervalMs },
    ...ttlMs === void 0 ? {} : { ttlMs },
    ...message === void 0 ? {} : { statusMessage: { untrusted: message } }
  };
}
var COUNT;
var init_classify = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/classify.ts"() {
    init_content();
    init_json();
    init_brands();
    COUNT = /^\d+$/u;
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/instructions.ts
function isContinuation(byte) {
  return byte !== void 0 && (byte & 192) === 128;
}
function boundInstructions(text, byteLimit) {
  if (!Number.isSafeInteger(byteLimit) || byteLimit < 1)
    throw new RangeError("byteLimit is a positive safe integer");
  const digest2 = digestOf(text, isInstructionsDigest);
  const bytes = encoder.encode(text);
  if (bytes.length <= byteLimit) return { text, truncated: false, digest: digest2 };
  let cut = byteLimit;
  while (cut > 0 && isContinuation(bytes[cut])) cut -= 1;
  return { text: decoder.decode(bytes.subarray(0, cut)), truncated: true, digest: digest2 };
}
var encoder, decoder;
var init_instructions = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/instructions.ts"() {
    init_brands();
    init_digest();
    encoder = new TextEncoder();
    decoder = new TextDecoder("utf-8");
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/revisions.ts
function isModernProtocolVersion(version) {
  return version >= FIRST_MODERN_PROTOCOL_VERSION;
}
function isLegacyProtocolVersion(version) {
  return LEGACY_PROTOCOL_VERSIONS.some((known) => known === version);
}
var FIRST_MODERN_PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSIONS;
var init_revisions = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/revisions.ts"() {
    FIRST_MODERN_PROTOCOL_VERSION = "2026-07-28";
    LEGACY_PROTOCOL_VERSIONS = [
      "2025-11-25",
      "2025-06-18",
      "2025-03-26",
      "2024-11-05",
      "2024-10-07"
    ];
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/envelope.ts
function clientEnvelopeOf(version, clientInfo) {
  return {
    [PROTOCOL_VERSION_KEY]: version,
    [CLIENT_CAPABILITIES_KEY]: isModernProtocolVersion(version) ? MODERN_CAPABILITIES : LEGACY_CAPABILITIES,
    [CLIENT_INFO_KEY]: { name: clientInfo.name, version: clientInfo.version }
  };
}
function isSafeFieldValue(value) {
  if (value === "" || value.startsWith("=?")) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code > 126) return false;
  }
  return value.trim() === value;
}
function encodeMcpHeaderValue(value) {
  if (isSafeFieldValue(value)) return value;
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return `=?base64?${btoa(binary)}?=`;
}
function mcpRequestHeadersOf(method, params, version, session) {
  const source = MCP_NAME_SOURCES[method];
  const name = source === void 0 ? void 0 : params[source];
  return {
    "mcp-protocol-version": version,
    "mcp-method": method,
    ...typeof name === "string" ? { "mcp-name": encodeMcpHeaderValue(name) } : {},
    ...session === void 0 || method === "initialize" ? {} : { "mcp-session-id": session }
  };
}
var PROTOCOL_VERSION_KEY, CLIENT_CAPABILITIES_KEY, CLIENT_INFO_KEY, SERVER_INFO_KEY, TASKS_EXTENSION, MODERN_CAPABILITIES, LEGACY_CAPABILITIES, MCP_NAME_SOURCES;
var init_envelope = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/envelope.ts"() {
    init_revisions();
    PROTOCOL_VERSION_KEY = "io.modelcontextprotocol/protocolVersion";
    CLIENT_CAPABILITIES_KEY = "io.modelcontextprotocol/clientCapabilities";
    CLIENT_INFO_KEY = "io.modelcontextprotocol/clientInfo";
    SERVER_INFO_KEY = "io.modelcontextprotocol/serverInfo";
    TASKS_EXTENSION = "io.modelcontextprotocol/tasks";
    MODERN_CAPABILITIES = {
      extensions: { [TASKS_EXTENSION]: {} },
      elicitation: { form: {} }
    };
    LEGACY_CAPABILITIES = {};
    MCP_NAME_SOURCES = {
      "tools/call": "name",
      "tasks/get": "taskId",
      "tasks/update": "taskId",
      "tasks/cancel": "taskId"
    };
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/withheld.ts
function headerDeclarationInvalid(node, reachable, depth, seen) {
  if (!isObject(node)) return false;
  const raw = member(node, "x-mcp-header");
  if (raw !== void 0) {
    const name = textOf(raw);
    const type = textOf(member(node, "type"));
    if (!reachable || depth === 0 || name === void 0 || !RFC9110_TOKEN.test(name)) return true;
    if (type === void 0 || !HEADER_TYPES.includes(type)) return true;
    const lower = name.toLowerCase();
    if (seen.has(lower)) return true;
    seen.add(lower);
  }
  const properties = member(node, "properties");
  if (isObject(properties)) {
    for (const entry of properties.entries)
      if (headerDeclarationInvalid(entry.value, reachable, depth + 1, seen)) return true;
  }
  for (const keyword of NON_REACHABLE) {
    const sub = member(node, keyword);
    if (sub === void 0) continue;
    const branches = itemsOf(sub) ?? (isObject(sub) && NAMED_SUBSCHEMAS.includes(keyword) ? sub.entries.map((entry) => entry.value) : [sub]);
    for (const branch of branches)
      if (headerDeclarationInvalid(branch, false, depth + 1, seen)) return true;
  }
  return false;
}
function withheldTools(tools) {
  const kept = [];
  const withheld = [];
  for (const tool of tools) {
    const schema2 = isObject(tool) ? member(tool, "inputSchema") : void 0;
    if (headerDeclarationInvalid(schema2, true, 0, /* @__PURE__ */ new Set()))
      withheld.push({
        name: { untrusted: (isObject(tool) ? textOf(member(tool, "name")) : void 0) ?? "" },
        reason: "header-invalid"
      });
    else kept.push(tool);
  }
  return withheld.length === 0 ? { tools: kept } : { tools: kept, withheld };
}
var RFC9110_TOKEN, HEADER_TYPES, NON_REACHABLE, NAMED_SUBSCHEMAS;
var init_withheld = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/withheld.ts"() {
    init_json();
    RFC9110_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
    HEADER_TYPES = ["string", "integer", "boolean"];
    NON_REACHABLE = [
      "items",
      "prefixItems",
      "contains",
      "additionalProperties",
      "unevaluatedProperties",
      "unevaluatedItems",
      "propertyNames",
      "patternProperties",
      "dependentSchemas",
      "oneOf",
      "anyOf",
      "allOf",
      "not",
      "if",
      "then",
      "else",
      "$defs",
      "definitions"
    ];
    NAMED_SUBSCHEMAS = [
      "patternProperties",
      "dependentSchemas",
      "$defs",
      "definitions"
    ];
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/authorization.ts
function authorizationChallengeOf(header) {
  const parameters = /* @__PURE__ */ new Map();
  if (header === void 0) return parameters;
  for (const match of header.matchAll(/([A-Za-z_]+)=(?:"([^"]*)"|([^\s,"]+))/gu)) {
    const name = match[1];
    const value = match[2] ?? match[3];
    if (name !== void 0 && value !== void 0 && !parameters.has(name.toLowerCase()))
      parameters.set(name.toLowerCase(), value);
  }
  return parameters;
}
function metadataCandidatesOf(target, challenge) {
  const named = challenge.get("resource_metadata");
  if (named !== void 0) return [named];
  const origin = new URL(target);
  const path = origin.pathname.replace(/\/$/u, "");
  return [new URL(`${METADATA_PATH}${path}`, origin).href, new URL(METADATA_PATH, origin).href];
}
function textsOf(object, key) {
  const items = isObject(object) ? itemsOf(member(object, key)) : void 0;
  return (items ?? []).flatMap((item) => item.kind === "string" ? [item.value] : []);
}
function authorizationDiscoveryOf(challenge, candidates, fetched) {
  let found;
  for (const [index, url] of candidates.entries()) {
    const metadata = fetched[index];
    if (isObject(metadata)) {
      found = { url, metadata };
      break;
    }
  }
  const scope = challenge.get("scope");
  const headerScopes = scope === void 0 ? [] : scope.split(/\s+/u).filter((item) => item !== "");
  const last = candidates.at(-1) ?? METADATA_PATH;
  return {
    resourceMetadataUrl: found?.url ?? last,
    metadata: found === void 0 ? "unavailable" : "fetched",
    ...found === void 0 ? {} : { resourceMetadata: { untrusted: found.metadata } },
    issuers: textsOf(found?.metadata, "authorization_servers"),
    scopes: headerScopes.length > 0 ? headerScopes : textsOf(found?.metadata, "scopes_supported")
  };
}
var METADATA_PATH;
var init_authorization = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/authorization.ts"() {
    init_json();
    METADATA_PATH = "/.well-known/oauth-protected-resource";
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/readers.ts
function readDiscoverResult(result, versions) {
  if (!isObject(result)) return { failure: "shape" };
  const offered = itemsOf(member(result, "supportedVersions"));
  const capabilities = member(result, "capabilities");
  if (offered === void 0 || !isObject(capabilities)) return { failure: "shape" };
  const texts = offered.flatMap((item) => item.kind === "string" ? [item.value] : []);
  const version = versions.find(
    (candidate) => texts.includes(candidate) && isModernProtocolVersion(candidate)
  );
  if (version === void 0 || !isProtocolVersion(version)) return { failure: "no-common-version" };
  const meta = member(result, "_meta");
  const serverInfo = isObject(meta) ? member(meta, SERVER_INFO_KEY) : void 0;
  const instructions = textOf(member(result, "instructions"));
  return {
    ok: {
      protocolVersion: version,
      capabilities,
      ...serverInfo === void 0 ? {} : { serverInfo },
      ...instructions === void 0 ? {} : { instructions }
    }
  };
}
function readInitializeResult(result) {
  if (!isObject(result)) return { failure: "shape" };
  const version = textOf(member(result, "protocolVersion"));
  const capabilities = member(result, "capabilities");
  if (version === void 0 || !isProtocolVersion(version) || !isLegacyProtocolVersion(version) || !isObject(capabilities))
    return { failure: "shape" };
  const serverInfo = member(result, "serverInfo");
  const instructions = textOf(member(result, "instructions"));
  return {
    ok: {
      protocolVersion: version,
      capabilities,
      ...serverInfo === void 0 ? {} : { serverInfo },
      ...instructions === void 0 ? {} : { instructions }
    }
  };
}
function peerIdentityOf(read, bound) {
  return {
    protocolVersion: read.protocolVersion,
    capabilities: read.capabilities,
    ...read.serverInfo === void 0 ? {} : { serverInfo: { untrusted: read.serverInfo } },
    ...read.instructions === void 0 ? {} : {
      instructions: {
        untrusted: {
          ...boundInstructions(read.instructions, bound.instructionsByteLimit),
          generation: bound.generation
        }
      }
    }
  };
}
function readListingPage(result, checkHeaders) {
  const tools = isObject(result) ? itemsOf(member(result, "tools")) : void 0;
  if (!isObject(result) || tools === void 0) return { failure: "tools-missing" };
  const cursor = member(result, "nextCursor");
  const nextCursor = textOf(cursor);
  if (cursor !== void 0 && nextCursor === void 0) return { failure: "cursor-invalid" };
  const ttlMs = countOf(member(result, "ttlMs"));
  const page = checkHeaders ? withheldTools(tools) : { tools };
  return {
    ok: {
      ...page,
      ...nextCursor === void 0 ? {} : { nextCursor },
      ...ttlMs === void 0 ? {} : { ttlMs }
    }
  };
}
function readTaskReport(result) {
  if (!isObject(result)) return { failure: "status-unknown" };
  const written = textOf(member(result, "status"));
  const status = TASK_STATUSES.find((known) => known === written);
  const taskId = textOf(member(result, "taskId"));
  if (status === void 0 || taskId === void 0 || taskId === "")
    return { failure: "status-unknown" };
  const inputRequests = member(result, "inputRequests");
  if (status === "input_required" && !isObject(inputRequests))
    return { failure: "input-requests-missing" };
  if (status === "completed" && member(result, "result") === void 0)
    return { failure: "result-missing" };
  if (status === "failed" && !isObject(member(result, "error"))) return { failure: "error-missing" };
  return {
    ok: {
      status,
      ...status === "input_required" && inputRequests !== void 0 ? { inputRequests: { untrusted: inputRequests } } : {},
      ...taskHintsOf(result)
    }
  };
}
function readTaskAnswer(result) {
  const report = readTaskReport(result);
  if ("failure" in report) return report;
  if (!isObject(result)) return { failure: "status-unknown" };
  switch (report.ok.status) {
    case "completed": {
      const value = member(result, "result");
      return value === void 0 ? { failure: "result-missing" } : { ok: { kind: "finished", answer: { kind: "result", result: value } } };
    }
    case "failed": {
      const error = member(result, "error");
      return error === void 0 ? { failure: "error-missing" } : { ok: { kind: "finished", answer: { kind: "error", error } } };
    }
    case "cancelled":
      return { ok: { kind: "cancelled" } };
    case "working":
    case "input_required":
      return { ok: { kind: "not-finished" } };
    default: {
      const exhaustive = report.ok.status;
      return exhaustive;
    }
  }
}
function errorAnswerOf(error) {
  if (!isObject(error)) return void 0;
  const code = member(error, "code");
  const message = textOf(member(error, "message"));
  if (code?.kind !== "number" || !INTEGER.test(code.lexeme) || message === void 0)
    return void 0;
  const data = member(error, "data");
  return {
    kind: "error-answer",
    code: Number(code.lexeme),
    message,
    ...data === void 0 ? {} : { data }
  };
}
var INTEGER, TASK_STATUSES;
var init_readers = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/readers.ts"() {
    init_brands();
    init_classify();
    init_envelope();
    init_instructions();
    init_json();
    init_revisions();
    init_withheld();
    INTEGER = /^-?\d+$/u;
    TASK_STATUSES = [
      "working",
      "input_required",
      "completed",
      "failed",
      "cancelled"
    ];
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/wire.ts
function parse2(text) {
  const read = readJsonText(text, LIMITS);
  return read.kind === "ok" ? read.value : void 0;
}
function idOf(message) {
  const id = member(message, "id");
  if (id?.kind === "string") return `s:${id.value}`;
  if (id?.kind === "number") return `n:${id.lexeme}`;
  return void 0;
}
function sameId(message, id) {
  return idOf(message) === (typeof id === "string" ? `s:${id}` : `n:${String(id)}`);
}
function envelopeOf(message) {
  if (textOf(member(message, "jsonrpc")) !== "2.0") return void 0;
  const result = member(message, "result");
  const error = member(message, "error");
  if (result !== void 0 && error === void 0) return { result };
  if (error !== void 0 && result === void 0) return { error };
  return void 0;
}
function supportedOf(data) {
  const items = isObject(data) ? itemsOf(member(data, "supported")) : void 0;
  if (items === void 0 || items.length === 0) return void 0;
  const texts = items.flatMap((item) => item.kind === "string" ? [item.value] : []);
  return texts.length === items.length ? texts : void 0;
}
function errorClassOf(error, versions) {
  if (!isObject(error)) return "unreadable";
  const code = member(error, "code");
  if (code?.kind !== "number" || !INTEGER2.test(code.lexeme)) return "unreadable";
  if (textOf(member(error, "message")) === void 0) return "unreadable";
  switch (code.lexeme) {
    case "-32020":
      return "-32020";
    case "-32021":
      return "-32021";
    case "-32601":
      return "-32601";
    case "-32602":
      return "-32602";
    case "-32022": {
      const modern = (supportedOf(member(error, "data")) ?? []).filter(isModernProtocolVersion);
      if (modern.length === 0) return "-32022+legacy";
      return versions.some((version) => modern.includes(version)) ? "-32022+common" : "-32022+modern";
    }
    default:
      return "other";
  }
}
function resultClassOf(request, result, versions) {
  switch (request) {
    case "discover":
    case "discover-retry": {
      const read = readDiscoverResult(result, versions);
      if ("ok" in read) return "result";
      return read.failure === "no-common-version" ? "result:no-common" : "result:unreadable";
    }
    case "initialize":
      return "ok" in readInitializeResult(result) ? "result" : "result:unreadable";
    case "tools/list": {
      const read = readListingPage(result, false);
      return "ok" in read ? "result" : `result:${read.failure}`;
    }
    case "tasks/get": {
      const read = readTaskReport(result);
      return "ok" in read ? "result" : `result:${read.failure}`;
    }
    case "tools/call":
    case "tasks/update":
    case "tasks/cancel":
    case "notification":
      return "result";
    default: {
      const exhaustive = request;
      return exhaustive;
    }
  }
}
function messageClassOf(message, context) {
  const envelope = envelopeOf(message);
  if (envelope === void 0) return "error:unreadable";
  if ("result" in envelope) return resultClassOf(context.request, envelope.result, context.versions);
  return `error:${errorClassOf(envelope.error, context.versions)}`;
}
function answers(message, context) {
  return isObject(message) && member(message, "method") === void 0 && sameId(message, context.id);
}
function bodyClassOf(body, versions) {
  const message = parse2(body);
  const envelope = isObject(message) ? envelopeOf(message) : void 0;
  if (envelope === void 0 || !("error" in envelope)) return "plain";
  return errorClassOf(envelope.error, versions);
}
function statusClassOf(status) {
  if (status >= 500) return "5xx";
  return STATUS_CLASSES[status] ?? "4xx";
}
function httpStatusOf(event, context) {
  const { status } = event;
  if (status >= 200 && status < 300) return "http:2xx";
  if (status === 401) return "http:401";
  if (status === 403) {
    const challenge = event.headers["www-authenticate"] ?? "";
    return /error="insufficient_scope"/iu.test(challenge) ? "http:403+scope" : "http:403";
  }
  if (status === 404 && context.session) return "http:404+session";
  return `http:${statusClassOf(status)}+${bodyClassOf(event.body, context.versions)}`;
}
function classifyWireEvent(event, context) {
  switch (event.kind) {
    case "unsent":
      return answer("unsent");
    case "nothing":
      return answer("silent");
    case "line": {
      const message = parse2(event.text);
      return message !== void 0 && answers(message, context) ? answer(messageClassOf(message, context)) : { kind: "other" };
    }
    case "stdio-ended": {
      const { stdoutEndedAt, exitedAt } = event;
      if (exitedAt === void 0) return answer("stream-broken");
      const exitFirst = stdoutEndedAt === void 0 || exitedAt - stdoutEndedAt <= PROCESS_EXIT_WINDOW_MS;
      return answer(exitFirst ? "process-exited" : "stream-broken");
    }
    case "http-aborted":
      return answer("stream-broken");
    case "http-status":
      return answer(httpStatusOf(event, context));
    case "http-stream": {
      for (const text of event.messages) {
        const message = parse2(text);
        if (answers(message, context)) return answer(messageClassOf(message, context));
      }
      return event.ended && context.mode !== "sse" ? answer("http:2xx") : { kind: "waiting" };
    }
    default: {
      const exhaustive = event;
      return exhaustive;
    }
  }
}
var PROCESS_EXIT_WINDOW_MS, LIMITS, INTEGER2, STATUS_CLASSES, answer;
var init_wire = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/wire.ts"() {
    init_src();
    init_json();
    init_readers();
    init_revisions();
    PROCESS_EXIT_WINDOW_MS = 100;
    LIMITS = {
      maxBytes: 16777216,
      maxDepth: 128,
      maxItems: 1e6,
      maxMembers: 1e5,
      maxStringLength: 16777216,
      maxNumberLength: 100
    };
    INTEGER2 = /^-?\d+$/u;
    STATUS_CLASSES = {
      400: "400",
      404: "404",
      405: "405",
      406: "406",
      415: "415",
      429: "429"
    };
    answer = (value) => ({ kind: "answer", answer: value });
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/keys.ts
var init_keys = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/keys.ts"() {
    init_src3();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/index.ts
var init_src5 = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/index.ts"() {
    init_brands();
    init_endpoint();
    init_listing();
    init_catalog();
    init_args();
    init_classify();
    init_json();
    init_content();
    init_instructions();
    init_revisions();
    init_envelope();
    init_withheld();
    init_authorization();
    init_readers();
    init_wire();
    init_keys();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/limits.ts
var BYTE_LIMIT, JSON_LIMITS;
var init_limits = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/limits.ts"() {
    BYTE_LIMIT = 16777216;
    JSON_LIMITS = {
      maxBytes: BYTE_LIMIT,
      maxDepth: 128,
      maxItems: 1e6,
      maxMembers: 1e5,
      maxStringLength: BYTE_LIMIT,
      maxNumberLength: 100
    };
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/authorization.ts
function metadataFetcher(fetchFn) {
  return async (url, signal) => {
    let response;
    try {
      response = await fetchFn(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal,
        redirect: "manual"
      });
    } catch {
      return void 0;
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => void 0);
      return void 0;
    }
    let text;
    try {
      text = await response.text();
    } catch {
      return void 0;
    }
    const read = readJsonText(text, JSON_LIMITS);
    return read.kind === "ok" ? read.value : void 0;
  };
}
var init_authorization2 = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/authorization.ts"() {
    init_src();
    init_limits();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/eventsource-parser@3.1.1/node_modules/eventsource-parser/src/errors.ts
var ParseError;
var init_errors = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/eventsource-parser@3.1.1/node_modules/eventsource-parser/src/errors.ts"() {
    ParseError = class extends Error {
      /**
       * The type of error that occurred.
       */
      type;
      /**
       * In the case of an unknown field encountered in the stream, this will be the field name.
       */
      field;
      /**
       * In the case of an unknown field encountered in the stream, this will be the value of the field.
       */
      value;
      /**
       * The line that caused the error, if available.
       */
      line;
      constructor(message, options) {
        super(message);
        this.name = "ParseError";
        this.type = options.type;
        this.field = options.field;
        this.value = options.value;
        this.line = options.line;
      }
    };
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/eventsource-parser@3.1.1/node_modules/eventsource-parser/src/parse.ts
function noop(_arg) {
}
function createParser(config) {
  if (typeof config === "function") {
    throw new TypeError(
      "`config` must be an object, got a function instead. Did you mean `createParser({onEvent: fn})`?"
    );
  }
  const { onEvent = noop, onError = noop, onRetry = noop, onComment, maxBufferSize } = config;
  const pendingFragments = [];
  let pendingFragmentsLength = 0;
  let isFirstChunk = true;
  let id;
  let data = "";
  let dataLines = 0;
  let eventType;
  let terminated = false;
  function feed(chunk) {
    if (terminated) {
      throw new Error(
        "Cannot feed parser: it was terminated after exceeding the configured max buffer size. Call `reset()` to resume parsing."
      );
    }
    if (isFirstChunk) {
      isFirstChunk = false;
      if (chunk.charCodeAt(0) === 239 && chunk.charCodeAt(1) === 187 && chunk.charCodeAt(2) === 191) {
        chunk = chunk.slice(3);
      }
    }
    if (pendingFragments.length === 0) {
      const trailing2 = processLines(chunk);
      if (trailing2 !== "") {
        pendingFragments.push(trailing2);
        pendingFragmentsLength = trailing2.length;
      }
      checkBufferSize();
      return;
    }
    if (chunk.indexOf("\n") === -1 && chunk.indexOf("\r") === -1) {
      pendingFragments.push(chunk);
      pendingFragmentsLength += chunk.length;
      checkBufferSize();
      return;
    }
    pendingFragments.push(chunk);
    const input = pendingFragments.join("");
    pendingFragments.length = 0;
    pendingFragmentsLength = 0;
    const trailing = processLines(input);
    if (trailing !== "") {
      pendingFragments.push(trailing);
      pendingFragmentsLength = trailing.length;
    }
    checkBufferSize();
  }
  function checkBufferSize() {
    if (maxBufferSize === void 0) return;
    if (pendingFragmentsLength + data.length <= maxBufferSize) return;
    terminated = true;
    pendingFragments.length = 0;
    pendingFragmentsLength = 0;
    id = void 0;
    data = "";
    dataLines = 0;
    eventType = void 0;
    onError(
      new ParseError(`Buffered data exceeded max buffer size of ${maxBufferSize} characters`, {
        type: "max-buffer-size-exceeded"
      })
    );
  }
  function processLines(chunk) {
    let searchIndex = 0;
    if (chunk.indexOf("\r") === -1) {
      let lfIndex = chunk.indexOf("\n", searchIndex);
      while (lfIndex !== -1) {
        if (searchIndex === lfIndex) {
          if (dataLines > 0) {
            onEvent({ id, event: eventType, data });
          }
          id = void 0;
          data = "";
          dataLines = 0;
          eventType = void 0;
          searchIndex = lfIndex + 1;
          lfIndex = chunk.indexOf("\n", searchIndex);
          continue;
        }
        const firstCharCode = chunk.charCodeAt(searchIndex);
        if (isDataPrefix(chunk, searchIndex, firstCharCode)) {
          const valueStart = chunk.charCodeAt(searchIndex + 5) === SPACE ? searchIndex + 6 : searchIndex + 5;
          const value = chunk.slice(valueStart, lfIndex);
          if (dataLines === 0 && chunk.charCodeAt(lfIndex + 1) === LF) {
            onEvent({ id, event: eventType, data: value });
            id = void 0;
            data = "";
            eventType = void 0;
            searchIndex = lfIndex + 2;
            lfIndex = chunk.indexOf("\n", searchIndex);
            continue;
          }
          data = dataLines === 0 ? value : `${data}
${value}`;
          dataLines++;
        } else if (isEventPrefix(chunk, searchIndex, firstCharCode)) {
          eventType = chunk.slice(
            chunk.charCodeAt(searchIndex + 6) === SPACE ? searchIndex + 7 : searchIndex + 6,
            lfIndex
          ) || void 0;
        } else {
          parseLine(chunk, searchIndex, lfIndex);
        }
        searchIndex = lfIndex + 1;
        lfIndex = chunk.indexOf("\n", searchIndex);
      }
      return chunk.slice(searchIndex);
    }
    while (searchIndex < chunk.length) {
      const crIndex = chunk.indexOf("\r", searchIndex);
      const lfIndex = chunk.indexOf("\n", searchIndex);
      let lineEnd = -1;
      if (crIndex !== -1 && lfIndex !== -1) {
        lineEnd = crIndex < lfIndex ? crIndex : lfIndex;
      } else if (crIndex !== -1) {
        if (crIndex === chunk.length - 1) {
          lineEnd = -1;
        } else {
          lineEnd = crIndex;
        }
      } else if (lfIndex !== -1) {
        lineEnd = lfIndex;
      }
      if (lineEnd === -1) {
        break;
      }
      parseLine(chunk, searchIndex, lineEnd);
      searchIndex = lineEnd + 1;
      if (chunk.charCodeAt(searchIndex - 1) === CR && chunk.charCodeAt(searchIndex) === LF) {
        searchIndex++;
      }
    }
    return chunk.slice(searchIndex);
  }
  function parseLine(chunk, start, end) {
    if (start === end) {
      dispatchEvent();
      return;
    }
    const firstCharCode = chunk.charCodeAt(start);
    if (isDataPrefix(chunk, start, firstCharCode)) {
      const valueStart = chunk.charCodeAt(start + 5) === SPACE ? start + 6 : start + 5;
      const value2 = chunk.slice(valueStart, end);
      data = dataLines === 0 ? value2 : `${data}
${value2}`;
      dataLines++;
      return;
    }
    if (isEventPrefix(chunk, start, firstCharCode)) {
      eventType = chunk.slice(chunk.charCodeAt(start + 6) === SPACE ? start + 7 : start + 6, end) || void 0;
      return;
    }
    if (firstCharCode === 105 && chunk.charCodeAt(start + 1) === 100 && chunk.charCodeAt(start + 2) === 58) {
      const value2 = chunk.slice(chunk.charCodeAt(start + 3) === SPACE ? start + 4 : start + 3, end);
      if (!value2.includes("\0")) id = value2;
      return;
    }
    if (firstCharCode === 58) {
      if (onComment) {
        const line2 = chunk.slice(start, end);
        onComment(line2.slice(chunk.charCodeAt(start + 1) === SPACE ? 2 : 1));
      }
      return;
    }
    const line = chunk.slice(start, end);
    const fieldSeparatorIndex = line.indexOf(":");
    if (fieldSeparatorIndex === -1) {
      processField(line, "", line);
      return;
    }
    const field2 = line.slice(0, fieldSeparatorIndex);
    const offset = line.charCodeAt(fieldSeparatorIndex + 1) === SPACE ? 2 : 1;
    const value = line.slice(fieldSeparatorIndex + offset);
    processField(field2, value, line);
  }
  function processField(field2, value, line) {
    switch (field2) {
      case "event":
        eventType = value || void 0;
        break;
      case "data":
        data = dataLines === 0 ? value : `${data}
${value}`;
        dataLines++;
        break;
      case "id":
        if (!value.includes("\0")) id = value;
        break;
      case "retry":
        if (/^\d+$/.test(value)) {
          onRetry(parseInt(value, 10));
        } else {
          onError(
            new ParseError(`Invalid \`retry\` value: "${value}"`, {
              type: "invalid-retry",
              value,
              line
            })
          );
        }
        break;
      default:
        onError(
          new ParseError(
            `Unknown field "${field2.length > 20 ? `${field2.slice(0, 20)}\u2026` : field2}"`,
            { type: "unknown-field", field: field2, value, line }
          )
        );
        break;
    }
  }
  function dispatchEvent() {
    if (dataLines > 0) {
      onEvent({
        id,
        event: eventType,
        data
      });
    }
    id = void 0;
    data = "";
    dataLines = 0;
    eventType = void 0;
  }
  function reset(options = {}) {
    if (options.consume && pendingFragments.length > 0) {
      const incompleteLine = pendingFragments.join("");
      parseLine(incompleteLine, 0, incompleteLine.length);
    }
    isFirstChunk = true;
    id = void 0;
    data = "";
    dataLines = 0;
    eventType = void 0;
    pendingFragments.length = 0;
    pendingFragmentsLength = 0;
    terminated = false;
  }
  return { feed, reset };
}
function isDataPrefix(chunk, i, firstCharCode) {
  return firstCharCode === 100 && chunk.charCodeAt(i + 1) === 97 && chunk.charCodeAt(i + 2) === 116 && chunk.charCodeAt(i + 3) === 97 && chunk.charCodeAt(i + 4) === 58;
}
function isEventPrefix(chunk, i, firstCharCode) {
  return firstCharCode === 101 && chunk.charCodeAt(i + 1) === 118 && chunk.charCodeAt(i + 2) === 101 && chunk.charCodeAt(i + 3) === 110 && chunk.charCodeAt(i + 4) === 116 && chunk.charCodeAt(i + 5) === 58;
}
var LF, CR, SPACE;
var init_parse = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/eventsource-parser@3.1.1/node_modules/eventsource-parser/src/parse.ts"() {
    init_errors();
    LF = 10;
    CR = 13;
    SPACE = 32;
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/eventsource-parser@3.1.1/node_modules/eventsource-parser/src/stream.ts
var EventSourceParserStream;
var init_stream = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/node_modules/.pnpm/eventsource-parser@3.1.1/node_modules/eventsource-parser/src/stream.ts"() {
    init_parse();
    EventSourceParserStream = class extends TransformStream {
      constructor({ onError, onRetry, onComment, maxBufferSize } = {}) {
        let parser;
        super({
          start(controller) {
            parser = createParser({
              onEvent: (event) => {
                controller.enqueue(event);
              },
              onError(error) {
                if (typeof onError === "function") {
                  onError(error);
                }
                if (onError === "terminate" || error.type === "max-buffer-size-exceeded") {
                  controller.error(error);
                }
              },
              onRetry,
              onComment,
              maxBufferSize
            });
          },
          transform(chunk) {
            parser.feed(chunk);
          }
        });
      }
    };
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/queue.ts
var AsyncQueue;
var init_queue = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/queue.ts"() {
    AsyncQueue = class {
      items = [];
      waiting;
      ended = false;
      failure;
      push(item) {
        if (this.ended) return;
        const waiting = this.waiting;
        if (waiting === void 0) {
          this.items.push(item);
          return;
        }
        this.waiting = void 0;
        waiting.resolve({ value: item, done: false });
      }
      end() {
        if (this.ended) return;
        this.ended = true;
        const waiting = this.waiting;
        this.waiting = void 0;
        waiting?.resolve({ value: void 0, done: true });
      }
      fail(reason) {
        if (this.ended) return;
        this.ended = true;
        this.failure = { reason };
        const waiting = this.waiting;
        this.waiting = void 0;
        waiting?.reject(reason);
      }
      [Symbol.asyncIterator]() {
        return {
          next: () => {
            const item = this.items.shift();
            if (item !== void 0) return Promise.resolve({ value: item, done: false });
            if (this.failure !== void 0) return Promise.reject(this.failure.reason);
            if (this.ended) return Promise.resolve({ value: void 0, done: true });
            return new Promise((resolve, reject) => {
              this.waiting = { resolve, reject };
            });
          },
          return: () => {
            this.end();
            return Promise.resolve({ value: void 0, done: true });
          }
        };
      }
    };
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/http-line.ts
function codeOf(error) {
  const cause = error instanceof Error ? error.cause : void 0;
  if (typeof cause !== "object" || cause === null || !("code" in cause)) return void 0;
  return typeof cause.code === "string" ? cause.code : void 0;
}
function failedExchange(error) {
  const code = codeOf(error);
  const unsent = code !== void 0 && (UNSENT_CODES.includes(code) || code.startsWith("ERR_SSL_"));
  return { kind: unsent ? "unsent" : "aborted" };
}
function headersOf(response) {
  const headers = {};
  response.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value;
  });
  return headers;
}
function mediaTypeOf(response) {
  return (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}
async function bodyOf(response) {
  const body = response.body;
  if (body === null) return "";
  const decoder2 = new TextDecoder();
  let bytes = 0;
  let text = "";
  for await (const chunk of body) {
    bytes += chunk.byteLength;
    if (bytes > BYTE_LIMIT) {
      await body.cancel().catch(() => void 0);
      throw new RangeError("the body is above the byte bound");
    }
    text += decoder2.decode(chunk, { stream: true });
  }
  return text + decoder2.decode();
}
function eventsOf(body) {
  return body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream({ maxBufferSize: BYTE_LIMIT }));
}
async function* messagesOf(response) {
  const type = mediaTypeOf(response);
  if (type === "application/json") {
    yield await bodyOf(response);
    return;
  }
  if (type !== "text/event-stream" || response.body === null) {
    await bodyOf(response).catch(() => void 0);
    return;
  }
  for await (const event of eventsOf(response.body))
    if (event.event === void 0 || event.event === "message") yield event.data;
}
var UNSENT_CODES, HttpLine;
var init_http_line = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/http-line.ts"() {
    init_stream();
    init_limits();
    init_queue();
    UNSENT_CODES = [
      "ECONNREFUSED",
      "ENOTFOUND",
      "EAI_AGAIN",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "EADDRNOTAVAIL",
      "UND_ERR_CONNECT_TIMEOUT",
      "ERR_TLS_CERT_ALTNAME_INVALID",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "CERT_HAS_EXPIRED"
    ];
    HttpLine = class {
      kind = "streamable-http";
      events;
      enterSse;
      queue = new AsyncQueue();
      target;
      fetch;
      controllers = /* @__PURE__ */ new Set();
      /** The endpoint of the legacy HTTP+SSE mode, once entered. */
      endpoint;
      closed = false;
      constructor(target, fetchFn) {
        this.target = target;
        this.fetch = fetchFn;
        this.events = this.queue;
        this.enterSse = (headers, signal) => this.tryEnterSse(headers, signal);
      }
      /** An abort controller for one exchange, aborted with the caller's signal and on close. */
      controllerFor(signal) {
        const controller = new AbortController();
        this.controllers.add(controller);
        signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
        if (signal.aborted) controller.abort(signal.reason);
        return controller;
      }
      async send(outbound, signal) {
        if (this.closed) return { kind: "unsent" };
        const controller = this.controllerFor(signal);
        const headers = new Headers(outbound.headers);
        headers.set("content-type", "application/json");
        headers.set("accept", "application/json, text/event-stream");
        let response;
        try {
          response = await this.fetch(this.endpoint ?? this.target, {
            method: "POST",
            headers,
            body: outbound.text,
            signal: controller.signal,
            redirect: "manual"
          });
        } catch (error) {
          this.controllers.delete(controller);
          return controller.signal.aborted ? { kind: "aborted" } : failedExchange(error);
        }
        const answered = headersOf(response);
        if (!response.ok) {
          const body = await bodyOf(response).catch(() => "");
          this.controllers.delete(controller);
          return { kind: "status", status: response.status, headers: answered, body };
        }
        const messages = messagesOf(response);
        const release = () => this.controllers.delete(controller);
        return {
          kind: "stream",
          headers: answered,
          messages: {
            [Symbol.asyncIterator]: () => {
              const iterator = messages[Symbol.asyncIterator]();
              return {
                next: () => iterator.next().then(
                  (result) => {
                    if (result.done) release();
                    return result;
                  },
                  (error) => {
                    release();
                    throw error;
                  }
                ),
                return: () => {
                  release();
                  controller.abort();
                  return iterator.return(void 0);
                }
              };
            }
          },
          abort: () => controller.abort()
        };
      }
      /**
       * The legacy HTTP+SSE fallback (T3): GET the target; a 200 `text/event-stream` whose first
       * event is a same-origin `endpoint` enters the mode. The stream then carries the answers.
       */
      async tryEnterSse(headers, signal) {
        if (this.closed || this.endpoint !== void 0) return { kind: "unavailable" };
        const controller = this.controllerFor(signal);
        const sent = new Headers(headers);
        sent.set("accept", "text/event-stream");
        let response;
        try {
          response = await this.fetch(this.target, {
            method: "GET",
            headers: sent,
            signal: controller.signal,
            redirect: "manual"
          });
        } catch (error) {
          this.controllers.delete(controller);
          return failedExchange(error).kind === "unsent" ? { kind: "unsent" } : { kind: "unavailable" };
        }
        if (response.status !== 200) {
          const body = await bodyOf(response).catch(() => "");
          this.controllers.delete(controller);
          if (response.status >= 200 && response.status < 300) return { kind: "unavailable" };
          return { kind: "status", status: response.status, headers: headersOf(response), body };
        }
        if (mediaTypeOf(response) !== "text/event-stream" || response.body === null) {
          controller.abort();
          this.controllers.delete(controller);
          return { kind: "unavailable" };
        }
        const reader = eventsOf(response.body).getReader();
        const first = await reader.read().then(
          (result) => result.done ? void 0 : result.value,
          () => void 0
        );
        const endpoint = first === void 0 ? void 0 : this.endpointOf(first);
        if (endpoint === void 0) {
          controller.abort();
          await reader.cancel().catch(() => void 0);
          this.controllers.delete(controller);
          return { kind: "unavailable" };
        }
        this.endpoint = endpoint;
        void this.readSharedStream(reader, controller);
        return { kind: "entered" };
      }
      /** The endpoint of an `endpoint` event, when it resolves to the origin of the target. */
      endpointOf(event) {
        if (event.event !== "endpoint") return void 0;
        let url;
        try {
          url = new URL(event.data, this.target);
        } catch {
          return void 0;
        }
        return url.origin === new URL(this.target).origin ? url.href : void 0;
      }
      /** The shared stream of the SSE mode: each message event is a line; its end breaks the line. */
      async readSharedStream(reader, controller) {
        try {
          for (; ; ) {
            const next = await reader.read();
            if (next.done) break;
            if (next.value.event === void 0 || next.value.event === "message")
              this.queue.push({ kind: "line", text: next.value.data });
          }
        } catch {
        }
        this.controllers.delete(controller);
        if (!this.closed) this.queue.push({ kind: "broken" });
      }
      async close() {
        if (this.closed) return;
        this.closed = true;
        for (const controller of this.controllers) controller.abort();
        this.controllers.clear();
        this.queue.end();
      }
    };
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/options.ts
function checkOptions(options) {
  const { name, version } = options.clientInfo;
  if (typeof name !== "string" || name === "")
    throw new RangeError("clientInfo.name must be a non-empty text");
  if (typeof version !== "string" || version === "")
    throw new RangeError("clientInfo.version must be a non-empty text");
  const probe = options.probeTimeoutMs;
  if (!Number.isSafeInteger(probe) || probe <= 0)
    throw new RangeError("probeTimeoutMs must be a positive integer of milliseconds");
}
var init_options = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/options.ts"() {
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/message.ts
function parseMessage(text) {
  const read = readJsonText(text, JSON_LIMITS);
  return read.kind === "ok" && read.value.kind === "object" ? read.value : void 0;
}
function memberOf(object, key) {
  return object.entries.find((entry) => entry.key === key)?.value;
}
function textOf2(value) {
  return value?.kind === "string" ? value.value : void 0;
}
function plainIdOf(message) {
  const id = memberOf(message, "id");
  if (id?.kind === "string") return id.value;
  if (id?.kind === "number") return Number(id.lexeme);
  return void 0;
}
function isPlainJson(value) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isPlainJson);
  return typeof value === "object" && Object.values(value).every(isPlainJson);
}
function plainOf(value) {
  const parsed = JSON.parse(writeJsonText(value));
  if (!isPlainJson(parsed)) throw new TypeError("a JSON tree did not write as JSON");
  return parsed;
}
function messageText(message) {
  return JSON.stringify({ jsonrpc: "2.0", ...message });
}
var init_message = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/message.ts"() {
    init_src();
    init_limits();
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/session.ts
function reading(read) {
  return (result) => {
    const outcome = read(result);
    return "ok" in outcome ? outcome : { failure: malformed2(outcome.failure) };
  };
}
function interpret(wire, read) {
  switch (wire.kind) {
    case "result":
      return read(wire.result);
    case "error": {
      const answer2 = errorAnswerOf(wire.error);
      return answer2 === void 0 ? { failure: malformed2("error-shape") } : { failure: answer2 };
    }
    case "no-answer":
      return { failure: { kind: "no-answer", cause: wire.cause } };
    case "server-error":
      return { failure: { kind: "no-answer", cause: "stream-broken" } };
    case "not-sent":
      return { failure: wire.failure };
    case "legacy-signal":
    case "probe-timeout":
      return { failure: malformed2("discover-shape") };
    default: {
      const exhaustive = wire;
      return exhaustive;
    }
  }
}
function expiredOf(wire) {
  if (wire.kind !== "error") return void 0;
  return errorAnswerOf(wire.error)?.code === -32602 ? { ok: "expired" } : void 0;
}
function answerOf(wire) {
  switch (wire.kind) {
    case "result":
      return { kind: "result", result: wire.result };
    case "error":
      return { kind: "error", error: wire.error };
    case "no-answer":
      return { kind: "no-answer", cause: wire.cause };
    case "server-error":
      return { kind: "no-answer", cause: "stream-broken" };
    case "not-sent":
    case "legacy-signal":
    case "probe-timeout":
      return { kind: "no-answer", cause: "abandoned" };
    default: {
      const exhaustive = wire;
      return exhaustive;
    }
  }
}
function interpretFailure(wire) {
  if (wire.kind === "not-sent") return wire.failure;
  return { kind: "no-answer", cause: wire.kind === "no-answer" ? wire.cause : "stream-broken" };
}
function supportedOf2(data) {
  if (data?.kind !== "object") return void 0;
  const supported = memberOf(data, "supported");
  if (supported?.kind !== "array" || supported.items.length === 0) return void 0;
  const texts = supported.items.flatMap((item) => item.kind === "string" ? [item.value] : []);
  return texts.length === supported.items.length ? texts : void 0;
}
function errorPayloadOf(message) {
  const error = memberOf(message, "error");
  return error !== void 0 && memberOf(message, "result") === void 0 ? error : message;
}
function bodyErrorOf(body) {
  const message = body === void 0 ? void 0 : parseMessage(body);
  const error = message === void 0 ? void 0 : memberOf(message, "error");
  return error ?? { kind: "null" };
}
function drain(exchange) {
  if (exchange.kind !== "stream") return;
  void (async () => {
    try {
      for await (const message of exchange.messages) void message;
    } catch {
    }
  })();
}
function causeOfEnded(event, versions) {
  const anyRequest = { id: "", request: "tools/list", session: false, versions };
  const classified = classifyWireEvent({ ...event, kind: "stdio-ended" }, anyRequest);
  return classified.kind === "answer" && classified.answer === "process-exited" ? "process-exited" : "stream-broken";
}
function isModern(version) {
  return DATE.test(version) && version >= FIRST_MODERN_PROTOCOL_VERSION;
}
var Deferred, OFFERED_LEGACY_VERSION, MODERN_ERROR_CODES, METHOD_NOT_FOUND, READ_METHODS, PROBES, HTTP_CLASS, DATE, notSent, NOT_SENT, ABANDONED, malformed2, readTask, readAnswer, Session;
var init_session = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/session.ts"() {
    init_src5();
    init_message();
    Deferred = class {
      settled = false;
      value;
      resolve = () => void 0;
      promise;
      constructor() {
        this.promise = new Promise((resolve) => {
          this.resolve = (value) => {
            if (this.settled) return;
            this.settled = true;
            this.value = value;
            resolve(value);
          };
        });
      }
    };
    [OFFERED_LEGACY_VERSION] = LEGACY_PROTOCOL_VERSIONS;
    MODERN_ERROR_CODES = [-32022, -32021, -32020];
    METHOD_NOT_FOUND = -32601;
    READ_METHODS = ["server/discover", "tools/list", "tasks/get"];
    PROBES = ["discover", "discover-retry"];
    HTTP_CLASS = /^http:([^+]+)\+(.+)$/u;
    DATE = /^\d{4}-\d{2}-\d{2}$/u;
    notSent = { kind: "not-sent", cause: "connection-unavailable" };
    NOT_SENT = { kind: "not-sent", failure: notSent };
    ABANDONED = { kind: "no-answer", cause: "abandoned" };
    malformed2 = (what) => ({
      kind: "answer-malformed",
      what
    });
    readTask = reading(readTaskReport);
    readAnswer = reading(readTaskAnswer);
    Session = class {
      generation;
      line;
      material;
      options;
      pending = /* @__PURE__ */ new Map();
      /** Aborts what no request owns: notifications, responses to the peer, the fallback GET, metadata. */
      closing = new AbortController();
      nextId = 0;
      version;
      legacy = false;
      /** The legacy HTTP+SSE mode (T3): requests post to the endpoint, answers come on the stream. */
      sse = false;
      /** The `Mcp-Session-Id` of a legacy Streamable HTTP connection. */
      session;
      closed = false;
      dead;
      constructor(line, material, options) {
        this.line = line;
        this.material = material;
        this.options = options;
        this.generation = material.generation;
        void this.pump();
      }
      get highest() {
        const highest = this.options.versions[0];
        if (highest === void 0) throw new TypeError("the transport speaks no protocol version");
        return highest;
      }
      get usable() {
        return !this.closed && this.dead === void 0;
      }
      get credential() {
        return this.material.kind === "streamable-http" ? this.material.credential : void 0;
      }
      get stdio() {
        return this.line.kind === "stdio";
      }
      envelope(version) {
        return clientEnvelopeOf(version, this.options.clientInfo);
      }
      reserveId() {
        this.nextId += 1;
        return `r${this.nextId}`;
      }
      /** The stream or the process is gone: every pending request answers with the cause. */
      die(cause) {
        this.dead ??= cause;
        for (const entry of this.pending.values()) this.settle(entry, { kind: "no-answer", cause });
      }
      settle(entry, wire) {
        if (entry.deferred.settled) return;
        clearTimeout(entry.probe);
        this.pending.delete(entry.id);
        entry.deferred.resolve(wire);
      }
      /** Reads the events of the line until it closes. */
      async pump() {
        try {
          for await (const event of this.line.events) this.onEvent(event);
        } catch {
        }
      }
      onEvent(event) {
        switch (event.kind) {
          case "line": {
            const message = parseMessage(event.text);
            if (message !== void 0 && memberOf(message, "method") !== void 0)
              return this.onPeerMessage(message);
            for (const entry of this.pending.values()) {
              const classified = classifyWireEvent({ kind: "line", text: event.text }, entry.context);
              if (classified.kind === "answer") {
                void this.conclude(entry, classified.answer, { message });
                return;
              }
            }
            return;
          }
          case "ended":
            return this.die(causeOfEnded(event, this.options.versions));
          case "broken":
            return this.die("stream-broken");
          default: {
            const exhaustive = event;
            return exhaustive;
          }
        }
      }
      /**
       * A request or notification of the peer (T3): `ping` answers an empty result, every other
       * request `-32601`; a progress notification whose token is the token of a call in flight goes
       * to its observer, as written and untrusted (S6); every other notification is dropped.
       */
      onPeerMessage(message) {
        const method = textOf2(memberOf(message, "method"));
        const id = plainIdOf(message);
        if (id !== void 0) {
          void this.respond(
            method === "ping" ? { id, result: {} } : { id, error: { code: METHOD_NOT_FOUND, message: "Method not found" } }
          );
          return;
        }
        if (method !== "notifications/progress") return;
        const params = memberOf(message, "params");
        const token = params?.kind === "object" ? memberOf(params, "progressToken") : void 0;
        const tokenText = token?.kind === "string" ? token.value : token?.kind === "number" ? token.lexeme : void 0;
        const entry = tokenText === void 0 ? void 0 : this.pending.get(tokenText);
        if (entry?.observe === void 0 || params === void 0) return;
        try {
          entry.observe({ kind: "progress", notification: { untrusted: params } });
        } catch {
        }
      }
      /** The headers of a message that is not a request: the protocol version and the session. */
      plainHeaders() {
        const headers = new Headers();
        headers.set("mcp-protocol-version", this.version ?? this.highest);
        if (this.session !== void 0 && !this.sse) headers.set("mcp-session-id", this.session);
        return headers;
      }
      /** Writes a response to a request of the peer. What the wire answers has no outcome (N01). */
      async respond(response) {
        if (!this.usable) return;
        await this.write({ text: messageText(response), headers: this.plainHeaders() });
      }
      /** Writes a message nobody waits for. Whatever the wire does with it has no outcome (N01). */
      async write(outbound) {
        try {
          drain(await this.line.send(outbound, this.closing.signal));
        } catch {
        }
      }
      /** Sends a notification (T3). Whatever the peer answers to it does not change any outcome (N01). */
      async sendNotification(method, params) {
        if (!this.usable) return;
        const version = this.version ?? this.highest;
        const headers = new Headers();
        if (!await this.authorize(headers)) return;
        this.setMcpHeaders(headers, method, params, version);
        const text = messageText({ method, params: { ...params, _meta: this.envelope(version) } });
        await this.write({ text, headers });
      }
      setMcpHeaders(headers, method, params, version) {
        const session = this.sse ? void 0 : this.session;
        const mcp = mcpRequestHeadersOf(method, params, version, session);
        for (const [name, value] of Object.entries(mcp))
          if (value !== void 0) headers.set(name, value);
      }
      /**
       * Authorizes an outgoing request with the credential handle, when the material has one. True
       * when the request may go out; `undefined` from a handle that rejects or throws leaves it not
       * sent (T9).
       */
      async authorize(headers) {
        const credential = this.credential;
        if (credential === void 0) return true;
        const answer2 = await Promise.resolve().then(() => credential.authorize(headers)).catch(() => void 0);
        return answer2 !== void 0 && !("failure" in answer2);
      }
      /**
       * Composes one request (T3) and hands it to the line. Undefined when it is not sent: the
       * transport is unusable or the credential handle did not authorize it. Otherwise the pending
       * request, settled already when the wire answered at once.
       */
      async send(method, params, how) {
        if (!this.usable) return void 0;
        const id = this.reserveId();
        const headers = new Headers();
        const authorized = this.credential !== void 0;
        if (!await this.authorize(headers)) return void 0;
        if (!this.usable) return void 0;
        const version = how.version ?? this.version ?? this.highest;
        this.setMcpHeaders(headers, method, params, version);
        const meta = method === "tools/call" ? { ...this.envelope(version), progressToken: id } : this.envelope(version);
        const text = messageText({ id, method, params: { ...params, _meta: meta } });
        const entry = {
          id,
          context: {
            id,
            request: this.classOf(method, how.retry === true),
            session: (this.session !== void 0 || this.sse) && method !== "initialize",
            versions: this.options.versions,
            ...this.sse ? { mode: "sse" } : {}
          },
          controller: new AbortController(),
          deferred: new Deferred(),
          authorized,
          ...how.observe === void 0 ? {} : { observe: how.observe }
        };
        this.pending.set(id, entry);
        await this.dispatch(entry, { text, headers });
        return entry;
      }
      classOf(method, retry) {
        switch (method) {
          case "server/discover":
            return retry ? "discover-retry" : "discover";
          case "initialize":
          case "tools/list":
          case "tools/call":
          case "tasks/get":
          case "tasks/update":
          case "tasks/cancel":
            return method;
          default:
            throw new TypeError(`${method} is not a request the session sends`);
        }
      }
      /** Hands one request to the line and settles it from what the wire did at once. */
      async dispatch(entry, outbound) {
        let exchange;
        try {
          exchange = await this.line.send(outbound, entry.controller.signal);
        } catch {
          exchange = { kind: "aborted" };
        }
        if (entry.deferred.settled) return drain(exchange);
        switch (exchange.kind) {
          case "unsent":
            return this.conclude(entry, "unsent", {});
          case "sent":
            if (this.stdio && PROBES.includes(entry.context.request))
              entry.probe = setTimeout(
                () => this.settle(entry, { kind: "probe-timeout" }),
                this.options.probeTimeoutMs
              );
            return;
          case "aborted":
            if (entry.controller.signal.aborted) return this.settle(entry, ABANDONED);
            return this.conclude(entry, "stream-broken", {});
          case "status": {
            const classified = classifyWireEvent({ ...exchange, kind: "http-status" }, entry.context);
            if (classified.kind === "answer")
              return this.conclude(entry, classified.answer, {
                headers: exchange.headers,
                body: exchange.body
              });
            return;
          }
          case "stream":
            entry.stream = exchange;
            void this.consume(entry, exchange);
            return;
          default: {
            const exhaustive = exchange;
            return exhaustive;
          }
        }
      }
      /** Reads a 2xx answer stream: the messages of the peer, and the answer when it comes. */
      async consume(entry, exchange) {
        const seen = [];
        try {
          for await (const text of exchange.messages) {
            seen.push(text);
            const message = parseMessage(text);
            if (message !== void 0 && memberOf(message, "method") !== void 0) {
              this.onPeerMessage(message);
              continue;
            }
            if (entry.deferred.settled) continue;
            const event = { kind: "http-stream", messages: [text], ended: false };
            const classified2 = classifyWireEvent(event, entry.context);
            if (classified2.kind === "answer")
              await this.conclude(entry, classified2.answer, { message, headers: exchange.headers });
          }
          if (entry.deferred.settled) return;
          const ended = { kind: "http-stream", messages: seen, ended: true };
          const classified = classifyWireEvent(ended, entry.context);
          if (classified.kind === "answer")
            await this.conclude(entry, classified.answer, { headers: exchange.headers });
        } catch {
          if (entry.deferred.settled) return;
          if (entry.controller.signal.aborted) return this.settle(entry, ABANDONED);
          await this.conclude(entry, "stream-broken", {});
        }
      }
      /** Settles a request from its answer class (T8) and applies what the row says of the transport. */
      async conclude(entry, answer2, payload) {
        switch (answer2) {
          case "unsent":
            this.settle(entry, NOT_SENT);
            if (this.stdio) this.die("stream-broken");
            return;
          case "silent":
            return this.settle(entry, ABANDONED);
          case "stream-broken":
          case "http:2xx":
            return this.settle(entry, { kind: "no-answer", cause: "stream-broken" });
          case "process-exited":
            this.settle(entry, { kind: "no-answer", cause: "process-exited" });
            return this.die("process-exited");
          case "http:401":
          case "http:403+scope":
            return this.settle(
              entry,
              await this.authorizationRequired(entry.authorized, payload.headers ?? {})
            );
          case "http:403":
            return this.settle(entry, NOT_SENT);
          case "http:404+session":
            this.dead = "session-ended";
            return this.settle(entry, {
              kind: "not-sent",
              failure: { kind: "not-sent", cause: "session-ended" }
            });
          default:
            return this.settle(entry, this.answerWireOf(entry, answer2, payload));
        }
      }
      /** The wire of a JSON-RPC answer, direct or in an HTTP error body. */
      answerWireOf(entry, answer2, payload) {
        const { message } = payload;
        if (answer2.startsWith("result")) {
          const result = message === void 0 ? void 0 : memberOf(message, "result");
          const session = entry.context.request === "initialize" ? payload.headers?.["mcp-session-id"] : void 0;
          return {
            kind: "result",
            result: result ?? { kind: "null" },
            ...session === void 0 ? {} : { session }
          };
        }
        if (answer2.startsWith("error:"))
          return {
            kind: "error",
            error: message === void 0 ? { kind: "null" } : errorPayloadOf(message)
          };
        const match = HTTP_CLASS.exec(answer2);
        const status = match?.[1];
        const body = match?.[2];
        const probe = PROBES.includes(entry.context.request);
        if (body === "plain") {
          if (status === "5xx") return { kind: "server-error" };
          if (probe) return { kind: "legacy-signal" };
          if (entry.context.request === "initialize" && !this.sse)
            return { kind: "not-sent", failure: notSent, legacyHttp: true };
          return NOT_SENT;
        }
        const error = bodyErrorOf(payload.body);
        if (!probe) return { kind: "error", error };
        if (status === "5xx") return { kind: "server-error" };
        const code = errorAnswerOf(error)?.code;
        return code !== void 0 && MODERN_ERROR_CODES.includes(code) ? { kind: "error", error } : { kind: "legacy-signal" };
      }
      /** T4: reports the rejection to the handle that authorized the request, then discovers. */
      async authorizationRequired(authorized, headers) {
        const credential = this.credential;
        if (credential !== void 0 && authorized)
          await Promise.resolve().then(() => credential.reportRejection()).catch(() => void 0);
        const challenge = authorizationChallengeOf(headers["www-authenticate"]);
        const discovery = await this.discoverAuthorization(challenge);
        return {
          kind: "not-sent",
          failure: { kind: "not-sent", cause: "authorization-required", discovery }
        };
      }
      async discoverAuthorization(challenge) {
        const target = this.material.kind === "streamable-http" ? this.material.target : "https://invalid.test/";
        const candidates = metadataCandidatesOf(target, challenge);
        const fetched = [];
        for (const url of candidates) {
          const metadata = await this.options.fetchMetadata(url, this.closing.signal).catch(() => void 0);
          fetched.push(metadata);
          if (metadata?.kind === "object") break;
        }
        return authorizationDiscoveryOf(challenge, candidates, fetched);
      }
      /** Sends one non-call request; on Streamable HTTP a read request is re-sent once after a broken stream (D15, O05). */
      async request(method, params, how = {}) {
        const first = await this.once(method, params, how);
        const read = this.line.kind === "streamable-http" && !this.sse && READ_METHODS.includes(method);
        if (read && first.kind === "no-answer" && first.cause === "stream-broken")
          return this.once(method, params, how);
        return first;
      }
      async once(method, params, how) {
        const entry = await this.send(method, params, how);
        return entry === void 0 ? NOT_SENT : entry.deferred.promise;
      }
      async discover() {
        const modern = await this.modernPath();
        if (modern.kind === "identity") return { ok: modern.identity };
        if (modern.kind === "final") return { failure: modern.failure };
        const legacy = await this.legacyPath();
        if ("ok" in legacy || modern.kind === "legacy-peer") return legacy;
        return { failure: modern.failure };
      }
      /** The modern path: `server/discover`, once more after a `-32022` that names a version in common. */
      async modernPath() {
        let version = this.highest;
        let retried = false;
        for (; ; ) {
          const wire = await this.request("server/discover", {}, { version, retry: retried });
          const probe = this.probeOf(wire, retried);
          if (probe.kind !== "retry") return probe;
          retried = true;
          version = probe.version;
        }
      }
      /** What one answer to `server/discover` means (T3, T8 D rows). */
      probeOf(wire, retried) {
        switch (wire.kind) {
          case "result": {
            const read = readDiscoverResult(wire.result, this.options.versions);
            if ("ok" in read) {
              this.version = read.ok.protocolVersion;
              return { kind: "identity", identity: peerIdentityOf(read.ok, this.bound) };
            }
            if (read.failure === "no-common-version") return { kind: "legacy-peer" };
            return { kind: "fallback", failure: malformed2("discover-shape") };
          }
          case "error":
            return this.probeErrorOf(wire.error, retried);
          case "no-answer":
          case "not-sent":
          case "server-error":
            return { kind: "final", failure: interpretFailure(wire) };
          case "legacy-signal":
          case "probe-timeout":
            return { kind: "legacy-peer" };
          default: {
            const exhaustive = wire;
            return exhaustive;
          }
        }
      }
      /** A JSON-RPC error on `server/discover`: the modern codes are final, `-32601` is a legacy peer. */
      probeErrorOf(error, retried) {
        const answer2 = errorAnswerOf(error);
        if (answer2 === void 0) return { kind: "fallback", failure: malformed2("error-shape") };
        if (answer2.code === -32022 && !retried) return this.versionRetryOf(answer2.data);
        if (MODERN_ERROR_CODES.includes(answer2.code)) return { kind: "final", failure: answer2 };
        if (answer2.code === METHOD_NOT_FOUND) return { kind: "legacy-peer" };
        return { kind: "fallback", failure: answer2 };
      }
      /** The first `-32022` (D04–D06): a version in common is retried; modern versions with none in common are final. */
      versionRetryOf(data) {
        const modern = (supportedOf2(data) ?? []).filter(isModern);
        if (modern.length === 0) return { kind: "legacy-peer" };
        const common = this.options.versions.find((version) => modern.includes(version));
        return common === void 0 ? { kind: "final", failure: malformed2("discover-shape") } : { kind: "retry", version: common };
      }
      get bound() {
        return {
          generation: this.generation,
          instructionsByteLimit: this.material.instructionsByteLimit
        };
      }
      /** The legacy path (T3): `initialize` with the highest legacy version, then `notifications/initialized`. */
      async legacyPath() {
        const params = {
          protocolVersion: OFFERED_LEGACY_VERSION,
          capabilities: {},
          clientInfo: { ...this.options.clientInfo }
        };
        const how = { version: OFFERED_LEGACY_VERSION };
        let wire = await this.request("initialize", params, how);
        if (wire.kind === "not-sent" && wire.legacyHttp === true) {
          const entered = await this.enterSse();
          wire = entered === void 0 ? await this.request("initialize", params, how) : entered;
        }
        const read = interpret(wire, (result) => {
          const legacy = readInitializeResult(result);
          if ("failure" in legacy) return { failure: malformed2("discover-shape") };
          this.version = legacy.ok.protocolVersion;
          this.legacy = true;
          return { ok: peerIdentityOf(legacy.ok, this.bound) };
        });
        if ("failure" in read) return read;
        if (wire.kind === "result") this.session = wire.session;
        await this.sendNotification("notifications/initialized", {});
        return read;
      }
      /**
       * Tries the legacy HTTP+SSE fallback (T3). Undefined when the line entered the SSE mode;
       * otherwise the wire that `initialize` reports: a refused authorization of the GET (S05, S06),
       * or `not-sent` (I07).
       */
      async enterSse() {
        const enter = this.line.enterSse?.bind(this.line);
        if (enter === void 0 || this.sse || !this.usable) return NOT_SENT;
        const headers = new Headers();
        const authorized = this.credential !== void 0;
        if (!await this.authorize(headers)) return NOT_SENT;
        if (!this.usable) return NOT_SENT;
        headers.set("mcp-protocol-version", OFFERED_LEGACY_VERSION);
        const entry = await enter(headers, this.closing.signal);
        switch (entry.kind) {
          case "entered":
            this.sse = true;
            return void 0;
          case "status": {
            const context = {
              id: "",
              request: "initialize",
              session: false,
              versions: this.options.versions
            };
            const classified = classifyWireEvent({ ...entry, kind: "http-status" }, context);
            if (classified.kind === "answer" && (classified.answer === "http:401" || classified.answer === "http:403+scope"))
              return this.authorizationRequired(authorized, entry.headers);
            return NOT_SENT;
          }
          case "unsent":
          case "unavailable":
            return NOT_SENT;
          default: {
            const exhaustive = entry;
            return exhaustive;
          }
        }
      }
      async listActions(cursor) {
        const wire = await this.request("tools/list", cursor === void 0 ? {} : { cursor });
        const checked = this.line.kind === "streamable-http" && !this.legacy;
        return interpret(
          wire,
          reading((result) => readListingPage(result, checked))
        );
      }
      async call(request, signal, observe) {
        if (!this.usable || signal.aborted) return { failure: notSent };
        const continuation = request.continuation;
        const params = {
          name: request.action,
          arguments: plainOf(request.args),
          ...continuation?.requestState === void 0 ? {} : { requestState: continuation.requestState },
          ...continuation?.inputResponses === void 0 ? {} : { inputResponses: plainOf(continuation.inputResponses) }
        };
        const entry = await this.sendCall(params, signal, observe);
        if (entry === void 0) return { failure: notSent };
        const wire = entry.deferred.value;
        if (wire?.kind === "not-sent") return { failure: wire.failure };
        return { ok: { requestId: entry.id, answer: entry.deferred.promise.then(answerOf) } };
      }
      /** Sends `tools/call`; the caller's signal, once it fires, abandons the answer (T5). */
      async sendCall(params, signal, observe) {
        let entry;
        const abandon = () => {
          if (entry === void 0) return;
          entry.controller.abort();
          entry.stream?.abort();
          this.settle(entry, ABANDONED);
        };
        signal.addEventListener("abort", abandon, { once: true });
        entry = await this.send("tools/call", params, observe === void 0 ? {} : { observe });
        if (entry === void 0) {
          signal.removeEventListener("abort", abandon);
          return void 0;
        }
        if (signal.aborted) abandon();
        void entry.deferred.promise.then(() => signal.removeEventListener("abort", abandon));
        return entry;
      }
      /**
       * stdio, and Streamable HTTP on a legacy revision, send `notifications/cancelled`; Streamable
       * HTTP on a modern revision ends the answer stream (T5).
       */
      async cancelRequest(requestId) {
        if (this.stdio || this.legacy || this.sse) {
          await this.sendNotification("notifications/cancelled", { requestId });
          return;
        }
        const entry = this.pending.get(requestId);
        if (entry === void 0) return;
        entry.controller.abort();
        entry.stream?.abort();
        this.settle(entry, ABANDONED);
      }
      async getTask(taskId) {
        const wire = await this.request("tasks/get", { taskId });
        return expiredOf(wire) ?? interpret(wire, readTask);
      }
      async getTaskResult(taskId) {
        const wire = await this.request("tasks/get", { taskId });
        if (expiredOf(wire) !== void 0) return { ok: { kind: "expired" } };
        return interpret(wire, readAnswer);
      }
      async updateTask(taskId, inputResponses) {
        const wire = await this.request("tasks/update", {
          taskId,
          inputResponses: plainOf(inputResponses)
        });
        return interpret(wire, () => ({ ok: "accepted" }));
      }
      async cancelTask(taskId) {
        const wire = await this.request("tasks/cancel", { taskId });
        return interpret(wire, () => ({ ok: "requested" }));
      }
      /** Closes the transport (T5): the requests in flight are abandoned, then the line closes. */
      async close() {
        if (this.closed) return;
        this.closed = true;
        for (const entry of this.pending.values()) {
          entry.controller.abort();
          entry.stream?.abort();
          this.settle(entry, ABANDONED);
        }
        this.closing.abort();
        await this.line.close();
      }
    };
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/stdio-line.ts
var encoder2, StdioLine;
var init_stdio_line = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/stdio-line.ts"() {
    init_src5();
    init_limits();
    init_queue();
    encoder2 = new TextEncoder();
    StdioLine = class {
      kind = "stdio";
      events;
      queue = new AsyncQueue();
      writer;
      stdout;
      stderr;
      exited;
      stdoutEndedAt;
      exitedAt;
      announced = false;
      window;
      writable = true;
      closed = false;
      constructor(process2) {
        this.events = this.queue;
        this.writer = process2.stdin.getWriter();
        this.stdout = process2.stdout.getReader();
        this.stderr = process2.stderr.getReader();
        this.exited = process2.exited.then(
          () => this.onExited(),
          () => this.onExited()
        );
        void this.readStdout();
        void this.drainStderr();
      }
      /**
       * Settles what is already observable before the transport is handed over: a process that has
       * exited, a stdout that has ended. It waits for nothing that has not happened yet.
       */
      async ready() {
        await Promise.race([this.exited, Promise.resolve()]);
        await new Promise((resolve) => setImmediate(resolve));
      }
      /** The instant of an event on one clock: the contract's exit window compares two of them (T8). */
      now() {
        return (
          /* wall-clock: operation-timing -- the exit window of contract T8 compares stdout's end and the exit on one clock */
          performance.now()
        );
      }
      async readStdout() {
        const decoder2 = new TextDecoder("utf-8", { fatal: false });
        let buffered = "";
        let pendingBytes = 0;
        let broken = false;
        try {
          for (; ; ) {
            const next = await this.stdout.read();
            if (next.done) break;
            buffered += decoder2.decode(next.value, { stream: true });
            let newline = buffered.indexOf("\n");
            if (newline < 0) {
              pendingBytes += next.value.byteLength;
              if (pendingBytes <= BYTE_LIMIT) continue;
              broken = true;
              break;
            }
            if (encoder2.encode(buffered.slice(0, newline)).byteLength > BYTE_LIMIT) {
              broken = true;
              break;
            }
            while (newline >= 0) {
              this.deliver(buffered.slice(0, newline));
              buffered = buffered.slice(newline + 1);
              newline = buffered.indexOf("\n");
            }
            pendingBytes = encoder2.encode(buffered).byteLength;
          }
          const tail = buffered + decoder2.decode();
          if (!broken && tail !== "" && pendingBytes <= BYTE_LIMIT) this.deliver(tail);
        } catch {
        }
        if (broken) {
          await this.stdout.cancel().catch(() => void 0);
          this.stdoutEndedAt ??= this.now();
          this.announce();
          return;
        }
        this.onStdoutEnded();
      }
      deliver(text) {
        this.queue.push({ kind: "line", text: text.endsWith("\r") ? text.slice(0, -1) : text });
      }
      async drainStderr() {
        try {
          for (; ; ) {
            const next = await this.stderr.read();
            if (next.done) return;
          }
        } catch {
        }
      }
      /** stdout ended: the exit within the window decides the cause (T8). */
      onStdoutEnded() {
        if (this.stdoutEndedAt !== void 0 || this.closed) return;
        this.stdoutEndedAt = this.now();
        if (this.exitedAt !== void 0) return this.announce();
        this.window = setTimeout(() => this.announce(), PROCESS_EXIT_WINDOW_MS);
      }
      /** The process exited: stdout is read for the window, then the event goes out. */
      onExited() {
        if (this.exitedAt !== void 0 || this.closed) return;
        this.exitedAt = this.now();
        if (this.stdoutEndedAt !== void 0) return this.announce();
        this.window = setTimeout(() => {
          this.announce();
          void this.stdout.cancel().catch(() => void 0);
        }, PROCESS_EXIT_WINDOW_MS);
      }
      announce() {
        if (this.announced || this.closed) return;
        this.announced = true;
        clearTimeout(this.window);
        this.queue.push({
          kind: "ended",
          ...this.stdoutEndedAt === void 0 ? {} : { stdoutEndedAt: this.stdoutEndedAt },
          ...this.exitedAt === void 0 ? {} : { exitedAt: this.exitedAt }
        });
      }
      /** Writes one line. A write to a process that exited, or a write that fails, is `unsent` (X02). */
      async send(outbound) {
        if (this.closed || !this.writable || this.exitedAt !== void 0) return { kind: "unsent" };
        try {
          await this.writer.write(encoder2.encode(`${outbound.text}
`));
        } catch {
          this.writable = false;
          return { kind: "unsent" };
        }
        return { kind: "sent" };
      }
      /** T5: the stdin write end first, then the stdout read; the process is left alone. */
      async close() {
        if (this.closed) return;
        this.closed = true;
        clearTimeout(this.window);
        this.writable = false;
        await this.writer.close().catch(() => void 0);
        await this.stdout.cancel().catch(() => void 0);
        await this.stderr.cancel().catch(() => void 0);
        this.queue.end();
      }
    };
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/factory.ts
function createLocalTransportFactory(options) {
  checkOptions(options);
  const fetchFn = options.fetch ?? globalThis.fetch;
  const sessionOptions = {
    clientInfo: { name: options.clientInfo.name, version: options.clientInfo.version },
    versions: VERSIONS,
    probeTimeoutMs: options.probeTimeoutMs,
    fetchMetadata: metadataFetcher(fetchFn)
  };
  return {
    async open(material, signal) {
      if (signal.aborted) return { failure: NOT_SENT2 };
      let line;
      if (material.kind === "stdio") {
        const stdio = new StdioLine(material.process);
        await stdio.ready();
        line = stdio;
      } else line = new HttpLine(material.target, fetchFn);
      if (signal.aborted) {
        await line.close();
        return { failure: NOT_SENT2 };
      }
      return { ok: new Session(line, material, sessionOptions) };
    }
  };
}
var VERSIONS, NOT_SENT2;
var init_factory = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/factory.ts"() {
    init_src5();
    init_authorization2();
    init_http_line();
    init_options();
    init_session();
    init_stdio_line();
    VERSIONS = [FIRST_MODERN_PROTOCOL_VERSION];
    NOT_SENT2 = { kind: "not-sent", cause: "connection-unavailable" };
  }
});

// ../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/index.ts
var src_exports = {};
__export(src_exports, {
  createLocalTransportFactory: () => createLocalTransportFactory
});
var init_src6 = __esm({
  "../../../data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/index.ts"() {
    init_factory();
  }
});

// common.ts
async function factory(extra = {}) {
  const { createLocalTransportFactory: createLocalTransportFactory2 } = await Promise.resolve().then(() => (init_src6(), src_exports));
  return createLocalTransportFactory2({ clientInfo: { name: "probe", version: "1" }, probeTimeoutMs: 300, ...extra });
}
var race = (p, ms) => Promise.race([p.then((v) => ({ settled: true, v })), new Promise((r2) => setTimeout(() => r2({ settled: false }), ms))]);

// p3-stdio-close-blocked.ts
var log = [];
var stdoutCtl;
var stdin = new WritableStream({ write: () => {
  log.push("write");
  return new Promise(() => {
  });
}, close: () => {
  log.push("stdin-close");
}, abort: () => {
  log.push("stdin-abort");
} });
var stdout = new ReadableStream({ start: (c) => {
  stdoutCtl = c;
}, cancel: () => {
  log.push("stdout-cancel");
} });
var stderr = new ReadableStream({});
var handle = { stdin, stdout, stderr, exited: new Promise(() => {
}), stop: async () => ({ scope: "tree" }) };
var f = await factory();
var t = (await f.open({ kind: "stdio", process: handle, generation: 1, instructionsByteLimit: 1e3 }, new AbortController().signal)).ok;
var ac = new AbortController();
var call = t.call({ action: "echo", args: { kind: "object", entries: [] } }, ac.signal);
await new Promise((r2) => setTimeout(r2, 100));
ac.abort();
var c1 = await race(call, 1e3);
console.log("P3 call settled 1s after its signal fired:", c1.settled);
var closing = t.close();
var r = await race(closing, 3e3);
console.log("P3 close() settled within 3s:", r.settled, "log:", log.join(","));
var c2 = await race(call, 500);
console.log("P3 call settled after close:", c2.settled);
process.exit(0);
