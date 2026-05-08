// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as ts from 'typescript';

export interface SymbolInfo {
  /** 0-based номер строки определения */
  line: number;
  /** Очищенный текст JSDoc (без маркеров комментария и ведущих звёздочек) */
  jsdoc?: string;
  kind?: 'constructor' | 'interface' | 'class' | 'method' | 'static' | 'enum';
  /** Базовые классы/интерфейсы из @extends или class extends */
  extends?: string[];
  /** Интерфейсы из @implements */
  implements?: string[];
}

// Regex для извлечения @-тегов из сырого JSDoc-текста
const JSDOC_EXTENDS_RE    = /@extends\s*\{([^}]+)\}/g;
const JSDOC_IMPLEMENTS_RE = /@implements\s*\{([^}]+)\}/g;
const JSDOC_INTERFACE_RE  = /@interface\b/;
const JSDOC_CONSTRUCTOR_RE = /@constructor\b/;
const JSDOC_ENUM_RE       = /@enum\b/;

/** Извлекает все совпадения одного regex из строки */
function extractTagValues(text: string, re: RegExp): string[] {
  re.lastIndex = 0;
  const result: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    result.push(m[1].trim());
  }
  return result;
}

/** Очищает сырой JSDoc: убирает /**, *\/ и ведущие " * " */
function cleanJsdoc(raw: string): string {
  return raw
    .replace(/^\/\*+/, '')
    .replace(/\*+\/$/, '')
    .replace(/^\s*\*\s?/gm, '')
    .trim();
}

/**
 * Ищет ведущий JSDoc-комментарий перед позицией `nodePos` в исходном тексте.
 * Возвращает сырой текст комментария или undefined.
 */
function getLeadingJsdoc(sourceText: string, nodePos: number): string | undefined {
  const ranges = ts.getLeadingCommentRanges(sourceText, nodePos);
  if (!ranges) return undefined;
  // Берём последний комментарий перед узлом, начинающийся с /**
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    const text = sourceText.slice(r.pos, r.end);
    if (text.startsWith('/**')) return text;
  }
  return undefined;
}

/** Парсит JSDoc-текст и заполняет мета-поля SymbolInfo */
function parseJsdocMeta(raw: string, info: SymbolInfo): void {
  const cleaned = cleanJsdoc(raw);
  info.jsdoc = cleaned;

  if (JSDOC_INTERFACE_RE.test(raw)) {
    info.kind = 'interface';
  } else if (JSDOC_CONSTRUCTOR_RE.test(raw)) {
    info.kind = 'constructor';
  }

  const ext = extractTagValues(raw, JSDOC_EXTENDS_RE);
  if (ext.length > 0) {
    info.extends = [...(info.extends ?? []), ...ext];
  }

  const impl = extractTagValues(raw, JSDOC_IMPLEMENTS_RE);
  if (impl.length > 0) {
    info.implements = [...(info.implements ?? []), ...impl];
  }
}

/** Получает полное dotted-имя из PropertyAccessExpression / Identifier */
function getDottedName(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const left = getDottedName(node.expression);
    if (!left) return undefined;
    return `${left}.${node.name.text}`;
  }
  return undefined;
}

/**
 * Сканирует JS-файл через TypeScript AST и возвращает карту символов.
 *
 * Ключи карты — полные dotted-пути произвольной глубины, например:
 *   "Ns.Sub.Class"                        — класс/конструктор/интерфейс
 *   "Ns.Sub.Class.prototype.getColor"     — метод прототипа
 *   "Ns.Sub.Class.staticHelper"           — статический метод
 */
export function scanSymbols(content: string, filePath: string): Map<string, SymbolInfo> {
  const symbols = new Map<string, SymbolInfo>();

  // Latest — принимает весь современный JS без тихих parse-ошибок; setParentNodes=true
  // страхует getStart(sf) на дочерних узлах класса в handleClassExpression
  const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, /*setParentNodes*/ true);

  function lineOf(pos: number): number {
    // ts.getLineAndCharacterOfPosition надёжнее ручного split
    return sf.getLineAndCharacterOfPosition(pos).line;
  }

  /** Регистрирует ES6-класс и все его методы; className — полный dotted-путь */
  function handleClassExpression(
    className: string,
    classExpr: ts.ClassExpression | ts.ClassDeclaration,
    nodePos: number
  ): void {
    const info: SymbolInfo = { line: lineOf(nodePos), kind: 'class' };

    const jsdocRaw = getLeadingJsdoc(content, nodePos);
    if (jsdocRaw) parseJsdocMeta(jsdocRaw, info);

    // extends из heritageClauses (class extends Base)
    if (classExpr.heritageClauses) {
      for (const clause of classExpr.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const typeNode of clause.types) {
            const name = getDottedName(typeNode.expression);
            if (name) info.extends = [...(info.extends ?? []), name];
          }
        }
        if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
          for (const typeNode of clause.types) {
            const name = getDottedName(typeNode.expression);
            if (name) info.implements = [...(info.implements ?? []), name];
          }
        }
      }
    }

    symbols.set(className, info);

    // Методы внутри класса
    for (const member of classExpr.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      const nameNode = member.name;
      if (!ts.isIdentifier(nameNode) && !ts.isStringLiteral(nameNode)) continue;
      const methodName = nameNode.text;
      const isStatic = member.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword) ?? false;
      const methodKey = isStatic
        ? `${className}.${methodName}`
        : `${className}.prototype.${methodName}`;

      const mInfo: SymbolInfo = {
        line: lineOf(member.getStart(sf)),
        kind: isStatic ? 'static' : 'method',
      };
      const mJsdoc = getLeadingJsdoc(content, member.pos);
      if (mJsdoc) mInfo.jsdoc = cleanJsdoc(mJsdoc);
      symbols.set(methodKey, mInfo);
    }
  }

  /** Обходит один Statement верхнего уровня */
  function visitStatement(stmt: ts.Statement): void {
    // ClassDeclaration: class Foo { ... } — типичный паттерн goog.module
    if (ts.isClassDeclaration(stmt) && stmt.name) {
      handleClassExpression(stmt.name.text, stmt, stmt.getStart(sf));
      return;
    }

    // FunctionDeclaration: function Foo() { ... } — паттерн goog.module и legacy GCL
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      const info: SymbolInfo = { line: lineOf(stmt.getStart(sf)) };
      const jsdocRaw = getLeadingJsdoc(content, stmt.pos);
      if (jsdocRaw) parseJsdocMeta(jsdocRaw, info);
      symbols.set(stmt.name.text, info);
      return;
    }

    // VariableStatement: const/var/let Foo = function() {} или = class {}
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        const name = decl.name.text;
        const initKind = decl.initializer.kind;
        if (initKind === ts.SyntaxKind.FunctionExpression || initKind === ts.SyntaxKind.ArrowFunction) {
          const info: SymbolInfo = { line: lineOf(stmt.getStart(sf)) };
          const jsdocRaw = getLeadingJsdoc(content, stmt.pos);
          if (jsdocRaw) parseJsdocMeta(jsdocRaw, info);
          symbols.set(name, info);
        } else if (initKind === ts.SyntaxKind.ClassExpression) {
          handleClassExpression(name, decl.initializer as ts.ClassExpression, stmt.getStart(sf));
        }
      }
      return;
    }

    // ExpressionStatement: X = function/class, или goog.inherits(...)
    if (!ts.isExpressionStatement(stmt)) return;
    const expr = stmt.expression;

    // goog.inherits(Child, Parent)
    if (
      ts.isCallExpression(expr) &&
      ts.isPropertyAccessExpression(expr.expression) &&
      getDottedName(expr.expression) === 'goog.inherits' &&
      expr.arguments.length >= 2
    ) {
      const childName = getDottedName(expr.arguments[0] as ts.Expression);
      const parentName = getDottedName(expr.arguments[1] as ts.Expression);
      if (childName && parentName) {
        const existing = symbols.get(childName);
        if (existing) {
          existing.extends = [...(existing.extends ?? []), parentName];
        }
        // Если символ ещё не зарегистрирован — ничего не делаем;
        // goog.inherits обычно идёт после объявления, так что existing должен быть
      }
      return;
    }

    // BinaryExpression: LHS = RHS
    if (!ts.isBinaryExpression(expr) || expr.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;

    const lhs = expr.left;
    const rhs = expr.right;
    const symbolName = getDottedName(lhs);
    if (!symbolName) return;

    // Пропускаем чисто примитивные присваивания (число, строка и т.п.)
    const rhsKind = rhs.kind;

    // RHS — FunctionExpression → GCL-конструктор или метод
    if (rhsKind === ts.SyntaxKind.FunctionExpression || rhsKind === ts.SyntaxKind.ArrowFunction) {
      // Определяем — это метод прототипа, статик или конструктор?
      const isPrototypeMethod = symbolName.includes('.prototype.');
      const info: SymbolInfo = {
        line: lineOf(stmt.getStart(sf)),
        kind: isPrototypeMethod ? 'method' : undefined,
      };

      const jsdocRaw = getLeadingJsdoc(content, stmt.pos);
      if (jsdocRaw) parseJsdocMeta(jsdocRaw, info);

      // Если явно не prototype — может быть static или constructor
      if (!isPrototypeMethod && !info.kind) {
        // Эвристика: если имя содержит хотя бы две части и нет .prototype. — статик
        // Если одна часть или соответствует namespace-стилю — constructor
        // Без @constructor/@interface трактуем как generic function
        info.kind = undefined;
      }

      symbols.set(symbolName, info);
      return;
    }

    // RHS — ClassExpression → ES6 класс
    if (rhsKind === ts.SyntaxKind.ClassExpression) {
      handleClassExpression(symbolName, rhs as ts.ClassExpression, stmt.getStart(sf));
      return;
    }

    // RHS — ObjectLiteralExpression + @enum → GCL enum-тип
    if (rhsKind === ts.SyntaxKind.ObjectLiteralExpression) {
      const jsdocRaw = getLeadingJsdoc(content, stmt.pos);
      if (jsdocRaw && JSDOC_ENUM_RE.test(jsdocRaw)) {
        const info: SymbolInfo = { line: lineOf(stmt.getStart(sf)), kind: 'enum' };
        info.jsdoc = cleanJsdoc(jsdocRaw);
        symbols.set(symbolName, info);
      }
      return;
    }
  }

  // Разворачивает goog.scope(function() { ... }) → массив внутренних statements
  function unwrapGoogScope(stmt: ts.Statement): readonly ts.Statement[] | null {
    if (!ts.isExpressionStatement(stmt)) return null;
    const expr = stmt.expression;
    if (!ts.isCallExpression(expr)) return null;
    if (getDottedName(expr.expression) !== 'goog.scope') return null;
    const arg = expr.arguments[0];
    if (!arg || !ts.isFunctionExpression(arg)) return null;
    return arg.body.statements;
  }

  // Обходим верхний уровень; goog.scope прозрачно разворачиваем на один уровень
  for (const stmt of sf.statements) {
    const inner = unwrapGoogScope(stmt);
    if (inner) {
      for (const s of inner) visitStatement(s);
    } else {
      visitStatement(stmt);
    }
  }

  return symbols;
}
